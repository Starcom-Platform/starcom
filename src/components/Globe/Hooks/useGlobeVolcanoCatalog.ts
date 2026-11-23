/**
 * useGlobeVolcanoCatalog — dim, small, always-visible context dots for the real
 * Smithsonian GVP Holocene volcano catalog (1,214 real volcanoes, baked at build
 * time by scripts/eco-natural/bake-volcanoes.ts — see that file for why this can't
 * be fetched live: GVP's WFS endpoint has no CORS header).
 *
 * Distinct from EONET's currently-active eruption events (already rendered by
 * Globe.tsx's shared point-marker layer): this is passive background context —
 * "volcanoes exist here" — rendered underneath/around those active markers, dim
 * enough not to compete with them.
 *
 * 1,214 static points is exactly the kind of content the plan called out as
 * "unusable at global zoom without LOD" — this is the first real consumer of
 * useCameraDetailTier (Phase 2.5): zoomed out shows only the most recently active
 * volcanoes, zoomed in reveals the full catalog.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { useCameraDetailTier, type DetailTier } from './useCameraDetailTier';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { buildScreenPoints, drawAboveSurfaceLayers, screenPointCount, SCREEN_POINTS_RENDER_ORDER } from '../screenPoints';
import { SURFACE_MARKS } from '../globeAltitudes';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { globeCameraTelemetry } from '../../../services/globe/GlobeCameraTelemetry';
import { replaceGroupContentsWithCrossFade, type FadeHandle } from '../../../geopolitical/utils/groupFade';
import { prefersReducedMotion } from '../../../geopolitical/hooks/useSimpleGeoOverlayLayer';
import { createLogger } from '@utils/logger';
import { resolveMarkerStyle, type MarkerStyleChoices, type MarkerStyle as ScreenPointStyle } from '../markerStyles';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:VolcanoCatalog' });
const MODE_KEY = 'EcoNatural.EcologicalDisasters' as const;
const CATALOG_URL = '/eco-natural/volcanoes-baked.json';

const GLOBE_RADIUS_UNITS = 100;

// Global zoom can't usefully show all 1,214 dots at once — thin to the most
// recently active volcanoes first (a real, meaningful ranking already in the
// baked data), not an arbitrary or random subset.
const TIER_LIMITS: Record<DetailTier, number> = {
  0: 150,
  1: 400,
  2: Infinity
};

// Cross-fade duration for a tier-driven rebuild — previously an instant
// dispose-then-rebuild pop every time the camera crossed a tier boundary.
const TIER_TRANSITION_FADE_MS = 400;

export interface BakedVolcano {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  lastEruptionYear?: number | null;
  country?: string;
  region?: string;
  elevation?: number;
  tectonicSetting?: string;
}

interface VolcanoCatalogFile {
  count: number;
  volcanoes: BakedVolcano[];
}

/**
 * Real, meaningful thinning order (most recently active first — an unknown/never-
 * dated eruption year sorts last, not first) and cap for a given detail tier.
 * Exported for direct unit testing.
 */
export function selectVolcanoesForTier(volcanoes: BakedVolcano[], tier: DetailTier): BakedVolcano[] {
  const limit = TIER_LIMITS[tier];
  if (!Number.isFinite(limit) || volcanoes.length <= limit) return volcanoes;

  const ranked = [...volcanoes].sort((a, b) => {
    const ay = typeof a.lastEruptionYear === 'number' ? a.lastEruptionYear : -Infinity;
    const by = typeof b.lastEruptionYear === 'number' ? b.lastEruptionYear : -Infinity;
    return by - ay;
  });
  return ranked.slice(0, limit);
}

/**
 * Builds a fresh InstancedMesh for a given (already tier-thinned) set of
 * volcanoes. Pulled out of the render effect so both the initial/data-driven
 * build and a tier-driven cross-fade rebuild can share it without duplicating
 * the geometry/matrix setup.
 */
function buildVolcanoMesh(points: BakedVolcano[], style?: ScreenPointStyle): THREE.Points {
  return buildScreenPoints(points.map((volcano) => ({
    position: latLngToGlobeWorld(volcano.lat, volcano.lng, GLOBE_RADIUS_UNITS * SURFACE_MARKS),
    sizePx: VOLCANO_MARK_PX,
    color: VOLCANO_COLOR,
    tooltip: buildVolcanoTooltip(volcano),
  })), {
    style,
    rim: 'dark',
    // Context, not an alert: these are every volcano in the catalogue, erupting or
    // not, so they stay quiet behind whatever else the operator has up. The opacity
    // is also the target a tier cross-fade eases to — see groupFade.ts.
    opacity: 0.55,
    userData: {
      type: 'volcanoCatalog',
      layer: 'Volcano catalogue',
      points: points.map((v) => ({ lat: v.lat, lng: v.lng })),
    },
  });
}

