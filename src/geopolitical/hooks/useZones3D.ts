/**
 * useZones3D — Zones, with Sectors inside the Zones, drawn as territories (ZSP 1.0;
 * the documents and their rules are in ../zones/zsp.ts).
 *
 * ─── WHAT IT DRAWS ─────────────────────────────────────────────────────────
 *
 * Each Sector filled in a shade of its Zone's colour (zoneTheme.ts), the lines
 * between Sectors dashed where they are approximate, and the Zone's own edge solid
 * over them. A Zone with no Sectors is filled itself. The fills stand where the war
 * map's do, over the clouds and under the lines that follow the surface, and ride
 * the territories' shell like every layer above the base map (shellLift.ts).
 *
 * ─── WHAT IT DOES UNDER THE POINTER ────────────────────────────────────────
 *
 * The Sector under the pointer lights up, eased as the countries' fills are, and a
 * click opens it in the panel (GlobeZonePanel). An open Sector stays lit and the
 * rest of the layer dims; an open Zone lights all its Sectors. The pick is the
 * nearest fill on the near side of the globe: a ray that misses every fill in front
 * would otherwise find one through the Earth.
 *
 * A Sector is an area, nearer than the country under it, so it takes a click that
 * would pick the country (globeClick.ts, BA9), and the country is still offered in
 * the menu at that click (BA20). A report's glyph is nearer still: over one, the
 * Sector neither lights nor takes the click.
 *
 * ─── A WHOLE-GLOBE PARTITION (ZSP 2.0) ─────────────────────────────────────
 *
 * About 2,600 Sectors, each a mesh and a material, were as many draws: measured on
 * 18 October on a full-scale test set, 3,184 objects, and the globe some seven times
 * slower with Zones on. So a 2.0 partition's fills are one mesh per Terra or Mare,
 * each Sector a part of it lit by a texel of its own, as the country fills are
 * (territoryBatch.ts); and its lines are batched once across the partition, by
 * look. The draws stay a handful however many Sectors there are.
 */
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../geometry/geometryFactory';
import { buildBorderLineBatches } from '../geometry/fatBorderLines';
import { simplifyChain } from '../geometry/simplifyChain';
import {
  createPartMotion, easeTerritoryParts, mergeTerritoryParts, territoryBatchData, territoryPartAt,
  type TerritoryPartMotion, type TerritoryPartSource,
} from '../geometry/territoryBatch';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import {
  createTerritoryFillMaterial,
  isTerritoryFillMaterial,
  setTerritoryMaterialHoverSelectDim,
  setTerritoryMaterialSunDirection,
} from '../theme/territoryFillMaterial';
import { TERRITORY_FILLS_ORDER } from '../theme/applyTerritoryLook';
import {
  CONTAINER_EDGE_LOOK, LIGHT_UP_TAU_S, PARTITION_ZONE_EDGE_LOOK, SECTOR_FILL_OPACITY, ZONE_EDGE_LOOK, ZONE_FILL_OPACITY,
  partitionSectorLineLook, sectorColor, sectorLineLook, swatchCss, zoneColor, zoneColorMeaning,
} from '../theme/zoneTheme';
import { partitionFills } from '../theme/partitionTheme';
import type { ZoneIndex, ZspPlace, ZspZone } from '../zones/zsp';
import { useSimpleGeoOverlayLayer, prefersReducedMotion } from './useSimpleGeoOverlayLayer';
import { CLAIM_RANK, claimGlobeClicks, isGlobeClick, nearerLayerTakes, pressOn, type PointerAt } from '../../components/Globe/globeClick';
import { CLOUDS, SURFACE_LINES } from '../../components/Globe/globeAltitudes';
import { shellLift } from '../../globe-engine/shellLift';
import { publishLegend, type LayerLegend } from '../../services/globe/globeLegendStore';
import { getZonesState, selectZonePlace, setZoneHover } from '../../features/globe/zones/zonesStore';
import { fill, messagesNow } from '../../i18n/app/i18n';
import { useZoneIndex } from '../../features/globe/zones/useZoneIndex';
import { setGlobeZonesInUse } from '../../services/globe/globeQuality';

