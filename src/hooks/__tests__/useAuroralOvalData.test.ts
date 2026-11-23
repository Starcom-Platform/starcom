import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuroralOvalData } from '../useAuroralOvalData';
import { fetchLiveKpSnapshot } from '../../services/SpaceWeatherLive';

vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveKpSnapshot: vi.fn()
}));

// Computed relative to real Date.now() at test-run time (matching
// useGeomagneticData.test.ts and GlobeEngine.spaceWeather.test.ts's own
// staleness tests) rather than fake timers.
const FRESH_TIME = () => new Date().toISOString();

describe('useAuroralOvalData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays null while inactive and never calls fetchLiveKpSnapshot', () => {
    const { result } = renderHook(() => useAuroralOvalData(false));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
    expect(fetchLiveKpSnapshot).not.toHaveBeenCalled();
  });

  it('fetches a live snapshot on activation and exposes kp/activity/quality/lastUpdated', async () => {
    const timestamp = FRESH_TIME();
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 4, timestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(4));
    expect(result.current.data?.quality).toBe('live');
    expect(result.current.data?.activity).toBe('active');
    expect(result.current.lastUpdated).toEqual(new Date(timestamp));
  });

  it('surfaces fallback quality when the live fetch falls back, without throwing', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 3, timestamp: FRESH_TIME() },
      quality: 'fallback'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.quality).toBe('fallback'));
    expect(result.current.data?.kp).toBe(3);
  });

  it('overrides quality to stale when a successfully-fetched Kp reading is older than the staleness threshold', async () => {
    const oldTimestamp = new Date(Date.now() - 100 * 60 * 1000).toISOString(); // 100 minutes old
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 5, timestamp: oldTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(5));
    expect(result.current.data?.quality).toBe('stale');
  });

  it('does not mark a reading just under the staleness threshold as stale', async () => {
    const recentTimestamp = new Date(Date.now() - 80 * 60 * 1000).toISOString(); // 80 minutes old
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 5, timestamp: recentTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(5));
    expect(result.current.data?.quality).toBe('live');
  });

  // The whole point of this hook existing separately from
  // useGeomagneticData: same underlying Kp value, but its own real signal
  // specific to aurora — whether the current index meets the same
  // blackout threshold buildAuroralPayload uses to widen the 3D oval's
  // blackout band.
  it('reports blackoutRisk true when Kp meets the blackout threshold (7)', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 7, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(7));
    expect(result.current.data?.blackoutRisk).toBe(true);
  });

  it('reports blackoutRisk false when Kp is just under the blackout threshold', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 6.9, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(6.9));
    expect(result.current.data?.blackoutRisk).toBe(false);
  });

  it('clears data when deactivated after being active', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 4, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result, rerender } = renderHook(({ active }) => useAuroralOvalData(active), {
      initialProps: { active: true }
    });
    await waitFor(() => expect(result.current.data?.kp).toBe(4));

    rerender({ active: false });
    expect(result.current.data).toBeNull();
  });

  // Practically unreachable today (fetchLiveKpSnapshot always resolves via
  // its own internal try/catch) but defended explicitly, matching
  // useGeomagneticData.ts's identical stance.
  it('surfaces an explicit error when the Kp fetch promise itself rejects', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockRejectedValue(new Error('unexpected failure'));

    const { result } = renderHook(() => useAuroralOvalData(true));

    await waitFor(() => expect(result.current.data?.error).toBe('Unable to load aurora oval data'));
    expect(result.current.data?.kp).toBeUndefined();
  });
});