/**
 * Grey-brown, and 7 px across.
 *
 * Was a SphereGeometry of 0.28 scene units on a 100-unit Earth — under a pixel at the
 * share-card view, for the whole Smithsonian catalogue. The colour is unchanged; only
 * the unit is, and the marks sit above the country fills now rather than under them.
 */
const VOLCANO_COLOR = 0x8a7a6a;
const VOLCANO_MARK_PX = 7;

export function buildVolcanoTooltip(volcano: BakedVolcano): string {
  const parts = [volcano.name];
  if (volcano.type) parts.push(volcano.type);
  if (typeof volcano.lastEruptionYear === 'number') {
    parts.push(volcano.lastEruptionYear < 0 ? `Last eruption: ${Math.abs(volcano.lastEruptionYear)} BCE` : `Last eruption: ${volcano.lastEruptionYear} CE`);
  }
  if (volcano.country) parts.push(volcano.country);
  return parts.join(' • ');
}

interface UseGlobeVolcanoCatalogOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  /** The quake kit's Volcanoes (D-EQ, EQ8): false hides the catalogue while Eco Disasters is drawn. On by default. */
  shown?: boolean;
  /**
   * How the person chose to draw Eco Disasters (decision D-F, step 6.3).
   *
   * This is the layer's SECOND path — useGlobeEcoDisasterMarks draws the rest —
   * so both have to honour the same choice or the layer is half styled, which is
   * why it stood at `not-yet` until now.
   */
  markerStyles?: MarkerStyleChoices;
}

