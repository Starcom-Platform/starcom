/**
 * A shape small enough to keep, honest about being smaller than the original.
 *
 * ─── WHY NOT THE GEOMETRY ITSELF ───────────────────────────────────────────
 *
 * A report's area used to be discarded entirely: `representativePoint` reduced
 * a line or a polygon to one coordinate, the record kept `latitude`/`longitude`
 * and a `geometry:<how>` tag, and the rings were gone (D-F 17). Keeping them
 * instead is not free. The parser admits up to `maxVerticesPerPolygon: 2000`,
 * which is roughly 40KB of JSON per report; the workspace holds up to 200 intel
 * reports and serialises ALL of them into one localStorage key beside its
 * IndexedDB copy, so full geometry is several megabytes of store for shapes
 * that are a few hundred pixels wide on screen.
 *
 * So: an outline, bounded by a vertex budget, stored instead of the geometry.
 *
 * ─── AND WHY IT SAYS SO ────────────────────────────────────────────────────
 *
 * A simplified shape drawn identically to an exact one is a small lie on the
 * surface where the shape IS the claim. Both counts are carried — what the
 * source had, what was kept — so a reader can see how much was dropped, and a
 * surface can say it. That is the same rule the reduction to a point already
 * followed by tagging `geometry:centroid` rather than moving the pin quietly.
 *
 * ─── HOW IT DROPS VERTICES ─────────────────────────────────────────────────
 *
 * Even decimation by a single stride across every part, with the first and last
 * vertex of each always kept. Not Douglas-Peucker, which would hold detail
 * better at the same budget: this runs on every feature of every event the
 * globe ingests, and a predictable, obviously-correct rule that can be read in
 * one sitting is worth more here than fidelity at the margin. If a coastline
 * ever looks wrong at this budget, that is the reason to reach for DP, and the
 * counts will show why.
 */
import type { ParsedPoint } from './types';

/**
 * Vertices kept across all parts of one feature.
 *
 * 64 is ~1.3KB per report, so 200 reports is ~260KB — a fifth of what a single
 * unsimplified 2000-vertex polygon would cost, and enough for a recognisable
 * district or coastline at the sizes the globe draws.
 */
export const OUTLINE_VERTEX_BUDGET = 64;

/** Metres-scale precision, which is far finer than anything the globe draws. */
const COORD_DECIMALS = 5;

export interface BoundedOutline {
  kind: 'line' | 'polygon';
  /**
   * `[lat, lon]` pairs. A polygon's parts are its rings, outer first; a line
   * has one part. Pairs rather than objects because this is stored per report
   * and `{"lat":..,"lon":..}` is roughly three times the bytes.
   */
  parts: Array<Array<[number, number]>>;
  /** Vertices the source had, before any were dropped. */
  sourceVertices: number;
  /** Vertices kept. Equal to sourceVertices when nothing was dropped. */
  keptVertices: number;
}

const round = (n: number): number => {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(n * factor) / factor;
};

/** Every `stride`-th vertex, plus the first and the last, order preserved. */
function decimate(part: ParsedPoint[], stride: number): Array<[number, number]> {
  if (part.length === 0) return [];
  const kept: Array<[number, number]> = [];
  for (let i = 0; i < part.length; i += stride) {
    kept.push([round(part[i].lat), round(part[i].lon)]);
  }
  const last = part[part.length - 1];
  const lastKept = kept[kept.length - 1];
  // A shape whose final vertex is dropped closes in the wrong place, which for
  // a ring means a visible notch.
  if (!lastKept || lastKept[0] !== round(last.lat) || lastKept[1] !== round(last.lon)) {
    kept.push([round(last.lat), round(last.lon)]);
  }
  return kept;
}

export function boundedOutline(
  geometry: { kind: 'line'; coords: ParsedPoint[] } | { kind: 'polygon'; rings: ParsedPoint[][] },
  budget = OUTLINE_VERTEX_BUDGET,
): BoundedOutline | null {
  const parts: ParsedPoint[][] = geometry.kind === 'line' ? [geometry.coords] : geometry.rings;
  const usable = parts.filter((p) => p.length >= 2);
  // One point is not a shape; the representative point already says where it is.
  if (usable.length === 0) return null;

  const sourceVertices = usable.reduce((sum, p) => sum + p.length, 0);
  const stride = sourceVertices <= budget ? 1 : Math.ceil(sourceVertices / budget);
  const decimated = usable.map((p) => decimate(p, stride));

  return {
    kind: geometry.kind,
    parts: decimated,
    sourceVertices,
    keptVertices: decimated.reduce((sum, p) => sum + p.length, 0),
  };
}
