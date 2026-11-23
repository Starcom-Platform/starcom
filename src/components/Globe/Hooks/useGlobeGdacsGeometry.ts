/**
 * useGlobeGdacsGeometry — real GDACS flood/drought affected-area polygons and
 * cyclone forecast tracks/wind-bands/cone-of-uncertainty on the Globe.
 *
 * GDACS's point-event list feed (GeoEventsDataProvider.ts) only ever carries a bare
 * centroid per event, already rendered by the existing point-marker layer in
 * Globe.tsx. The real extent/track geometry lives behind a second, per-event fetch
 * (GdacsGeometryService.ts) — bounded here to Orange/Red-severity flood/drought/
 * hurricane events (severityBucket 'major'/'catastrophic'), the same real
 * classification GDACS's own alertlevel already assigns, so a quiet Green day fetches
 * nothing extra.
 *
 * Rendering reuses GeometryFactory.buildTerritoryPolygons/buildBorderLines directly
 * (proven, generic, already handles winding-order correction, holes, dateline
 * splitting, and triangulation) rather than react-globe.gl's native polygonsData/
 * pathsData props — this follows the same Globe/Hooks convention (own THREE.Group,
 * scene.add/remove, cleanup) every other feature in this build already uses, and
 * keeps Globe.tsx itself untouched beyond a single hook call.
 *
 * All 185 real meshes (a real severe multi-storm day) previously rendered
 * regardless of camera distance — the wind-band/cone-of-uncertainty detail is
 * genuinely hard to read at a global view anyway (low-opacity radiating
 * shapes with no context at that scale). useCameraDetailTier thins this the
 * same way the volcano catalog and streamflow gauges already do, here by
 * which KIND of feature renders rather than by count.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { NaturalEvent } from '../../../hooks/useGeoEvents';
import { fetchGdacsGeometries, type GdacsEventGeometry, type GdacsGeometryFeature, type GdacsGeometryKind } from '../../../services/GdacsGeometryService';
import { GeometryFactory, type PolygonFeature, type LineFeature } from '../../../geopolitical/geometry/geometryFactory';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { useCameraDetailTier, type DetailTier } from './useCameraDetailTier';
import { createLogger } from '@utils/logger';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:GdacsGeometry' });
const MODE_KEY = 'EcoNatural.EcologicalDisasters' as const;

const GDACS_GEOMETRY_TYPES = new Set(['flood', 'drought', 'hurricane']);
const GDACS_GEOMETRY_SEVERITIES = new Set(['major', 'catastrophic']);

export interface GdacsGeometryCandidate {
  eventId: number;
  geometryUrl: string;
}

/**
 * Which of the already-fetched eco-disaster events warrant a real geometry fetch —
 * exported for direct unit testing. Orange/Red only (major/catastrophic), matching
 * GDACS's own severity classification, so a feed full of Green events costs nothing
 * beyond the point markers already rendered elsewhere.
 */
export function selectGdacsGeometryCandidates(
  events: Array<Pick<NaturalEvent, 'type' | 'severityBucket' | 'gdacsEventId' | 'gdacsGeometryUrl'>>
): GdacsGeometryCandidate[] {
  const seen = new Set<number>();
  const candidates: GdacsGeometryCandidate[] = [];
  for (const event of events) {
    if (!GDACS_GEOMETRY_TYPES.has(event.type)) continue;
    if (!event.severityBucket || !GDACS_GEOMETRY_SEVERITIES.has(event.severityBucket)) continue;
    if (typeof event.gdacsEventId !== 'number' || !event.gdacsGeometryUrl) continue;
    if (seen.has(event.gdacsEventId)) continue;
    seen.add(event.gdacsEventId);
    candidates.push({ eventId: event.gdacsEventId, geometryUrl: event.gdacsGeometryUrl });
  }
  return candidates;
}

/**
 * Which real GDACS feature kinds render at a given camera detail tier — far
 * zoom shows only the track line (the centroid marker itself is already
 * rendered by Globe.tsx's point layer), medium zoom adds the real flood/
 * drought/hurricane affected-area extent, and only close zoom (tier 2) adds
 * the wind-intensity bands and forecast cone — the detail that reads as
 * ambiguous "radiating lines" without enough context to interpret. Exported
 * for direct unit testing.
 */
