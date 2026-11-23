/**
 * Zones, with Sectors inside the Zones: the Zone and Sector Protocol, ZSP 1.0.
 *
 * A Zone says what is happening in an area; a Sector says what each part of it
 * is for. The Zone's own principle draws its Sectors' lines (a rift's faults, a
 * basin's watersheds), never national borders unless politics defines the Zone.
 *
 * The documents are made and checked in Mecha Jono's repository (the protocol is
 * its docs/zones/ZONE_SECTOR_PROTOCOL.md; the wiki page is "Zone and Sector
 * Protocol") and copied into public/geopolitical/zones/ by its export script,
 * with a manifest of their hashes. Nothing here edits them.
 *
 * A Zone's code is the one a report already names it by (areaRegistry.ts, BA17):
 * `zone:east-african-rift`. A Sector's adds its own part to it:
 * `zone:east-african-rift/sector:afar-triangle`.
 *
 * Lines are drawn no finer than their `precision` says, which for every Zone so
 * far is "approximate": the panel and the hover say so.
 */
import { pointInGeometry, type PolygonGeometry } from '../../services/geoint/pointInPolygon';

/**
 * The schema's levels. A Nested Zone is a `zone` with a parent: a Zone inside a Sector or Sub-Sector (ZSP 1.0).
 * ZSP 2.0 puts every Zone in a Terra (a land) or a Mare (a sea) of the world (decision D-ZR, ZR1–ZR2).
 */
export type ZspLevel = 'terra' | 'mare' | 'zone' | 'sector' | 'sub-sector';
export type ZspEdition = '1.0' | '2.0';
export type ZspPrecision = 'schematic' | 'approximate' | 'surveyed';

export interface ZspSource {
  name: string;
  url?: string;
  for?: string;
  /** The source's own licence, as the document records it. */
  licence?: string;
}

/** A Zone, a Sector, a Sub-Sector or a Nested Zone: one feature of a ZSP document. */
export interface ZspPlace {
  id: string;
  name: string;
  level: ZspLevel;
  /** The place it lies in; null for a Zone at the top. */
  parent: string | null;
  /** The Zone at the top of its document. */
  zone: string;
  geometry: PolygonGeometry;
  precision: ZspPrecision;
  /** A Zone's class: anchor, event or nested. */
  zoneClass?: string;
  /** What is happening: hazard, conflict and the rest; an Anchor Zone's is "frame". */
  condition?: string;
  /** An Anchor Zone's frame: geological, hydrological, ecological, climatic, cultural or operational. */
  frame?: string;
  principle?: string;
  state?: string;
  lifecycle?: string;
  /** How a Sector's lines are drawn: defined, approximate, transition or disputed. */
  boundary?: string;
  character?: string;
  terrain: string[];
  hazards: string[];
  resources: string[];
  landmarks: string[];
  /** ISO 3166-1 alpha-2, lower case. */
  countries: string[];
  sources: ZspSource[];
  /** Its page on the FusionGirl wiki, by title. */
  canon?: string;
  label: { lat: number; lon: number };
  /** West, south, east, north. */
  bbox: [number, number, number, number];
  /** The source's own alert level, quoted with its source; ZSP invents none. */
  alert?: string;
  /** ZSP 2.0: the Terra or Mare it lies in (its own id for a Terra or Mare). */
  container?: string;
  /** ZSP 2.0, a Zone's: the system that binds it (rift, orogen, basin, shield, plateau, delta, arc, ridge, gyre). */
  system?: string;
  /** ZSP 2.0: the plates it lies on. */
  plates?: string[];
  /** ZSP 2.0, a Sector's: its area, as the document states it. */
  areaKm2?: number;
  /** ZSP 2.0, a Sector's: the ecoregions it overlaps. */
  ecoregions?: string[];
  /** ZSP 2.0, a Sector's: what each of its edges follows, and the source of that line. */
  edges?: ZspEdge[];
  /** ZSP 2.0, a Sector's: why it is outside 50,000–500,000 km², when it is. */
  sizeReason?: string;
  /** ZSP 2.0, a Sector's: its landform, in the IAU's own word for one ("Planitia", "Chasma"), when it has one. */
  descriptor?: string;
}

/**
 * What one of a Sector's edges follows (decision D-ZR, ZR7): at sea also an ocean front and the continental margin
 * (ZR18, for Mecha Jono's Maria).
 */