const GLOBE_RADIUS_UNITS = 100;
/** Where the war map's fills stand: over the clouds, under the surface lines. */
const FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
/** With the lines that follow the surface. */
const LINE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
/** After the country fills, as the war map's are. */
const ZONE_FILLS_ORDER = TERRITORY_FILLS_ORDER + 1;
/** How often the pointer is picked against the fills, at most. */
const PICK_INTERVAL_MS = 50;

export const ZONES_LAYER_ID = 'geopolitical-zones';
export const ZONES_LEGEND_ID = 'Zones';

type LngLat = [number, number];

const ringsOf = (geometry: PolygonGeometry): LngLat[][] =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flatMap((rings) => rings as LngLat[][]);

const pointKey = (p: LngLat): string => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

interface Segment { key: string; a: LngLat; b: LngLat }

/** A segment along the antimeridian. */
const onSeam = (a: LngLat, b: LngLat): boolean => Math.abs(a[0]) >= 179.9999 && Math.abs(b[0]) >= 179.9999;

/** A seam segment's key with the side of the antimeridian left out: +180° and −180° are one meridian. */
const seamKey = (a: LngLat, b: LngLat): string => [a, b].map((p) => `180,${p[1].toFixed(4)}`).sort().join('|');

/**
 * The segments of a place's rings, each by a key the same from either end. A segment on the antimeridian is the seam
 * where a place split at ±180° meets itself when the place has it on both sides, and is not a line of the map; on
 * one side only, it is a real edge, where the place meets another (decision D-ZR: places tile the whole globe).
 */
function segmentsOf(rings: LngLat[][]): Segment[] {
  const out: Segment[] = [];
  const seamSides = new Map<string, Set<number>>();
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      if (!onSeam(ring[i], ring[i + 1])) continue;
      const k = seamKey(ring[i], ring[i + 1]);
      seamSides.set(k, (seamSides.get(k) ?? new Set()).add(Math.sign(ring[i][0])));
    }
  }
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const ka = pointKey(ring[i]);
      const kb = pointKey(ring[i + 1]);
      if (ka === kb) continue;
      if (onSeam(ring[i], ring[i + 1]) && (seamSides.get(seamKey(ring[i], ring[i + 1]))?.size ?? 0) > 1) continue;
      out.push({ key: ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, a: ring[i], b: ring[i + 1] });
    }
  }
  return out;
}