export function allowedGdacsFeatureKindsForTier(tier: DetailTier): Set<GdacsGeometryKind> {
  if (tier === 0) return new Set<GdacsGeometryKind>(['track']);
  if (tier === 1) return new Set<GdacsGeometryKind>(['track', 'affectedArea']);
  return new Set<GdacsGeometryKind>(['track', 'affectedArea', 'windBand', 'cone']);
}

const WIND_BAND_COLOR: Record<string, number> = {
  Poly_Green: 0x33cc33,
  Poly_Orange: 0xff9933,
  Poly_Red: 0xff3333
};
const CONE_COLOR = 0xffffff;
const FLOOD_AREA_COLOR = 0x3399ff;
const DROUGHT_AREA_COLOR = 0xcc9944;
const TRACK_INTENSITY_COLOR: Record<string, number> = {
  TD: 0x66ccff,
  TS: 0xffcc33,
  HU: 0xff3333
};
const DEFAULT_TRACK_COLOR = 0xdddddd;

function affectedAreaColor(hazardType: string): number {
  return hazardType === 'drought' ? DROUGHT_AREA_COLOR : FLOOD_AREA_COLOR;
}

let polygonFeatureCounter = 0;

/** Flattens one GdacsGeometryFeature's polygons into GeometryFactory PolygonFeatures. */
export function toPolygonFeatures(feature: GdacsGeometryFeature, eventId: number): PolygonFeature[] {
  if (!feature.polygons) return [];
  return feature.polygons.map((rings) => ({
    id: `gdacs-${eventId}-${feature.gdacsClass}-${polygonFeatureCounter++}`,
    rings
  }));
}

export function toLineFeature(feature: GdacsGeometryFeature, eventId: number): LineFeature | null {
  if (!feature.line) return null;
  return { id: `gdacs-${eventId}-${feature.gdacsClass}-${polygonFeatureCounter++}`, coordinates: feature.line };
}

interface UseGlobeGdacsGeometryOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  events: NaturalEvent[];
}

/**
 * Turned into the scene's frame. GeometryFactory builds in the globe mesh's
 * frame, this group hangs off the scene, and three-globe puts -90° about y
 * between the two — see the note in utils/globeCoordinates.ts.
 *
 * Found on 2026-09-20 while chasing the same fault in the intel outline layer,
 * not by anyone looking at a flood. A disaster footprint 90° of longitude from
 * the disaster still looks like a disaster footprint, so nothing about the
 * drawing said it was wrong.
 */
function makeGdacsGroup(): THREE.Group {
  const group = ridesShell(new THREE.Group());
  group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
  return group;
}

