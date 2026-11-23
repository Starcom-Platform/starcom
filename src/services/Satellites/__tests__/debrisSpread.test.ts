/**
 * The debris clouds' spread, modelled (D-GV GV2, step 6): each plane turned back by the Earth's oblateness.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { nodalRateRadPerDay, spreadOf, turnBack } from '../debrisSpread';

const DEG = 180 / Math.PI;

describe('nodalRateRadPerDay', () => {
  it('turns the ISS\'s node about 5° a day westward, as its plane is known to', () => {
    const degPerDay = nodalRateRadPerDay(15.5, 0.0003, 51.64) * DEG;
    expect(degPerDay).toBeGreaterThan(-5.1);
    expect(degPerDay).toBeLessThan(-4.8);
  });

  it('turns a polar orbit near 850 km about 1° a day eastward: Fengyun-1C\'s, which kept its angle to the Sun', () => {
    const degPerDay = nodalRateRadPerDay(14.13, 0.001, 98.6) * DEG;
    expect(degPerDay).toBeGreaterThan(0.9);
    expect(degPerDay).toBeLessThan(1.05);
  });

  it('turns a lower orbit faster: the spread between pieces thrown higher and lower', () => {
    expect(Math.abs(nodalRateRadPerDay(14.4, 0, 98.6))).toBeGreaterThan(Math.abs(nodalRateRadPerDay(14.0, 0, 98.6)));
  });
});

describe('spreadOf', () => {
  const born = { a: Date.parse('2007-01-11T00:00:00Z'), b: Date.parse('2009-02-10T16:56:00Z') };
  const bornMsOf = (cloud: string) => born[cloud as keyof typeof born];

  it('sets each cloud\'s common drift aside: its median piece does not turn', () => {
    const turns = spreadOf([
      { index: 0, cloud: 'a', meanMotionRevPerDay: 14.0, eccentricity: 0, inclinationDeg: 98.6 },
      { index: 1, cloud: 'a', meanMotionRevPerDay: 14.2, eccentricity: 0, inclinationDeg: 98.6 },
      { index: 2, cloud: 'a', meanMotionRevPerDay: 14.4, eccentricity: 0, inclinationDeg: 98.6 },
      { index: 3, cloud: 'b', meanMotionRevPerDay: 14.3, eccentricity: 0, inclinationDeg: 74 },
    ], bornMsOf);
    const byIndex = new Map(turns.map((t) => [t.index, t]));
    expect(byIndex.get(1)?.relRateRadPerDay).toBe(0);
    expect(byIndex.get(3)?.relRateRadPerDay).toBe(0);
    expect(Math.sign(byIndex.get(0)!.relRateRadPerDay)).toBe(-Math.sign(byIndex.get(2)!.relRateRadPerDay));
    expect(byIndex.get(3)?.bornMs).toBe(born.b);
  });

  it('leaves out a piece whose elements do not read, and one of a cloud with no breakup', () => {
    const turns = spreadOf([
      { index: 0, cloud: 'a', meanMotionRevPerDay: Number.NaN, eccentricity: 0, inclinationDeg: 98.6 },
      { index: 1, cloud: 'z', meanMotionRevPerDay: 14.2, eccentricity: 0, inclinationDeg: 98.6 },
      { index: 2, cloud: 'a', meanMotionRevPerDay: 14.2, eccentricity: 0, inclinationDeg: 98.6 },
    ], bornMsOf);
    expect(turns.map((t) => t.index)).toEqual([2]);
  });
});

describe('turnBack', () => {
  it('puts a plane that turns east faster than its cloud further west the further back it goes', () => {
    const out = new Float32Array(3);
    // On the equator at longitude 0: x = 0, z = r in the globe's frame.
    turnBack(0, 0, 106, 0.001, 365, out, 0);
    const lngDeg = Math.atan2(out[0], out[2]) * DEG;
    expect(lngDeg).toBeCloseTo(-0.365 * DEG, 3);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(106, 3);
  });

  it('leaves a piece where it is today at no days back, and keeps its height and latitude always', () => {
    const out = new Float32Array(6);
    turnBack(30, 80, 50, 0.002, 0, out, 0);
    expect([...out.slice(0, 3)].map((v) => Math.round(v * 1000) / 1000)).toEqual([30, 80, 50]);
    turnBack(30, 80, 50, 0.002, 4000, out, 3);
    expect(out[4]).toBe(80);
    expect(Math.hypot(out[3], out[4], out[5])).toBeCloseTo(Math.hypot(30, 80, 50), 3);
  });
});