/** Joins segments end to end into as few lines as they make, stopping where three or more meet. */
function chained(segments: Segment[]): LngLat[][] {
  const at = new Map<string, Segment[]>();
  for (const s of segments) {
    for (const k of [pointKey(s.a), pointKey(s.b)]) at.set(k, [...(at.get(k) ?? []), s]);
  }
  const used = new Set<string>();
  const lines: LngLat[][] = [];
  // Ends and junctions first, so an open line is walked from one end; then the loops.
  const starts = [...at.keys()].sort((p, q) => Number(at.get(p)!.length === 2) - Number(at.get(q)!.length === 2));
  for (const start of starts) {
    for (const first of at.get(start)!) {
      if (used.has(first.key)) continue;
      let here = start;
      const line: LngLat[] = [pointKey(first.a) === start ? first.a : first.b];
      let seg: Segment | undefined = first;
      while (seg && !used.has(seg.key)) {
        used.add(seg.key);
        const next = pointKey(seg.a) === here ? seg.b : seg.a;
        line.push(next);
        here = pointKey(next);
        const onward: Segment[] = at.get(here) ?? [];
        seg = onward.length === 2 ? onward.find((s) => !used.has(s.key)) : undefined;
      }
      if (line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

/**
 * A Zone's two kinds of line: its own edge, and the lines between its Sectors,
 * each drawn once. A document may give its Zone as one dissolved outline or as
 * its Sectors' rings together; either way, a segment two of the Zone's rings
 * share is a line between Sectors, not the edge.
 */
export function zoneLines(zone: ZspZone): { edge: LngLat[][]; between: LngLat[][] } {
  const zoneSegments = segmentsOf(ringsOf(zone.root.geometry));
  const times = new Map<string, number>();
  for (const s of zoneSegments) times.set(s.key, (times.get(s.key) ?? 0) + 1);
  const edge = zoneSegments.filter((s) => times.get(s.key) === 1);
  const onEdge = new Set(edge.map((s) => s.key));
  const between = new Map<string, Segment>();
  for (const sector of zone.sectors) {
    for (const s of segmentsOf(ringsOf(sector.geometry))) if (!onEdge.has(s.key)) between.set(s.key, s);
  }
  return { edge: chained(edge), between: chained([...between.values()]) };
}

/** A Zone's own colour: under 2.0 a shade of its Terra's or Mare's (partitionTheme.ts), under 1.0 its frame's or condition's. */
const baseOf = (zone: ZspZone, index: ZoneIndex): number =>
  (index.edition === '2.0' ? partitionFills(index).zones.get(zone.root.id) : undefined) ?? zoneColor(zone.root);

/** The places a Zone is filled by: its Sectors, or the Zone itself when it has none. */
function filledPlaces(zone: ZspZone, index: ZoneIndex): Array<{ place: ZspPlace; color: number; opacity: number }> {
  const base = baseOf(zone, index);
  const fills = index.edition === '2.0' ? partitionFills(index).sectors : null;
  return zone.sectors.length
    ? zone.sectors.map((place, i) => ({ place, color: fills?.get(place.id) ?? sectorColor(base, i), opacity: SECTOR_FILL_OPACITY }))
    : [{ place: zone.root, color: base, opacity: ZONE_FILL_OPACITY }];
}

const lighter = (color: number, by: number): number => new THREE.Color(color).offsetHSL(0, 0, by).getHex();
const linesColor = (zone: ZspZone, index: ZoneIndex): number => lighter(baseOf(zone, index), 0.18);

/** How a Zone's Sector lines are drawn: as its Sectors say, or as precise as the Zone's own lines. */
const boundaryOf = (zone: ZspZone): string =>
  zone.sectors.find((s) => s.boundary)?.boundary ?? (zone.root.precision === 'surveyed' ? 'defined' : 'approximate');

/**
 * Everything the layer draws, as the direct children of one group (the layer's
 * disposal clears direct children only). Under ZSP 1.0 each fill is a mesh of its
 * own with its own material, so one Sector can light while the others do not, and
 * carries its place's id as `userData.zspId`; a 2.0 partition is merged
 * (buildPartitionGroup).
 */
/** How a partition is drawn: its Sector lines simpler when the globe steps detail down (globeQuality.ts). */
export interface ZoneDrawing {
  simpleSectorLines?: boolean;
}

/** How far a simplified Sector line strays at most, in degrees: about 5 km, under a pixel with the globe in view. */
const SIMPLE_LINE_TOLERANCE = 0.05;
/** The longest span a simplified line keeps, in degrees of arc, so that it still follows the globe. */
const SIMPLE_LINE_SPAN = 1;

export function buildZoneGroup(index: ZoneIndex, drawing: ZoneDrawing = {}): THREE.Group {
  if (index.edition === '2.0') return buildPartitionGroup(index, drawing);
  const group = new THREE.Group();
  for (const zone of index.zones) {
    for (const { place, color, opacity } of filledPlaces(zone, index)) {
      const features: PolygonFeature[] = (place.geometry.type === 'Polygon' ? [place.geometry.coordinates] : place.geometry.coordinates)
        .flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `zsp:${place.id}#${i}`, rings: rings as LngLat[][] }] : []));
      const built = GeometryFactory.buildTerritoryPolygons(features, { color, opacity, elevation: FILL_ELEVATION });
      for (const part of built.children) {
        const geometry = (part as THREE.Mesh).geometry;
        if (!geometry) continue;
        // A mesh of its own over the factory's geometry: the factory keeps its mesh in its
        // cache, so its material is left as it is, and this one is ours to light.
        const mesh = new THREE.Mesh(geometry, createTerritoryFillMaterial({ baseColorHex: color, opacity }));
        mesh.name = `zsp:${place.id}`;
        mesh.userData.zspId = place.id;
        // How large its Zone is: where Zones overlap, the smaller is the more specific, and is named first.
        mesh.userData.zspSize = (zone.root.bbox[2] - zone.root.bbox[0]) * (zone.root.bbox[3] - zone.root.bbox[1]);
        mesh.renderOrder = ZONE_FILLS_ORDER;
        group.add(mesh);
      }
    }
    const { edge, between } = zoneLines(zone);
    const color = linesColor(zone, index);
    const sectorLook = sectorLineLook(boundaryOf(zone));
    const lines = buildBorderLineBatches(
      [
        ...between.map((coordinates, i): LineFeature & { look: 'between' | 'edge' } => ({ id: `zsp-between:${zone.root.id}#${i}`, coordinates, look: 'between' })),
        ...edge.map((coordinates, i): LineFeature & { look: 'between' | 'edge' } => ({ id: `zsp-edge:${zone.root.id}#${i}`, coordinates, look: 'edge' })),
      ],
      (f) => ({ color, look: f.look === 'edge' ? ZONE_EDGE_LOOK : sectorLook }),
      { elevation: LINE_ELEVATION },
    );
    if (lines.children.length > 0) group.add(...lines.children);
  }
  return group;
}

