import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  findSnapshotAtOrBefore,
  nextSnapshotTime,
  previousSnapshotTime,
  formatHistorySpan,
  classifyHistoricalEvents,
  useEcoHistoryPlayback
} from '../useEcoHistoryPlayback';
import { EcoHistoryStore, ecoHistoryStore } from '../../services/history/EcoHistoryStore';
import type { EcoHistorySnapshot } from '../../services/history/EcoHistoryStore';
import type { NaturalEvent } from '../../services/GeoEventsService';

const snap = (timestamp: number, id: string): EcoHistorySnapshot => ({
  timestamp,
  eventCount: 1,
  data: [{ id, lat: 0, lng: 0, type: 'earthquake', magnitude: 5, source: 'USGS' }]
});

describe('findSnapshotAtOrBefore', () => {
  const snapshots = [snap(100, 'a'), snap(200, 'b'), snap(300, 'c')];

  it('returns the real snapshot exactly at the requested time', () => {
    expect(findSnapshotAtOrBefore(snapshots, 200)?.data[0].id).toBe('b');
  });

  it('returns the most recent real snapshot strictly before the requested time', () => {
    expect(findSnapshotAtOrBefore(snapshots, 250)?.data[0].id).toBe('b');
  });

  it('returns null when the requested time is before every real snapshot', () => {
    expect(findSnapshotAtOrBefore(snapshots, 50)).toBeNull();
  });

  it('returns the latest real snapshot when the requested time is after all of them', () => {
    expect(findSnapshotAtOrBefore(snapshots, 9999)?.data[0].id).toBe('c');
  });
});

describe('nextSnapshotTime', () => {
  const snapshots = [snap(100, 'a'), snap(200, 'b'), snap(300, 'c')];

  it('returns the next real snapshot timestamp strictly after the current one', () => {
    expect(nextSnapshotTime(snapshots, 100)).toBe(200);
  });

  it('returns null once at the real end of captured data (no silent loop)', () => {
    expect(nextSnapshotTime(snapshots, 300)).toBeNull();
  });

  it('returns the first real snapshot after a time before all of them', () => {
    expect(nextSnapshotTime(snapshots, 0)).toBe(100);
  });
});

describe('previousSnapshotTime', () => {
  const snapshots = [snap(100, 'a'), snap(200, 'b'), snap(300, 'c')];

  it('returns the previous real snapshot timestamp strictly before the current one', () => {
    expect(previousSnapshotTime(snapshots, 300)).toBe(200);
  });

  it('returns null once at the real start of captured data', () => {
    expect(previousSnapshotTime(snapshots, 100)).toBeNull();
  });

  it('returns the last real snapshot before a time after all of them', () => {
    expect(previousSnapshotTime(snapshots, 9999)).toBe(300);
  });
});

describe('formatHistorySpan', () => {
  it('returns null when there is no real range yet', () => {
    expect(formatHistorySpan(null, null)).toBeNull();
    expect(formatHistorySpan(1000, 1000)).toBeNull(); // real min === max, no span
  });

  it('formats a real sub-hour span in minutes', () => {
    expect(formatHistorySpan(0, 45 * 60 * 1000)).toBe('45 minutes captured');
  });

  it('formats a real multi-hour span in hours', () => {
    expect(formatHistorySpan(0, 5 * 60 * 60 * 1000)).toBe('5.0 hours captured');
  });

  it('formats a real multi-day span in days', () => {
    expect(formatHistorySpan(0, 3.2 * 24 * 60 * 60 * 1000)).toBe('3.2 days captured');
  });
});

describe('classifyHistoricalEvents', () => {
  it('applies the same real severity classification live events get', () => {
    const events: NaturalEvent[] = [
      { id: 'eq-1', lat: 0, lng: 0, type: 'earthquake', magnitude: 7, source: 'USGS' },
      { id: 'gdacs-1', lat: 0, lng: 0, type: 'flood', source: 'GDACS', severityOverride: 'catastrophic' }
    ];
    const result = classifyHistoricalEvents(events);
    expect(result[0].severityBucket).toBe('catastrophic'); // magnitude 7 -> catastrophic
    expect(result[1].severityBucket).toBe('catastrophic'); // real GDACS override takes precedence
  });
});

