/**
 * The ticker's poll reads what it already holds (critique audit of 2026-10-01,
 * section 2.1; plan block F, item 2).
 *
 * The poll runs every five minutes, in every open tab, and wrote each reading
 * to a cache it never read: every series was asked for again each time, at
 * 4-16 s a request, for figures EIA publishes daily, weekly or monthly. The
 * cache's age limit also read the table's minutes as seconds. Now a reading is
 * kept for its series' refresh interval, in minutes, and only what is missing
 * or expired is asked for. What a reading becomes is read from the table too:
 * each series fills the field the table names.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EnhancedEIAService } from '../EIAService';
import { EIA_SERIES_CONFIG } from '../seriesConfig';
import type { EIADataPoint } from '../interfaces';

const point = (seriesId: string, value: number): EIADataPoint => ({
  seriesId, value, timestamp: new Date(), units: '', label: seriesId, category: 'x', priority: 'standard', formattedValue: String(value),
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the ticker\'s poll', () => {
  const service = () => {
    const s = EnhancedEIAService.getInstance() as unknown as {
      provider: { fetchBatch: (r: { seriesIds: string[] }) => Promise<{ data: Record<string, EIADataPoint> }> };
      clearCache?: () => void;
      cache: Map<string, unknown>;
    };
    s.cache.clear();
    const fetchBatch = vi.fn(async ({ seriesIds }: { seriesIds: string[] }) => ({
      data: Object.fromEntries(seriesIds.map((id) => [id, point(id, 1)])),
    }));
    s.provider.fetchBatch = fetchBatch;
    return { s: s as unknown as EnhancedEIAService, fetchBatch };
  };

  it('asks only for what it does not hold, until a reading is older than its series refreshes', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 2, 12) });
    const { s, fetchBatch } = service();
    await s.getMultipleSeries(['PET.RWTC.W', 'NG.RNGWHHD.D']);
    expect(fetchBatch).toHaveBeenCalledTimes(1);

    // Five minutes on, the next poll: nothing to ask for.
    vi.setSystemTime(Date.UTC(2026, 9, 2, 12, 5));
    const again = await s.getMultipleSeries(['PET.RWTC.W', 'NG.RNGWHHD.D']);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(again.map((p) => p.seriesId).sort()).toEqual(['NG.RNGWHHD.D', 'PET.RWTC.W']);

    // Past the daily series' interval, but not the weekly one's: only the daily is asked for.
    const daily = Object.values(EIA_SERIES_CONFIG).find((c) => c.series === 'NG.RNGWHHD.D')!.refreshInterval;
    const weekly = Object.values(EIA_SERIES_CONFIG).find((c) => c.series === 'PET.RWTC.W')!.refreshInterval;
    expect(daily).toBeLessThan(weekly);
    vi.setSystemTime(Date.UTC(2026, 9, 2, 12) + (daily + 1) * 60_000);
    await s.getMultipleSeries(['PET.RWTC.W', 'NG.RNGWHHD.D']);
    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(fetchBatch.mock.calls[1][0].seriesIds).toEqual(['NG.RNGWHHD.D']);
  });

  it('puts each reading in the field its series names in the table', async () => {
    const { s } = service();
    const data = await s.getAllEnhancedData();
    for (const config of Object.values(EIA_SERIES_CONFIG)) {
      expect((data as unknown as Record<string, unknown>)[config.field], config.series).toBe(1);
    }
  });
});
