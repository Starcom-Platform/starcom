/**
 * The hooks must not fetch when they are not the provider in use.
 *
 * The context half of this is in
 * src/context/__tests__/spaceWeatherProviderFetch.test.tsx. Both halves are
 * needed: a hook that ignores `enabled` still fetches however carefully the
 * context passes it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/*
 * Returns the shape the hook actually consumes — an empty NOAA feature
 * collection — rather than a stub that throws on the way through. A test whose
 * subject is "was this called" still should not leave a TypeError in the log:
 * noise in passing output is how people learn to stop reading it.
 */
const fetchLatest = vi.fn(async (dataset: string) => ({
  time_tag: new Date().toISOString(),
  cadence: 60,
  product_version: dataset === 'InterMag' ? 'InterMagEarthScope' : 'US-Canada-1D',
  type: 'FeatureCollection',
  features: [],
}));
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

const { useSpaceWeatherData } = await import('../useSpaceWeatherData');

describe('useSpaceWeatherData honours `enabled`', () => {
  beforeEach(() => { fetchLatest.mockClear(); });

  it('does not reach NOAA when disabled', async () => {
    renderHook(() => useSpaceWeatherData({ enabled: false, autoRefresh: false }));
    // Give any mount effect a chance to run before concluding it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it('does reach NOAA when enabled — so the test above is not passing vacuously', async () => {
    renderHook(() => useSpaceWeatherData({ enabled: true, autoRefresh: false }));
    await waitFor(() => expect(fetchLatest).toHaveBeenCalled());
  });
});
