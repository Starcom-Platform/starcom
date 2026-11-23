// useSimpleGeoOverlayLayer.ts — shared LayerRegistry registration +
// cross-fade + disable-cleanup plumbing, extracted from useResourceZones3D.ts
// and useDiplomaticEvents3D.ts, which had near-identical copies of this exact
// ~50-line pattern (groupRef/pendingFadeHandlesRef/trackFade, the
// register-once-then-cross-fade buildAll shape, the disable-cleanup effect).
// Both are "deliberately simpler than National Territories" layers — no
// hover/select, no adaptive LOD — differing only in WHAT THREE.Group content
// they build; this factory is that shared shape, parameterized by a
// buildContent callback that supplies the content.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { globalLayerRegistry } from '../LayerRegistry';
import { clearGroup } from '../utils/disposal';
import { fadeGroupIn, replaceGroupContentsWithCrossFade, type FadeHandle } from '../utils/groupFade';
import { applyGeoPoliticalSceneCounterOffset } from './useNationalTerritories3D';
import { registerTooltipGroup } from '../../components/Globe/pointTooltipRegistry';
import { ridesShell } from '../../globe-engine/shellLift';
import { registerLayerRoot } from '../../globe-engine/compareLayers';

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface UseSimpleGeoOverlayLayerParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  layerId: string;
  layerOrder: number;
  /** Builds this build cycle's full content fresh; the factory applies the
   * scene counter-offset, registers/activates/cross-fades it, and manages
   * the disable-cleanup — buildContent only needs to know what to draw. */
  buildContent: () => Promise<THREE.Group>;
  /** The globe layer it draws, by its id, so a comparison side by side can draw it in one half (D-CM, CM1). */
  compareLayer?: string;
}

export interface UseSimpleGeoOverlayLayerResult {
  loading: boolean;
  error: string | null;
  /** The currently-built top-level group (null before the first build, or
   * while disabled) — exposed for a caller that needs to reach into its own
   * sub-content for an additional effect the factory has no opinion about
   * (e.g. DiplomaticEvents' "marching dashes" animation on its connections
   * sub-group). A stable ref object; safe to include directly in a caller's
   * own effect dependency array. */
  groupRef: RefObject<THREE.Group | null>;
}