export interface ZspEdge {
  follows: 'plate' | 'divide' | 'ecoregion' | 'grid' | 'front' | 'margin';
  /** The line's own name: "the Somali–Nubian boundary", "the Mau Escarpment". */
  name?: string;
  source?: string;
}

/** A Terra or a Mare, with its Zones (ZSP 2.0). */
export interface ZspContainer {
  root: ZspPlace;
  /** Its Zones, in the document's order. */
  zones: ZspZone[];
  /** Features the document carried that this build could not read, counted rather than dropped unsaid. */
  unread: number;
  licence?: string;
}

/** A ZSP 1.0 Zone that ZSP 2.0 retired, and the Zones that now cover its place (ZR8). */
export interface RetiredZone {
  id: string;
  name: string;
  coveredBy: string[];
}

export interface ZspZone {
  /** The Zone itself. */
  root: ZspPlace;
  /** Its Sectors, in the document's order, which runs along the Zone. */
  sectors: ZspPlace[];
  /** Every place in the document, the Zone first. */
  places: ZspPlace[];
  /** Features the document carried that this build could not read, counted rather than dropped unsaid. */
  unread: number;
  /** The document's own licence, when its sources make it one (the Dry Corridor's is CC-BY-SA-4.0). */
  licence?: string;
}

export interface ZoneIndex {
  /** Which edition was served: 1.0's Zones stand alone, 2.0's tile the globe inside their Terrae and Maria. */
  edition: ZspEdition;
  zones: ZspZone[];
  /** ZSP 2.0's Terrae and Maria; none under 1.0. */
  containers: ZspContainer[];
  byId: ReadonlyMap<string, ZspPlace>;
  /** ZSP 2.0: each retired 1.0 Zone by its old id, so a report naming it still finds its places. */
  retired: ReadonlyMap<string, RetiredZone>;
}

const LEVELS = new Set<ZspLevel>(['zone', 'sector', 'sub-sector']);
const PRECISIONS = new Set<ZspPrecision>(['schematic', 'approximate', 'surveyed']);

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const isShape = (geometry: unknown): geometry is PolygonGeometry => {
  const g = geometry as { type?: unknown; coordinates?: unknown } | null | undefined;
  return (g?.type === 'Polygon' || g?.type === 'MultiPolygon') && Array.isArray(g.coordinates) && g.coordinates.length > 0;
};

function placeFrom(feature: { properties?: Record<string, unknown>; geometry?: unknown }, zone: string): ZspPlace | null {
  const p = feature.properties ?? {};
  const id = text(p.id);
  const name = text(p.name);
  const level = p.level as ZspLevel;
  const precision = p.precision as ZspPrecision;
  const label = p.label as { lat?: unknown; lon?: unknown } | undefined;
  const bbox = p.bbox as unknown[] | undefined;
  if (!id || !name || !LEVELS.has(level) || !PRECISIONS.has(precision) || !isShape(feature.geometry)) return null;
  if (!id.startsWith(zone)) return null;
  if (typeof label?.lat !== 'number' || typeof label?.lon !== 'number') return null;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === 'number')) return null;
  const sources = Array.isArray(p.sources)
    ? (p.sources as Array<Record<string, unknown>>).flatMap((s) => (text(s?.name)
      ? [{ name: s.name as string, url: text(s.url), for: text(s.for), licence: text(s.licence) }] : []))
    : [];
  return {
    id,
    name,
    level,
    parent: text(p.parent) ?? null,
    zone,
    geometry: feature.geometry,
    precision,
    zoneClass: text(p.class),
    condition: text(p.condition),
    frame: text(p.frame),
    principle: text(p.principle),
    state: text(p.state),
    lifecycle: text(p.lifecycle),
    boundary: text(p.boundary),
    character: text(p.character),
    terrain: texts(p.terrain),
    hazards: texts(p.hazards),
    resources: texts(p.resources),
    landmarks: texts(p.landmarks),
    countries: texts(p.countries),
    sources,
    canon: text(p.canon),
    label: { lat: label.lat, lon: label.lon },
    bbox: bbox as [number, number, number, number],
    alert: text(p.alert),
  };
}

/**
 * A ZSP document as the globe reads it, or null when it is not one: no `zsp`
 * version, no Zone at its top, or a top that is not the Zone it names.
 */
