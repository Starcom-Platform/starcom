/**
 * Space weather's age is the data's, not the fetch's (decision D-F, step 12).
 *
 * The hook set lastUpdated to `new Date()` after fetching — and to `new Date()`
 * again when NOAA listed no files, so an empty result read as fresh. Its
 * fallback for a missing time_tag was also "now", which dated space-weather
 * intel reports to the moment of fetching.
 *
 * The mock returns NOAA's REAL shape: time_tag is a DATE only. The neighbouring
 * spaceWeatherDataEnabled test mocks it as a full ISO timestamp, which is how
 * that shape stayed invisible to every test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const fetchLatest = vi.fn();
vi.mock('../../services/noaaSpaceWeather', () => ({
  fetchLatestElectricFieldData: (...a: unknown[]) => fetchLatest(...(a as [])),
  generateSpaceWeatherAlerts: () => [],
}));
vi.mock('../../services/SpaceWeatherCacheService', () => ({
  SpaceWeatherCacheService: class {
    isDataFresh() { return false; }
    get() { return null; }
    set() { /* no-op */ }
  },
}));

const { useSpaceWeatherData, spaceWeatherObservedAt } = await import('../useSpaceWeatherData');

const file = (dataset: string, observedAt?: number) => ({
  time_tag: '2026-09-19', // what NOAA really sends: a date
  cadence: 60,
  product_version: dataset === 'InterMag' ? 'InterMagEarthScope' : 'US-Canada-1D',
  type: 'FeatureCollection',
  features: [],
  ...(observedAt === undefined ? {} : { observedAt }),
});

describe('spaceWeatherObservedAt', () => {
  it('takes the older of the two datasets', () => {
    expect(spaceWeatherObservedAt({ observedAt: 2000 }, { observedAt: 1000 })).toBe(1000);
  });

  it('ignores a dataset with no time, and is null when neither has one', () => {
    expect(spaceWeatherObservedAt({ observedAt: 5 }, {})).toBe(5);
    expect(spaceWeatherObservedAt({}, null)).toBeNull();
  });
});

describe('useSpaceWeatherData — lastUpdated', () => {
  beforeEach(() => { fetchLatest.mockReset(); });

  it('is the time the older file is for, not the moment it was fetched', async () => {
    const interMag = Date.UTC(2026, 8, 19, 19, 54, 30);
    const usCanada = Date.UTC(2026, 8, 19, 19, 56, 30);
    fetchLatest.mockImplementation(async (d: string) => file(d, d === 'InterMag' ? interMag : usCanada));
    const { result } = renderHook(() => useSpaceWeatherData({ enabled: true, autoRefresh: false }));

    await waitFor(() => expect(result.current.lastUpdated?.getTime()).toBe(interMag));
  });

  /*
   * And never time_tag's midnight — the "obvious" fix that would have called
   * 19:54Z data twenty hours old.
   */
  it('is not the date-only time_tag read as midnight', async () => {
    fetchLatest.mockImplementation(async (d: string) => file(d, Date.UTC(2026, 8, 19, 19, 54, 30)));
    const { result } = renderHook(() => useSpaceWeatherData({ enabled: true, autoRefresh: false }));

    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull());
    expect(result.current.lastUpdated!.getTime()).not.toBe(Date.parse('2026-09-19'));
  });

  it('is null, not "now", when neither file carries a time', async () => {
    fetchLatest.mockImplementation(async (d: string) => file(d));
    const before = Date.now();
    const { result } = renderHook(() => useSpaceWeatherData({ enabled: true, autoRefresh: false }));

    await waitFor(() => expect(fetchLatest).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.lastUpdated === null || result.current.lastUpdated.getTime() < before).toBe(true);
  });
});
