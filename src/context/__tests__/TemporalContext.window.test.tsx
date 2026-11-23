/**
 * What a paused time selects (decision D-E, settled 2026-09-14): the shared state
 * holds a window. A click or pause selects the axis step containing the moment,
 * a drag selects its own two ends, and live mode has no window. It was a fixed
 * ±12 hours around the moment, whatever span was on screen.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TemporalProvider, useTemporalState } from '../TemporalContext';

const DAY = 86_400_000;
const KEY = 'starcom.temporalCursor.v1';
const wrapper = ({ children }: { children: React.ReactNode }) => <TemporalProvider>{children}</TemporalProvider>;
const ends = (w: { start: Date; end: Date } | null) => (w ? [w.start.toISOString(), w.end.toISOString()] : null);

describe('TemporalContext: the selected window', () => {
  beforeEach(() => localStorage.clear());

  it('selects the axis step containing a clicked moment, from the span of the data', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setDataRange(Date.UTC(2026, 6, 9), Date.UTC(2026, 6, 9) + 69 * DAY));
    act(() => result.current.setCurrentTime(Date.UTC(2026, 6, 29, 14)));

    expect(result.current.currentTime).toBe(Date.UTC(2026, 6, 29, 14));
    expect(ends(result.current.timeWindow)).toEqual(['2026-07-27T00:00:00.000Z', '2026-08-03T00:00:00.000Z']);
  });

  it('selects the UTC day before any data has given a span', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setCurrentTime(Date.UTC(2026, 6, 27, 21, 24)));
    expect(ends(result.current.timeWindow)).toEqual(['2026-07-27T00:00:00.000Z', '2026-07-28T00:00:00.000Z']);
  });

  it('keeps a selected window when the data span changes afterwards', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setDataRange(Date.UTC(2026, 6, 9), Date.UTC(2026, 6, 9) + 69 * DAY));
    act(() => result.current.setCurrentTime(Date.UTC(2026, 6, 29, 14)));
    act(() => result.current.setDataRange(Date.UTC(2025, 0, 1), Date.UTC(2027, 0, 1)));

    expect(ends(result.current.timeWindow)).toEqual(['2026-07-27T00:00:00.000Z', '2026-08-03T00:00:00.000Z']);
  });

  // Owner, 1 Nov 2026 (critique-2026-11-01 OR27): pausing shows the last day up to now, whatever the data's span.
  it('shows the last 24 hours up to now when paused', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    const now = Date.now();
    act(() => result.current.setDataRange(now - 30 * DAY, now + 2 * DAY));
    act(() => result.current.setIsLive(false));

    const w = result.current.timeWindow!;
    expect(w.end.getTime()).toBe(result.current.currentTime);
    expect(w.end.getTime() - w.start.getTime()).toBe(DAY);
  });

  it('selects a dragged window by its two ends, in either order, and stops the moment at its end', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setTimeWindow(Date.UTC(2026, 6, 10), Date.UTC(2026, 6, 3)));

    expect(result.current.isLive).toBe(false);
    expect(ends(result.current.timeWindow)).toEqual(['2026-07-03T00:00:00.000Z', '2026-07-10T00:00:00.000Z']);
    expect(result.current.currentTime).toBe(Date.UTC(2026, 6, 10));
  });

  // Tonight's card (raver-nights.md, RN10): tonight's hours shown, read from their start.
  it('reads a window from a moment inside it when one is given, kept to its ends', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setTimeWindow(Date.UTC(2026, 9, 2, 23), Date.UTC(2026, 9, 3, 11), Date.UTC(2026, 9, 2, 23)));
    expect(ends(result.current.timeWindow)).toEqual(['2026-10-02T23:00:00.000Z', '2026-10-03T11:00:00.000Z']);
    expect(result.current.currentTime).toBe(Date.UTC(2026, 9, 2, 23));
    act(() => result.current.setTimeWindow(Date.UTC(2026, 9, 2, 23), Date.UTC(2026, 9, 3, 11), Date.UTC(2026, 9, 4)));
    expect(result.current.currentTime).toBe(Date.UTC(2026, 9, 3, 11));
    act(() => result.current.setTimeWindow(Date.UTC(2026, 9, 2, 23), Date.UTC(2026, 9, 3, 11), Date.UTC(2026, 9, 1)));
    expect(result.current.currentTime).toBe(Date.UTC(2026, 9, 2, 23));
  });

  it('reads a window with no width as a moment', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setTimeWindow(Date.UTC(2026, 6, 27, 21), Date.UTC(2026, 6, 27, 21)));
    expect(ends(result.current.timeWindow)).toEqual(['2026-07-27T00:00:00.000Z', '2026-07-28T00:00:00.000Z']);
  });

  it('has no window while live', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setTimeWindow(Date.UTC(2026, 6, 3), Date.UTC(2026, 6, 10)));
    act(() => result.current.setIsLive(true));
    expect(result.current.timeWindow).toBeNull();
  });

  it('keeps the selected window across a reload', () => {
    const first = renderHook(() => useTemporalState(), { wrapper });
    act(() => first.result.current.setTimeWindow(Date.UTC(2026, 6, 3), Date.UTC(2026, 6, 10)));
    first.unmount();

    const second = renderHook(() => useTemporalState(), { wrapper });
    expect(ends(second.result.current.timeWindow)).toEqual(['2026-07-03T00:00:00.000Z', '2026-07-10T00:00:00.000Z']);
  });

  it('restores a cursor stored before windows existed as the day containing it', () => {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.UTC(2026, 6, 27, 21, 24), savedAt: Date.now() }));
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    expect(ends(result.current.timeWindow)).toEqual(['2026-07-27T00:00:00.000Z', '2026-07-28T00:00:00.000Z']);
  });
});