/** What a merged mesh of a partition keeps beside its parts: each part's place, and how large its Zone is. */
interface PartitionBatchData {
  zspIds: string[];
  zspSizes: Float32Array;
  /** The hovered and open places its targets were last set for. */
  zspTargetsFor?: string;
}

/** A place's polygons, built as every fill is, as the parts a merged mesh takes. */
function partsOf(place: ZspPlace, color: number, opacity: number): TerritoryPartSource[] {
  const features: PolygonFeature[] = (place.geometry.type === 'Polygon' ? [place.geometry.coordinates] : place.geometry.coordinates)
    .flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `zsp:${place.id}#${i}`, rings: rings as LngLat[][] }] : []));
  const built = GeometryFactory.buildTerritoryPolygons(features, { color, opacity, elevation: FILL_ELEVATION });
  return built.children.flatMap((child) => {
    const geometry = (child as THREE.Mesh).geometry;
    const position = geometry?.getAttribute('position');
    if (!position) return [];
    const indices = geometry.index ? geometry.index.array : Uint32Array.from({ length: position.count }, (_, k) => k);
    return [{ id: place.id, positions: position.array, indices }];
  });
}

/**
 * A ZSP 2.0 partition: its fills one mesh per Terra or Mare (and per opacity, for a Zone with no Sectors), each Sector
 * a part; its Zones' lines batched once across the partition by look; each Terra's and Mare's edge over them.
 *
 * Built a Terra or Mare at a time, yielding between them: a whole-globe partition takes about 1.6 s to triangulate
 * here, longer on a slow phone, and the page answers between its steps (buildZoneGroupInSteps).
 */
