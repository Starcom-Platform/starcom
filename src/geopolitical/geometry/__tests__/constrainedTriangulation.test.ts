import { describe, it, expect } from 'vitest';
import { constrainedDelaunayTriangulate, type Point2D } from '../constrainedTriangulation';

function signedArea(a: Point2D, b: Point2D, c: Point2D): number {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function triangleArea(a: Point2D, b: Point2D, c: Point2D): number {
  return Math.abs(signedArea(a, b, c));
}

// Every triangle geometryFactory.ts/bake-territories.ts feed into a mesh must
// wind CCW (positive signed area, x-right/y-up) to match THREE.ShapeUtils.triangulateShape's
// (ear-clipping's) convention for the same correctWinding'd input ring — the
// rest of the pipeline relies on that for correct face-normal direction.
function expectAllCCW(tris: number[][], points: Point2D[]) {
  for (const [a, b, c] of tris) {
    expect(signedArea(points[a], points[b], points[c])).toBeGreaterThan(0);
  }
}

function polygonArea(ring: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

describe('constrainedDelaunayTriangulate', () => {
  it('triangulates a convex square with no holes', () => {
    const square: Point2D[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const tris = constrainedDelaunayTriangulate(square);
    expect(tris.length).toBe(2);
    const totalArea = tris.reduce((sum, [a, b, c]) => sum + triangleArea(square[a], square[b], square[c]), 0);
    expect(totalArea).toBeCloseTo(polygonArea(square), 6);
    expectAllCCW(tris, square);
  });

  it('triangulates a concave L-shape without leaking triangles into the missing corner', () => {
    // L-shape: a 4x4 square with the top-right 2x2 quadrant removed.
    const lShape: Point2D[] = [
      [0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]
    ];
    const tris = constrainedDelaunayTriangulate(lShape);
    const totalArea = tris.reduce((sum, [a, b, c]) => sum + triangleArea(lShape[a], lShape[b], lShape[c]), 0);
    // L-shape area = 4x4 - 2x2 = 12
    expect(polygonArea(lShape)).toBeCloseTo(12, 6);
    expect(totalArea).toBeCloseTo(12, 6);
    expectAllCCW(tris, lShape);
  });

  it('triangulates a square with a square hole, excluding the hole interior', () => {
    const outer: Point2D[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const hole: Point2D[] = [[1, 1], [2, 1], [2, 2], [1, 2]];
    const tris = constrainedDelaunayTriangulate(outer, [hole]);

    const allPoints = [...outer, ...hole];
    const totalArea = tris.reduce((sum, [a, b, c]) => sum + triangleArea(allPoints[a], allPoints[b], allPoints[c]), 0);
    // 4x4 square minus 1x1 hole = 15
    expect(totalArea).toBeCloseTo(15, 6);

    // No triangle centroid should land inside the hole.
    for (const [a, b, c] of tris) {
      const cx = (allPoints[a][0] + allPoints[b][0] + allPoints[c][0]) / 3;
      const cy = (allPoints[a][1] + allPoints[b][1] + allPoints[c][1]) / 3;
      const insideHole = cx > 1 && cx < 2 && cy > 1 && cy < 2;
      expect(insideHole).toBe(false);
    }
    expectAllCCW(tris, allPoints);
  });

  it('produces well-shaped (Delaunay) triangles for an elongated, irregular polygon, unlike ear-clipping', () => {
    // A long, thin, zigzagging polygon designed to be adversarial for
    // ear-clipping (which can bridge across the zigzag with a long triangle)
    // but which Delaunay triangulation, by construction, cannot produce
    // arbitrarily-thin slivers for relative to the point spacing.
    const ring: Point2D[] = [];
    for (let i = 0; i <= 20; i++) {
      ring.push([i, i % 2 === 0 ? 0 : 1]);
    }
    for (let i = 20; i >= 0; i--) {
      ring.push([i, (i % 2 === 0 ? 0 : 1) + 2]);
    }
    const tris = constrainedDelaunayTriangulate(ring);
    expect(tris.length).toBeGreaterThan(0);
    expectAllCCW(tris, ring);

    let maxEdge = 0;
    const edgeLengths: number[] = [];
    for (const [a, b, c] of tris) {
      const pa = ring[a], pb = ring[b], pc = ring[c];
      const d = (p: Point2D, q: Point2D) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      const lens = [d(pa, pb), d(pb, pc), d(pc, pa)];
      edgeLengths.push(...lens);
      maxEdge = Math.max(maxEdge, ...lens);
    }
    edgeLengths.sort((x, y) => x - y);
    const median = edgeLengths[Math.floor(edgeLengths.length / 2)];
    // Delaunay triangulation of this point spacing should never need an edge
    // more than a handful of times the median — nowhere near the 76x ratio
    // seen from ear-clipping on Russia's real ring.
    expect(maxEdge / median).toBeLessThan(10);
  });

  it('returns an empty array for a degenerate (fewer than 3 point) ring', () => {
    expect(constrainedDelaunayTriangulate([[0, 0], [1, 1]])).toEqual([]);
  });

  // Constrainautor throws (rather than silently degrading) for genuinely
  // malformed input — a self-intersecting ring, or a hole that crosses the
  // outer boundary. This is a deliberate contract, not a bug: callers
  // (geometryFactory.ts, bake-territories.ts) catch it and fall back to
  // ear-clipping, which has no such failure mode. This test documents that
  // contract so a future change that makes this silently "succeed" with bad
  // output doesn't slip through unnoticed.
  it('throws for a self-intersecting (bowtie) ring, rather than silently producing bad output', () => {
    const bowtie: Point2D[] = [[0, 0], [4, 4], [4, 0], [0, 4]];
    expect(() => constrainedDelaunayTriangulate(bowtie)).toThrow();
  });

  it('throws when a hole ring crosses the outer boundary', () => {
    const outer: Point2D[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const crossingHole: Point2D[] = [[2, 2], [6, 2], [6, 6], [2, 6]];
    expect(() => constrainedDelaunayTriangulate(outer, [crossingHole])).toThrow();
  });
});
