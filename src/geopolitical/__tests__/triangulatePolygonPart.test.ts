import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mocking the Delaunay module (not `three`) lets us deterministically
// control what "the large-part triangulation" returns, so this test
// exercises triangulatePolygonPart's retry DECISION logic precisely,
// without depending on real triangulation library quirks (constrained
// Delaunay is fussy about near-degenerate/collinear input and throws on
// plenty of legitimate polygons, which made hand-crafting a synthetic
// polygon where it reliably both succeeds AND improves impractical — real
// end-to-end verification against actual country geometry, via
// `npm run geo:bake && npm run geo:qa`, is the authoritative check for
// this fix; this test is regression protection for the decision logic).
vi.mock('../geometry/constrainedTriangulation', () => ({
  constrainedDelaunayTriangulate: vi.fn()
}));

import { triangulatePolygonPart } from '../geometry/geometryFactory';
import { constrainedDelaunayTriangulate } from '../geometry/constrainedTriangulation';

// A real, deterministic pathological shape verified against the actual
// THREE.ShapeUtils.triangulateShape (ear-clipping) algorithm: two dense
// circular clusters connected by a single-point neck on each side. Ear
// clipping reliably produces a ~64x max/median edge ratio here (a "bridge"
// triangle spanning the neck), matching the real bake-time failure mode
// described in bake-territories.ts/geometryFactory.ts.
function buildDumbbell(): THREE.Vector2[] {
  const blobA: THREE.Vector2[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    blobA.push(new THREE.Vector2(-100 + Math.cos(t) * 10, Math.sin(t) * 10));
  }
  const blobB: THREE.Vector2[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    blobB.push(new THREE.Vector2(100 + Math.cos(t) * 10, Math.sin(t) * 10));
  }
  return [...blobA, new THREE.Vector2(0, 1), ...blobB, new THREE.Vector2(0, -1)];
}

// A simple, non-pathological square — ear-clipping produces two triangles
// with a max/median ratio of ~1.4, well under the pathological threshold.
function buildSimpleSquare(): THREE.Vector2[] {
  return [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(10, 0),
    new THREE.Vector2(10, 10),
    new THREE.Vector2(0, 10)
  ];
}

describe('triangulatePolygonPart', () => {
  beforeEach(() => {
    vi.mocked(constrainedDelaunayTriangulate).mockReset();
  });

  it('retries with Delaunay and uses its result when it produces fewer pathological triangles than ear-clipping', () => {
    const outer = buildDumbbell();
    const all2DVertices = outer;
    // A hand-built "good" triangulation: a simple fan from vertex 0, which
    // for this input has no pathologically long edges relative to the
    // dense blob spacing — stands in for what a real Delaunay retry would
    // produce (fewer/no dropped triangles).
    const goodFaces: number[][] = [];
    for (let i = 1; i < outer.length - 1; i++) {
      goodFaces.push([0, i, i + 1]);
    }
    vi.mocked(constrainedDelaunayTriangulate).mockReturnValue(goodFaces);

    const result = triangulatePolygonPart(outer, [], outer.length, all2DVertices);

    expect(constrainedDelaunayTriangulate).toHaveBeenCalledTimes(1);
    // The mocked "good" Delaunay result should be what's returned — every
    // one of its triangles present, none of the ear-clipping fallback's
    // dropped-face gaps.
    expect(result.length).toBe(goodFaces.length);
    expect(result).toEqual(expect.arrayContaining(goodFaces));
  });

  it('keeps the ear-clipping (filtered) result when the Delaunay retry does not actually improve things', () => {
    const outer = buildDumbbell();
    // Mock Delaunay to just reproduce the same pathological shape ear-clipping
    // would have produced (simulating its own internal fallback-to-ear-clipping
    // on a throw, or a genuinely no-better result).
    const earFaces = THREE.ShapeUtils.triangulateShape(outer, []);
    vi.mocked(constrainedDelaunayTriangulate).mockReturnValue(earFaces.map((f) => [...f]));

    const result = triangulatePolygonPart(outer, [], outer.length, outer);

    expect(constrainedDelaunayTriangulate).toHaveBeenCalledTimes(1);
    // Falls back to the drop-without-repair ear-clipping result — fewer
    // faces than the raw (unfiltered) ear-clip output, since the
    // pathological bridge triangle(s) get dropped.
    expect(result.length).toBeLessThan(earFaces.length);
  });

  it('never attempts a Delaunay retry when ear-clipping produces no pathological triangles', () => {
    const outer = buildSimpleSquare();

    const result = triangulatePolygonPart(outer, [], outer.length, outer);

    expect(constrainedDelaunayTriangulate).not.toHaveBeenCalled();
    expect(result.length).toBe(2); // a simple quad triangulates to exactly 2 triangles
  });

  it('uses Delaunay directly (no ear-clip attempt first) for parts at/above the 800-point large-complex-part cutoff', () => {
    const outer = buildSimpleSquare();
    const largeFaces = [[0, 1, 2], [0, 2, 3]];
    vi.mocked(constrainedDelaunayTriangulate).mockReturnValue(largeFaces);

    const result = triangulatePolygonPart(outer, [], 800, outer);

    expect(constrainedDelaunayTriangulate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(largeFaces);
  });

  it('stays on the ear-clipping path for a part just under the 800-point cutoff with no pathological triangles', () => {
    const outer = buildSimpleSquare();

    triangulatePolygonPart(outer, [], 799, outer);

    expect(constrainedDelaunayTriangulate).not.toHaveBeenCalled();
  });
});
