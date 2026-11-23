/**
 * The solar wind between the Sun and the Earth as it was (space-weather-visualization.md, SW6, SW7,
 * SW16): each measured minute a source on the turning Sun, its parcels out along a trailing spiral,
 * at the hindcast moment when the measurements fill the Sun-Earth stretch.
 */
import { describe, expect, it } from 'vitest';
import { AU_KM, daysToEarth, hindcastMoment, parcelAt, parseWindHistory, polarityOf, SUN_ROTATION, windSources, type WindMinute } from '../heliosphere';

const T0 = Date.UTC(2026, 9, 10);
const DAY = 86_400_000;
const minutes = (n: number, at: (k: number) => Partial<WindMinute> = () => ({})): WindMinute[] =>
  Array.from({ length: n }, (_, k) => ({ arrive: T0 - (n - 1 - k) * 60_000, speed: 400, density: 5, bx: -3, by: 3, bz: 0, ...at(k) }));

describe('reading the 7 days of wind', () => {
  it('takes each complete minute by its columns\' names, timed by its arrival at the Earth, oldest first', () => {
    const header = ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'];
    const got = parseWindHistory([
      header,
      ['2026-10-10T18:02:00Z', 800, 16, 1, -20, -16, -7, 27, 0, 0, 0, '2026-10-10T18:30:00Z'],
      ['2026-10-10T18:01:00Z', 790, 15, 1, -19, -15, -6, 26, 0, 0, 0, '2026-10-10T18:29:00Z'],
      ['2026-10-10T18:03:00Z', null, 15, 1, -19, -15, -6, 26, 0, 0, 0, '2026-10-10T18:31:00Z'],
    ]);
    expect(got.map((m) => [new Date(m.arrive).toISOString(), m.speed])).toEqual([['2026-10-10T18:29:00.000Z', 790], ['2026-10-10T18:30:00.000Z', 800]]);
  });
});

describe('the hindcast moment', () => {
  it('is the last arrival less a day\'s median parcel\'s time from the Sun, to the hour', () => {
    const got = hindcastMoment(minutes(2 * 24 * 60))!;
    const want = Math.floor((T0 - daysToEarth(400) * DAY) / 3_600_000) * 3_600_000;
    expect(got).toBe(want);
    expect(daysToEarth(400)).toBeCloseTo(AU_KM / 400 / 86_400, 9);
  });
});

describe('the sources and their parcels', () => {
  it('put a parcel that reached the Earth at the moment at the Earth, 1 AU out on +x', () => {
    const moment = T0;
    const [source] = windSources([{ arrive: moment, speed: 400, density: 5, bx: -3, by: 3, bz: 0 }], moment);
    const [x, y] = parcelAt(source, daysToEarth(400));
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('lay each source\'s parcels along a spiral trailing the Sun\'s turn: farther out, farther behind', () => {
    const [source] = windSources([{ arrive: T0, speed: 400, density: 5, bx: -3, by: 3, bz: 0 }], T0);
    const a1 = Math.atan2(parcelAt(source, 1)[1], parcelAt(source, 1)[0]);
    const a3 = Math.atan2(parcelAt(source, 3)[1], parcelAt(source, 3)[0]);
    expect(a1 - a3).toBeCloseTo(SUN_ROTATION * 2 * DAY, 9);
    expect(Math.hypot(...parcelAt(source, 3))).toBeCloseTo(3 * Math.hypot(...parcelAt(source, 1)), 9);
  });

  it('let a fast stream outrun a slow one sent at the same time', () => {
    const [slow, fast] = windSources([{ arrive: T0, speed: 350, density: 5, bx: 0, by: 1, bz: 0 }, { arrive: T0 + 60_000, speed: 700, density: 2, bx: 0, by: 1, bz: 0 }], T0, 1);
    expect(Math.hypot(...parcelAt(fast, 2))).toBeGreaterThan(Math.hypot(...parcelAt(slow, 2)) * 1.9);
  });

  it('cover about ninety degrees of the Sun\'s longitude from seven days', () => {
    const all = windSources(minutes(7 * 24 * 60), T0 - 4 * DAY, 60);
    const span = Math.max(...all.map((s) => s.angle)) - Math.min(...all.map((s) => s.angle));
    // The Sun's turn less the Earth's along its orbit, 13.2° a day, over seven days.
    expect((span * 180) / Math.PI).toBeGreaterThan(90);
    expect((span * 180) / Math.PI).toBeLessThan(95);
  });

  it('carry the IMF\'s polarity, away along the outgoing spiral, toward the other way', () => {
    expect(polarityOf(-3, 3)).toBe(1);
    expect(polarityOf(3, -3)).toBe(-1);
  });

  it('carry how unsteady the wind was about them', () => {
    const steady = windSources(minutes(30), T0, 15)[1];
    const gusty = windSources(minutes(30, (k) => ({ bz: k % 2 ? 6 : -6 })), T0, 15)[1];
    expect(steady.turbulence).toBeCloseTo(0, 9);
    expect(gusty.turbulence).toBeGreaterThan(0.5);
  });
});
