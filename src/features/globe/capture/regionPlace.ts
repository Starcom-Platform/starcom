/**
 * Where an item about a whole country or state stands, for the share handle
 * and for a mark: the middle of the region's largest part (a peninsula, not an
 * island off it), at 0.1°, and how far the region reaches from there, which is
 * how far from that point the item may apply. Used by Raver Watch (contract
 * v8), War & Conflict (v10, decision WC4), Intel Reports about a territory
 * (v26) and about an area (v29).
 *
 * The middle is the part's centroid, unless that falls outside the part, as it
 * does for Norway, Croatia, Vietnam, Antarctica and the Ring of Fire. It was
 * then the part's first vertex, a point on its edge. It is now the middle of the
 * part's widest run along the parallel through its middle, which is inside it.
 */
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { representativePoint } from '../../../services/geoint/representativePoint';

const EARTH_RADIUS_M = 6_371_000;
type Ring = number[][];

const toRad = (deg: number) => (deg * Math.PI) / 180;
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ringArea = (ring: Ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + (x * ny - nx * y);
}, 0) / 2);

/** The middle of a ring's widest run along the parallel through its middle, or null when the parallel crosses none. */
function middleOfWidestRun(ring: Ring): { lat: number; lng: number } | null {
  const lats = ring.map(([, lat]) => lat);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const crossings = ring.flatMap(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return (y1 > lat) !== (y2 > lat) ? [x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)] : [];
  }).sort((a, b) => a - b);
  let best: { lat: number; lng: number } | null = null;
  let widest = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > widest) {
      widest = crossings[i + 1] - crossings[i];
      best = { lat, lng: (crossings[i] + crossings[i + 1]) / 2 };
    }
  }
  return best;
}

/** The region's largest outer ring, as regionPlace ranks them, or undefined when it has none. */
function largestRing(region: RegionOutline): Ring | undefined {
  const outers: Ring[] = region.geometry.type === 'Polygon'
    ? [region.geometry.coordinates[0] as Ring]
    : region.geometry.coordinates.map((polygon) => polygon[0] as Ring);
  return outers.filter((ring) => ring && ring.length >= 3).sort((a, b) => ringArea(b) - ringArea(a))[0];
}

/** The middle of a ring: its centroid where that is inside it, else the middle of its widest run (above). */
function middleOfRing(ring: Ring): { lat: number; lng: number } | null {
  const { point, how } = representativePoint({ kind: 'polygon', rings: [ring.map(([lon, lat]) => ({ lat, lon }))] });
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  return (how === 'polygon-centroid' ? null : middleOfWidestRun(ring)) ?? { lat: point.lat, lng: point.lon };
}

/**
 * The middle of the region's largest part, unrounded: for telling which
 * country or continent a part lies in, where 0.1° could put a small island's
 * middle in the sea.
 */
export function regionMiddle(region: RegionOutline): { lat: number; lng: number } | null {
  const largest = largestRing(region);
  return largest ? middleOfRing(largest) : null;
}

/** The region's place, or null when it has no part to stand in. */
export function regionPlace(region: RegionOutline): { lat: number; lng: number; precisionM: number } | null {
  const largest = largestRing(region);
  if (!largest) return null;
  const centre = middleOfRing(largest);
  if (!centre) return null;
  const reach = Math.max(...largest.map(([lng, lat]) => metresBetween(centre, { lat, lng })));
  return {
    lat: Math.round(centre.lat * 10) / 10,
    lng: Math.round(centre.lng * 10) / 10,
    precisionM: Math.round(reach / 1000) * 1000,
  };
}