function* partitionSteps(index: ZoneIndex, group: THREE.Group, drawing: ZoneDrawing): Generator<void, void, void> {
  const batches = new Map<string, { container: string; opacity: number; sources: Array<TerritoryPartSource & { color: number; size: number }> }>();
  let last: string | null = null;
  for (const zone of index.zones) {
    const container = zone.root.container ?? zone.root.parent ?? '';
    if (last !== null && container !== last) yield;
    last = container;
    // Where Zones overlap, the smaller is the more specific, and is named first.
    const size = (zone.root.bbox[2] - zone.root.bbox[0]) * (zone.root.bbox[3] - zone.root.bbox[1]);
    for (const { place, color, opacity } of filledPlaces(zone, index)) {
      const key = `${container}|${opacity}`;
      const batch = batches.get(key) ?? { container, opacity, sources: [] };
      for (const part of partsOf(place, color, opacity)) batch.sources.push({ ...part, color, size });
      batches.set(key, batch);
    }
  }
  for (const { container, opacity, sources } of batches.values()) {
    const { geometry, parts } = mergeTerritoryParts(sources, { colorOf: (part) => part.color });
    if (parts.length === 0) { geometry.dispose(); continue; }
    const motion = createPartMotion(parts.length);
    geometry.addEventListener('dispose', () => motion.texture.dispose());
    const sizeOf = new Map(sources.map((source) => [source.id, source.size]));
    const mesh = new THREE.Mesh(geometry, createTerritoryFillMaterial({ baseColorHex: 0x9a9a9a, opacity, partState: motion.texture }));
    mesh.name = `zsp-fills:${container}`;
    const data: PartitionBatchData = { zspIds: parts.map((p) => p.id), zspSizes: Float32Array.from(parts, (p) => sizeOf.get(p.id) ?? Number.MAX_VALUE) };
    mesh.userData = { parts, motion, ...data };
    mesh.renderOrder = ZONE_FILLS_ORDER;
    group.add(mesh);
  }
  yield;
  type Path = LineFeature & { color: number; look: ReturnType<typeof partitionSectorLineLook> };
  const zonePaths = index.zones.flatMap((zone): Path[] => {
    const { edge, between } = zoneLines(zone);
    const color = linesColor(zone, index);
    const sectorLook = partitionSectorLineLook(boundaryOf(zone));
    // Simpler on a device the governor stepped down; the Zone's own edge stays whole (globeQuality.ts).
    const lines = drawing.simpleSectorLines ? between.map((c) => simplifyChain(c, SIMPLE_LINE_TOLERANCE, SIMPLE_LINE_SPAN)) : between;
    return [
      ...lines.map((coordinates, i): Path => ({ id: `zsp-between:${zone.root.id}#${i}`, coordinates, color, look: sectorLook })),
      ...edge.map((coordinates, i): Path => ({ id: `zsp-edge:${zone.root.id}#${i}`, coordinates, color, look: PARTITION_ZONE_EDGE_LOOK })),
    ];
  });
  const fills = partitionFills(index);
  const containerPaths = index.containers.flatMap((container): Path[] => {
    const color = lighter(fills.containers.get(container.root.id) ?? 0x9a9a9a, 0.28);
    return chained(segmentsOf(ringsOf(container.root.geometry)))
      .map((coordinates, i): Path => ({ id: `zsp-container:${container.root.id}#${i}`, coordinates, color, look: CONTAINER_EDGE_LOOK }));
  });
  for (const paths of [zonePaths, containerPaths]) {
    const lines = buildBorderLineBatches(paths, (f) => ({ color: f.color, look: f.look }), { elevation: LINE_ELEVATION });
    if (lines.children.length > 0) group.add(...lines.children);
  }
}

function buildPartitionGroup(index: ZoneIndex, drawing: ZoneDrawing): THREE.Group {
  const group = new THREE.Group();
  for (const _ of partitionSteps(index, group, drawing)) { /* each step at once */ }
  return group;
}

/** A frame's worth of time back to the page between steps. */
const breathe = () => new Promise<void>((done) => { setTimeout(done, 0); });

/** As buildZoneGroup, a ZSP 2.0 partition built a Terra or Mare at a time, the page answering in between. */
export async function buildZoneGroupInSteps(index: ZoneIndex, drawing: ZoneDrawing = {}, pause: () => Promise<void> = breathe): Promise<THREE.Group> {
  if (index.edition !== '2.0') return buildZoneGroup(index);
  const group = new THREE.Group();
  for (const _ of partitionSteps(index, group, drawing)) await pause();
  return group;
}