export function zoneFrom(doc: unknown): ZspZone | null {
  const d = doc as { zsp?: unknown; zone?: unknown; features?: unknown; licence?: unknown } | null | undefined;
  const zone = text(d?.zone);
  if (d?.zsp !== '1.0' || !zone || !Array.isArray(d.features)) return null;
  const places: ZspPlace[] = [];
  let unread = 0;
  for (const feature of d.features as Array<{ properties?: Record<string, unknown>; geometry?: unknown }>) {
    const place = placeFrom(feature, zone);
    if (place) places.push(place);
    else unread += 1;
  }
  const root = places.find((p) => p.id === zone && p.level === 'zone' && p.parent === null);
  if (!root) return null;
  return {
    root,
    sectors: places.filter((p) => p.level === 'sector' && p.parent === zone),
    places: [root, ...places.filter((p) => p !== root)],
    unread,
    licence: text(d.licence),
  };
}

export function zoneIndexOf(
  zones: ZspZone[],
  more: { edition?: ZspEdition; containers?: ZspContainer[]; retired?: readonly RetiredZone[] } = {},
): ZoneIndex {
  const byId = new Map<string, ZspPlace>();
  for (const container of more.containers ?? []) byId.set(container.root.id, container.root);
  for (const zone of zones) for (const place of zone.places) byId.set(place.id, place);
  return {
    edition: more.edition ?? '1.0',
    zones,
    containers: more.containers ?? [],
    byId,
    retired: new Map((more.retired ?? []).map((r) => [r.id, r])),
  };
}

/** The Sectors and the rest a place holds directly; a Terra's or a Mare's Zones. */
export function childrenOf(index: ZoneIndex, id: string): ZspPlace[] {
  const container = index.containers.find((c) => c.root.id === id);
  if (container) return container.zones.map((z) => z.root);
  const zone = index.zones.find((z) => z.root.zone === index.byId.get(id)?.zone);
  return zone ? zone.places.filter((p) => p.parent === id) : [];
}

// ─── ZSP 2.0: the whole globe, in Terrae and Maria (decision D-ZR) ──────────────

type LngLat = [number, number];

const CONTAINER_ID = /^(terra|mare):[a-z0-9-]+$/;
const ZONE_ID = /^zone:[a-z0-9-]+$/;
const SECTOR_ID = /^zone:[a-z0-9-]+\/sector:[a-z0-9-]+$/;
const LEVELS_2 = new Set<ZspLevel>(['terra', 'mare', 'zone', 'sector']);
const FOLLOWS = new Set<ZspEdge['follows']>(['plate', 'divide', 'ecoregion', 'grid', 'front', 'margin']);

/**
 * The IAU's descriptor terms for a planet's surface features, the words a Sector's landform is named in (D-ZR, the
 * owner, 2026-10-18), singular and plural: Planitia a low plain, Planum a plateau, Chasma a deep rift valley, and so
 * on (IAU WGPSN, "Descriptor Terms"). Arcus, an arc-shaped feature, for the island arcs at sea (ZR18).
 */
export const IAU_DESCRIPTORS: ReadonlySet<string> = new Set([
  'Arcus', 'Catena', 'Catenae', 'Chaos', 'Chasma', 'Chasmata', 'Collis', 'Colles', 'Dorsum', 'Dorsa', 'Fluctus', 'Fossa', 'Fossae',
  'Fretum', 'Insula', 'Insulae', 'Labyrinthus', 'Lacus', 'Mensa', 'Mensae', 'Mons', 'Montes', 'Palus', 'Patera', 'Planitia',
  'Planum', 'Promontorium', 'Regio', 'Rupes', 'Scopulus', 'Sinus', 'Sulcus', 'Sulci', 'Tholus', 'Tholi', 'Unda', 'Undae',
  'Vallis', 'Valles', 'Vastitas',
]);

const outerRings = (geometry: PolygonGeometry): LngLat[][] =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map((rings) => (rings as LngLat[][])[0])
    .filter((ring): ring is LngLat[] => Array.isArray(ring) && ring.length >= 4);

/** West, south, east, north, from the geometry itself. */
export function bboxOf(geometry: PolygonGeometry): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of outerRings(geometry)) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}

/**
 * Where a name is put: the centre of the largest outer ring, by the plane's own area (a label, not a survey), when it
 * lies inside the place. A bent or hollow place's centre can lie outside it, on a neighbour; then the name goes at the
 * middle of the widest run across the place along rows of that ring's box.
 */
