import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeomagneticData } from '../useGeomagneticData';
import { fetchLiveKpSnapshot, fetchGeomagneticForecast, fetchGeomagneticDisruptionRisk } from '../../services/SpaceWeatherLive';

vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveKpSnapshot: vi.fn(),
  fetchGeomagneticForecast: vi.fn(),
  fetchGeomagneticDisruptionRisk: vi.fn()
}));

const defaultForecast = { forecast: [], quality: 'fallback' as const };
const defaultRisk = { risk: null, quality: 'fallback' as const };
// Computed relative to real Date.now() at test-run time (matching
// GlobeEngine.spaceWeather.test.ts's staleness tests) rather than fake
// timers — vi.useFakeTimers() froze this hook's Promise.allSettled(...)
// chain from ever resolving in earlier attempts at this file, and even
// setting that aside, real-time-relative fixtures are simpler to reason
// about than keeping a pinned fake "now" in sync with every timestamp.
const FRESH_TIME = () => new Date().toISOString();

describe('useGeomagneticData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchGeomagneticForecast).mockResolvedValue(defaultForecast);
    vi.mocked(fetchGeomagneticDisruptionRisk).mockResolvedValue(defaultRisk);
  });

  it('stays null while inactive and never calls any fetcher', () => {
    const { result } = renderHook(() => useGeomagneticData(false));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
    expect(fetchLiveKpSnapshot).not.toHaveBeenCalled();
    expect(fetchGeomagneticForecast).not.toHaveBeenCalled();
    expect(fetchGeomagneticDisruptionRisk).not.toHaveBeenCalled();
  });

  it('fetches a live snapshot on activation and exposes kp/activity/quality/lastUpdated', async () => {
    const timestamp = FRESH_TIME();
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 6, timestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(6));
    expect(result.current.data?.quality).toBe('live');
    expect(result.current.data?.activity).toBe('major_storm');
    expect(result.current.lastUpdated).toEqual(new Date(timestamp));
  });

  it('surfaces fallback quality when the live fetch falls back, without throwing', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 3, timestamp: FRESH_TIME() },
      quality: 'fallback'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.quality).toBe('fallback'));
    expect(result.current.data?.kp).toBe(3);
  });

  // Distinct from 'fallback': the fetch genuinely succeeded, the value is
  // just old. GlobeEngine.ts's 3D shell already dimmed itself for stale Kp
  // readings before this hook had any equivalent concept — a stale value
  // could show as confidently "live" in the HUD panel next to a dimmed
  // shell. Same 90-minute threshold (KP_STALE_MS, SpaceWeatherModeling.ts)
  // now drives both.
  it('overrides quality to stale when a successfully-fetched Kp reading is older than the staleness threshold, even though the fetch reported live', async () => {
    const oldTimestamp = new Date(Date.now() - 100 * 60 * 1000).toISOString(); // 100 minutes old
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 5, timestamp: oldTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(5));
    expect(result.current.data?.quality).toBe('stale');
  });

  it('does not mark a reading just under the staleness threshold as stale', async () => {
    const recentTimestamp = new Date(Date.now() - 80 * 60 * 1000).toISOString(); // 80 minutes old
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 5, timestamp: recentTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(5));
    expect(result.current.data?.quality).toBe('live');
  });

  it('clears data when deactivated after being active', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 4, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result, rerender } = renderHook(({ active }) => useGeomagneticData(active), {
      initialProps: { active: true }
    });
    await waitFor(() => expect(result.current.data?.kp).toBe(4));

    rerender({ active: false });
    expect(result.current.data).toBeNull();
  });

  it('reports a rising trend when the nearest forecast day predicts meaningfully higher Kp', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 2, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    vi.mocked(fetchGeomagneticForecast).mockResolvedValue({
      forecast: [{ date: FRESH_TIME(), predictedKp: 5 }],
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.trend).toBe('rising'));
  });

  it('reports a falling trend when the nearest forecast day predicts meaningfully lower Kp', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 6, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    vi.mocked(fetchGeomagneticForecast).mockResolvedValue({
      forecast: [{ date: FRESH_TIME(), predictedKp: 2 }],
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.trend).toBe('falling'));
  });

  it('reports a steady trend for a small forecast delta, and no trend at all when no forecast is available', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 4, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    vi.mocked(fetchGeomagneticForecast).mockResolvedValue({
      forecast: [{ date: FRESH_TIME(), predictedKp: 4.2 }],
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));
    await waitFor(() => expect(result.current.data?.kp).toBe(4));
    expect(result.current.data?.trend).toBe('steady');
  });

  it('omits trend when the forecast is unavailable, rather than guessing', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 4, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    // defaultForecast (empty array) from beforeEach applies here.

    const { result } = renderHook(() => useGeomagneticData(true));
    await waitFor(() => expect(result.current.data?.kp).toBe(4));
    expect(result.current.data?.trend).toBeUndefined();
  });

  it('surfaces disruption risk level and description when available', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 6, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    vi.mocked(fetchGeomagneticDisruptionRisk).mockResolvedValue({
      risk: { level: 'high', description: 'Significant risk to satellite and communication systems.' },
      quality: 'live'
    });

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.riskLevel).toBe('high'));
    expect(result.current.data?.riskDescription).toContain('Significant');
  });

  it('still resolves kp/activity even if the forecast fetch itself rejects', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({
      snapshot: { kp: 6, timestamp: FRESH_TIME() },
      quality: 'live'
    });
    vi.mocked(fetchGeomagneticForecast).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.kp).toBe(6));
    expect(result.current.data?.trend).toBeUndefined();
  });

  // Practically unreachable today (fetchLiveKpSnapshot always resolves via
  // its own internal try/catch) but defended explicitly: if that invariant
  // ever breaks, the hook must surface a clear error instead of silently
  // leaving the panel showing nothing (or stale data with no signal that
  // it stopped updating).
  it('surfaces an explicit error when the Kp fetch promise itself rejects', async () => {
    vi.mocked(fetchLiveKpSnapshot).mockRejectedValue(new Error('unexpected failure'));

    const { result } = renderHook(() => useGeomagneticData(true));

    await waitFor(() => expect(result.current.data?.error).toBe('Unable to load geomagnetic data'));
    expect(result.current.data?.kp).toBeUndefined();
  });
});