export function useGlobeVolcanoCatalog({ globeRef, isLayerActive, markerStyles, shown = true }: UseGlobeVolcanoCatalogOptions) {
  // Eco Disasters' choice, shared with useGlobeEcoDisasterMarks: this layer draws
  // through two paths and both have to honour it (decision D-F, step 6.3).
  const volcanoStyle = resolveMarkerStyle(markerStyles, 'EcologicalDisasters');
  /*
   * Above the country fills, which painted over the whole catalogue at group order 0 —
   * and one step BELOW the other mark layers, which is what the old comment on this
   * layer's altitude was reaching for: an erupting volcano from the eco-disaster feed
   * should draw over the catalogue dot for the same mountain, not under it.
   */
  const groupRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  groupRef.current.renderOrder = SCREEN_POINTS_RENDER_ORDER - 1;
  const meshRef = useRef<THREE.Points | null>(null);
  const fadeHandleRef = useRef<FadeHandle | null>(null);
  const [catalog, setCatalog] = useState<BakedVolcano[]>([]);
  const active = isLayerActive('EcologicalDisasters') && shown;
  const detailTier = useCameraDetailTier(undefined, active);

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EcologicalDisasters', groupRef.current, { timeless: true });
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  // Re-registered (not just defined once) so getDetailTier() stays accurate
  // across tier-driven cross-fade rebuilds too, which don't go through the
  // main effect below.
  const registerDebugHook = () => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;
    (window as unknown as { __volcanoCatalogDebug?: unknown }).__volcanoCatalogDebug = {
      getMesh: () => meshRef.current,
      getRenderedCount: () => screenPointCount(meshRef.current),
      getCatalogCount: () => catalog.length,
      getDetailTier: () => detailTier,
      getRawTelemetry: () => globeCameraTelemetry.getCurrent()
    };
  };

  useEffect(() => {
    if (!active || catalog.length > 0) return;
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Volcano catalog request failed: ${res.status}`);
        return res.json() as Promise<VolcanoCatalogFile>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data?.volcanoes)) throw new Error('Volcano catalog payload missing volcanoes array');
        setCatalog(data.volcanoes);
        log.debug(`🌋 Loaded real volcano catalog: ${data.volcanoes.length} volcanoes`);
      })
      .catch((error) => log.error('Failed to load real volcano catalog', error));
    return () => { cancelled = true; };
  }, [active, catalog.length]);

  // Initial/data-driven build — deliberately NOT keyed on detailTier (see the
  // separate cross-fade effect below), so a tier crossing doesn't tear down and
  // instantly rebuild everything else this effect owns (scene attach, catalog
  // fetch dependency, etc.). Uses whatever tier is current at build time.
  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    const clearMesh = () => {
      const mesh = meshRef.current;
      if (!mesh) return;
      group.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
      meshRef.current = null;
    };

    const teardown = () => {
      fadeHandleRef.current?.cancel();
      fadeHandleRef.current = null;
      clearMesh();
      if (scene.children.includes(group)) scene.remove(group);
      publishLegend('EcologicalDisasters:volcanoCatalog', null);
      visualizationResourceMonitor.clearMode(MODE_KEY);
    };

    if (!active || catalog.length === 0) {
      teardown();
      return;
    }

    if (!scene.children.includes(group)) scene.add(group);

    const points = selectVolcanoesForTier(catalog, detailTier);
    clearMesh();

    const mesh = buildVolcanoMesh(points, volcanoStyle);
    group.add(mesh);
    meshRef.current = mesh;

    /*
     * Its own key rather than a swatch on the Eco Disasters one: this layer is the
     * whole Smithsonian catalogue, most of which is not erupting, and a reader who
     * takes a grey dot for a current event has been misled by the picture. The
     * dominant risk on a globe of hazards is exactly that reading.
     */
    publishLegend('EcologicalDisasters:volcanoCatalog', {
      layerId: 'EcologicalDisasters:volcanoCatalog',
      layer: 'Volcano catalogue',
      colorMeans: 'a catalogued volcano, erupting or not',
      swatches: [{ color: cssColorOf(VOLCANO_COLOR), label: `${points.length} of ${catalog.length} shown at this zoom` }],
    });

    const stats = collectGeometryStats(group);
    visualizationResourceMonitor.recordGeometry(MODE_KEY, stats);
    log.debug(`🌋 Rendered ${points.length} real volcano context dots (tier ${detailTier})`);
    registerDebugHook();

    return () => {
      teardown();
    };
    // detailTier and registerDebugHook intentionally omitted: this effect owns
    // only the initial/data-driven build (scene attach, catalog dependency);
    // the separate tier effect below owns tier-driven rebuilds so a tier
    // crossing doesn't tear down and rebuild everything else this effect owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeRef, active, catalog]);

  // Tier-driven rebuild — cross-fades the old tier's dots out while the new
  // tier's dots fade in (groupFade.ts), instead of the instant dispose-then-
  // rebuild pop a tier crossing previously caused. Only runs once a mesh
  // already exists (the effect above owns the very first build); skips
  // entirely while inactive/no data, matching the main effect's own guard.
  useEffect(() => {
    const group = groupRef.current;
    if (!meshRef.current || !active || catalog.length === 0) return;

    const points = selectVolcanoesForTier(catalog, detailTier);
    const newMesh = buildVolcanoMesh(points, volcanoStyle);
    const newContent = new THREE.Group();
    newContent.add(newMesh);

    fadeHandleRef.current?.cancel();
    // replaceGroupContentsWithCrossFade reparents newContent's children into
    // group via Object3D.add() (which removes each from its old parent as it
    // goes) — newContent.children is empty by the time this call returns, so
    // the mesh reference must be captured beforehand, not read back after.
    fadeHandleRef.current = replaceGroupContentsWithCrossFade(group, newContent, {
      durationMs: TIER_TRANSITION_FADE_MS,
      reducedMotion: prefersReducedMotion()
    });
    meshRef.current = newMesh;
    publishLegend('EcologicalDisasters:volcanoCatalog', {
      layerId: 'EcologicalDisasters:volcanoCatalog',
      layer: 'Volcano catalogue',
      colorMeans: 'a catalogued volcano, erupting or not',
      swatches: [{ color: cssColorOf(VOLCANO_COLOR), label: `${points.length} of ${catalog.length} shown at this zoom` }],
    });

    const stats = collectGeometryStats(group);
    visualizationResourceMonitor.recordGeometry(MODE_KEY, stats);
    log.debug(`🌋 Cross-faded to ${points.length} real volcano context dots (tier ${detailTier})`);
    registerDebugHook();
    // catalog is intentionally omitted: a tier crossing shouldn't re-run this
    // just because the catalog reference identity happens to differ — the
    // effect above already rebuilds fully whenever catalog itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTier]);

  return { groupRef };
}
