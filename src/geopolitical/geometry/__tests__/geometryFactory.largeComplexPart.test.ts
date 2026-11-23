import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GeometryFactory, type PolygonFeature } from '../geometryFactory';

// None of the other geometryFactory tests reach the isLargeComplexPart (>=800
// point) threshold, so none of them actually exercise the constrained-Delaunay
// branch added to buildFlatPolygonTangent/buildFlatPolygonLambert — only the
// ordinary ear-clipping path. This builds a synthetic ring shaped to reproduce
// the real failure case (wide longitude span + high point count + irregular,
// multi-frequency concave "coastline" wobble with occasional sharp spikes —
// the combination that made ear-clipping produce a pathological bridge
// triangle for Russia's real mainland polygon; a plain uniform zigzag turned
// out NOT to be adversarial enough once routed through the real pipeline's
// Lambert projection — a uniform pattern projects into something too regular
// for ear-clipping to trip on).
//
// This isn't just a "doesn't crash" check — verified via git-stash A/B against
// the pre-fix geometryFactory.ts: ear-clipping (post-Lambert-projection)
// produces a max-edge/median-edge ratio of ~33-44 here (a real bridge
// triangle, same failure mode as Russia's ~76 pre-fix). Both
// buildFlatPolygonTangent/Lambert already ran every part (regardless of size)
// through filterPathologicalFaces, which drops any triangle whose longest
// edge exceeds 16x the median — which also caps the reported ratio for the
// pre-fix path, so ratio alone doesn't discriminate the fix (post-filter
// ratio is <=16 either way). What the filter can't fix: dropping triangles
// instead of avoiding them leaves holes — pre-fix, this fixture's triangle
// count drops from 899 to 853 (no-hole case) and 855 to 812 (hole case). A
// valid triangulation of a simple N-point polygon (no holes) has exactly N-2
// triangles (n_outer + n_hole for one hole), so the completeness check below
// (exact count, not just "close") is what actually catches the regression.
// Face winding must produce outward-facing normals (matching every other
// part's ear-clip-triangulated mesh) — Delaunator's raw winding convention is
// the opposite handedness of THREE.ShapeUtils.triangulateShape's for the same
// input ring, which constrainedTriangulation.ts corrects internally. This
// checks that correction actually reaches the final mesh: for a point on a
// sphere centered at the origin, a correctly-wound triangle's face normal
// points away from the origin (positive dot product with its own centroid).
function expectFacesWindOutward(geom: THREE.BufferGeometry) {
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex();
  if (!pos || !idx) throw new Error('geometry missing position/index');
  const v = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let i = 0; i < idx.count; i += 3) {
    const a = v(idx.getX(i));
    const b = v(idx.getX(i + 1));
    const c = v(idx.getX(i + 2));
    const faceNormal = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    expect(faceNormal.dot(centroid)).toBeGreaterThan(0);
  }
}

function computeMaxToMedianEdgeRatio(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex();
  if (!pos || !idx) return 0;
  const v = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  const lengths: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = v(idx.getX(i));
    const b = v(idx.getX(i + 1));
    const c = v(idx.getX(i + 2));
    lengths.push(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  }
  lengths.sort((x, y) => x - y);
  const median = lengths[Math.floor(lengths.length / 2)] || 1;
  const max = lengths[lengths.length - 1] || median;
  return max / median;
}