export function labelOf(geometry: PolygonGeometry): { lat: number; lon: number } {
  let best = { area: -1, lon: 0, lat: 0 };
  let largest: readonly (readonly number[])[] = [];
  for (const ring of outerRings(geometry)) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
    }
    const area = Math.abs(a / 2);
    if (area > best.area) {
      largest = ring;
      best = area > 0
        ? { area, lon: cx / (3 * a), lat: cy / (3 * a) }
        : { area, lon: ring[0][0], lat: ring[0][1] };
    }
  }
  if (best.area <= 0 || pointInGeometry(best.lat, best.lon, geometry)) return { lat: best.lat, lon: best.lon };
  return widestRunIn(largest, geometry) ?? { lat: best.lat, lon: best.lon };
}

/** The middle of the widest run across a ring, along 24 rows of its box, that lies in the place (not in a hole). */
function widestRunIn(ring: readonly (readonly number[])[], geometry: PolygonGeometry): { lat: number; lon: number } | null {
  const lats = ring.map(([, y]) => y);
  const s = Math.min(...lats);
  const n = Math.max(...lats);
  let found: { lat: number; lon: number } | null = null;
  let widest = 0;
  for (let k = 0; k < 24; k += 1) {
    const lat = s + ((k + 0.5) / 24) * (n - s);
    const xs = ring.slice(1).flatMap(([x1, y1], i) => {
      const [x0, y0] = ring[i];
      return (y0 > lat) !== (y1 > lat) ? [x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0)] : [];
    }).sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const lon = (xs[i] + xs[i + 1]) / 2;
      if (xs[i + 1] - xs[i] > widest && pointInGeometry(lat, lon, geometry)) {
        widest = xs[i + 1] - xs[i];
        found = { lat, lon };
      }
    }
  }
  return found;
}

function edgesFrom(value: unknown): ZspEdge[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((e: Record<string, unknown>) => (FOLLOWS.has(e?.follows as ZspEdge['follows'])
    ? [{ follows: e.follows as ZspEdge['follows'], name: text(e.name), source: text(e.source) }] : []));
}

/**
 * Every property a ZSP 2.0 place is read from (placeFrom2 below), and of an edge its three: all a writer need serve.
 * Mecha Jono's Maria manifest carries more (an edge's neighbour and length, a Zone's notes and bounds), which stays in
 * their manifest and is never served (decision D-ZR, ZR27).
 */
export const ZSP2_PLACE_FIELDS = [
  'id', 'name', 'level', 'parent', 'precision', 'principle', 'system', 'state', 'boundary', 'character', 'terrain',
  'hazards', 'resources', 'landmarks', 'countries', 'plates', 'ecoregions', 'edges', 'size_reason', 'descriptor',
  'area_km2', 'sources', 'label', 'bbox',
] as const;
export const ZSP2_EDGE_FIELDS = ['follows', 'name', 'source'] as const;

/** A place's properties as served: only what the reader reads, its edges' three fields each. */
export function servedPlace(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ZSP2_PLACE_FIELDS) if (properties[key] !== undefined) out[key] = properties[key];
  if (Array.isArray(out.edges)) {
    out.edges = (out.edges as Array<Record<string, unknown>>).map((edge) =>
      Object.fromEntries(ZSP2_EDGE_FIELDS.filter((key) => edge?.[key] !== undefined).map((key) => [key, edge[key]])));
  }
  return out;
}

