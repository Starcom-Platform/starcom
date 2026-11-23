/**
 * The wind the magnetopause and bow shock stand off from at the moment shown (space-weather-visualization.md,
 * SW30): measured within NOAA's 7 days; past them, the last measured, pushed in by a CME CCMC has arriving by
 * then, modelled; before them, the earliest, said so.
 */
import { describe, expect, it } from 'vitest';
import { boundaryWindAt, PUSH_LASTS_MS } from '../boundaryWind';
import { computeDynamicPressureNPa, computeMagnetopauseStandoff } from '../../SpaceWeatherModeling';
import type { WindMinute } from '../heliosphere';
import type { Cme } from '../donki';

const MIN = 60_000;
const HOUR = 3_600_000;
const START = Date.UTC(2026, 9, 18);
/** A week of minutes: 400 km/s and 5 per cm³, but 600 km/s and 20 per cm³ through one hour on the third day. */
const week: WindMinute[] = Array.from({ length: 7 * 24 * 60 }, (_, k) => {
  const arrive = START + k * MIN;
  const storm = arrive >= START + 50 * HOUR && arrive < START + 51 * HOUR;
  return { arrive, speed: storm ? 600 : 400, density: storm ? 20 : 5, bx: 1, by: 2, bz: storm ? -10 : -1 };
});
const LAST = week[week.length - 1].arrive;
const cme = (at: number, glancing = false): Cme => ({
  id: `cme-${at}`, leftAt: at - 2 * 24 * HOUR, speed: 1200, halfAngle: 40, lat: 0, lon: 0, type: 'O', link: '',
  earth: { kind: 'arrives', at, glancing, modelledAt: 0, link: '' },
});
const standoff = (w: ReturnType<typeof boundaryWindAt>) => computeMagnetopauseStandoff(computeDynamicPressureNPa(w!.snapshot.densityPerCm3, w!.snapshot.speedKmPerSec)).value;

describe('the wind at the bow shock for the moment shown', () => {
  it('is the ten minutes measured up to the moment, within the 7 days', () => {
    const quiet = boundaryWindAt(week, START + 10 * HOUR + 30_000)!;
    expect(quiet.kind).toBe('measured');
    expect(quiet.measuredAt).toBe(START + 10 * HOUR);
    expect(quiet.snapshot.speedKmPerSec).toBe(400);
    expect(quiet.pushedBy).toBeNull();
    const storm = boundaryWindAt(week, START + 50 * HOUR + 30 * MIN)!;
    expect(storm.snapshot.speedKmPerSec).toBe(600);
    expect(storm.snapshot.densityPerCm3).toBe(20);
    expect(storm.snapshot.bz).toBe(-10);
    // The magnetopause stood in closer through the hour of strong wind.
    expect(standoff(storm)).toBeLessThan(standoff(quiet) - 2);
  });

  it('is the earliest measured before the 7 days, said so, and none with nothing measured', () => {
    const before = boundaryWindAt(week, START - 3 * 24 * HOUR)!;
    expect(before.kind).toBe('earliest-measured');
    expect(before.measuredAt).toBe(START);
    expect(boundaryWindAt([], START)).toBeNull();
  });

  it('past the measurements, is the last measured, until a CME CCMC has arriving pushes the magnetopause in', () => {
    const ahead = boundaryWindAt(week, LAST + 6 * HOUR, [cme(LAST + 12 * HOUR)])!;
    expect(ahead.kind).toBe('last-measured');
    expect(ahead.measuredAt).toBe(LAST);
    expect(ahead.pushedBy).toBeNull();
    expect(ahead.snapshot.densityPerCm3).toBe(5);

    const arrived = boundaryWindAt(week, LAST + 12 * HOUR, [cme(LAST + 12 * HOUR)])!;
    expect(arrived.pushedBy).toMatchObject({ cmeId: `cme-${LAST + 12 * HOUR}`, arrivedAt: LAST + 12 * HOUR, compression: 4, glancing: false });
    expect(arrived.snapshot.densityPerCm3).toBeCloseTo(20, 9);
    expect(arrived.snapshot.speedKmPerSec).toBeCloseTo(arrived.pushedBy!.speed, 6);
    expect(arrived.pushedBy!.speed).toBeGreaterThan(400);
    expect(standoff(arrived)).toBeLessThan(standoff(ahead) - 2);

    // Easing back as it passes, and gone a day and a half after it arrived.
    const later = boundaryWindAt(week, LAST + 24 * HOUR, [cme(LAST + 12 * HOUR)])!;
    expect(standoff(later)).toBeGreaterThan(standoff(arrived));
    expect(boundaryWindAt(week, LAST + 12 * HOUR + PUSH_LASTS_MS + HOUR, [cme(LAST + 12 * HOUR)])!.pushedBy).toBeNull();
  });

  it('pushes less for a glancing blow, takes the hardest push of several, and leaves one in the measurements to them', () => {
    const at = LAST + 12 * HOUR;
    const glancing = boundaryWindAt(week, at, [cme(at, true)])!;
    expect(glancing.pushedBy!.compression).toBe(2);
    const both = boundaryWindAt(week, at, [cme(at, true), cme(at - HOUR)])!;
    expect(both.pushedBy!.cmeId).toBe(`cme-${at - HOUR}`);
    // An arrival the measurements already hold is in them, not modelled again.
    expect(boundaryWindAt(week, LAST + HOUR, [cme(LAST - HOUR)])!.pushedBy).toBeNull();
  });
});
