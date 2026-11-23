import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMagnetopauseData } from '../useMagnetopauseData';
import { fetchLiveSolarWindSnapshot } from '../../services/SpaceWeatherLive';

// Only the fetch is mocked — buildMagnetopausePayload/computeDynamicPressureNPa/
// computeMagnetopauseStandoff (SpaceWeatherModeling.ts) run for real, so
// this test exercises the exact same derivation the 3D magnetopause shell
// uses, not a re-implemented copy.
vi.mock('../../services/SpaceWeatherLive', () => ({
  fetchLiveSolarWindSnapshot: vi.fn()
}));

const FRESH_TIME = () => new Date().toISOString();

describe('useMagnetopauseData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays null while inactive and never calls fetchLiveSolarWindSnapshot', () => {
    const { result } = renderHook(() => useMagnetopauseData(false));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
    expect(fetchLiveSolarWindSnapshot).not.toHaveBeenCalled();
  });

  it('derives a real stand-off distance from a live solar wind snapshot', async () => {
    const timestamp = FRESH_TIME();
    // speed=420/density=6 matches fallbackSolarWindSnapshot()'s own
    // literals; computeDynamicPressureNPa -> computeMagnetopauseStandoff
    // resolves this to ~9.292 Re (verified against the real formula, not
    // hand-arithmetic).
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.standoffRe).toBeDefined());
    expect(result.current.data?.standoffRe).toBeCloseTo(9.292, 2);
    expect(result.current.data?.clamped).toBe(false);
    expect(result.current.data?.quality).toBe('live');
    expect(result.current.lastUpdated).toEqual(new Date(timestamp));
  });

  it('surfaces fallback quality when the live fetch falls back, without throwing', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: FRESH_TIME() },
      quality: 'fallback'
    });

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.quality).toBe('fallback'));
    expect(result.current.data?.standoffRe).toBeCloseTo(9.292, 2);
  });

  it('overrides quality to stale when a successfully-fetched snapshot is older than the staleness threshold', async () => {
    const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes old
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: oldTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.standoffRe).toBeDefined());
    expect(result.current.data?.quality).toBe('stale');
  });

  it('does not mark a reading just under the staleness threshold as stale', async () => {
    const recentTimestamp = new Date(Date.now() - 8 * 60 * 1000).toISOString(); // 8 minutes old
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: recentTimestamp },
      quality: 'live'
    });

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.standoffRe).toBeDefined());
    expect(result.current.data?.quality).toBe('live');
  });

  // Extreme dynamic pressure (very high density + speed) pushes the raw
  // physics result below the model's 5 Re floor — computeMagnetopauseStandoff
  // clamps it and reports that fact, which this hook surfaces rather than
  // discarding, unlike the pre-existing stub which had no such signal.
  it('surfaces clamped: true when solar wind pressure is extreme enough to hit the model floor', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 2000, densityPerCm3: 200, bz: -20, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.standoffRe).toBeDefined());
    expect(result.current.data?.standoffRe).toBeCloseTo(5, 5);
    expect(result.current.data?.clamped).toBe(true);
  });

  it('clears data when deactivated after being active', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: FRESH_TIME() },
      quality: 'live'
    });

    const { result, rerender } = renderHook(({ active }) => useMagnetopauseData(active), {
      initialProps: { active: true }
    });
    await waitFor(() => expect(result.current.data?.standoffRe).toBeDefined());

    rerender({ active: false });
    expect(result.current.data).toBeNull();
  });

  // Practically unreachable today (fetchLiveSolarWindSnapshot always
  // resolves via its own internal try/catch) but defended explicitly,
  // matching useSolarWindData.ts/useGeomagneticData.ts's identical stance.
  it('surfaces an explicit error when the fetch promise itself rejects', async () => {
    vi.mocked(fetchLiveSolarWindSnapshot).mockRejectedValue(new Error('unexpected failure'));

    const { result } = renderHook(() => useMagnetopauseData(true));

    await waitFor(() => expect(result.current.data?.error).toBe('Unable to load magnetopause data'));
    expect(result.current.data?.standoffRe).toBeUndefined();
  });
});
