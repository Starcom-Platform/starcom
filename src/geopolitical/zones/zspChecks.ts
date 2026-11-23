/**
 * The checks a ZSP 2.0 partition passes before Starcom serves it (decision D-ZR, ZR9): the same ones Mecha Jono's
 * export runs, so a set that fails is refused at the build, never drawn with a gap in it. Run by
 * scripts/guard-zsp.mjs; read through the reader the globe uses (zsp.ts), so what is checked is what is drawn.
 *
 * - Every file is the one its manifest names: the same hash, the same container, nothing unread.
 * - Every id is unique on Earth; every Sector has its Zone, every Zone its container.
 * - Every Sector is 50,000 to 500,000 km², or says why not in `size_reason`; a landform `descriptor` is an IAU term.
 * - Every ring is closed, wound as RFC 7946 says (outer rings counter-clockwise), and crosses itself nowhere.
 * - Every source states its licence, and none is share-alike or non-commercial: the partition is CC BY 4.0.
 * - The Sectors cover the globe: their areas add up to the Earth's to within 0.01%, and every point of a 2° grid
 *   lies in exactly one Sector, so no hole or overlap wider than the grid goes unseen.
 * - Every retired 1.0 Zone is covered by Zones the partition holds.
 * - The whole set is under 6 MB before compression, as the handoff asks: the globe loads it whole when Zones are
 *   shown, and a partition traced off a raster carries far more points per edge than one drawn as lines.
 */
import { area as turfArea } from '@turf/turf';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import { pointInGeometry } from '../../services/geoint/pointInPolygon';
import {
  containerFrom, editionOf, IAU_DESCRIPTORS, manifestEntriesFrom, retiredFrom, type ZspContainer, type ZspPlace,
} from './zsp';

/** The Earth's area on the sphere turf measures with (radius 6,371,008.8 m), in km². */
export const EARTH_KM2 = 4 * Math.PI * 6371.0088 ** 2;
export const SECTOR_MIN_KM2 = 50_000;
export const SECTOR_MAX_KM2 = 500_000;
const COVER_TOLERANCE = 1e-4;
/**
 * The cap on the whole set, before compression: the handoff's "Keep the whole set under 6 MB", raised to 8 MB by the
 * owner on 26 Oct once Mecha Jono's Maria were measured (ZR27): 7.3 MB raw, under 0.9 MB compressed.
 */
export const PARTITION_MAX_BYTES = 8_000_000;
const GRID_STEP = 2;
/** A whole number of km² with thousands marked, the same in every language this report is read in. */
const km2Text = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const ALLOWED_LICENCE = /^(CC0(-1\.0)?|CC-BY(-[34]\.0)?|ODC-BY(-1\.0)?|PDDL(-1\.0)?|OGL(-UK)?-3\.0|NLOD(-2\.0)?|public domain|Public domain)$/i;
const FORBIDDEN_LICENCE = /(-SA\b|-NC\b|ShareAlike|NonCommercial|BY-SA|BY-NC)/i;

type LngLat = [number, number];

export interface PartitionReport {
  /** The edition served; the checks run only on 2.0. */
  edition: '1.0' | '2.0' | null;
  problems: string[];
  containers: number;
  zones: number;
  sectors: number;
  /** The Sectors' areas added up, in km². */
  coveredKm2: number;
  /** The files' size together, in bytes as written (UTF-8), and their rings' points: what a partition costs to load. */
  bytes: number;
  points: number;
}

const ringsOf = (geometry: PolygonGeometry): LngLat[][][] =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as LngLat[][][];

/** Twice the signed area of a ring in the plane of longitude and latitude: positive when counter-clockwise. */
function signedArea2(ring: readonly LngLat[]): number {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a;
}

const orient = (a: LngLat, b: LngLat, c: LngLat): number => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));