/**
 * Each part's targets: the Sector under the pointer lit; an open Sector lit, or every Sector of an open Zone, and
 * the rest dimmed while anything is open.
 */
export function partitionTargets(motion: TerritoryPartMotion, ids: readonly string[], hovered: string | null, selected: string | null): void {
  for (let p = 0; p < ids.length; p++) {
    const id = ids[p];
    const lit = selected !== null && (id === selected || id.startsWith(`${selected}/`));
    motion.targetHover[p] = id === hovered ? 1 : 0;
    motion.targetSelect[p] = lit ? 1 : 0;
    motion.targetDim[p] = selected !== null && !lit ? 1 : 0;
  }
}

/**
 * The key to ZSP 2.0's colours: each Terra and Mare by name, in its colour, and the three weights of line. Its Zones
 * and Sectors are shades of it, too many to list: the hover and the panel name each.
 */
function partitionLegend(index: ZoneIndex): LayerLegend {
  const w = messagesNow().zones;
  const fills = partitionFills(index);
  const swatches = index.containers.map((c) => ({
    color: swatchCss(fills.containers.get(c.root.id) ?? 0x9a9a9a),
    label: `${c.root.name} (${w.levels[c.root.level]})`,
    shape: 'area' as const,
  }));
  const line = swatchCss(0xc8d0d8);
  return {
    layerId: ZONES_LEGEND_ID,
    layer: 'Zones',
    colorMeans: 'its Terra or Mare: a land in an earth hue, a sea in a deep blue; its Zones and Sectors in shades of it',
    swatches: [
      ...swatches,
      { color: line, label: fill(w.legendContainer, { name: `${w.levels.terra} / ${w.levels.mare}` }), shape: 'line' },
      { color: line, label: w.legendZoneEdge, shape: 'line' },
      { color: line, label: fill(w.legendBetween, { boundary: 'approximate' }), shape: 'dashed' },
    ],
  };
}

/** The key to the colours: each Zone in its frame's or condition's colour, its Sectors in shades of it, and the lines. */
export function zonesLegend(index: ZoneIndex): LayerLegend {
  if (index.edition === '2.0') return partitionLegend(index);
  // A Zone's Sectors are one run of shades, named once, at its end.
  const fills = index.zones.flatMap((zone) => filledPlaces(zone, index).map(({ color }, i, all) => ({
    color: swatchCss(color),
    label: i === all.length - 1 ? `${zone.root.name} (${zoneColorMeaning(zone.root, messagesNow().zones.colour)})` : '',
    shape: 'area',
  })));
  const lines = index.zones.flatMap((zone) => {
    const color = swatchCss(linesColor(zone, index));
    const boundary = boundaryOf(zone);
    return [
      { color, label: fill(messagesNow().zones.legendEdge, { zone: zone.root.name }), shape: 'line' },
      { color, label: fill(messagesNow().zones.legendBetween, { boundary }), shape: boundary === 'defined' ? 'line' : 'dashed' },
    ];
  });
  return {
    layerId: ZONES_LEGEND_ID,
    layer: 'Zones',
    colorMeans: "the Zone's frame or condition; its Sectors in shades of it",
    swatches: [...fills, ...lines],
  };
}

/**
 * The place a ray finds first on the near side of the Earth, or null. A ray that
 * misses every fill in front would otherwise find one through the Earth, on the
 * far side of the globe, which is not under the pointer.
 */
export function placeUnderRay(ray: THREE.Raycaster, fills: THREE.Object3D[], earthRadius: number): string | null {
  return placesUnderRay(ray, fills, earthRadius)[0] ?? null;
}

/**
 * Every place a ray meets on the near side of the Earth, one per Zone, the smallest Zone's first. Zones overlap
 * (the Ring of Fire crosses the Dry Corridor; the Horn of Africa the Rift), so the pointer can be over a Sector
 * of each.
 */
