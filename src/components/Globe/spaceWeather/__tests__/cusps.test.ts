/**
 * The polar cusps and day-side reconnection (space-weather-visualization.md, SW5): where T96 puts the
 * boundary of open and closed lines at noon, the bundles traced round it, and the bursts drawn while
 * the IMF points south.
 */
import { describe, expect, it } from 'vitest';
import { cuspLatitude, flashesAt, flashInterval, magnetopauseNoseRe, traceCusps, vbsOf, FLASH_SECONDS } from '../cusps';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';

const UT = Date.UTC(2026, 9, 10, 12) / 1000;
const QUIET = { pdyn: 2, dst: -10, byImf: 0, bzImf: 2 };
const SOUTH = { pdyn: 2, dst: -10, byImf: 0, bzImf: -8 };

describe('the cusps', () => {
  it('lie at the noon boundary of open and closed lines, high in each hemisphere, and move equatorward when the IMF turns south', () => {
    const frame = recalc(UT);
    const quiet = cuspLatitude(frame, QUIET, 'north');
    const south = cuspLatitude(frame, SOUTH, 'north');
    expect(quiet).toBeGreaterThan(70);
    expect(quiet).toBeLessThan(86);
    expect(south).toBeLessThan(quiet);
    expect(cuspLatitude(frame, QUIET, 'south')).toBeLessThan(-70);
  });

  it('are bundles of lines, each from space down to the ground', () => {
    const cusps = traceCusps({ ut: UT, drivers: QUIET });
    expect(cusps.latitude.north).toBeGreaterThan(70);
    expect(cusps.latitude.south).toBeLessThan(-70);
    expect(cusps.lines.length).toBeGreaterThan(10);
    expect(cusps.lines.length).toBeLessThanOrEqual(30);
    for (const line of cusps.lines) {
      const r = (k: number) => Math.hypot(line.points[k], line.points[k + 1], line.points[k + 2]);
      // From its highest point (or 14 Re), only downward, to the ground it started from.
      expect(r(0)).toBeGreaterThan(2);
      expect(r(0)).toBeLessThanOrEqual(14);
      for (let k = 3; k < line.points.length; k += 3) expect(r(k)).toBeLessThanOrEqual(r(k - 3) + 1e-9);
      expect(r(line.points.length - 3)).toBeLessThan(1.05);
    }
  });
});

describe('reconnection on the day side', () => {
  it('flashes at T96\'s own magnetopause nose: 11.1 Re at 2 nPa, pressed in to 8.8 at 10', () => {
    expect(magnetopauseNoseRe(2)).toBeCloseTo(5.48 + 0.08 * 70, 9);
    const xappa = 5 ** 0.14;
    expect(magnetopauseNoseRe(10)).toBeCloseTo(5.48 / xappa + 0.08 * (70 / xappa), 9);
    expect(magnetopauseNoseRe(10)).toBeCloseTo(8.84, 1);
  });

  it('comes in bursts only while the IMF points south, more often the stronger the wind\'s electric field', () => {
    expect(vbsOf(500, -4)).toBeCloseTo(2, 9);
    expect(vbsOf(500, 3)).toBe(0);
    expect(flashInterval(0)).toBeNull();
    expect(flashInterval(2)).toBe(6);
    expect(flashInterval(8)).toBeLessThan(flashInterval(2)!);
    expect(flashInterval(100)).toBe(0.8);
    expect(flashesAt(123.4, 0)).toEqual([]);
  });

  it('is the same for the same moment, and lights each burst up and down over its time, near the nose', () => {
    const lit: number[] = [];
    for (let s = 0; s < 60; s += 0.05) {
      const flashes = flashesAt(s, 4);
      expect(flashesAt(s, 4)).toEqual(flashes);
      for (const f of flashes) {
        expect(f.strength).toBeGreaterThanOrEqual(0);
        expect(f.strength).toBeLessThanOrEqual(1);
        expect(Math.abs(f.y)).toBeLessThanOrEqual(4);
        expect(Math.abs(f.z)).toBeLessThanOrEqual(3);
        lit.push(s);
      }
    }
    // Every 3 s at 4 mV/m, each lit for 0.7 s: about a quarter of the time.
    expect(lit.length * 0.05).toBeGreaterThan(60 * (FLASH_SECONDS / 3) * 0.6);
  });
});