/** Whether two segments cross at a point that is not an end they share. */
function crosses(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * Whether a ring crosses itself, its segments bucketed in a grid of the ring's own box so that only neighbours are
 * compared: a Sector's ring runs to thousands of points, and comparing every pair would take minutes.
 */
export function selfIntersects(ring: readonly LngLat[]): boolean {
  const n = ring.length - 1;
  if (n < 4) return false;
  let [w, s, e, nn] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); nn = Math.max(nn, y); }
  const cells = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cw = (e - w) / cells || 1, ch = (nn - s) / cells || 1;
  const bucket = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const [a, b] = [ring[i], ring[i + 1]];
    const x0 = Math.floor((Math.min(a[0], b[0]) - w) / cw), x1 = Math.floor((Math.max(a[0], b[0]) - w) / cw);
    const y0 = Math.floor((Math.min(a[1], b[1]) - s) / ch), y1 = Math.floor((Math.max(a[1], b[1]) - s) / ch);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = x * (cells + 1) + y;
        const here = bucket.get(key) ?? [];
        for (const j of here) {
          const adjacent = Math.abs(i - j) === 1 || (i === n - 1 && j === 0);
          if (!adjacent && crosses(a, b, ring[j], ring[j + 1])) return true;
        }
        here.push(i);
        bucket.set(key, here);
      }
    }
  }
  return false;
}

function geometryProblems(place: ZspPlace): string[] {
  const out: string[] = [];
  ringsOf(place.geometry).forEach((rings, p) => rings.forEach((ring, r) => {
    const where = `${place.id} (polygon ${p + 1}, ring ${r + 1})`;
    const first = ring[0], last = ring[ring.length - 1];
    if (ring.length < 4 || !first || !last || first[0] !== last[0] || first[1] !== last[1]) { out.push(`${where}: not a closed ring of four points or more`); return; }
    const ccw = signedArea2(ring) > 0;
    if (r === 0 && !ccw) out.push(`${where}: an outer ring wound clockwise (RFC 7946 asks counter-clockwise)`);
    if (r > 0 && ccw) out.push(`${where}: a hole wound counter-clockwise (RFC 7946 asks clockwise)`);
    if (selfIntersects(ring)) out.push(`${where}: crosses itself`);
  }));
  return out;
}

function licenceProblems(place: ZspPlace): string[] {
  return place.sources.flatMap((s) => {
    if (!s.licence) return [`${place.id}: source "${s.name}" states no licence`];
    if (FORBIDDEN_LICENCE.test(s.licence)) return [`${place.id}: source "${s.name}" is ${s.licence}, which would bind the partition`];
    return [];
  });
}

