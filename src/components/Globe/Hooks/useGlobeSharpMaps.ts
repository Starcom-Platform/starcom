/**
 * useGlobeSharpMaps — the Earth's 8K maps, put into the globe's material once a person has
 * zoomed in closer than the default view (globe-engine/sharpEarthMaps.ts; decision K7, TX3).
 *
 * Only a person's own zoom counts. The controls fire `start` and `end` only for a press, a
 * scroll or a touch, and the camera must end closer than the default view and closer than
 * where the person's input began: a run of scroll steps close together counts from the
 * first, as a trackpad sends a zoom in many small steps. A move made in code, like the
 * turn to the first reports, fetches nothing, so a first visit fetches nothing more; nor
 * does a drag at a close view that code flew to. And only at a quality step that keeps
 * them, once auto quality has measured the device: a slow device steps down within
 * seconds, and would have paid for maps it then could not draw. On a graphics card that
 * cannot hold a texture 8192 wide, never.
 *
 * Once fetched they stay for as long as the globe does, and a material built later, for
 * another mode, gets those it draws; a map no mode has drawn yet is fetched on the next
 * approach. While a capture is under way they wait for it to end, so a clip is drawn with
 * the maps it started with.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import type * as THREE from 'three';
import {
  SKIN_SHARP_MAPS,
  SharpMapLoader,
  applySharpMaps,
  canDrawSharpMaps,
  isApproach,
  type SharpTextures,
} from '../../../globe-engine/sharpEarthMaps';
import { captureUnderWay } from '../../../globe-engine/captureClock';
import { getGlobeQuality, qualityStepOf, subscribeGlobeQuality } from '../../../services/globe/globeQuality';
import { getResolvedGlobeSkin } from '../../../services/globe/globeAppearance';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useGlobeSharpMaps' });

/** Input that starts within this long of the last input's end continues the same zoom. */
export const ZOOM_RUN_GAP_MS = 500;
/** How often maps that came during a capture look again for its end. */
export const CAPTURE_RETRY_MS = 250;

type ControlsEvent = 'start' | 'end';

interface Controls {
  addEventListener(type: ControlsEvent, listener: () => void): void;
  removeEventListener(type: ControlsEvent, listener: () => void): void;
}

interface ZoomableGlobe {
  controls?: () => Controls | undefined;
  renderer?: () => THREE.WebGLRenderer;
  pointOfView?: () => { altitude?: number } | undefined;
}

export function useGlobeSharpMaps(globeRef: RefObject<unknown>, material: THREE.Material | null, ready: boolean): void {
  const quality = useSyncExternalStore(subscribeGlobeQuality, getGlobeQuality, getGlobeQuality);
  const allowed = quality.settled && qualityStepOf(quality).sharpMaps;
  const allowedRef = useRef(allowed);
  const materialRef = useRef(material);
  const arrived = useRef<SharpTextures>({});
  const loaderRef = useRef<SharpMapLoader | null>(null);
  const heldTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    allowedRef.current = allowed;
  }, [allowed]);

  /** What has come goes into the material drawn now, once no capture is under way. */
  const putIn = useCallback(() => {
    clearTimeout(heldTimer.current);
    const current = materialRef.current;
    if (!current) return;
    if (captureUnderWay()) {
      heldTimer.current = setTimeout(putIn, CAPTURE_RETRY_MS);
      return;
    }
    applySharpMaps(current, getResolvedGlobeSkin(), arrived.current);
  }, []);

  useEffect(() => {
    materialRef.current = material;
    putIn();
  }, [material, putIn]);

  useEffect(() => {
    if (!ready) return undefined;
    const globe = globeRef.current as ZoomableGlobe | null;
    const controls = globe?.controls?.();
    const renderer = globe?.renderer?.();
    if (!globe || !controls || !renderer) return undefined;
    let gone = false;
    /** The altitude the person's input began at, and when it last ended. */
    let from: number | null = null;
    let endedAt = -Infinity;
    const altitude = () => globe.pointOfView?.()?.altitude ?? Infinity;

    const onStart = () => {
      if (from === null || performance.now() - endedAt > ZOOM_RUN_GAP_MS) from = altitude();
    };
    const onEnd = () => {
      endedAt = performance.now();
      if (from === null || !isApproach(from, altitude())) return;
      if (!allowedRef.current || !canDrawSharpMaps(renderer)) return;
      const wanted = SKIN_SHARP_MAPS[getResolvedGlobeSkin()].filter((map) => !arrived.current[map]);
      if (!wanted.length) return;
      const loader = loaderRef.current ?? (loaderRef.current = new SharpMapLoader(renderer));
      void Promise.allSettled(wanted.map((map) => loader.load(map))).then((results) => {
        if (gone) return;
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') arrived.current = { ...arrived.current, [wanted[i]]: result.value };
          else log.warn(`8K ${wanted[i]} map not loaded; keeping the map the globe has:`, result.reason);
        });
        putIn();
      });
    };

    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    return () => {
      gone = true;
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
    };
  }, [ready, globeRef, putIn]);

  useEffect(() => () => {
    clearTimeout(heldTimer.current);
    loaderRef.current?.dispose();
    loaderRef.current = null;
    arrived.current = {};
  }, []);
}