/** One feature of a ZSP 2.0 file, or null when it breaks the edition's rules for its level. */
function placeFrom2(feature: { properties?: Record<string, unknown>; geometry?: unknown }, container: string): ZspPlace | null {
  const p = feature.properties ?? {};
  const id = text(p.id);
  const name = text(p.name);
  const level = p.level as ZspLevel;
  if (!id || !name || !LEVELS_2.has(level) || !isShape(feature.geometry)) return null;
  const parent = text(p.parent) ?? null;
  // Each level's id has its own form, and names the place it lies in.
  if (level === 'terra' || level === 'mare') {
    if (id !== container || !id.startsWith(`${level}:`) || parent !== null) return null;
  } else if (level === 'zone') {
    if (!ZONE_ID.test(id) || parent !== container) return null;
  } else if (!SECTOR_ID.test(id) || parent !== id.split('/')[0]) return null;
  const precision = PRECISIONS.has(p.precision as ZspPrecision) ? p.precision as ZspPrecision : 'approximate';
  const label = p.label as { lat?: unknown; lon?: unknown } | undefined;
  const bbox = p.bbox as unknown[] | undefined;
  const sources = Array.isArray(p.sources)
    ? (p.sources as Array<Record<string, unknown>>).flatMap((s) => (text(s?.name)
      ? [{ name: s.name as string, url: text(s.url), for: text(s.for), licence: text(s.licence) }] : []))
    : [];
  const area = Number(p.area_km2);
  return {
    id,
    name,
    level,
    parent,
    zone: level === 'terra' || level === 'mare' ? id : id.split('/')[0],
    container,
    geometry: feature.geometry,
    precision,
    principle: text(p.principle),
    system: text(p.system),
    state: text(p.state),
    boundary: text(p.boundary),
    character: text(p.character),
    terrain: texts(p.terrain),
    hazards: texts(p.hazards),
    resources: texts(p.resources),
    landmarks: texts(p.landmarks),
    countries: texts(p.countries),
    plates: texts(p.plates),
    ecoregions: texts(p.ecoregions),
    edges: edgesFrom(p.edges),
    sizeReason: text(p.size_reason),
    descriptor: IAU_DESCRIPTORS.has(String(p.descriptor)) ? String(p.descriptor) : undefined,
    ...(Number.isFinite(area) && area > 0 ? { areaKm2: area } : {}),
    sources,
    label: typeof label?.lat === 'number' && typeof label?.lon === 'number' ? { lat: label.lat, lon: label.lon } : labelOf(feature.geometry),
    bbox: Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === 'number')
      ? bbox as [number, number, number, number] : bboxOf(feature.geometry),
    alert: text(p.alert),
  };
}

/**
 * A ZSP 2.0 file as the globe reads it: one Terra or Mare with its Zones and their Sectors. Null when it is not one:
 * another edition, no container named at its top, or no outline of that container in it. A Zone whose container is
 * another, or a Sector whose Zone is not in the file, is counted as unread.
 */
export function containerFrom(doc: unknown): ZspContainer | null {
  const d = doc as { zsp?: unknown; container?: unknown; features?: unknown; licence?: unknown } | null | undefined;
  const container = text(d?.container);
  if (d?.zsp !== '2.0' || !container || !CONTAINER_ID.test(container) || !Array.isArray(d.features)) return null;
  const places: ZspPlace[] = [];
  let unread = 0;
  for (const feature of d.features as Array<{ properties?: Record<string, unknown>; geometry?: unknown }>) {
    const place = placeFrom2(feature, container);
    if (place) places.push(place);
    else unread += 1;
  }
  const root = places.find((p) => p.id === container);
  if (!root) return null;
  const zoneRoots = places.filter((p) => p.level === 'zone');
  const zones: ZspZone[] = zoneRoots.map((z) => {
    const sectors = places.filter((p) => p.level === 'sector' && p.parent === z.id);
    return { root: z, sectors, places: [z, ...sectors], unread: 0, licence: text(d.licence) };
  });
  const placed = new Set<ZspPlace>([root, ...zones.flatMap((z) => z.places)]);
  unread += places.filter((p) => !placed.has(p)).length;
  return { root, zones, unread, licence: text(d.licence) };
}

/** The retired Zones a 2.0 manifest lists, each with the Zones now covering it. */
export function retiredFrom(manifest: unknown): RetiredZone[] {
  const m = manifest as { zsp?: unknown; retired?: unknown } | null | undefined;
  if (m?.zsp !== '2.0' || !Array.isArray(m.retired)) return [];
  return (m.retired as Array<Record<string, unknown>>).flatMap((r) => {
    const id = text(r?.id);
    return id && ZONE_ID.test(id) ? [{ id, name: text(r.name) ?? id, coveredBy: texts(r.covered_by).filter((z) => ZONE_ID.test(z)) }] : [];
  });
}

/**
 * The places a Zone code stands for, as a report names it: the place itself; or, for a 1.0 Zone that 2.0 retired,
 * the Zones that now cover its place. Empty for a code the index does not hold.
 */
export function placesForCode(index: ZoneIndex, code: string): ZspPlace[] {
  const place = index.byId.get(code);
  if (place) return [place];
  return (index.retired.get(code)?.coveredBy ?? []).flatMap((id) => index.byId.get(id) ?? []);
}

/**
 * The innermost place a point lies in: a Sector before its Zone. Null outside
 * every Zone. Sectors partition their Zone, so a point is in one at most,
 * except on a shared line, where the first in the document's order is taken.
 */
