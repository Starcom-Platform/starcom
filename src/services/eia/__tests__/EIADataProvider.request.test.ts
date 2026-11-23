/**
 * How the ticker asks EIA for a reading, and what it will accept back
 * (critique audit of 2026-10-01, section 2.1; plan block F, item 2).
 *
 * It asked for a series with no `length`, so each poll downloaded the whole
 * history (5,000 rows, 1.4 MB for the daily oil price) to read one value. It
 * read only `value` and `generation`, so the electricity price, which EIA
 * sends as `price`, never arrived. And it showed whatever the newest row was,
 * however old: the gas price it read had not changed since April 2024.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, calls: [] as Array<[string, Record<string, string>]> }));
vi.mock('../../../api/eia', () => ({
  fetchEIAData: vi.fn(async (endpoint: string, params: Record<string, string>) => { api.calls.push([endpoint, params]); return api.rows; }),
}));
import { EIADataProvider } from '../EIADataProvider';

const DAY_MS = 86_400_000;
const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const isoMonth = (monthsAgo: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - monthsAgo); return d.toISOString().slice(0, 7); };

beforeEach(() => { api.rows = []; api.calls = []; });

describe('asking EIA for a reading', () => {
  it('asks for the newest row only', async () => {
    api.rows = [{ period: isoDay(2 * DAY_MS), value: 93.57 }];
    await new EIADataProvider().fetchSeries('PET.RWTC.W');
    expect(api.calls).toEqual([['seriesid/PET.RWTC.W', { length: '1', 'sort[0][column]': 'period', 'sort[0][direction]': 'desc' }]]);
  });

  it('reads a value EIA sends as price, as it does for the electricity price', async () => {
    api.rows = [{ period: isoMonth(3), price: 14.99, 'price-units': 'cents per kilowatt-hour' }];
    expect((await new EIADataProvider().fetchSeries('ELEC.PRICE.US-ALL.M')).value).toBe(14.99);
  });
});

describe('what it will not show as current', () => {
  it('a daily series more than two weeks old', async () => {
    api.rows = [{ period: isoDay(15 * DAY_MS), value: 1.785 }];
    await expect(new EIADataProvider().fetchSeries('NG.RNGWHHD.D')).rejects.toThrow(/old|stale/i);
    api.rows = [{ period: isoDay(3 * DAY_MS), value: 3.18 }];
    expect((await new EIADataProvider().fetchSeries('NG.RNGWHHD.D')).value).toBe(3.18);
  });

  it('a weekly series more than five weeks old', async () => {
    api.rows = [{ period: isoDay(36 * DAY_MS), value: 93.57 }];
    await expect(new EIADataProvider().fetchSeries('PET.RWTC.W')).rejects.toThrow(/old|stale/i);
    api.rows = [{ period: isoDay(8 * DAY_MS), value: 93.57 }];
    expect((await new EIADataProvider().fetchSeries('PET.RWTC.W')).value).toBe(93.57);
  });

  it('a monthly series more than six months old; EIA publishes these two or three months behind', async () => {
    api.rows = [{ period: isoMonth(7), generation: 71171 }];
    await expect(new EIADataProvider().fetchSeries('ELEC.GEN.NUC-US-99.M')).rejects.toThrow(/old|stale/i);
    api.rows = [{ period: isoMonth(3), generation: 71171 }];
    expect((await new EIADataProvider().fetchSeries('ELEC.GEN.NUC-US-99.M')).value).toBe(71171);
  });

  it('a row with no period it can read', async () => {
    api.rows = [{ value: 93.57 }];
    await expect(new EIADataProvider().fetchSeries('PET.RWTC.W')).rejects.toThrow(/period|date/i);
  });
});
