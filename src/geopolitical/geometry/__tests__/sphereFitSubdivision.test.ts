/**
 * The guarantees sphereFitSubdivision.ts claims, each checked rather than described.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { subdivideToSphere, chordSag, maxTriangleSag } from '../sphereFitSubdivision';

const R = 100.5;

/** Unit direction from lat/lng, scaled to R. */
const onSphere = (lat: number, lng: number): number[] => {
  const la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180;
  return [R * Math.cos(la) * Math.sin(lo), R * Math.sin(la), R * Math.cos(la) * Math.cos(lo)];
};

/** A closed octahedron inscribed in the sphere: every edge a quarter great circle. */
const octahedron = () => ({
  positions: [R, 0, 0, -R, 0, 0, 0, R, 0, 0, -R, 0, 0, 0, R, 0, 0, -R],
  // Outward-facing.
  indices: [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5],
});

const normal = (p: number[], a: number, b: number, c: number) => {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};

describe('how deep a chord and a triangle sit', () => {
  it('measures a chord by the geometry, not a lookup: a quarter circle sags R(1 - cos 45°)', () => {
    const p = [R, 0, 0, 0, R, 0];
    expect(chordSag(p, 0, 1, R)).toBeCloseTo(R * (1 - Math.cos(Math.PI / 4)), 9);
  });

  it('reports a point on the sphere as not sagging at all', () => {
    const p = [...onSphere(10, 10), ...onSphere(10, 10)];
    expect(chordSag(p, 0, 1, R)).toBeCloseTo(0, 9);
  });
});

describe('subdivideToSphere', () => {
  const TOL = 0.05;

  it('leaves no edge sagging more than the tolerance', () => {
    const { positions, indices } = octahedron();
    const out = subdivideToSphere(positions, indices, R, TOL);

    let worstEdge = 0;
    for (let t = 0; t < out.indices.length; t += 3) {
      const [a, b, c] = [out.indices[t], out.indices[t + 1], out.indices[t + 2]];
      worstEdge = Math.max(worstEdge, chordSag(out.positions, a, b, R), chordSag(out.positions, b, c, R), chordSag(out.positions, c, a, R));
    }
    expect(worstEdge).toBeLessThanOrEqual(TOL);
  });

  it('keeps a whole triangle within 4/3 of the tolerance, the bound the module states', () => {
    const { positions, indices } = octahedron();
    const out = subdivideToSphere(positions, indices, R, TOL);
    // Before: an octahedron face's centroid is a third of the way to the centre.
    expect(maxTriangleSag(positions, indices, R)).toBeGreaterThan(40);
    expect(maxTriangleSag(out.positions, out.indices, R)).toBeLessThanOrEqual((4 / 3) * TOL + 1e-9);
  });

  it('puts every new point on the sphere', () => {
    const { positions, indices } = octahedron();
    const out = subdivideToSphere(positions, indices, R, TOL);
    for (let i = 0; i < out.positions.length; i += 3) {
      expect(Math.hypot(out.positions[i], out.positions[i + 1], out.positions[i + 2])).toBeCloseTo(R, 6);
    }
  });

  it('shares midpoints, so a closed surface stays closed — no cracks between neighbours', () => {
    /*
     * The octahedron is closed: every edge belongs to exactly two faces. Had two
     * neighbours split a shared edge at separate points, those halves would each be
     * used once, and this would find them.
     */
    const { positions, indices } = octahedron();
    const out = subdivideToSphere(positions, indices, R, TOL);
    const uses = new Map<string, number>();
    for (let t = 0; t < out.indices.length; t += 3) {
      const tri = [out.indices[t], out.indices[t + 1], out.indices[t + 2]];
      for (let e = 0; e < 3; e++) {
        const i = tri[e], j = tri[(e + 1) % 3];
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    expect([...uses.values()].every((n) => n === 2)).toBe(true);
  });

  it('keeps every child facing the way its parent did', () => {
    // One outward triangle of a size that needs splitting unevenly (1-, 2- and 3-edge cases).
    const positions = [...onSphere(0, 0), ...onSphere(0, 14), ...onSphere(3, 1)];
    const indices = [0, 1, 2];
    const parent = normal(positions, 0, 1, 2);
    const out = subdivideToSphere(positions, indices, R, TOL);

    expect(out.indices.length / 3).toBeGreaterThan(1);
    for (let t = 0; t < out.indices.length; t += 3) {
      const n = normal(out.positions, out.indices[t], out.indices[t + 1], out.indices[t + 2]);
      expect(n[0] * parent[0] + n[1] * parent[1] + n[2] * parent[2]).toBeGreaterThan(0);
    }
  });

  it('covers the same surface: more than the flat parent, never more than the true sphere', () => {
    /*
     * A fitted mesh lies between the flat triangle and the curved one: its corners are
     * on the sphere, its interior never above it. So its area must fall between the
     * two — and a gap or an overlap would push it outside that range. The upper bound
     * is the spherical triangle's exact area, from its spherical excess
     * (Van Oosterom–Strackee), not a guessed percentage: an earlier "under 2% larger"
     * failed on this very 20-degree triangle, which is legitimately 2.2% larger.
     */
    const positions = [...onSphere(0, 0), ...onSphere(0, 20), ...onSphere(15, 10)];
    const area = (p: number[], idx: number[]) => {
      let s = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const n = normal(p, idx[t], idx[t + 1], idx[t + 2]);
        s += Math.hypot(n[0], n[1], n[2]) / 2;
      }
      return s;
    };
    const unit = (i: number) => positions.slice(i * 3, i * 3 + 3).map((v) => v / R);
    const [a, b, c] = [unit(0), unit(1), unit(2)];
    const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const triple = dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]);
    const sphericalArea = 2 * Math.atan2(Math.abs(triple), 1 + dot(a, b) + dot(b, c) + dot(c, a)) * R * R;

    const flat = area(positions, [0, 1, 2]);
    const out = subdivideToSphere(positions, [0, 1, 2], R, TOL);
    const fitted = area(out.positions, out.indices);

    expect(fitted).toBeGreaterThanOrEqual(flat);
    expect(fitted).toBeLessThanOrEqual(sphericalArea);
    // And close to it: the whole point of fitting is to approach the curved surface.
    expect(fitted / sphericalArea).toBeGreaterThan(0.999);
  });

  it('returns a mesh already within tolerance unchanged', () => {
    const positions = [...onSphere(0, 0), ...onSphere(0, 0.5), ...onSphere(0.5, 0.25)];
    const out = subdivideToSphere(positions, [0, 1, 2], R, TOL);
    expect(out.indices).toEqual([0, 1, 2]);
    expect(out.addedVertices).toBe(0);
    expect(out.passes).toBe(0);
  });

  it('does not modify the arrays it was given', () => {
    const { positions, indices } = octahedron();
    const p = [...positions], i = [...indices];
    subdivideToSphere(positions, indices, R, TOL);
    expect(positions).toEqual(p);
    expect(indices).toEqual(i);
  });

  it('refuses a tolerance that could never be met', () => {
    const { positions, indices } = octahedron();
    expect(() => subdivideToSphere(positions, indices, R, 0)).toThrow(/positive/);
  });
});