/** Every check, on a manifest and its files as text, by file name; `sha256` hashes a file's text as the manifest does. */
export function checkPartition(manifest: unknown, files: Readonly<Record<string, string>>, sha256: (text: string) => string): PartitionReport {
  const edition = editionOf(manifest);
  const report: PartitionReport = { edition, problems: [], containers: 0, zones: 0, sectors: 0, coveredKm2: 0, bytes: 0, points: 0 };
  if (edition !== '2.0') return report;
  const problems = report.problems;
  const licence = (manifest as { licence?: unknown }).licence;
  if (typeof licence !== 'string' || !ALLOWED_LICENCE.test(licence) || FORBIDDEN_LICENCE.test(licence)) {
    problems.push(`manifest: the partition's licence is ${String(licence)}; it is to be CC-BY-4.0 or freer`);
  }

  const containers: ZspContainer[] = [];
  /** Each feature's properties as written, for what the reader passes over in silence (a descriptor it does not know). */
  const raw = new Map<string, Record<string, unknown>>();
  for (const entry of manifestEntriesFrom(manifest)) {
    const text = files[entry.file];
    if (text === undefined) { problems.push(`${entry.file}: named in the manifest, not in the folder`); continue; }
    if (sha256(text) !== entry.sha256) problems.push(`${entry.file}: its hash is not the manifest's`);
    const bytes = new TextEncoder().encode(text).length;
    report.bytes += bytes;
    // The size a manifest states is the file's in bytes as written (UTF-8), not its characters: a dash is three.
    const stated = (entry as { bytes?: unknown }).bytes;
    if (stated !== undefined && stated !== bytes) problems.push(`${entry.file}: the manifest says ${String(stated)} bytes, the file is ${bytes}`);
    let doc: unknown;
    try { doc = JSON.parse(text); } catch { problems.push(`${entry.file}: not JSON`); continue; }
    for (const f of ((doc as { features?: Array<{ properties?: Record<string, unknown> }> }).features ?? [])) {
      if (typeof f.properties?.id === 'string') raw.set(f.properties.id, f.properties);
    }
    const container = containerFrom(doc);
    if (!container) { problems.push(`${entry.file}: not a ZSP 2.0 container file with its own outline`); continue; }
    if (container.root.id !== entry.id) problems.push(`${entry.file}: holds ${container.root.id}, the manifest says ${entry.id}`);
    if (container.unread > 0) problems.push(`${entry.file}: ${container.unread} feature(s) break their level's rules`);
    containers.push(container);
  }

  const seen = new Set<string>();
  const sectors: ZspPlace[] = [];
  for (const container of containers) {
    report.containers += 1;
    const places = [container.root, ...container.zones.flatMap((z) => z.places)];
    for (const place of places) {
      if (seen.has(place.id)) problems.push(`${place.id}: the id is used twice`);
      seen.add(place.id);
      problems.push(...geometryProblems(place), ...licenceProblems(place));
      for (const polygon of ringsOf(place.geometry)) for (const ring of polygon) report.points += ring.length;
    }
    for (const zone of container.zones) {
      report.zones += 1;
      if (zone.sectors.length === 0) problems.push(`${zone.root.id}: a Zone with no Sectors`);
      for (const sector of zone.sectors) {
        report.sectors += 1;
        sectors.push(sector);
        const km2 = turfArea({ type: 'Feature', properties: {}, geometry: sector.geometry }) / 1e6;
        report.coveredKm2 += km2;
        const said = (raw.get(sector.id) as { descriptor?: unknown } | undefined)?.descriptor;
        if (said !== undefined && !IAU_DESCRIPTORS.has(String(said))) problems.push(`${sector.id}: "${String(said)}" is not one of the IAU's descriptor terms`);
        if ((km2 < SECTOR_MIN_KM2 || km2 > SECTOR_MAX_KM2) && !sector.sizeReason) {
          problems.push(`${sector.id}: ${km2Text(km2)} km², outside 50,000–500,000, and no size_reason`);
        }
      }
    }
  }

  if (report.bytes > PARTITION_MAX_BYTES) {
    problems.push(`size: the files come to ${km2Text(report.bytes)} bytes, over the cap of ${km2Text(PARTITION_MAX_BYTES)} before compression; simplify the edges`);
  }

  // Coverage: the sum first, then a grid of points, each in exactly one Sector.
  if (Math.abs(report.coveredKm2 - EARTH_KM2) > EARTH_KM2 * COVER_TOLERANCE) {
    problems.push(`coverage: the Sectors add up to ${km2Text(report.coveredKm2)} km², the Earth is ${km2Text(EARTH_KM2)}`);
  }
  let off = 0;
  for (let lat = -90 + GRID_STEP / 2; lat < 90; lat += GRID_STEP) {
    for (let lon = -180 + GRID_STEP / 2; lon < 180; lon += GRID_STEP) {
      const inside = sectors.filter((s) => lat >= s.bbox[1] && lat <= s.bbox[3] && lon >= s.bbox[0] && lon <= s.bbox[2]
        && pointInGeometry(lat, lon, s.geometry));
      if (inside.length !== 1) {
        off += 1;
        if (off <= 10) problems.push(`coverage: ${lat}, ${lon} is in ${inside.length === 0 ? 'no Sector' : inside.map((s) => s.id).join(' and ')}`);
      }
    }
  }
  if (off > 10) problems.push(`coverage: ${off - 10} more points of the ${GRID_STEP}° grid are in no Sector or in two`);
  // The map's four corners, where the date line meets a pole: a simplified edge can cut across one, which no grid
  // point would find. Each point stands 0.01° inside its corner.
  for (const [lon, lat] of [[-179.99, -89.99], [179.99, -89.99], [-179.99, 89.99], [179.99, 89.99]]) {
    const inside = sectors.filter((s) => pointInGeometry(lat, lon, s.geometry));
    if (inside.length !== 1) problems.push(`coverage: the corner at ${lat}, ${lon} is in ${inside.length === 0 ? 'no Sector' : inside.map((s) => s.id).join(' and ')}`);
  }

  for (const r of retiredFrom(manifest)) {
    if (r.coveredBy.length === 0) problems.push(`retired ${r.id}: covered by no Zone`);
    for (const id of r.coveredBy) if (!seen.has(id)) problems.push(`retired ${r.id}: covered by ${id}, which the partition does not hold`);
  }
  return report;
}