export function placeAt(index: ZoneIndex, lat: number, lon: number): ZspPlace | null {
  for (const zone of index.zones) {
    const [w, s, e, n] = zone.root.bbox;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    if (!pointInGeometry(lat, lon, zone.root.geometry)) continue;
    const inner = zone.places
      .filter((p) => p.level !== 'zone' && pointInGeometry(lat, lon, p.geometry))
      .sort((a, b) => depth(b) - depth(a))[0];
    return inner ?? zone.root;
  }
  // ZSP 2.0 tiles the globe with Zones, so this is reached only through a gap a check would have refused.
  for (const container of index.containers) {
    if (pointInGeometry(lat, lon, container.root.geometry)) return container.root;
  }
  return null;
}

const depth = (place: ZspPlace): number => place.id.split('/').length;

/** A Creative Commons licence id, such as CC-BY-SA-4.0, as its deed's address; null for any other. */
export function licenceUrl(licence: string | undefined): string | null {
  const m = /^CC-(BY(?:-NC)?(?:-SA|-ND)?)-(\d\.\d)$/i.exec(licence ?? '');
  return m ? `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/` : null;
}

/** Where a reader finds the place's own page on the wiki. */
export function canonUrl(place: ZspPlace): string | null {
  return place.canon ? `https://wiki.fusiongirl.app/wiki/${encodeURIComponent(place.canon.replace(/ /g, '_'))}` : null;
}

// ─── Loading ─────────────────────────────────────────────────────────────────

interface ManifestEntry {
  id: string;
  file: string;
  sha256: string;
}

export const ZONES_FOLDER = '/geopolitical/zones';

/** The edition a manifest is in, or null when it is in none this build reads. */
export function editionOf(manifest: unknown): ZspEdition | null {
  const zsp = (manifest as { zsp?: unknown } | null | undefined)?.zsp;
  return zsp === '1.0' || zsp === '2.0' ? zsp : null;
}

/** The manifest's entries this build can read, its Zones (1.0) or its Terrae and Maria (2.0); any other is passed over. */
export function manifestEntriesFrom(manifest: unknown): ManifestEntry[] {
  const m = manifest as { zones?: unknown; containers?: unknown } | null | undefined;
  const edition = editionOf(manifest);
  const entries = edition === '1.0' ? m?.zones : edition === '2.0' ? m?.containers : undefined;
  if (!Array.isArray(entries)) return [];
  return entries.filter((z): z is ManifestEntry => typeof z?.id === 'string' && typeof z?.file === 'string'
    && /^[a-z0-9-]+\.zsp\.geojson$/.test(z.file) && typeof z?.sha256 === 'string'
    && (edition === '1.0' || CONTAINER_ID.test(z.id)));
}

/** The index a manifest and its documents make, in the manifest's edition. */
export function indexFrom(manifest: unknown, docs: readonly unknown[]): ZoneIndex {
  if (editionOf(manifest) === '2.0') {
    const containers = docs.map((doc) => containerFrom(doc)).filter((c): c is ZspContainer => c !== null);
    return zoneIndexOf(containers.flatMap((c) => c.zones), { edition: '2.0', containers, retired: retiredFrom(manifest) });
  }
  return zoneIndexOf(docs.map((doc) => zoneFrom(doc)).filter((z): z is ZspZone => z !== null));
}

let loading: Promise<ZoneIndex | undefined> | null = null;

/**
 * Every Zone, fetched once per session. Each document is asked for by its hash,
 * so a browser never keeps a Zone's old lines under one address. Undefined when
 * the manifest could not be read; the next caller tries again. A document that
 * cannot be read is left out, and the rest still load.
 */
export function loadZones(): Promise<ZoneIndex | undefined> {
  loading ??= fetch(`${ZONES_FOLDER}/manifest.json`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then(async (manifest) => {
      const docs = await Promise.all(manifestEntriesFrom(manifest).map((entry) =>
        fetch(`${ZONES_FOLDER}/${entry.file}?v=${entry.sha256.slice(0, 12)}`, { cache: 'force-cache' })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)));
      return indexFrom(manifest, docs);
    })
    .catch(() => {
      loading = null;
      return undefined;
    });
  return loading;
}

/** Test-only: forget the fetched Zones. */
export function resetZonesForTests(): void {
  loading = null;
}
