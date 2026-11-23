import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSolarWindData } from '../useSolarWindData';
import { fetchLiveSolarWindSnapshot } from '../../services/SpaceWeatherLive';

vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveSolarWindSnapshot: vi.fn()
}));

// Computed relative to real Date.now() at test-run time (matching
// useAuroralOvalData.test.ts/useGeomagneticData.test.ts's own staleness
// tests) rather than fake timers.
const FRESH_TIME = () => new Date().toISOString();

describe('useSolarWindData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays null while inactive and never calls fetchLiveSolarWindSnapshot', () => {
    const { result } = renderHook(() => useSolarWindData(false));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
    expect(fetchLiveSolarWindSnapshot).not.toHaveBeenCalled();
  });

  it('fetches a live snapshot on activation and exposes speed/density/bz/quality/lastUpdated', async () => {
    const timestamp = FRESH_TIME();
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 512, densityPerCm3: 8.2, bz: -5, timestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useSolarWindData(true));

    await waitFor(() => expect(result.current.data?.speed).toBe(512));
    expect(result.current.data?.density).toBe(8.2);
    expect(result.current.data?.bz).toBe(-5);
    expect(result.current.data?.quality).toBe('live');
    expect(result.current.lastUpdated).toEqual(new Date(timestamp));
  });

  it('surfaces fallback quality when the live fetch falls back, without throwing', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: FRESH_TIME() },
      quality: 'fallback'
    });

    const { result } = renderHook(() => useSolarWindData(true));

    await waitFor(() => expect(result.current.data?.quality).toBe('fallback'));
    expect(result.current.data?.speed).toBe(420);
  });

  it('overrides quality to stale when a successfully-fetched snapshot is older than the staleness threshold', async () => {
    const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes old
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 500, densityPerCm3: 7, bz: 1, timestamp: oldTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useSolarWindData(true));

    await waitFor(() => expect(result.current.data?.speed).toBe(500));
    expect(result.current.data?.quality).toBe('stale');
  });

  it('does not mark a reading just under the staleness threshold as stale', async () => {
    const recentTimestamp = new Date(Date.now() - 8 * 60 * 1000).toISOString(); // 8 minutes old
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 500, densityPerCm3: 7, bz: 1, timestamp: recentTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useSolarWindData(true));

    await waitFor(() => expect(result.current.data?.speed).toBe(500));
    expect(result.current.data?.quality).toBe('live');
  });

  it('clears data when deactivated after being active', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 450, densityPerCm3: 5, bz: 0, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result, rerender } = renderHook(({ active }) => useSolarWindData(active), {
      initialProps: { active: true }
    });
    await waitFor(() => expect(result.current.data?.speed).toBe(450));

    rerender({ active: false });
    expect(result.current.data).toBeNull();
  });

  // Practically unreachable today (fetchLiveSolarWindSnapshot always
  // resolves via its own internal try/catch) but defended explicitly,
  // matching useAuroralOvalData.ts/useGeomagneticData.ts's identical stance.
  it('surfaces an explicit error when the fetch promise itself rejects', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockRejectedValue(new Error('unexpected failure'));

    const { result } = renderHook(() => useSolarWindData(true));

    await waitFor(() => expect(result.current.data?.error).toBe('Unable to load solar wind data'));
    expect(result.current.data?.speed).toBeUndefined();
  });
});
