// SubmarineCableService.ts — real submarine cable infrastructure data for CommHubs.
//
// Verified live before building this: TeleGeography's own site has the authoritative
// current data (724 real cables) but sends no CORS header (confirmed via curl — a real,
// keyless, but client-side-unusable source, same dead end as several others found this
// session). `mhdalitarhini/Submarine-Cables-Map` on GitHub mirrors it with real CORS
// support (raw.githubusercontent.com) and richer per-cable metadata than the base geo
// files carry (real owners, length, ready-for-service year) — but it's a genuinely
// incomplete snapshot: 521-525 of the current 724 real cables, not the full live set. That
// limitation is surfaced honestly via `datasetCableCount`, not hidden.
//
// Real data-quality finding from direct verification (not assumed): the source's own
// `is_planned` boolean is stale, frozen at whatever point this snapshot was originally
// scraped (~2022) — real, currently-active cables with a 2023/2024 ready-for-service year
// (e.g. 2Africa, Amitie, Blue, Raman) all still show `is_planned: true`. Using that field
// directly would render years-old, already-active cables as "planned." isPlanned is instead
// derived from rfsYear vs. the real current year.
import { sourceAllowed } from '../../legal/buildProfile';
import axios from 'axios';
import { createLogger } from '@utils/logger';
import { submarineCableCacheStore } from './SubmarineCableCacheStore';
import type { CableLandingPoint, CablePath, LandingPoint, SubmarineCable, SubmarineCableData } from '../../types/CommHubs';

const log = createLogger({ prefix: 'SubmarineCableService' });

/**
 * What the cable map is, whatever its age (record D-L). The mirror read below
 * is labelled MIT, but its files are byte-for-byte Steve Song's
 * open_undersea_cable_map: TeleGeography's Submarine Cable Map as last
 * released under CC BY-NC-SA 3.0, in late 2022 (checked 2026-10-05). So
 * cables laid since are missing, and what Starcom draws from it is shared
 * under the same licence, as ShareAlike asks.
 */
export const CABLE_SNAPSHOT_NOTE =
  "The cable map is TeleGeography's as of late 2022, so cables laid since are missing. Starcom shares it under the same licence.";

const BASE_URL = 'https://raw.githubusercontent.com/mhdalitarhini/Submarine-Cables-Map/main/open_undersea_cable_map/codebase/data';
export const CABLE_GEO_URL = `${BASE_URL}/cable-geo.json`;
export const LANDING_POINT_GEO_URL = `${BASE_URL}/landing-point-geo.json`;
// encodeURIComponent guards against a real cable id containing characters that would
// otherwise corrupt the path (e.g. a stray '/' turning one segment into two).
export const cableDetailUrl = (id: string) => `${BASE_URL}/cable/${encodeURIComponent(id)}.json`;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — shorter than MITRE's 30-day cache, since this dataset is itself already a partial snapshot worth refreshing more often
const DETAIL_BATCH_SIZE = 10; // requests open at once — conservative on purpose: no documented per-IP rate limit on raw.githubusercontent.com, and hammering an unauthenticated mirror is the real risk, not client cost
const DETAIL_TIMEOUT_MS = 10000;

// ── Real GeoJSON shapes (loosely typed — external data, not a contract we control) ──

interface GeoJsonFeature {
  type?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown };
}
interface GeoJsonFeatureCollection {
  features?: unknown;
}

interface RawCableDetail {
  id?: unknown;
  name?: unknown;
  length?: unknown;
  owners?: unknown;
  rfs_year?: unknown;
  landing_points?: unknown;
}

interface RawLandingPointRef {
  id?: unknown;
  name?: unknown;
  country?: unknown;
}

