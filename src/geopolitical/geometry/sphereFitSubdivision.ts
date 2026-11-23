/**
 * Fit a triangulated country onto the sphere it is drawn on.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * The bake triangulates each country in a flat 2D projection and then lifts only the
 * VERTICES onto the sphere. Every triangle's interior stays flat — a chord — and a
 * chord sags below the surface between its corners. Measured on the shipped bake,
 * the lowest-detail fills sagged up to 3.9 scene units (Canada, the US, Australia,
 * Antarctica), with a tenth of all triangles sagging more than 0.19. The fills sit
 * 0.2 units above the globe (globeAltitudes BASE_MAP), so those interiors went
 * under the planet's own surface — which is why the fill material had to stop depth
 * testing and discard the far side by hand.
 *
 * This splits every edge whose chord sags more than a tolerance, putting the new
 * point ON the sphere, until none does.
 *
 * ─── THE GUARANTEES, EACH TESTED ───────────────────────────────────────────
 *
 *   · Every output edge sags at most `tolerance`. A triangle's interior can sag a
 *     little more than its edges — for an equilateral one the centroid sits 4/3 as
 *     deep as an edge midpoint — so the whole-triangle bound is 4/3 · tolerance.
 *   · Midpoints are shared, so two triangles that meet along an edge split it at the
 *     same point: no T-junctions, no cracks inside a part. A closed input stays closed.
 *   · Winding is kept: every child faces the way its parent did.
 *   · A mesh already within tolerance comes back unchanged.
 *
 * Pure, with no three.js dependency, so the bake and its tests use the same code.
 */

/** How far the straight chord between two points on a sphere sits below it, at its midpoint. */
export function chordSag(
  positions: ArrayLike<number>, i: number, j: number, radius: number,
): number {
  const x = (positions[i * 3] + positions[j * 3]) / 2;
  const y = (positions[i * 3 + 1] + positions[j * 3 + 1]) / 2;
  const z = (positions[i * 3 + 2] + positions[j * 3 + 2]) / 2;
  return radius - Math.hypot(x, y, z);
}

/**
 * The deepest a triangle's flat interior falls below the sphere, sampled at its
 * centroid and edge midpoints — where a flat triangle's depth below a sphere peaks.
 */
export function maxTriangleSag(
  positions: ArrayLike<number>, indices: ArrayLike<number>, radius: number,
): number {
  let worst = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const depth = (x: number, y: number, z: number) => radius - Math.hypot(x, y, z);
    worst = Math.max(
      worst,
      depth((positions[a] + positions[b] + positions[c]) / 3,
        (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3,
        (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3),
      depth((positions[a] + positions[b]) / 2, (positions[a + 1] + positions[b + 1]) / 2, (positions[a + 2] + positions[b + 2]) / 2),
      depth((positions[b] + positions[c]) / 2, (positions[b + 1] + positions[c + 1]) / 2, (positions[b + 2] + positions[c + 2]) / 2),
      depth((positions[a] + positions[c]) / 2, (positions[a + 1] + positions[c + 1]) / 2, (positions[a + 2] + positions[c + 2]) / 2),
    );
  }
  return worst;
}

export interface SphereFitResult {
  positions: number[];
  indices: number[];
  /** How many new points were placed on the sphere. */
  addedVertices: number;
  /** Refinement passes that split something. */
  passes: number;
}

/**
 * Split every edge that sags more than `tolerance` below a sphere of `radius`, placing
 * each new point on the sphere, until no edge does. Returns new arrays; the inputs are
 * not modified.
 */
export function subdivideToSphere(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  radius: number,
  tolerance: number,
  maxPasses = 32,
): SphereFitResult {
  if (!(tolerance > 0)) throw new Error(`Sphere-fit tolerance must be positive, got ${tolerance}`);
  const pos = Array.from(positions);
  let tris = Array.from(indices);
  const originalVertexCount = pos.length / 3;
  // One midpoint per edge, whichever triangle asks first: this is what keeps
  // neighbouring triangles from splitting a shared edge at two different points.
  const midpoints = new Map<string, number>();

  const midpoint = (i: number, j: number): number => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    const existing = midpoints.get(key);
    if (existing !== undefined) return existing;
    const x = (pos[i * 3] + pos[j * 3]) / 2;
    const y = (pos[i * 3 + 1] + pos[j * 3 + 1]) / 2;
    const z = (pos[i * 3 + 2] + pos[j * 3 + 2]) / 2;
    const length = Math.hypot(x, y, z);
    // Antipodal endpoints have no unique midpoint on the sphere. No country edge is
    // anywhere near that, so this refuses loudly rather than inventing a direction.
    if (length < 1e-9) throw new Error(`Edge ${i}-${j} spans a diameter; it has no midpoint on the sphere`);
    const index = pos.length / 3;
    pos.push((x / length) * radius, (y / length) * radius, (z / length) * radius);
    midpoints.set(key, index);
    return index;
  };

  let passes = 0;
  for (; passes < maxPasses; passes++) {
    const next: number[] = [];
    let changed = false;
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const splitAB = chordSag(pos, a, b, radius) > tolerance;
      const splitBC = chordSag(pos, b, c, radius) > tolerance;
      const splitCA = chordSag(pos, c, a, radius) > tolerance;
      const count = Number(splitAB) + Number(splitBC) + Number(splitCA);
      if (count === 0) { next.push(a, b, c); continue; }
      changed = true;
      /*
       * Every child below lists its corners in the parent's rotational order, which is
       * what preserves winding — the test checks each child's normal against its
       * parent's rather than trusting this comment.
       */
      if (count === 3) {
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else if (count === 1) {
        if (splitAB) { const m = midpoint(a, b); next.push(a, m, c, m, b, c); }
        else if (splitBC) { const m = midpoint(b, c); next.push(a, b, m, a, m, c); }
        else { const m = midpoint(c, a); next.push(a, b, m, m, b, c); }
      } else if (!splitAB) {
        const bc = midpoint(b, c), ca = midpoint(c, a);
        next.push(a, b, bc, a, bc, ca, ca, bc, c);
      } else if (!splitBC) {
        const ab = midpoint(a, b), ca = midpoint(c, a);
        next.push(a, ab, ca, ab, b, c, ab, c, ca);
      } else {
        const ab = midpoint(a, b), bc = midpoint(b, c);
        next.push(a, ab, c, ab, bc, c, ab, b, bc);
      }
    }
    tris = next;
    if (!changed) break;
  }

  return { positions: pos, indices: tris, addedVertices: pos.length / 3 - originalVertexCount, passes };
}
