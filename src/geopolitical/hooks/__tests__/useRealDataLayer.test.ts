import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealDataLayer } from '../useRealDataLayer';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { pollerRegistry } from '../../../services/pollerRegistry';

const flushAsync = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useRealDataLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pollerRegistry.stopAll();
  });

  afterEach(() => {
    pollerRegistry.stopAll();
    visualizationResourceMonitor.clearMode('GeoPolitical.ConflictZones');
    visualizationResourceMonitor.clearMode('GeoPolitical.DiplomaticEvents');
    vi.useRealTimers();
  });

  it('fetches immediately on enable and exposes data/lastUpdated', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a', 'b']);
    const { result } = renderHook(() =>
      useRealDataLayer({ key: 'test-immediate', enabled: true, fetchFn, intervalMs: 60_000, initialValue: [] as string[] })
    );

    await flushAsync();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.lastUpdated).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch at all while disabled', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);
    renderHook(() =>
      useRealDataLayer({ key: 'test-disabled', enabled: false, fetchFn, intervalMs: 60_000, initialValue: [] as string[] })
    );
    await flushAsync();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refetches after intervalMs elapses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['x']);
    renderHook(() =>
      useRealDataLayer({ key: 'test-refetch', enabled: true, fetchFn, intervalMs: 1000, initialValue: [] as string[] })
    );
    await flushAsync();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good data on a failed refetch instead of blanking it', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(['good'])
      .mockRejectedValueOnce(new Error('network blip'));
    const { result } = renderHook(() =>
      useRealDataLayer({ key: 'test-keep-good', enabled: true, fetchFn, intervalMs: 1000, initialValue: [] as string[] })
    );
    await flushAsync();
    expect(result.current.data).toEqual(['good']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.data).toEqual(['good']);
    expect(result.current.error).toBe('network blip');
  });

  it('records into VisualizationResourceMonitor when resourceMode + countRecords are provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a', 'b', 'c']);
    renderHook(() =>
      useRealDataLayer({
        key: 'test-record',
        enabled: true,
        fetchFn,
        intervalMs: 60_000,
        initialValue: [] as string[],
        resourceMode: 'GeoPolitical.DiplomaticEvents',
        countRecords: (data) => data.length
      })
    );
    await flushAsync();

    const snapshot = visualizationResourceMonitor.getSnapshot('GeoPolitical.DiplomaticEvents');
    expect(Array.isArray(snapshot)).toBe(false);
    expect((snapshot as { vectors?: { count: number } }).vectors?.count).toBe(3);
  });

  it('records into pipelineVectors instead of vectors when metricKind is set, so two sources can share one resourceMode', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a', 'b']);
    renderHook(() =>
      useRealDataLayer({
        key: 'test-record-pipeline',
        enabled: true,
        fetchFn,
        intervalMs: 60_000,
        initialValue: [] as string[],
        resourceMode: 'GeoPolitical.ConflictZones',
        countRecords: (data) => data.length,
        metricKind: 'pipelineVectors'
      })
    );
    await flushAsync();

    const snapshot = visualizationResourceMonitor.getSnapshot('GeoPolitical.ConflictZones') as {
      vectors?: { count: number };
      pipelineVectors?: { count: number };
    };
    expect(snapshot.pipelineVectors?.count).toBe(2);
    expect(snapshot.vectors).toBeUndefined();
  });

  it('ignores a resource-budget warning fired for a different mode', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() =>
      useRealDataLayer({
        key: 'test-budget-other-mode',
        enabled: true,
        fetchFn,
        intervalMs: 5000,
        initialValue: [] as string[],
        resourceMode: 'GeoPolitical.ConflictZones',
        countRecords: (data) => data.length,
        budget: { maxVectors: 10 }
      })
    );
    await flushAsync();

    // Trip a budget warning for a DIFFERENT mode entirely.
    visualizationResourceMonitor.setBudgets('GeoPolitical.DiplomaticEvents', { maxVectors: 1 });
    visualizationResourceMonitor.recordVectors('GeoPolitical.DiplomaticEvents', { count: 50 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.pausedByBudget).toBe(false);
    expect(pollerRegistry.isActive('test-budget-other-mode')).toBe(true);
  });

  it('auto-pauses (stops polling) when its own resource budget is exceeded, and ignores warnings for other modes', async () => {
    // intervalMs deliberately exceeds the resource monitor's warning debounce (1.5s
    // default) — a poller ticking faster than the debounce window would perpetually
    // reschedule it (each new recordVectors() call resets the pending timer), so a
    // shorter interval here would never let the warning actually fire.
    const fetchFn = vi.fn().mockResolvedValue(new Array(50).fill('x'));
    const { result } = renderHook(() =>
      useRealDataLayer({
        key: 'test-budget-pause',
        enabled: true,
        fetchFn,
        intervalMs: 5000,
        initialValue: [] as string[],
        resourceMode: 'GeoPolitical.ConflictZones',
        countRecords: (data) => data.length,
        budget: { maxVectors: 10 }
      })
    );

    await flushAsync();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // The warning is debounced (1.5s default) before listeners fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.pausedByBudget).toBe(true);

    const callsBeforeMoreTime = fetchFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    // No further fetches once paused, even though intervalMs has long since elapsed.
    expect(fetchFn.mock.calls.length).toBe(callsBeforeMoreTime);
  });

  it('resumes and clears pausedByBudget when the caller toggles enabled off then on', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Array(50).fill('x'));
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useRealDataLayer({
          key: 'test-budget-resume',
          enabled,
          fetchFn,
          intervalMs: 5000,
          initialValue: [] as string[],
          resourceMode: 'GeoPolitical.ConflictZones',
          countRecords: (data) => data.length,
          budget: { maxVectors: 10 }
        }),
      { initialProps: { enabled: true } }
    );

    await flushAsync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.pausedByBudget).toBe(true);

    // Disabling alone doesn't clear the pause flag — only a transition back to enabled
    // does (see the hook's own effect: `if (enabled) setPausedByBudget(false)`).
    rerender({ enabled: false });
    expect(result.current.pausedByBudget).toBe(true);

    rerender({ enabled: true });
    await flushAsync();
    expect(result.current.pausedByBudget).toBe(false);
  });

  /*
   * One key, one poller, one copy of the data. The registry hands a second subscriber of a key the
   * first one's handle, so each kept its own copy and only the first ever got any: the Geopolitical
   * layers popup read nothing while the globe drew Diplomacy, and closing it stopped the globe's
   * poller, since its cleanup stopped the key.
   */
  describe('more than one subscriber of a key', () => {
    const layer = (key: string, enabled: boolean, fetchFn: () => Promise<string[]>) =>
      useRealDataLayer({ key, enabled, fetchFn, intervalMs: 1000, initialValue: [] as string[] });

    it('gives each the data, fetched once', async () => {
      const fetchFn = vi.fn().mockResolvedValue(['shared']);
      const first = renderHook(() => layer('shared-each', true, fetchFn));
      const second = renderHook(() => layer('shared-each', true, fetchFn));
      await flushAsync();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(first.result.current.data).toEqual(['shared']);
      expect(second.result.current.data).toEqual(['shared']);
      expect(second.result.current.lastUpdated).not.toBeNull();
    });

    it('keeps polling while any of them is left', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(['one']).mockResolvedValue(['two']);
      const first = renderHook(() => layer('shared-left', true, fetchFn));
      const second = renderHook(() => layer('shared-left', true, fetchFn));
      await flushAsync();
      first.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(second.result.current.data).toEqual(['two']);
    });

    it('stops polling when the last one leaves', async () => {
      const fetchFn = vi.fn().mockResolvedValue(['x']);
      const first = renderHook(() => layer('shared-last', true, fetchFn));
      const second = renderHook(() => layer('shared-last', true, fetchFn));
      await flushAsync();
      first.unmount();
      second.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('shows a subscriber that is not enabled nothing of it, as if never fetched', async () => {
      const fetchFn = vi.fn().mockResolvedValue(['shared']);
      renderHook(() => layer('shared-off', true, fetchFn));
      const off = renderHook(() => layer('shared-off', false, fetchFn));
      await flushAsync();
      expect(off.result.current.data).toEqual([]);
      expect(off.result.current.lastUpdated).toBeNull();
    });

    it('shows a subscriber that joins later what was already fetched, without fetching again', async () => {
      const fetchFn = vi.fn().mockResolvedValue(['shared']);
      renderHook(() => layer('shared-late', true, fetchFn));
      await flushAsync();
      const late = renderHook(() => layer('shared-late', true, fetchFn));
      await flushAsync();
      expect(late.result.current.data).toEqual(['shared']);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });
});
