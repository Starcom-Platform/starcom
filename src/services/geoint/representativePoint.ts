import type { ParsedPoint } from './types';

/**
 * One point to stand for a published geometry, and how it was chosen
 * (decision D-F, step 17).
 *
 * The globe draws a point per report. It used to reduce a line to its first
 * coordinate and a polygon to its first vertex, so a district sat on one of its
 * corners — and position is the claim. A polygon now stands at its centroid and
 * a line at its halfway point. Where that would mislead it falls back to the
 * first vertex, and `how` says so, so a reader can tell a published point from a
 * chosen one and a good choice from a fallback.
 *
 * Planar arithmetic in degrees: sound for a shape the size of a district or a
 * country, which is what reaches the globe as a single report. A ring or line
 * spanning more than 180° of longitude is taken to cross the antimeridian, where
 * averaging longitudes is meaningless, and falls back.
 */
export type RepresentativeHow =
  | 'point' | 'line-midpoint' | 'line-vertex' | 'polygon-centroid' | 'polygon-vertex';

export type ReducibleGeometry =
  | { kind: 'point'; point: ParsedPoint }
  | { kind: 'line'; coords: ParsedPoint[] }
  | { kind: 'polygon'; rings: ParsedPoint[][] };

const crossesAntimeridian = (pts: readonly ParsedPoint[]): boolean => {
  const lons = pts.map((q) => q.lon);
  return Math.max(...lons) - Math.min(...lons) > 180;
};

/** Ray casting on the outer ring. */
const inside = (pt: ParsedPoint, ring: readonly ParsedPoint[]): boolean => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > pt.lat) !== (b.lat > pt.lat)
      && pt.lon < ((b.lon - a.lon) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lon) hit = !hit;
  }
  return hit;
};

function polygonPoint(rings: ParsedPoint[][]): { point: ParsedPoint; how: RepresentativeHow } | null {
  const ring = rings[0];
  if (!ring?.length) return null;
  const vertex = { point: ring[0], how: 'polygon-vertex' as const };
  if (crossesAntimeridian(ring)) return vertex;
  // Shoelace centroid of the outer ring; holes do not move a district's centre enough to matter here.
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const cross = a.lon * b.lat - b.lon * a.lat;
    area += cross; cx += (a.lon + b.lon) * cross; cy += (a.lat + b.lat) * cross;
  }
  // No area: a line drawn as a ring. The inside() test below would reject the
  // 0/0 centroid too, so this is stated intent rather than the only guard.
  if (Math.abs(area) < 1e-12) return vertex;
  const centroid = { lat: cy / (3 * area), lon: cx / (3 * area) };
  return inside(centroid, ring) ? { point: centroid, how: 'polygon-centroid' } : vertex;
}

function linePoint(coords: ParsedPoint[]): { point: ParsedPoint; how: RepresentativeHow } | null {
  if (!coords.length) return null;
  const vertex = { point: coords[0], how: 'line-vertex' as const };
  if (coords.length < 2 || crossesAntimeridian(coords)) return vertex;
  const seg = coords.slice(1).map((b, i) => Math.hypot(b.lat - coords[i].lat, b.lon - coords[i].lon));
  const half = seg.reduce((s, x) => s + x, 0) / 2;
  if (half === 0) return vertex;
  let walked = 0;
  for (let i = 0; i < seg.length; i++) {
    if (walked + seg[i] >= half) {
      const t = (half - walked) / seg[i];
      const a = coords[i], b = coords[i + 1];
      return { point: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }, how: 'line-midpoint' };
    }
    walked += seg[i];
  }
  return vertex;
}

export function representativePoint(geometry: ReducibleGeometry): { point: ParsedPoint; how: RepresentativeHow } {
  if (geometry.kind === 'point') return { point: geometry.point, how: 'point' };
  const chosen = geometry.kind === 'line' ? linePoint(geometry.coords) : polygonPoint(geometry.rings);
  // Nothing to stand on: an empty shape. The caller counts it as having no place.
  return chosen ?? { point: { lat: Number.NaN, lon: Number.NaN }, how: geometry.kind === 'line' ? 'line-vertex' : 'polygon-vertex' };
}