export function useGlobeGdacsGeometry({ globeRef, isLayerActive, events }: UseGlobeGdacsGeometryOptions) {
  const groupRef = useRef<THREE.Group>(makeGdacsGroup());
  const candidatesRef = useRef<GdacsGeometryCandidate[]>([]);
  const eventTypeByIdRef = useRef<Map<number, string>>(new Map());
  // Raw fetched geometries, cached so a detail-tier change can re-filter and
  // rebuild without a redundant real network fetch.
  const rawGeometriesRef = useRef<GdacsEventGeometry[]>([]);
  const hasLoadedOnceRef = useRef(false);

  const candidates = selectGdacsGeometryCandidates(events);
  candidatesRef.current = candidates;
  events.forEach((e) => {
    if (typeof e.gdacsEventId === 'number') eventTypeByIdRef.current.set(e.gdacsEventId, e.type);
  });
  // Stable signature so the fetch effect only re-runs when the actual set of
  // candidate events changes, not on every ecoEvents re-render (a new refresh cycle
  // that reports the same severe events shouldn't re-fetch their geometry).
  const candidateSignature = candidates.map((c) => c.eventId).sort().join(',');

  const active = isLayerActive('EcologicalDisasters');
  const detailTier = useCameraDetailTier(undefined, active);

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EcologicalDisasters', groupRef.current);
  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    let cancelled = false;

    const clearGroup = () => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh | THREE.Line;
        if ((mesh as THREE.Mesh).isMesh || (mesh as THREE.Line).isLine) {
          mesh.geometry?.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      group.clear();
    };

    // Deliberately does NOT reset hasLoadedOnceRef — this runs on every effect
    // cleanup, including a tier-only rerun, and resetting it there would force
    // a real refetch on every tier crossing. Only the two genuinely-inactive
    // branches below (layer off, no candidates) reset it explicitly.
    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
      visualizationResourceMonitor.clearMode(MODE_KEY);
    };

    if (!active) {
      hasLoadedOnceRef.current = false;
      teardown();
      return () => { cancelled = true; };
    }

    if (!scene.children.includes(group)) scene.add(group);

    const currentCandidates = candidatesRef.current;
    if (currentCandidates.length === 0) {
      hasLoadedOnceRef.current = false;
      clearGroup();
      return () => { cancelled = true; teardown(); };
    }

    const renderGeometries = (geometries: GdacsEventGeometry[], tier: DetailTier) => {
      clearGroup();
      const allowedKinds = allowedGdacsFeatureKindsForTier(tier);

      geometries.forEach((eventGeometry: GdacsEventGeometry) => {
        const hazardType = eventTypeByIdRef.current.get(eventGeometry.eventId) ?? 'flood';

        eventGeometry.features.forEach((feature) => {
          if (!allowedKinds.has(feature.kind)) return;

          if (feature.kind === 'track') {
            const lineFeature = toLineFeature(feature, eventGeometry.eventId);
            if (!lineFeature) return;
            const color = TRACK_INTENSITY_COLOR[feature.intensityLabel ?? ''] ?? DEFAULT_TRACK_COLOR;
            const lineGroup = GeometryFactory.buildBorderLines([lineFeature], { color, opacity: 0.9, elevation: 0.3 });
            // .add(...[]) (zero arguments) logs a THREE.js console error — a degenerate
            // real-world segment (e.g. a track point pair GeometryFactory itself drops)
            // can legitimately leave this empty.
            if (lineGroup.children.length > 0) group.add(...lineGroup.children);
            return;
          }

          const polygonFeatures = toPolygonFeatures(feature, eventGeometry.eventId);
          if (polygonFeatures.length === 0) return;

          const color = feature.kind === 'windBand'
            ? WIND_BAND_COLOR[feature.gdacsClass] ?? WIND_BAND_COLOR.Poly_Green
            : feature.kind === 'cone'
              ? CONE_COLOR
              : affectedAreaColor(hazardType);
          const opacity = feature.kind === 'windBand' ? 0.12 : feature.kind === 'cone' ? 0.08 : 0.25;

          const polyGroup = GeometryFactory.buildTerritoryPolygons(polygonFeatures, { color, opacity, elevation: 0.25 });
          // Same zero-argument .add() guard as above — a degenerate real-world polygon
          // part (e.g. too few points to triangulate) can legitimately leave this empty.
          if (polyGroup.children.length > 0) group.add(...polyGroup.children);
        });
      });

      if (cancelled) {
        clearGroup();
        return;
      }

      const stats = collectGeometryStats(group);
      visualizationResourceMonitor.recordGeometry(MODE_KEY, stats);
      log.debug(`🌪️ Rendered real GDACS geometry for ${geometries.length} severe event(s) (tier ${tier})`);

      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        (window as unknown as { __gdacsGeometryDebug?: unknown }).__gdacsGeometryDebug = {
          getGroup: () => groupRef.current,
          getMeshCount: () => groupRef.current.children.length,
          getCandidateCount: () => currentCandidates.length,
          getDetailTier: () => detailTier
        };
      }
    };

    const load = async () => {
      const geometries = await fetchGdacsGeometries(currentCandidates);
      if (cancelled) return;
      rawGeometriesRef.current = geometries;
      hasLoadedOnceRef.current = true;
      renderGeometries(geometries, detailTier);
    };

    if (hasLoadedOnceRef.current) {
      // Tier-only rerun — re-filter and rebuild from the cached raw fetch
      // instead of hitting the real GDACS geometry service again.
      renderGeometries(rawGeometriesRef.current, detailTier);
    } else {
      load();
    }

    return () => {
      cancelled = true;
      teardown();
    };
  }, [globeRef, isLayerActive, active, candidateSignature, detailTier]);

  return { groupRef };
}