export function placesUnderRay(ray: THREE.Raycaster, fills: THREE.Object3D[], earthRadius: number): string[] {
  const front = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), earthRadius), new THREE.Vector3());
  const limit = front ? front.distanceTo(ray.ray.origin) + 1 : Number.POSITIVE_INFINITY;
  const byZone = new Map<string, { id: string; size: number }>();
  for (const hit of ray.intersectObjects(fills, false)) {
    if (hit.distance > limit) continue;
    // A part of a partition's merged mesh, named through the vertex struck; or a fill of its own.
    const part = territoryBatchData(hit.object) ? territoryPartAt(hit) : null;
    const data = hit.object.userData as Partial<PartitionBatchData> & { zspId?: unknown; zspSize?: unknown };
    const id = part !== null ? data.zspIds?.[part] : data.zspId;
    if (typeof id !== 'string') continue;
    const size = part !== null ? data.zspSizes?.[part] : Number(data.zspSize);
    const zone = id.split('/')[0];
    if (!byZone.has(zone)) byZone.set(zone, { id, size: size || Number.MAX_VALUE });
  }
  return [...byZone.values()].sort((a, b) => a.size - b.size).map((p) => p.id);
}

export interface UseZones3DParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  /** The canvas the globe draws into, which pointer positions are measured against. */
  getCanvas: () => HTMLCanvasElement | null;
  /** The sun, as the country fills are lit by it. */
  solarDirection?: THREE.Vector3 | null;
  /** A partition's Sector lines simpler, on a device the quality governor stepped down (globeQuality.ts). */
  simpleSectorLines?: boolean;
}