describe('useEcoHistoryPlayback', () => {
  let store: EcoHistoryStore;

  // Real timers throughout this block, not fake ones — fake-indexeddb's own
  // internals depend on real timer scheduling, and every test here does real
  // IndexedDB I/O via ecoHistoryStore.
  beforeEach(async () => {
    store = new EcoHistoryStore();
    await store.clear();
  });

  it('does not load real snapshots while disabled', async () => {
    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: false }));
    expect(result.current.snapshotCount).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('loads real captured snapshots once enabled', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(1));
  });

  it('starts in live mode (scrubTime null, no current events) until the user scrubs', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(1));

    expect(result.current.scrubTime).toBeNull();
    expect(result.current.currentEvents).toEqual([]);
  });

  it('shows the real classified events from the scrubbed-to snapshot', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 5, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(1));

    act(() => {
      result.current.setScrubTime(result.current.minTime!);
    });

    expect(result.current.currentEvents).toHaveLength(1);
    expect(result.current.currentEvents[0].id).toBe('eq-1');
    expect(result.current.currentEvents[0].severityBucket).toBe('major'); // magnitude 5 (4 <= mag < 6)
  });

  it('stop() returns to real live mode', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(1));

    act(() => result.current.setScrubTime(result.current.minTime!));
    expect(result.current.scrubTime).not.toBeNull();

    act(() => result.current.stop());
    expect(result.current.scrubTime).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('exposes real snapshot timestamps and a real captured-span label', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);
    await new Promise((r) => setTimeout(r, 5));
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-2', lat: 2, lng: 2, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(2));

    expect(result.current.snapshotTimes).toHaveLength(2);
    expect(result.current.snapshotTimes[0]).toBe(result.current.minTime);
    expect(result.current.snapshotTimes[1]).toBe(result.current.maxTime);
    expect(result.current.historySpanLabel).toMatch(/captured$/);
  });

  it('stepToPrevious from live jumps directly to the newest real snapshot', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);
    await new Promise((r) => setTimeout(r, 5));
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-2', lat: 2, lng: 2, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(2));
    expect(result.current.scrubTime).toBeNull();

    act(() => result.current.stepToPrevious());
    expect(result.current.scrubTime).toBe(result.current.maxTime);
  });

  it('stepToNext past the newest real snapshot returns to live', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);
    await new Promise((r) => setTimeout(r, 5));
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-2', lat: 2, lng: 2, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(2));

    act(() => result.current.setScrubTime(result.current.maxTime!));
    expect(result.current.scrubTime).not.toBeNull();

    act(() => result.current.stepToNext());
    expect(result.current.scrubTime).toBeNull();
  });

  it('stepToPrevious at the real oldest snapshot stays put (no wrap/underflow)', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(1));

    act(() => result.current.setScrubTime(result.current.minTime!));
    act(() => result.current.stepToPrevious());
    expect(result.current.scrubTime).toBe(result.current.minTime);
  });

  it('steps playback forward through real snapshots and pauses at the real end of captured data', async () => {
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-1', lat: 1, lng: 1, type: 'earthquake', magnitude: 6, source: 'USGS' }]);
    await new Promise((r) => setTimeout(r, 5)); // distinct real timestamps (keyPath)
    await ecoHistoryStore.appendSnapshot([{ id: 'eq-2', lat: 2, lng: 2, type: 'earthquake', magnitude: 6, source: 'USGS' }]);

    const { result } = renderHook(() => useEcoHistoryPlayback({ enabled: true }));
    await waitFor(() => expect(result.current.snapshotCount).toBe(2));

    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(true);

    // PLAYBACK_STEP_MS is 900ms real time per real captured-snapshot step — wait
    // past two real steps (with margin) to observe both the advance and the
    // automatic pause once real captured data runs out.
    await waitFor(() => expect(result.current.currentEvents[0]?.id).toBe('eq-2'), { timeout: 3000 });
    await waitFor(() => expect(result.current.isPlaying).toBe(false), { timeout: 3000 });
  }, 10000);
});
