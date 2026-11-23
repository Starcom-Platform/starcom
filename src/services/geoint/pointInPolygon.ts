/**
 * Whether a coordinate falls inside a GeoJSON polygon.
 *
 * Ray casting, counting crossings of a ray cast east from the point: an odd
 * count is inside. Chosen over winding number because the shapes here are
 * simple closed rings from Natural Earth rather than self-intersecting ones,
 * and this is short enough to read in one sitting — the same trade
 * boundedOutline makes for decimation.
 *
 * ─── COORDINATE ORDER ──────────────────────────────────────────────────────
 *
 * GeoJSON rings are [lng, lat]; this takes lat and lon as named arguments so a
 * caller cannot silently transpose them. Getting that wrong puts Washington in
 * the Indian Ocean, which is the bug outlineFeatures already has a test for.
 *
 * ─── KNOWN LIMIT, STATED ───────────────────────────────────────────────────
 *
 * A polygon crossing the antimeridian is not handled: its ring spans from +179
 * to -179 and the ray test reads that as a shape wrapping the whole planet.
 * Natural Earth splits most such territories at ±180 precisely so consumers do
 * not have to, but anything that does cross will answer wrongly rather than
 * refuse. Callers that care should check `crossesAntimeridian` first — the
 * geometry factory already has that notion, and representativePoint already
 * refuses to take a centroid in that case.
 */

/** A GeoJSON linear ring: [lng, lat] pairs, first and last equal. */
export type Ring = Array<[number, number]>;

export function pointInRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // A crossing counts when the edge straddles the point's latitude and the
    // intersection lies east of it.
    const straddles = (yi > lat) !== (yj > lat);
    if (!straddles) continue;
    const at = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lon < at) inside = !inside;
  }
  return inside;
}

/**
 * Outer ring minus holes: GeoJSON's first ring is the boundary and the rest
 * are holes, so a point inside a hole is outside the polygon.
 */
export function pointInPolygon(lat: number, lon: number, rings: Ring[]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false;
  }
  return true;
}

export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };

export function pointInGeometry(lat: number, lon: number, geometry: PolygonGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(lat, lon, geometry.coordinates);
  return geometry.coordinates.some((rings) => pointInPolygon(lat, lon, rings));
}

/** [minLon, minLat, maxLon, maxLat], for narrowing before the precise test. */
export function boundsOf(geometry: PolygonGeometry): [number, number, number, number] {
  let minLon = Infinity; let minLat = Infinity;
  let maxLon = -Infinity; let maxLat = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    for (const [lon, lat] of rings[0] ?? []) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}