// Number.isFinite (not just typeof === 'number') deliberately excludes NaN/Infinity —
// both pass a bare typeof check yet silently corrupt downstream THREE.js geometry
// (bounding-sphere math propagates NaN through the whole object), so a real but
// malformed coordinate needs to be caught here, not discovered as a rendering glitch.
function isPointArray(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(
    (point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  );
}

function isMultiLineStringCoords(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every((segment) => isPointArray(segment));
}

/** Real cable features in this source are typed MultiLineString, but GeoJSON also allows
 * a plain LineString for a single-segment path, and external data isn't a contract we
 * control — accept that shape too rather than silently dropping the cable. This dataset
 * is already an incomplete snapshot (see this file's header); losing more cables than
 * necessary to a geometry-shape mismatch would make that honest gap worse than it needs
 * to be. Returns segments (always MultiLineString-shaped: an array of point arrays). */
function extractPathSegments(geometryType: unknown, coords: unknown): number[][][] | null {
  if (isMultiLineStringCoords(coords)) return coords;
  if (geometryType === 'LineString' && isPointArray(coords)) return [coords];
  return null;
}

/** Exported for direct unit testing — real cable path geometry + color + name, keyed by
 * cable id. The geo file is the reliable source for name (always present for every cable,
 * unlike the per-cable detail file which can fail to fetch). Pure and synchronous. */
export function parseCableGeoJson(data: unknown): Map<string, { name: string; color: string; paths: CablePath[] }> {
  const result = new Map<string, { name: string; color: string; paths: CablePath[] }>();
  const features = (data as GeoJsonFeatureCollection)?.features;
  if (!Array.isArray(features)) return result;

  for (const feature of features as GeoJsonFeature[]) {
    const id = feature.properties?.id;
    if (typeof id !== 'string') continue;
    const segments = extractPathSegments(feature.geometry?.type, feature.geometry?.coordinates);
    if (!segments) continue;

    const name = typeof feature.properties?.name === 'string' ? feature.properties.name : id;
    const color = typeof feature.properties?.color === 'string' ? feature.properties.color : '#888888';
    // A 0-1 point segment can't form a real line — drop it rather than handing
    // downstream rendering a degenerate THREE.BufferGeometry.
    const paths = segments
      .map((segment) => segment.map(([lng, lat]) => [lng, lat] as [number, number]))
      .filter((path) => path.length >= 2);
    if (paths.length === 0) continue;

    const existing = result.get(id);
    if (existing) existing.paths.push(...paths);
    else result.set(id, { name, color, paths });
  }

  return result;
}

/** Exported for direct unit testing — real landing points from the geo file. Pure and
 * synchronous. Deduplicates by real id (keeping the first occurrence) — a defensive
 * guard against a duplicate feature from an upstream data-generation glitch, the same
 * "external data isn't a contract we control" stance the cable parser above already
 * takes for merging same-id features. */
export function parseLandingPointGeoJson(data: unknown): LandingPoint[] {
  const byId = new Map<string, LandingPoint>();
  const features = (data as GeoJsonFeatureCollection)?.features;
  if (!Array.isArray(features)) return [];

  for (const feature of features as GeoJsonFeature[]) {
    const id = feature.properties?.id;
    const name = feature.properties?.name;
    const coords = feature.geometry?.coordinates;
    if (typeof id !== 'string' || typeof name !== 'string') continue;
    if (!Array.isArray(coords) || coords.length !== 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
    if (byId.has(id)) continue;

    byId.set(id, {
      id,
      name,
      longitude: coords[0],
      latitude: coords[1],
      isTbd: feature.properties?.is_tbd === true
    });
  }

  return Array.from(byId.values());
}

/** Exported for direct unit testing — real per-cable rich metadata. `isPlanned` is derived
 * from `rfsYear` vs. `currentYear`, not read from the source's own stale `is_planned` field
 * (see this file's header comment for why). Pure and synchronous. */
export function parseCableDetail(data: unknown, currentYear: number): {
  id: string;
  length?: string;
  owners?: string;
  rfsYear?: number;
  isPlanned: boolean;
  landingPoints: CableLandingPoint[];
} | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as RawCableDetail;
  if (typeof raw.id !== 'string') return null;

  const rfsYear = typeof raw.rfs_year === 'number' ? raw.rfs_year : undefined;
  const landingPoints: CableLandingPoint[] = Array.isArray(raw.landing_points)
    ? (raw.landing_points as RawLandingPointRef[])
      .filter((lp): lp is RawLandingPointRef & { id: string; name: string; country: string } =>
        typeof lp.id === 'string' && typeof lp.name === 'string' && typeof lp.country === 'string')
      .map((lp) => ({ id: lp.id, name: lp.name, country: lp.country }))
    : [];

  return {
    id: raw.id,
    length: typeof raw.length === 'string' ? raw.length : undefined,
    owners: typeof raw.owners === 'string' ? raw.owners : undefined,
    rfsYear,
    // No known rfsYear is treated as "not confirmed active" — honest unknown, not assumed active.
    isPlanned: rfsYear === undefined || rfsYear > currentYear,
    landingPoints
  };
}

async function fetchOneCableDetail(id: string, currentYear: number) {
  try {
    const response = await axios.get(cableDetailUrl(id), { timeout: DETAIL_TIMEOUT_MS });
    return parseCableDetail(response.data, currentYear);
  } catch (error) {
    log.warn(`Cable detail fetch failed, skipping: ${id}`, error);
    return null;
  }
}

/**
 * Run `task` over `items` with at most `limit` in flight, keeping results in input order.
 *
 * A ROLLING pool, not fixed batches. The batches this replaced started ten requests and
 * waited for all ten before starting any more, so a single slow file — up to the 10 s
 * timeout — held nine idle slots with it. The pool never has more than `limit` open at
 * once, which is what the mirror's politeness depends on, and starts the next as soon as
 * any one finishes. Its tests show a slow item no longer holds the others back.
 *
 * What this is NOT, measured 2026-09-12: the reason a first visit to Comm Hubs was slow.
 * On two fresh 100-cable samples, order-controlled, whichever strategy ran first took
 * 1.2–1.4 s and whichever ran second 0.2 s — the CDN warming, not the strategy. An earlier
 * "4x faster" reading was that confound. Cold, all 521 files come to seconds, not the
 * minutes the layer took in the app, so that cause is elsewhere and still open.
 *
 * Exported for its tests: concurrency and ordering are exactly what a refactor breaks.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!(limit >= 1)) throw new Error(`Concurrency limit must be at least 1, got ${limit}`);
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchAllCableDetails(ids: string[], currentYear: number) {
  const detailResults = await mapWithConcurrency(ids, DETAIL_BATCH_SIZE, (id) => fetchOneCableDetail(id, currentYear));
  return new Map(ids.map((id, i) => [id, detailResults[i]] as const));
}

function isFresh(data: SubmarineCableData): boolean {
  return Date.now() - data.fetchedAt < CACHE_TTL_MS;
}

export interface SubmarineCableFetchInfo {
  fetchedAt: number;
  datasetCableCount: number;
  fromCache: boolean;
}

let lastFetchInfo: SubmarineCableFetchInfo | null = null;

/** Real last-fetch disclosure for the settings UI (Phase E) — mirrors
 * RealBlocklistService.ts's getLastFetchHealth() pattern: a synchronous, module-level
 * accessor a settings component can read without needing its own instance of the
 * useCommHubs3D hook (which only Globe.tsx mounts). */
export function getLastSubmarineCableFetchInfo(): SubmarineCableFetchInfo | null {
  return lastFetchInfo;
}

let inFlight: Promise<SubmarineCableData> | null = null;

/** The full real pipeline: real geo paths + real landing points + real bulk per-cable
 * metadata (521 real files, batched), merged into one real per-cable record. Checks the
 * real persisted cache first (7-day TTL); a genuine miss/expiry triggers the real fetch.
 * Deliberately NOT gated behind any "layer enabled" flag — callers should invoke this
 * eagerly so real status data is ready by the time a user opens the layer, not racing a
 * fetch against first render.
 *
 * If the live fetch fails (network error, mirror down, rate-limited) and a real stale
 * cached copy exists, that stale copy is served rather than surfacing an error — showing
 * last week's real cable map beats showing nothing, and the disclosure UI already
 * discloses fetchedAt honestly either way. Only a genuine cold-start failure (no cache at
 * all) propagates as an error. */
export async function getSubmarineCableData(): Promise<SubmarineCableData> {
  // TeleGeography's data is licensed for paying subscribers: a commercial build fetches none (D-CS, CS1).
  if (!sourceAllowed('cables')) return { cables: [], landingPoints: [], fetchedAt: Date.now(), datasetCableCount: 0 };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const cached = await submarineCableCacheStore.get();
    try {
      if (cached && isFresh(cached)) {
        lastFetchInfo = { fetchedAt: cached.fetchedAt, datasetCableCount: cached.datasetCableCount, fromCache: true };
        return cached;
      }

      const currentYear = new Date().getFullYear();
      const [cableGeoRes, landingGeoRes] = await Promise.all([
        axios.get(CABLE_GEO_URL, { timeout: 20000 }),
        axios.get(LANDING_POINT_GEO_URL, { timeout: 20000 })
      ]);

      const geoByCable = parseCableGeoJson(cableGeoRes.data);
      const landingPoints = parseLandingPointGeoJson(landingGeoRes.data);

      log.debug(`Fetching real per-cable metadata for ${geoByCable.size} real cables (batched)...`);
      const detailsByCable = await fetchAllCableDetails(Array.from(geoByCable.keys()), currentYear);

      const cables: SubmarineCable[] = [];
      for (const [id, geo] of geoByCable) {
        const detail = detailsByCable.get(id);
        cables.push({
          id,
          name: geo.name,
          color: geo.color,
          paths: geo.paths,
          length: detail?.length,
          owners: detail?.owners,
          rfsYear: detail?.rfsYear,
          isPlanned: detail?.isPlanned ?? true, // no real detail resolved — honest unknown treated as not-confirmed-active
          landingPoints: detail?.landingPoints ?? []
        });
      }

      const data: SubmarineCableData = {
        cables,
        landingPoints,
        fetchedAt: Date.now(),
        datasetCableCount: cables.length
      };

      await submarineCableCacheStore.set(data);
      lastFetchInfo = { fetchedAt: data.fetchedAt, datasetCableCount: data.datasetCableCount, fromCache: false };
      return data;
    } catch (error) {
      if (cached) {
        log.warn('Live submarine cable fetch failed — serving stale cached data instead', error);
        lastFetchInfo = { fetchedAt: cached.fetchedAt, datasetCableCount: cached.datasetCableCount, fromCache: true };
        return cached;
      }
      throw error;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
