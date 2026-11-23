/**
 * The debris spread's lapse, drawn (D-GV GV2, step 6): from the first breakup to now, each piece from its own
 * cloud's breakup on.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDebrisLapse, DEBRIS_LAPSE_TYPE } from '../debrisLapse';
import { DAY_MS } from '../../../services/Satellites/debrisSpread';

const FENGYUN = Date.parse('2007-01-11T00:00:00Z');
const COLLISION = Date.parse('2009-02-10T16:56:00Z');
const NOW = Date.parse('2026-10-24T00:00:00Z');
// Three pieces in the catalogue at indices 1, 2 and 4, today; the rest are not debris.
const TODAY = new Float32Array([
  0, 0, 0, 0, 0, 106, 106, 0, 0, 0, 0, 0, 0, 80, 70, 0, 0, 0,
]);
const TURNS = [
  { index: 1, relRateRadPerDay: 0.0005, bornMs: FENGYUN },
  { index: 2, relRateRadPerDay: -0.0002, bornMs: FENGYUN },
  { index: 4, relRateRadPerDay: 0.0003, bornMs: COLLISION },
];
const placed = (points: THREE.Points, k: number) => {
  const a = points.geometry.getAttribute('position').array as Float32Array;
  return [a[k * 3], a[k * 3 + 1], a[k * 3 + 2]];
};

describe('buildDebrisLapse', () => {
  it('starts at the first breakup, with a later cloud not yet broken up and hidden at the Earth\'s centre', () => {
    const lapse = buildDebrisLapse(TURNS, TODAY, NOW)!;
    expect(lapse.startMs).toBe(FENGYUN);
    expect(lapse.points.userData.type).toBe(DEBRIS_LAPSE_TYPE);
    expect(lapse.at(0)).toBe(FENGYUN);
    expect(placed(lapse.points, 2)).toEqual([0, 0, 0]);
    // Fengyun's pieces turned back nearly twenty years: away from today's places, at today's heights.
    expect(placed(lapse.points, 0)[2]).not.toBeCloseTo(106, 1);
    expect(Math.hypot(...placed(lapse.points, 0))).toBeCloseTo(106, 3);
  });

  it('draws the later cloud from its own breakup on, and every piece where it is today at the end', () => {
    const lapse = buildDebrisLapse(TURNS, TODAY, NOW)!;
    const atCollision = (COLLISION + DAY_MS - FENGYUN) / (NOW - FENGYUN);
    lapse.at(atCollision);
    expect(Math.hypot(...placed(lapse.points, 2))).toBeCloseTo(Math.hypot(0, 80, 70), 3);

    expect(lapse.at(1)).toBe(NOW);
    expect(placed(lapse.points, 0).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 106]);
    expect(placed(lapse.points, 1).map((v) => Math.round(v * 1000) / 1000)).toEqual([106, 0, 0]);
    expect(placed(lapse.points, 2).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 80, 70]);
    lapse.dispose();
  });

  it('plays nothing with no pieces', () => {
    expect(buildDebrisLapse([], TODAY, NOW)).toBeNull();
  });
});
