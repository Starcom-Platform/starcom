/**
 * The planes a constellation flies in, and each plane's ring (D-GV GV2).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { groupPlanes, ringOf, EARTH_TURN_RAD_PER_S, type PlaneMember } from '../orbitalPlanes';
import { propagateCatalog, satrecsOf, type OmmRecord } from '../catalogPropagation';

const GROUPING = { inclinationStepDeg: 0.5, raanGapDeg: 1.5, minMembers: 3 };
const members = (inc: number, raans: number[], from = 0): PlaneMember[] => raans.map((raanDeg, k) => ({ index: from + k, inclinationDeg: inc, raanDeg }));

describe('groupPlanes', () => {
  it('puts satellites of one inclination and node in one plane, and a node a gap away in another', () => {
    const planes = groupPlanes([...members(53, [10, 10.2, 10.4, 20, 20.1, 20.3]), ...members(97.6, [10, 10.1, 10.2], 6)], GROUPING);
    expect(planes.map((p) => p.sort((a, b) => a - b))).toEqual(expect.arrayContaining([[0, 1, 2], [3, 4, 5], [6, 7, 8]]));
    expect(planes).toHaveLength(3);
  });

  it('keeps a plane whole across 0° of node', () => {
    expect(groupPlanes(members(53, [359.6, 0.1, 0.5, 180]), GROUPING)).toEqual([[0, 1, 2]]);
  });

  it('draws no ring for too few satellites, nor for elements it cannot read', () => {
    expect(groupPlanes([...members(55, [40, 40.2]), { index: 9, inclinationDeg: NaN, raanDeg: 1 }], GROUPING)).toEqual([]);
  });
});

describe('ringOf', () => {
  /** Satellites on a circle of radius r in the plane whose normal is n, at angles a, and a step on. */
  const onCircle = (r: number, angles: number[], tilt: number) => {
    const from: number[] = [], to: number[] = [];
    const place = (a: number, out: number[]) => out.push(r * Math.cos(a), r * Math.sin(a) * Math.cos(tilt), r * Math.sin(a) * Math.sin(tilt));
    for (const a of angles) { place(a, from); place(a + 0.001, to); }
    return { from, to };
  };

  it('places the ring in the plane its members fly in, at their radius', () => {
    const tilt = 0.9;
    const { from, to } = onCircle(108, [0, 1, 2, 4], tilt);
    const ring = ringOf([0, 1, 2, 3], from, to, 0, 64)!;
    expect(ring).toHaveLength(65 * 3);
    // The plane's normal, for a circle in the x and (y cos t, z sin t) directions, is (0, -sin t, cos t).
    const normal = [0, -Math.sin(tilt), Math.cos(tilt)];
    for (let i = 0; i < 65; i += 1) {
      const p = [ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2]];
      expect(Math.hypot(...p)).toBeCloseTo(108, 6);
      expect(p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2]).toBeCloseTo(0, 6);
    }
  });

  it('passes over a member that did not propagate, and gives none when none did', () => {
    const { from, to } = onCircle(108, [0, 1, 2], 0.4);
    from.push(0, 0, 0); to.push(0, 0, 0);
    expect(ringOf([0, 1, 2, 3], from, to, 0)).not.toBeNull();
    expect(ringOf([3], from, to, 0)).toBeNull();
  });

  /*
   * The globe's frame turns with the Earth. Read without its turn, GPS's motion is short of the Earth's eastward
   * speed at 26,560 km, and the ring came out about 12° less steep than the plane the satellites fly in.
   */
  it('puts a ring through its satellites as SGP4 places them in the globe\'s turning frame', () => {
    const at = Date.parse('2024-01-01T00:30:00Z');
    const gps = [0, 72, 144, 216, 288].map((meanAnomaly, k) => ({
      OBJECT_NAME: `GPS ${k}`, OBJECT_ID: `2024-00${k}A`, EPOCH: '2024-01-01T00:00:00.000000', MEAN_MOTION: 2.0056,
      ECCENTRICITY: 0.005, INCLINATION: 55, RA_OF_ASC_NODE: 100, ARG_OF_PERICENTER: 30, MEAN_ANOMALY: meanAnomaly,
      EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 90000 + k, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100,
      BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0,
    }) as unknown as OmmRecord);
    const satrecs = satrecsOf(gps);
    const from = new Float32Array(gps.length * 3), to = new Float32Array(gps.length * 3);
    propagateCatalog(satrecs, at, from);
    propagateCatalog(satrecs, at + 1000, to);

    const ring = ringOf([0, 1, 2, 3, 4], from, to, EARTH_TURN_RAD_PER_S * 1, 128)!;
    // The ring's plane, from two of its points a quarter round apart.
    const a = ring.slice(0, 3), b = ring.slice(32 * 3, 32 * 3 + 3);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nl = Math.hypot(...n);
    for (let k = 0; k < gps.length; k += 1) {
      const p = [from[k * 3], from[k * 3 + 1], from[k * 3 + 2]];
      const offPlaneDeg = Math.asin(Math.abs(p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / (nl * Math.hypot(...p))) * 180 / Math.PI;
      expect(offPlaneDeg).toBeLessThan(0.1);
    }
  });
});
