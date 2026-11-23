// constrainedTriangulation.ts — constrained Delaunay triangulation for polygon
// rings, as an alternative to ear-clipping (THREE.ShapeUtils.triangulateShape,
// which wraps THREE.Earcut) for exceptionally large/complex parts.
//
// Why this exists: ear-clipping guarantees a topologically valid triangulation
// of any simple polygon, but gives no quality guarantee — for a large, highly
// irregular ring (e.g. Russia's ~1100-point mainland outline) it can choose an
// "ear" that bridges two distant, sparsely-connected regions of the shape with
// one very long, thin triangle. Delaunay triangulation doesn't have this
// failure mode: it maximizes the minimum angle across all triangles by
// construction, so it structurally avoids exactly this kind of sliver/bridge
// triangle. Constraining it (via Constrainautor) to respect the polygon's
// actual boundary (and hole boundaries) keeps that quality guarantee while
// still producing a triangulation whose outline matches the source ring.
//
// Scope: this is intentionally used only for the small number of parts flagged
// as "large complex" (see bake-territories.ts's isLargeComplexPart) — ear-
// clipping remains the default for everything else, since it's simpler, faster,
// and already well-tested for ordinary-sized country shapes.

import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';

export type Point2D = readonly [number, number];

/**
 * Triangulates a polygon (outer ring + optional holes) via constrained
 * Delaunay triangulation. Points are NOT deduplicated across outer/holes —
 * callers must pass already-sanitized, non-self-intersecting rings (as
 * produced by validateRing/sanitizeRing elsewhere in this pipeline).
 *
 * @param outer Outer ring points, in order, NOT closed (no repeated first point).
 * @param holes Hole rings, each in order, NOT closed.
 * @returns Triangle index triples into the combined [...outer, ...holes.flat()]
 *          point array — the same indexing convention THREE.ShapeUtils.triangulateShape
 *          produces, so callers can swap between the two without remapping indices.
 */
export function constrainedDelaunayTriangulate(
  outer: Point2D[],
  holes: Point2D[][] = []
): number[][] {
  if (outer.length < 3) return [];

  const allPoints: Point2D[] = [...outer, ...holes.flat()];
  if (allPoints.length < 3) return [];

  const coords = new Float64Array(allPoints.length * 2);
  for (let i = 0; i < allPoints.length; i++) {
    coords[i * 2] = allPoints[i][0];
    coords[i * 2 + 1] = allPoints[i][1];
  }

  const delaunay = new Delaunator(coords);
  if (delaunay.triangles.length === 0) return [];

  // Build the boundary constraint edges: consecutive pairs around the outer
  // ring, and around each hole, each treated as a closed loop.
  const constraintEdges: [number, number][] = [];
  const addLoopEdges = (startIndex: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = startIndex + i;
      const b = startIndex + ((i + 1) % count);
      constraintEdges.push([a, b]);
    }
  };
  addLoopEdges(0, outer.length);
  let holeOffset = outer.length;
  for (const hole of holes) {
    addLoopEdges(holeOffset, hole.length);
    holeOffset += hole.length;
  }

  const constrainautor = new Constrainautor(delaunay);
  const untriangulated = new Set(constrainautor.untriangulatedPoints());
  for (const [a, b] of constraintEdges) {
    // Points Delaunator silently dropped as exact duplicates can't be
    // constrained (Constrainautor throws) — skip those specific edges rather
    // than aborting the whole part. Duplicate points in real coastline data
    // are rare edge artifacts, not something worth failing the bake over.
    if (untriangulated.has(a) || untriangulated.has(b)) continue;
    constrainautor.constrainOne(a, b);
  }

  return filterToPolygonInterior(delaunay.triangles, allPoints, outer, holes);
}

function pointInRing(x: number, y: number, ring: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Delaunator triangulates the convex hull of the input points, which for a
 * concave polygon (essentially all real coastlines) includes triangles
 * outside the actual boundary and, for a polygon with holes, inside those
 * holes too. Constraining the boundary edges (above) stops Delaunay
 * re-triangulation from crossing them, but doesn't remove the exterior/hole
 * triangles themselves — done here via a centroid point-in-polygon test.
 *
 * This also normalizes triangle winding to CCW (in this function's x-right,
 * y-up 2D space). Delaunator's own convention is CCW in a y-down screen
 * space, which is CW here — the opposite of what THREE.ShapeUtils.triangulateShape
 * (ear-clipping) produces for the same, correctWinding'd input ring. Callers
 * throughout this pipeline (geometryFactory.ts, bake-territories.ts) rely on
 * ear-clip's CCW convention for correct face-normal direction, so leaving
 * Delaunator's raw winding in place would silently invert normals for every
 * "large complex part" — currently masked because both consumers render with
 * an unlit, double-sided material, but a real defect independent of that.
 */
function filterToPolygonInterior(
  triangles: Uint32Array,
  points: Point2D[],
  outer: Point2D[],
  holes: Point2D[][]
): number[][] {
  const result: number[][] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const ia = triangles[t];
    const ib = triangles[t + 1];
    const ic = triangles[t + 2];
    const [ax, ay] = points[ia];
    const [bx, by] = points[ib];
    const [cx, cy] = points[ic];
    const centroidX = (ax + bx + cx) / 3;
    const centroidY = (ay + by + cy) / 3;

    if (!pointInRing(centroidX, centroidY, outer)) continue;
    const inAnyHole = holes.some((hole) => pointInRing(centroidX, centroidY, hole));
    if (inAnyHole) continue;

    result.push([ia, ic, ib]);
  }
  return result;
}
