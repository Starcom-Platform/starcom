import { useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Where each model currently sits on screen, for positioning UI over the globe.
 *
 * ─── WHY THIS IS A HOOK ────────────────────────────────────────────────────
 *
 * ADR-0002's strangler extraction, first piece. Enhanced3DGlobeInteractivity had
 * grown to 1786 lines and 16 effects while the phasing board recorded this work
 * as finished, and this is the one concern in it that shares no mutable state
 * with any other: it owns a single piece of state, writes only that, and reads
 * the interaction state not at all.
 *
 * It was chosen first for exactly that reason. Everything else in that file —
 * hover, pointer, cursor trail — is interleaved through one 288-line mousemove
 * handler sharing a throttle clock, a frame-skip counter and one setState.
 *
 * ─── WHAT MOVED, AND WHAT DELIBERATELY DID NOT ─────────────────────────────
 *
 * The projector runs on an interval rather than per frame, and only while
 * something is actually being pointed at — that gate is the caller's, passed in
 * as `enabled`, because deciding it requires the interaction state this hook is
 * meant not to touch.
 *
 * The 15-pixel threshold below is behaviour, not tidying: without it every
 * interval tick replaces the map and re-renders whatever positions a popup.
 * Preserved exactly, including that an unchanged model keeps its PREVIOUS
 * Vector2 instance rather than an equal new one.
 */

/** How often positions are recomputed while enabled. */
const UPDATE_INTERVAL_MS = 500;

/**
 * How far a model must move on screen before its position is republished.
 *
 * Small movements are invisible under a popup and would otherwise re-render on
 * every tick.
 */
const SIGNIFICANT_MOVE_PX = 15;

interface ProjectableModel {
  mesh?: THREE.Object3D;
  report?: { pubkey?: string };
}

export interface UseModelScreenProjectionParams<TModel extends ProjectableModel> {
  models: TModel[];
  globeRef: React.RefObject<{ camera: () => THREE.Camera }>;
  containerRef?: React.RefObject<HTMLDivElement>;
  /**
   * Whether anything needs these positions right now.
   *
   * A boolean rather than the interaction state itself, so this hook stays free
   * of the shared state object four other concerns write to.
   */
  enabled: boolean;
}

export interface ModelScreenProjectionController {
  /** Latest known screen position for a model, or null if it has none yet. */
  getModelScreenPosition: (modelId: string) => THREE.Vector2 | null;
}

export function useModelScreenProjection<TModel extends ProjectableModel>({
  models,
  globeRef,
  containerRef,
  enabled,
}: UseModelScreenProjectionParams<TModel>): ModelScreenProjectionController {
  const [screenPositions, setScreenPositions] = useState<Map<string, THREE.Vector2>>(new Map());

  useEffect(() => {
    if (!enabled || !globeRef.current || !containerRef?.current || !models.length) return;

    let updateIntervalId: ReturnType<typeof setInterval> | null = null;
    let lastScreenPositions = new Map<string, THREE.Vector2>();

    const updateScreenPositions = () => {
      // Nothing is visible to position against on a hidden tab, and projecting
      // anyway would burn an interval per 500ms in a background page.
      if (document.hidden) return;

      const camera = globeRef.current?.camera();
      const container = containerRef?.current;
      if (!camera || !container || models.length === 0) return;

      const rect = container.getBoundingClientRect();
      const newScreenPositions = new Map<string, THREE.Vector2>();
      let hasSignificantChanges = false;

      models.forEach((modelInstance) => {
        const pubkey = modelInstance.report?.pubkey;
        if (!modelInstance.mesh || !pubkey) return;

        const worldPos = new THREE.Vector3();
        modelInstance.mesh.getWorldPosition(worldPos);

        const screenPos = worldPos.clone().project(camera);
        const x = (screenPos.x * 0.5 + 0.5) * rect.width;
        const y = (screenPos.y * -0.5 + 0.5) * rect.height;

        const currentPos = lastScreenPositions.get(pubkey);
        const newPos = new THREE.Vector2(x, y);

        if (
          !currentPos
          || Math.abs(currentPos.x - newPos.x) > SIGNIFICANT_MOVE_PX
          || Math.abs(currentPos.y - newPos.y) > SIGNIFICANT_MOVE_PX
        ) {
          newScreenPositions.set(pubkey, newPos);
          hasSignificantChanges = true;
        } else {
          // The previous instance, not an equal copy — callers may compare by
          // identity, and this is what the component did.
          newScreenPositions.set(pubkey, currentPos);
        }
      });

      if (hasSignificantChanges) {
        lastScreenPositions = new Map(newScreenPositions);
        setScreenPositions(newScreenPositions);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) updateScreenPositions();
    };

    updateScreenPositions();
    updateIntervalId = setInterval(updateScreenPositions, UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (updateIntervalId) clearInterval(updateIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, globeRef, containerRef, models]);

  const getModelScreenPosition = useCallback(
    (modelId: string): THREE.Vector2 | null => screenPositions.get(modelId) || null,
    [screenPositions],
  );

  return { getModelScreenPosition };
}
