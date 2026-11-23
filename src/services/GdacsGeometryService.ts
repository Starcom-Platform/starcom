// GdacsGeometryService.ts
// Real per-event GDACS geometry — a second, on-demand fetch beyond
// GeoEventsDataProvider's point-event list, which only ever carries a bare centroid
// per event. GDACS includes a ready-made per-event geometry URL on every list-feed
// feature (GeoEventsDataProvider.ts threads it through as gdacsGeometryUrl) —
// verified directly against the live API for both a flood and a live cyclone:
//
// - Floods/droughts: a Point centroid (already rendered by the existing point
//   marker) plus real MultiPolygon "Affected area" / "Affected Area" fills
//   (Class: Poly_Affected / Poly_area) and, for floods, a coarser "Global area"
//   (Poly_Global) which is deliberately NOT rendered here — it's a broad
//   watershed-scale context polygon, not the flood extent itself.
// - Cyclones: a centroid, ~48 small per-track-point marker polygons (Class:
//   Point_Polygon_Point_N — skipped, redundant with the track line below), real
//   wind-speed-radius bands at three real thresholds (Class: Poly_Green/Orange/Red),
//   a real cone-of-uncertainty polygon (Class: Poly_Cones), and real intensity-
//   tagged (polygonlabel: TD/TS/HU) forecast-track LineString segments (Class:
//   Line_Line_N).
import { fetchWithTimeout } from './space-weather/fetchWithTimeout';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'GdacsGeometryService' });

const REQUEST_TIMEOUT_MS = 12000;
// Geometry for a published event/episode doesn't change once GDACS has issued it —
// much longer-lived than the point-event list itself (5 min cache upstream).
const CACHE_TTL_MS = 15 * 60 * 1000;
// A multi-cyclone day can have a dozen+ Orange/Red severe events, each needing its
// own geometry fetch — bounded so they don't all fire at once against one host.
const MAX_CONCURRENT_FETCHES = 4;

export type GdacsGeometryKind = 'windBand' | 'cone' | 'affectedArea' | 'track';

export interface GdacsGeometryFeature {
  kind: GdacsGeometryKind;
  gdacsClass: string;
  // One entry per polygon ring-set (rings[0] = outer, rings[1..] = holes), already
  // flattened from GeoJSON MultiPolygon into one PolygonFeature-shaped ring-set per
  // constituent polygon — GeometryFactory.buildTerritoryPolygons takes a single
  // outer+holes ring-set per feature, not a true MultiPolygon.
  polygons?: Array<[number, number][][]>;
  line?: [number, number][];
  // Real TD/TS/HU track-segment intensity category (cyclone track only).
  intensityLabel?: string;
}

export interface GdacsEventGeometry {
  eventId: number;
  features: GdacsGeometryFeature[];
}

interface RawGdacsGeometryFeature {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'Polygon'; coordinates: [number, number][][] }
    | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
    | { type: 'LineString'; coordinates: [number, number][] };
  properties?: {
    eventid?: number;
    Class?: string;
    polygonlabel?: string;
  };
}

interface RawGdacsGeometryResponse {
  type: 'FeatureCollection';
  features: RawGdacsGeometryFeature[];
}

const WIND_BAND_CLASSES = new Set(['Poly_Green', 'Poly_Orange', 'Poly_Red']);
const AFFECTED_AREA_CLASSES = new Set(['Poly_Affected', 'Poly_area']);
// Deliberately excluded: Poly_Global (coarse flood watershed context, not extent)
// and every Point_Polygon_Point_N (redundant per-track-point marker, the Line_Line_N
// segments already convey the track).

function classifyClass(gdacsClass: string): GdacsGeometryKind | null {
  if (WIND_BAND_CLASSES.has(gdacsClass)) return 'windBand';
  if (gdacsClass === 'Poly_Cones') return 'cone';
  if (AFFECTED_AREA_CLASSES.has(gdacsClass)) return 'affectedArea';
  if (gdacsClass.startsWith('Line_Line_')) return 'track';
  return null;
}

function mapFeature(raw: RawGdacsGeometryFeature): GdacsGeometryFeature | null {
  const gdacsClass = raw.properties?.Class ?? '';
  const kind = classifyClass(gdacsClass);
  if (!kind) return null;

  const geom = raw.geometry;
  if (kind === 'track') {
    if (geom.type !== 'LineString' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return null;
    return { kind, gdacsClass, line: geom.coordinates, intensityLabel: raw.properties?.polygonlabel };
  }

  if (geom.type === 'Polygon') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) return null;
    return { kind, gdacsClass, polygons: [geom.coordinates] };
  }
  if (geom.type === 'MultiPolygon') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) return null;
    return { kind, gdacsClass, polygons: geom.coordinates };
  }
  return null;
}

const cache = new Map<string, { data: GdacsEventGeometry; timestamp: number }>();

async function fetchOne(eventId: number, geometryUrl: string): Promise<GdacsEventGeometry | null> {
  const cached = cache.get(geometryUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  try {
    const response = await fetchWithTimeout(geometryUrl, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`GDACS geometry API error: ${response.status}`);

    const payload = await response.json() as RawGdacsGeometryResponse;
    if (!payload || !Array.isArray(payload.features)) {
      throw new Error('GDACS geometry payload missing features array');
    }

    const features = payload.features
      .map(mapFeature)
      .filter((f): f is GdacsGeometryFeature => f !== null);

    const result: GdacsEventGeometry = { eventId, features };
    cache.set(geometryUrl, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    log.warn(`Failed to fetch GDACS geometry for event ${eventId}`, error);
    return null;
  }
}

export interface GdacsGeometryRequest {
  eventId: number;
  geometryUrl: string;
}

/** Bounded-concurrency fetch of real per-event GDACS geometry for several events at once. */
export async function fetchGdacsGeometries(requests: GdacsGeometryRequest[]): Promise<GdacsEventGeometry[]> {
  const results: GdacsEventGeometry[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < requests.length) {
      const { eventId, geometryUrl } = requests[cursor++];
      const geometry = await fetchOne(eventId, geometryUrl);
      if (geometry) results.push(geometry);
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_FETCHES, requests.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export function clearGdacsGeometryCache(): void {
  cache.clear();
}