// A seeded LCG keeps the fixture deterministic across runs. Builds a "strip"
// ring — a wavy bottom edge (west to east) and a wavy top edge (east to west)
// bounding a band roughly 24-36 degrees of latitude tall — so, unlike a
// single wavy curve closed by one long chord, it has a genuine, well-defined
// interior comfortably wide enough to place a hole in without the hole
// risking crossing the (irregular) outer boundary.
function makeFjordStripRing(pointCount: number, seed = 1): [number, number][] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  // Multiple overlapping frequencies plus occasional sharp spikes — mimics a
  // real coastline's irregular concave structure at varying scales, rather
  // than a single uniform wobble.
  const wobble = (t: number) => 3 * Math.sin(t * 37) + 1.5 * Math.sin(t * 91 + 1.3) + 0.75 * Math.sin(t * 181 + 2.7)
    + (rand() < 0.04 ? rand() * 4 - 2 : 0);
  const half = Math.floor(pointCount / 2);
  const ring: [number, number][] = [];
  for (let i = 0; i < half; i++) {
    const t = i / half;
    ring.push([-175 + 350 * t, 38 + wobble(t)]);
  }
  for (let i = half; i >= 0; i--) {
    const t = i / half;
    ring.push([-175 + 350 * t, 62 + wobble(t + 100)]);
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * The triangle count a complete triangulation of a disc with `holes` holes has, by Euler's formula, counted from the
 * mesh itself: T = 2V - B - 2 + 2h, B being the boundary edges (those one triangle uses). Counted from the output
 * rather than the input ring because runtime fills are now fitted to the sphere (D-GV GV0.1), which adds points
 * inside and along the outline; a gap still breaks the count.
 */
function completeTriangleCount(geom: THREE.BufferGeometry, holes: number): number {
  const idx = geom.getIndex()!;
  const uses = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  const boundary = [...uses.values()].filter((n) => n === 1).length;
  return 2 * geom.getAttribute('position').count - boundary - 2 + 2 * holes;
}

describe('GeometryFactory — large complex part (constrained Delaunay) runtime path', () => {
  it('produces a complete (non-gappy) triangulation for an 800+ point wide-span irregular ring', () => {
    const outer = makeFjordStripRing(900, 1);
    expect(outer.length).toBeGreaterThanOrEqual(800);
    const uniquePointCount = outer.length - 1; // closing point duplicates the first

    const feature: PolygonFeature = { id: 'BIGWIDE', rings: [outer] };
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0 });

    expect(group.children.length).toBeGreaterThan(0);
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute('position');
    const idx = geom.getIndex();
    expect(pos).toBeDefined();
    expect(pos!.count).toBeGreaterThan(0);
    expect(idx).toBeDefined();
    expect(idx!.count).toBeGreaterThan(0);

    // A valid triangulation of a simple N-point polygon (no holes) has exactly
    // N-2 triangles. The pre-fix ear-clip + filterPathologicalFaces path drops
    // triangles instead of avoiding the bad one, leaving a real, visible gap
    // (measured at ~863-872 of 898 for this fixture) — so this must be exact,
    // not just "close", to actually discriminate the fix.
    const triangleCount = idx!.count / 3;
    expect(triangleCount).toBe(completeTriangleCount(geom, 0));
    expect(triangleCount).toBeGreaterThanOrEqual(uniquePointCount - 2);

    expect(computeMaxToMedianEdgeRatio(geom)).toBeLessThan(25);
    expectFacesWindOutward(geom);
  });

  it('builds a complete triangulation for an 800+ point wide-span irregular ring with a hole', () => {
    const outer = makeFjordStripRing(850, 2);
    const uniquePointCount = outer.length - 1;
    // Placed in the strip's calm middle band (curves sit at ~38 and ~62,
    // wobble amplitude tops out around ±7) with comfortable clearance so the
    // hole can never cross the (irregular) outer boundary.
    const hole: [number, number][] = [[-10, 47], [-10, 53], [10, 53], [10, 47], [-10, 47]];

    const feature: PolygonFeature = { id: 'BIGWIDEHOLE', rings: [outer, hole] };
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0 });

    expect(group.children.length).toBeGreaterThan(0);
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const idx = geom.getIndex();
    expect(idx).toBeDefined();
    expect(idx!.count).toBeGreaterThan(0);

    // Hole ring is closed (5 points, 4 unique). A simple polygon with h holes
    // and n total boundary vertices (all rings combined) triangulates into
    // exactly n - 2 + 2h triangles (Euler's formula) — for h=1 that reduces
    // to n_outer + n_hole, verified directly against constrainedDelaunayTriangulate
    // for a known square-with-square-hole case (4 + 4 = 8 triangles).
    const triangleCount = idx!.count / 3;
    expect(triangleCount).toBe(completeTriangleCount(geom, 1));
    expect(triangleCount).toBeGreaterThanOrEqual(uniquePointCount + 4);

    expect(computeMaxToMedianEdgeRatio(geom)).toBeLessThan(25);
    expectFacesWindOutward(geom);
  });

  it('falls back to ear-clipping instead of throwing when an 800+ point part has malformed topology', () => {
    // Constrainautor throws for genuinely malformed input (self-intersecting
    // ring, or — as here — a hole that crosses the outer boundary). Real
    // coastline/hole datasets can produce this (simplification artifacts,
    // a hole ring touching the mainland). buildTerritoryPolygons must not let
    // that crash the whole batch (every OTHER feature's mesh) — it should
    // fall back to ear-clipping for just this one part instead.
    const outer = makeFjordStripRing(850, 3);
    // Deliberately extends far outside the strip's ~[31,69] latitude band,
    // guaranteeing the hole ring crosses the outer boundary.
    const crossingHole: [number, number][] = [[-10, 20], [-10, 80], [10, 80], [10, 20], [-10, 20]];

    const feature: PolygonFeature = { id: 'BIGWIDEBADHOLE', rings: [outer, crossingHole] };
    let group!: THREE.Group;
    expect(() => {
      group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0 });
    }).not.toThrow();

    expect(group.children.length).toBeGreaterThan(0);
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const idx = geom.getIndex();
    expect(idx).toBeDefined();
    expect(idx!.count).toBeGreaterThan(0);
  });
});
