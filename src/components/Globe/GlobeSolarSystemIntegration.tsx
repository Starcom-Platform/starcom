// GlobeSolarSystemIntegration.tsx - The solar system round the globe, in every mode,
// drawn at every render (decision K6; record
// docs/missions/01-architecture-decisions/solar-system.md).
//
// Each render of the scene, before anything is drawn, the solar system learns where the
// camera is, how much of it to draw (none while the Earth's marks are whole), and for
// which moment: a capture's still moment, else the timeline's paused moment, else now
// (decision D-E's one cursor, the moment the globe's light is for). A card or a clip
// frame is a render like any other, so it gets the same.

import { skyLook } from '../../solar-system/sky/skyLook';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlobeMethods } from 'react-globe.gl';
import { SolarSystemManager } from '../../solar-system/SolarSystemManager';
import type { SolarSystemManagerDependencies, SolarSystemState } from '../../solar-system/SolarSystemManager';
import { onSceneRender } from '../../globe-engine/sceneRenderHooks';
import { stilledAt } from '../../globe-engine/captureClock';
import { setSolarSystemDrawn } from '../../globe-engine/imagery';
import { solarSystemShownFor } from './zoomOutFade';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'GlobeSolarSystemIntegration' });

const POLL_MS = 250;

interface GlobeSolarSystemIntegrationProps {
  globeRef: React.RefObject<GlobeMethods>;
  enabled?: boolean;
  /** The moment the timeline is paused at, in ms since the epoch; null or absent while it is live. */
  pausedAt?: number | null;
  debugMode?: boolean;
  onStateChange?: (state: SolarSystemState) => void;
}

export const useGlobeSolarSystemIntegration = ({
  globeRef,
  enabled = true,
  pausedAt = null,
  debugMode = false,
  onStateChange
}: GlobeSolarSystemIntegrationProps) => {
  const [solarSystemState, setSolarSystemState] = useState<SolarSystemState | null>(null);
  const [isActive, setIsActive] = useState(false);
  const onStateChangeRef = useRef<typeof onStateChange>();
  const pausedAtRef = useRef<number | null>(pausedAt);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Read at each render, so a pause or a scrub moves the bodies at the next frame.
  pausedAtRef.current = pausedAt;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let manager: SolarSystemManager | null = null;
    let leave: (() => void) | undefined;

    const start = () => {
      if (cancelled) return;
      const globe = globeRef.current;
      const scene = typeof globe?.scene === 'function' ? globe.scene() : null;
      const camera = typeof globe?.camera === 'function' ? globe.camera() : null;
      if (!globe || !scene || !camera) {
        timer = setTimeout(start, POLL_MS);
        return;
      }

      try {
        const dependencies: SolarSystemManagerDependencies = {
          scene,
          camera,
          globe: { scene: () => globe.scene(), camera: () => globe.camera() }
        };
        const created = new SolarSystemManager(dependencies, { performanceMode: 'balanced', debugMode });
        manager = created;

        created.onStateChange((state) => {
          setSolarSystemState(state);
          onStateChangeRef.current?.(state);
        });

        const eye = new THREE.Vector3();
        const viewport = new THREE.Vector2();
        leave = onSceneRender(scene, (renderer, drawnThrough) => {
          eye.setFromMatrixPosition(drawnThrough.matrixWorld);
          created.frame({
            eye,
            // In Sky from a place the person stands on the Earth, which fills the view: the sky's bodies are in it (D5).
            shown: skyLook() ? 1 : solarSystemShownFor(renderer, drawnThrough),
            atMs: stilledAt() ?? pausedAtRef.current ?? Date.now(),
            camera: drawnThrough,
            viewport: renderer.getSize(viewport),
          });
          // Whether the planets and the Moon are in the picture just drawn, for a card's imagery credit (TX8).
          setSolarSystemDrawn(created.getShown() > 0);
        });
        setIsActive(true);

        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          (window as unknown as { __solarSystemDebug?: unknown }).__solarSystemDebug = { manager: created, scene };
        }
        if (debugMode) log.debug('SolarSystemManager initialized for Globe integration');
      } catch (error) {
        log.error('Failed to initialize solar system integration:', error);
      }
    };
    start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      leave?.();
      setSolarSystemDrawn(false);
      try {
        manager?.dispose();
      } catch (error) {
        log.warn('Error during solar system cleanup:', error);
      }
      setIsActive(false);
      setSolarSystemState(null);
    };
  }, [globeRef, enabled, debugMode]);

  return {
    solarSystemState,
    isActive,
    sunVisible: solarSystemState?.sunState?.isVisible || false
  };
};
