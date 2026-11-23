/**
 * The persistence skeleton (decision D-PW, PW78): the Fibonacci mesh triangulated whole (3n − 6 edges, each both
 * ways); two hills' lower one paired with the saddle between them, its persistence its height over that saddle; the
 * ridge from the saddle climbing to both summits; valleys the same of −Z. The bake checks EGM96's own against the
 * experiment's (13 ridges, 16 valleys).
 */
import { describe, it, expect } from 'vitest';
import { fibonacciMesh, persistencePairs, skeleton } from '../skeleton';
import { unit } from '../grid';

const mesh = fibonacciMesh(4000);
const hills = (sign = 1) => {
  const a = unit(10, 0);
  const b = unit(10, 40);
  const Z = new Float64Array(mesh.lat.length);
  for (let k = 0; k < Z.length; k++) {
    const p = [mesh.units[k * 3], mesh.units[k * 3 + 1], mesh.units[k * 3 + 2]];
    const da = Math.acos(Math.min(1, p[0] * a[0] + p[1] * a[1] + p[2] * a[2]));
    const db = Math.acos(Math.min(1, p[0] * b[0] + p[1] * b[1] + p[2] * b[2]));
    Z[k] = sign * (2 * Math.exp(-((da / 0.15) ** 2)) + Math.exp(-((db / 0.15) ** 2)));
  }
  return Z;
};

describe('the persistence skeleton', () => {
  it('triangulates the whole Fibonacci sphere', () => {
    expect(mesh.edges).toBe(3 * 4000 - 6);
    for (let a = 0; a < 4000; a += 97) for (const b of mesh.neighbours[a]) expect(mesh.neighbours[b]).toContain(a);
    expect(mesh.spacing).toBeGreaterThan(3);
    expect(mesh.spacing).toBeLessThan(4.5);
  });

  it("pairs the lower hill with the saddle between, at its height above it", () => {
    const Z = hills();
    const finite = [...persistencePairs(Z, mesh.neighbours).values()].filter(([p]) => Number.isFinite(p) && p > 0.05);
    expect(finite).toHaveLength(1);
    const [persistence, saddle] = finite[0];
    expect(mesh.lat[saddle]).toBeGreaterThan(5);
    expect(mesh.lon[saddle]).toBeGreaterThan(10);
    expect(mesh.lon[saddle]).toBeLessThan(30);
    expect(persistence).toBeGreaterThan(0.8);
    expect(persistence).toBeLessThan(1.01);
  });

  it('draws the ridge from the saddle up to both summits, and the same valley from −Z', () => {
    for (const sign of [1, -1]) {
      const arcs = skeleton(hills(sign), mesh, sign, 30, 0.05);
      expect(arcs).toHaveLength(2);
      const ends = arcs.map((a) => a.points[a.points.length - 1]).sort((p, q) => p[1] - q[1]);
      expect(Math.abs(ends[0][0] - 10) + Math.abs(ends[0][1])).toBeLessThan(6);
      expect(Math.abs(ends[1][0] - 10) + Math.abs(ends[1][1] - 40)).toBeLessThan(6);
      expect(arcs[0].points[0]).toEqual(arcs[1].points[0]);
    }
  });
});