export function useZones3D({ enabled, scene, camera, getCanvas, solarDirection, simpleSectorLines = false }: UseZones3DParams) {
  const { index, error: loadError } = useZoneIndex(enabled);
  const partition = enabled && index?.edition === '2.0';
  // Only a drawn partition makes its simpler lines a step worth taking (the governor passes over it otherwise).
  useEffect(() => {
    setGlobeZonesInUse(partition);
    return () => setGlobeZonesInUse(false);
  }, [partition]);
  // A 1.0 index draws the same either way, so only a partition is rebuilt when the step changes.
  const simple = partition && simpleSectorLines;
  const buildContent = useCallback(
    async () => (index ? buildZoneGroupInSteps(index, { simpleSectorLines: simple }) : new THREE.Group()),
    [index, simple],
  );
  const { loading, error, groupRef } = useSimpleGeoOverlayLayer({
    enabled: enabled && index !== null,
    scene,
    layerId: ZONES_LAYER_ID,
    layerOrder: 93,
    buildContent,
  });

  // The key, for as long as the layer draws.
  useEffect(() => {
    if (!enabled || !index) return;
    publishLegend(ZONES_LEGEND_ID, zonesLegend(index));
    return () => publishLegend(ZONES_LEGEND_ID, null);
  }, [enabled, index]);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const getCanvasRef = useRef(getCanvas);
  getCanvasRef.current = getCanvas;
  const sunRef = useRef<THREE.Vector3 | null>(solarDirection ?? null);
  const sunVersionRef = useRef(0);
  useEffect(() => {
    sunRef.current = solarDirection ?? null;
    sunVersionRef.current += 1;
  }, [solarDirection]);

  // The pointer: what is under it lights, and a click opens it.
  useEffect(() => {
    if (!enabled || !scene) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointer: PointerAt | null = null;
    let hovered: string | null = null;
    let pressed: PointerAt | null = null;

    // A Sector is nearer than the Spheres and the country under it; only nearer layers (a report's glyph) stop it.
    const stopClaiming = claimGlobeClicks(() => ({ mark: false, area: hovered !== null }), CLAIM_RANK.zones);
    const nearerTakes = (): boolean => nearerLayerTakes('area', CLAIM_RANK.zones);

    const fills = (): THREE.Mesh[] => (groupRef.current?.children ?? [])
      .filter((c): c is THREE.Mesh => typeof c.userData.zspId === 'string' || territoryBatchData(c) !== null);

    const pick = (at: PointerAt): string[] => {
      const canvas = getCanvasRef.current();
      const cam = cameraRef.current;
      const group = groupRef.current;
      if (!canvas || !cam || !group?.parent) return [];
      const rect = canvas.getBoundingClientRect();
      if (at.x < rect.left || at.x > rect.right || at.y < rect.top || at.y > rect.bottom) return [];
      ndc.set(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      return placesUnderRay(ray, fills(), GLOBE_RADIUS_UNITS * shellLift());
    };

    // Over the globe itself only: a panel drawn over a Sector does not light it.
    const onMove = (e: PointerEvent) => { pointer = e.target === getCanvasRef.current() ? { x: e.clientX, y: e.clientY } : null; };
    const onLeave = () => { pointer = null; };
    const onDown = (e: PointerEvent) => { pressed = pressOn(e, getCanvasRef.current(), 'area', CLAIM_RANK.zones); };
    const onUp = (e: PointerEvent) => {
      const press = pressed;
      pressed = null;
      const canvas = getCanvasRef.current();
      if (!canvas || e.target !== canvas || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const [id] = pick({ x: e.clientX, y: e.clientY });
      if (id) selectZonePlace(id);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && getZonesState().selected) selectZonePlace(null); };

    let frame = 0;
    let last = performance.now();
    let lastPick = 0;
    const reducedMotion = prefersReducedMotion();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - lastPick >= PICK_INTERVAL_MS) {
        lastPick = now;
        const [id = null, ...also] = pointer && !nearerTakes() ? pick(pointer) : [];
        hovered = id;
        setZoneHover(id && pointer ? { id, x: pointer.x, y: pointer.y, ...(also.length ? { also } : {}) } : null);
      }
      const { selected } = getZonesState();
      const alpha = reducedMotion ? 1 : Math.min(1, dt / LIGHT_UP_TAU_S);
      for (const mesh of fills()) {
        const material = mesh.material as THREE.Material;
        if (!isTerritoryFillMaterial(material)) continue;
        if (mesh.userData.zspSun !== sunVersionRef.current && sunRef.current) {
          setTerritoryMaterialSunDirection(material, sunRef.current);
          mesh.userData.zspSun = sunVersionRef.current;
        }
        // A partition's merged mesh: its parts' targets set when what is hovered or open changes, then eased.
        const batch = territoryBatchData(mesh);
        if (batch) {
          const data = mesh.userData as PartitionBatchData;
          const now = `${hovered ?? ''}|${selected ?? ''}`;
          if (data.zspTargetsFor !== now) {
            partitionTargets(batch.motion, data.zspIds, hovered, selected);
            data.zspTargetsFor = now;
          }
          easeTerritoryParts(batch.motion, alpha);
          continue;
        }
        const id = mesh.userData.zspId as string;
        // An open Sector is lit; an open Zone lights every Sector in it.
        const lit = selected !== null && (id === selected || id.startsWith(`${selected}/`));
        const t = (mesh.userData.zspT ??= { hover: 0, select: 0, dim: 0 }) as { hover: number; select: number; dim: number };
        t.hover += ((id === hovered ? 1 : 0) - t.hover) * alpha;
        t.select += ((lit ? 1 : 0) - t.select) * alpha;
        t.dim += ((selected !== null && !lit ? 1 : 0) - t.dim) * alpha;
        setTerritoryMaterialHoverSelectDim(material, t.hover, t.select, t.dim);
      }
    };
    frame = requestAnimationFrame(loop);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('blur', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      stopClaiming();
      setZoneHover(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, scene, groupRef]);

  return { loading, error: loadError ?? error, index };
}