export function useSimpleGeoOverlayLayer({
  enabled,
  scene,
  layerId,
  layerOrder,
  buildContent,
  compareLayer
}: UseSimpleGeoOverlayLayerParams): UseSimpleGeoOverlayLayerResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  // Its group named as the layer's while it is built, for a comparison (D-CM).
  const unregisterCompareRef = useRef<(() => void) | null>(null);
  const pendingFadeHandlesRef = useRef<Set<FadeHandle>>(new Set());
  const trackFade = useCallback((handle: FadeHandle | null) => {
    if (handle) pendingFadeHandlesRef.current.add(handle);
  }, []);

  // buildContent is async with multiple internal awaits (fetches), so a
  // disable (or a second enable-toggle) can land while a build is in
  // flight. Without this guard, a stale build that resolves AFTER the
  // layer was disabled would still run its "first build" branch below —
  // re-registering/re-activating the layer into the scene and undoing the
  // disable the user just performed. Bumped here and in the disable-cleanup
  // effect below; any build whose captured token no longer matches when it
  // resolves discards its result (disposing the orphaned group instead of
  // leaking its GPU buffers) rather than mutating groupRef/the scene.
  const generationRef = useRef(0);
  // The hover reads only groups registered with pointTooltipRegistry. Diplomacy,
  // Conflict Zones and Resources built their marks with hover text and never
  // registered, so none of it showed (critique audit of 2026-10-01, section 11).
  const unregisterTooltipsRef = useRef<(() => void) | null>(null);

  const buildAll = useCallback(async () => {
    if (!scene) return;
    const myGeneration = ++generationRef.current;
    try {
      setLoading(true);
      const newGroup = await buildContent();
      if (generationRef.current !== myGeneration) {
        clearGroup(newGroup);
        return;
      }
      applyGeoPoliticalSceneCounterOffset(newGroup);
      const reducedMotion = prefersReducedMotion();

      if (groupRef.current) {
        trackFade(replaceGroupContentsWithCrossFade(groupRef.current, newGroup, {
          reducedMotion,
          applyTransform: applyGeoPoliticalSceneCounterOffset
        }));
      } else {
        // Rides the territories' shell when it is raised (globe-engine/shellLift.ts).
        groupRef.current = ridesShell(newGroup);
        unregisterTooltipsRef.current?.();
        unregisterTooltipsRef.current = registerTooltipGroup(newGroup);
        unregisterCompareRef.current?.();
        unregisterCompareRef.current = compareLayer ? registerLayerRoot(compareLayer, newGroup) : null;
        // Replaced, not registered: a group an earlier mount left under the id would
        // stay drawn and this one never reach the scene (LayerRegistry.replace).
        globalLayerRegistry.replace({
          id: layerId,
          order: layerOrder,
          build: () => groupRef.current || new THREE.Group(),
          dispose: (g) => clearGroup(g)
        });
        globalLayerRegistry.activate(layerId, scene);
        fadeGroupIn(groupRef.current, 500, reducedMotion);
      }
      setLoading(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Failed to build ${layerId}`;
      setError(msg);
      setLoading(false);
    }
  }, [scene, buildContent, layerId, layerOrder, trackFade, compareLayer]);

  useEffect(() => {
    if (!enabled || !scene) return;
    buildAll();
  }, [enabled, scene, buildAll]);

  // Cleanup when disabled
  useEffect(() => {
    if (!enabled) {
      // Invalidate any build still in flight so it discards its result
      // instead of reviving the layer once it resolves (see generationRef
      // above) — bumped here too, not just inside buildAll, so disabling
      // takes effect immediately rather than waiting for buildAll's own
      // post-await check on its next tick.
      generationRef.current++;
      pendingFadeHandlesRef.current.forEach((handle) => handle.cancel());
      pendingFadeHandlesRef.current.clear();
      unregisterTooltipsRef.current?.();
      unregisterTooltipsRef.current = null;
      unregisterCompareRef.current?.();
      unregisterCompareRef.current = null;
      if (groupRef.current) {
        clearGroup(groupRef.current);
        groupRef.current = null;
      }
      // globalLayerRegistry.reset() also disposes/detaches whatever group IT
      // has cached, and returns status to 'registered'. Without this, a
      // re-enable's buildAll() creates a brand-new group (groupRef.current
      // was just nulled above) and hands it to registry.activate() — but
      // activate() only calls scene.add() when its own st.group is falsy or
      // not already in scene.children. The registry's st.group still points
      // to the ORIGINAL first-ever-built group object (registry.build() only
      // ever assigns it once), which is still sitting in scene.children (now
      // empty, since clearGroup() only empties a group's children, never
      // detaches the group itself from its parent) — so activate() sees
      // "already in scene" and skips scene.add() entirely, silently
      // orphaning the real new content forever. Confirmed via a reproduction
      // test before this fix: after one disable→enable cycle, scene.children
      // still held only the original (now-empty) group while the freshly
      // rebuilt, populated group had no parent at all.
      globalLayerRegistry.reset(layerId, scene ?? undefined);
    }
  }, [enabled, layerId, scene]);

  // And when the layer goes with the overlay still on: a build in flight is discarded,
  // its hover text withdrawn, and its group leaves a scene that outlives this hook.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => () => {
    generationRef.current++;
    pendingFadeHandlesRef.current.forEach((handle) => handle.cancel());
    pendingFadeHandlesRef.current.clear();
    unregisterTooltipsRef.current?.();
    unregisterTooltipsRef.current = null;
    groupRef.current = null;
    globalLayerRegistry.reset(layerId, sceneRef.current ?? undefined);
  }, [layerId]);

  return { loading, error, groupRef };
}
