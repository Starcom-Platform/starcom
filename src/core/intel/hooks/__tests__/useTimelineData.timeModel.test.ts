/**
 * time model: every view shows the same events, and hears about new ones.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md) calls for
 * one event source that every view shares. Each view loaded once and never
 * listened. Measured in the running app on 2026-09-13: on a first visit the
 * scrubber said "0 events" for the whole session while the timeline panel, opened
 * later, said 31. The adapter offered subscribeToUpdates; the hook did not use it.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

const adapter = vi.hoisted(() => ({
  getTimelineData: vi.fn(),
  getTimelineStats: vi.fn(),
  subscribeToUpdates: vi.fn(),
}));

vi.mock('../../adapters/timelineAdapter', () => ({
  timelineAdapter: {
    getTimelineData: (...args: unknown[]) => adapter.getTimelineData(...args),
    getTimelineStats: (...args: unknown[]) => adapter.getTimelineStats(...args),
    subscribeToUpdates: (...args: unknown[]) => adapter.subscribeToUpdates(...args),
    addEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  },
}));

import { useTimelineData } from '../useTimelineData';

const item = (id: string, at: number) => ({ id, title: id, type: 'intel', importance: 50, startTime: new Date(at) });
const data = (...items: ReturnType<typeof item>[]) => ({ items, groups: [] });
const noStats = { totalEvents: 0, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } };
const latestNotify = () => adapter.subscribeToUpdates.mock.calls.at(-1)![0] as () => void;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('time model: useTimelineData stays current', () => {
  beforeEach(() => {
    adapter.getTimelineData.mockReset().mockResolvedValue({ items: [], groups: [] });
    adapter.getTimelineStats.mockReset().mockResolvedValue(noStats);
    adapter.subscribeToUpdates.mockReset().mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it('D-E: reloads when the adapter reports a new event', async () => {
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(adapter.subscribeToUpdates).toHaveBeenCalled();
    const notify = adapter.subscribeToUpdates.mock.calls[0][0] as (update: { type: string; id?: string }) => void;
    act(() => notify({ type: 'add', id: 'new-event' }));
    await waitFor(() => expect(adapter.getTimelineData).toHaveBeenCalledTimes(2));
  });

  it('D-E: every mounted view shares one read', async () => {
    adapter.getTimelineData.mockResolvedValue(data(item('a', 1), item('b', 2)));
    const scrubber = renderHook(() => useTimelineData());
    const timeline = renderHook(() => useTimelineData());
    await waitFor(() => expect(timeline.result.current.loading).toBe(false));

    expect(adapter.getTimelineData).toHaveBeenCalledTimes(1);
    expect(scrubber.result.current.timelineData).toBe(timeline.result.current.timelineData);
  });

  it('D-E: a view opened later shows the events already read, without reading again', async () => {
    adapter.getTimelineData.mockResolvedValue(data(item('a', 1)));
    const scrubber = renderHook(() => useTimelineData());
    await waitFor(() => expect(scrubber.result.current.loading).toBe(false));

    const timeline = renderHook(() => useTimelineData());
    expect(timeline.result.current.loading).toBe(false);
    expect(timeline.result.current.timelineData.items).toHaveLength(1);
    expect(adapter.getTimelineData).toHaveBeenCalledTimes(1);
  });

  it('counts from the same read as the list it draws', async () => {
    adapter.getTimelineData.mockResolvedValue(data(item('a', 1), item('b', 2)));
    adapter.getTimelineStats.mockResolvedValue({ ...noStats, totalEvents: 99 });
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats.totalEvents).toBe(2);
    expect(result.current.stats.eventsByType).toEqual({ intel: 2 });
  });

  it('reads a burst of changes once, not once per change', async () => {
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Seeding the sample data writes dozens of items one after another.
    act(() => {
      for (let i = 0; i < 30; i++) latestNotify()();
    });
    await waitFor(() => expect(adapter.getTimelineData).toHaveBeenCalledTimes(2));
    await pause(300);
    expect(adapter.getTimelineData).toHaveBeenCalledTimes(2);
  });

  it('reads again after a change that lands during a read, and resolves after that read', async () => {
    let finishFirst!: (value: unknown) => void;
    adapter.getTimelineData
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue(data(item('after-change', 2)));
    const { result } = renderHook(() => useTimelineData());

    let refreshed = false;
    act(() => {
      void result.current.refreshData().then(() => { refreshed = true; });
    });
    await act(async () => {
      finishFirst(data(item('before-change', 1)));
    });

    await waitFor(() => expect(refreshed).toBe(true));
    expect(result.current.timelineData.items.map((i) => i.id)).toEqual(['after-change']);
  });

  it('drops a read that finishes after its views have gone', async () => {
    let finishStale!: (value: unknown) => void;
    adapter.getTimelineData.mockReturnValueOnce(new Promise((resolve) => { finishStale = resolve; }));
    const first = renderHook(() => useTimelineData());
    first.unmount();

    adapter.getTimelineData.mockResolvedValue(data(item('current', 2)));
    const second = renderHook(() => useTimelineData());
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    await act(async () => {
      finishStale(data(item('stale', 1)));
    });
    expect(second.result.current.timelineData.items.map((i) => i.id)).toEqual(['current']);
  });

  it('starts over for a view mounted after every other has gone, rather than showing the old read as current', async () => {
    // The timeline stamps "AS OF" when a read finishes; an old read shown as finished
    // would carry a new stamp.
    adapter.getTimelineData.mockResolvedValue(data(item('old', 1)));
    const first = renderHook(() => useTimelineData());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    adapter.getTimelineData.mockReturnValue(new Promise(() => {}));
    const second = renderHook(() => useTimelineData());
    expect(second.result.current.loading).toBe(true);
    expect(second.result.current.timelineData.items).toHaveLength(0);
  });

  it('stops listening when the last view unmounts', async () => {
    const stop = vi.fn();
    adapter.subscribeToUpdates.mockImplementation(() => stop);
    const scrubber = renderHook(() => useTimelineData());
    const timeline = renderHook(() => useTimelineData());
    await waitFor(() => expect(timeline.result.current.loading).toBe(false));

    timeline.unmount();
    expect(stop).not.toHaveBeenCalled();
    scrubber.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(adapter.subscribeToUpdates).toHaveBeenCalledTimes(1);
  });
});
