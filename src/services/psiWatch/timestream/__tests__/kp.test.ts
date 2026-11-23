/**
 * The field lane's Kp (decision D-PW, PW42, PW51): GFZ's record as baked, NOAA's last 30 days, 3-hourly forecast and
 * 27-day outlook read as SWPC writes them, merged with the better source standing in each slot, and drawn in the form
 * the zoom asks for: 3-hourly values, each day's largest, storm days, storms a year.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { bakeKp, KP_ALPHABET, kpBars, kpLod, kpName, kpRecord, readKpBake, readKpDaily, readKpForecast, readKpOutlook, stormLevel } from '../kp';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const FORECAST = [
  { time_tag: '2026-10-26T21:00:00', kp: 2.33, observed: 'observed', noaa_scale: null },
  { time_tag: '2026-10-27T00:00:00', kp: 1.67, observed: 'estimated', noaa_scale: null },
  { time_tag: '2026-10-29T21:00:00', kp: 1.67, observed: 'predicted', noaa_scale: null },
  { time_tag: 'not a time', kp: 4, observed: 'predicted' },
];
const OUTLOOK = `:Product: 27-day Space Weather Outlook Table 27DO.txt
#  Date       10.7 cm      A Index    Kp Index
2026 Oct 29      84           5          2
2026 Oct 30      84           5          2
2026 Oct 31      84          30          5
`;
const DAILY = `#  Date        A     K-indices        A     K-indices        A     K-indices
2026 10 26     3  0 2 1 1 2 1 1 0     2  0 1 0 2 1 0 1 0     4   0.67  1.67  1.00  1.33  1.33  0.67  1.00  3.00
2026 10 27    -1  1 2 2 1 3 1-1-1    -1  1 2 1 3 3 0-1-1     6   1.67  2.67  1.67  1.33  2.00  1.00 -1.00 -1.00
`;
const GFZ = `#YYY MM DD hh.h hh._m        days      days_m     Kp   ap D
2026 10 26 15.0 16.50 34632.62500 34632.68750  5.333   56 1
2026 10 26 18.0 19.50 34632.75000 34632.81250  0.667    3 0
2026 10 26 21.0 22.50 34632.87500 34632.93750 -1.000   -1 0
`;

describe('the field lane\'s Kp', () => {
  it('reads NOAA\'s three products in UTC, each value saying which it is', () => {
    const kp = readKpForecast(FORECAST);
    expect(kp.map((s) => s.basis)).toEqual(['observed', 'estimated', 'predicted']);
    expect(kp[0]).toEqual({ fromMs: Date.UTC(2026, 9, 26, 21), untilMs: Date.UTC(2026, 9, 27), kp: 2.33, basis: 'observed' });
    expect(readKpForecast({ not: 'a list' })).toEqual([]);
    expect(readKpOutlook(OUTLOOK).map((d) => d.kp)).toEqual([2, 2, 5]);
    const daily = readKpDaily(DAILY);
    // Two days' eight values, the second's last two not come yet.
    expect(daily).toHaveLength(14);
    expect(daily[7]).toMatchObject({ fromMs: Date.UTC(2026, 9, 26, 21), kp: 3, basis: 'estimated' });
  });

  it('bakes GFZ\'s file a character a slot and reads it back, preliminary apart, the missing left out', () => {
    const bake = bakeKp(GFZ);
    expect(bake.licence).toBe('CC BY 4.0');
    expect(bake.kp).toBe(`${KP_ALPHABET[16]}${KP_ALPHABET[2]}~`);
    expect(bake.preliminaryFrom).toBe(1);
    // Punctuation only: never a letter or a digit, so never a credential's shape.
    expect(/[A-Za-z0-9]/.test(KP_ALPHABET)).toBe(false);
    const read = readKpBake(JSON.parse(JSON.stringify(bake)))!;
    expect(read.startMs).toBe(Date.UTC(2026, 9, 26, 15));
    expect([...read.kp3]).toEqual([16, 2, 255]);
    expect([...read.preliminary]).toEqual([0, 1, 0]);
    expect(readKpBake({ kp: 3 })).toBeNull();
  });

  it('lets GFZ stand over NOAA, NOAA\'s observed over its estimate, and runs the outlook on from where the slots end', () => {
    const record = kpRecord(readKpBake(bakeKp(GFZ)), [...readKpDaily(DAILY), ...readKpForecast(FORECAST)], readKpOutlook(OUTLOOK));
    const slot = (ms: number) => Math.round((ms - record.startMs) / (3 * 3_600_000));
    const at = (ms: number) => ({ kp: record.kp3[slot(ms)] / 3, basis: ['definitive', 'preliminary', 'observed', 'estimated', 'predicted'][record.basis[slot(ms)]] });
    expect(at(Date.UTC(2026, 9, 26, 15))).toEqual({ kp: 16 / 3, basis: 'definitive' });
    expect(at(Date.UTC(2026, 9, 26, 18))).toEqual({ kp: 2 / 3, basis: 'preliminary' });
    // GFZ has no value at 21:00: NOAA's observed 2.33 stands over its 30-day estimate of 3.
    expect(at(Date.UTC(2026, 9, 26, 21))).toEqual({ kp: 7 / 3, basis: 'observed' });
    expect(record.outlook.map((d) => new Date(d.fromMs).toISOString().slice(0, 13))).toEqual(['2026-10-30T00', '2026-10-31T00']);
  });

  it('changes form with the zoom: slots, each day\'s largest, storm days, storms a year', () => {
    expect([kpLod(7 * DAY), kpLod(YEAR), kpLod(5 * YEAR), kpLod(50 * YEAR)]).toEqual(['slots', 'days', 'stormDays', 'years']);
    const record = kpRecord(readKpBake(bakeKp(GFZ)), [...readKpDaily(DAILY), ...readKpForecast(FORECAST)], readKpOutlook(OUTLOOK));
    const week = { startMs: Date.UTC(2026, 9, 25), spanMs: 7 * DAY };
    expect(kpBars(record, week, 'slots').some((b) => b.basis === 'outlook')).toBe(true);
    const days = kpBars(record, week, 'days');
    expect(days.find((d) => d.fromMs === Date.UTC(2026, 9, 26))).toMatchObject({ kp: 16 / 3, basis: 'definitive' });
    expect(kpBars(record, week, 'stormDays').map((d) => new Date(d.fromMs).toISOString().slice(0, 10))).toEqual(['2026-10-26', '2026-10-31']);
    // Two storm days apart are two storms, both of 2026.
    expect(kpBars(record, { startMs: Date.UTC(2020, 0, 1), spanMs: 10 * YEAR }, 'years')).toEqual([
      expect.objectContaining({ fromMs: Date.UTC(2026, 0, 1), storms: 2, basis: 'outlook' }),
    ]);
  });

  it('names a Kp by its thirds and its storm by the G scale', () => {
    expect([kpName(4 + 2 / 3), kpName(4), kpName(4 + 1 / 3), kpName(2.33)]).toEqual(['5−', '4o', '4+', '2+']);
    expect([stormLevel(4.67), stormLevel(5), stormLevel(7.33), stormLevel(9)]).toEqual([0, 1, 3, 5]);
  });
});
