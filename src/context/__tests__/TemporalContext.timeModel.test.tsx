/**
 * time model: in live mode the shared position is now.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): one
 * owner of live mode and position, kept by one ticking clock. The shared
 * currentTime was set when the provider mounted and never moved while live; the
 * scrubber ticked a private copy instead, so anything reading the shared value in
 * live mode read the moment the app loaded.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TemporalProvider, useClockNow, useTemporalState } from '../TemporalContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <TemporalProvider>{children}</TemporalProvider>;
const FIVE_MINUTES = 5 * 60_000;

describe('time model: the live position follows the clock', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('D-E: moves with the clock while live', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    const mountedAt = result.current.currentTime;

    act(() => {
      vi.advanceTimersByTime(FIVE_MINUTES);
    });

    expect(result.current.currentTime).toBeGreaterThanOrEqual(mountedAt + FIVE_MINUTES - 1000);
  });

  it('pauses at the moment of pausing, not at the moment the app loaded', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    const mountedAt = Date.now();
    act(() => {
      vi.advanceTimersByTime(FIVE_MINUTES);
    });

    act(() => result.current.setIsLive(false));
    expect(result.current.isLive).toBe(false);
    expect(result.current.currentTime).toBeGreaterThanOrEqual(mountedAt + FIVE_MINUTES);
    // Kept like any other paused position, so a reload returns to it.
    expect(JSON.parse(localStorage.getItem('starcom.temporalCursor.v1')!).at).toBe(result.current.currentTime);

    // Paused, it stays where it stopped.
    const pausedAt = result.current.currentTime;
    act(() => {
      vi.advanceTimersByTime(FIVE_MINUTES);
    });
    expect(result.current.currentTime).toBe(pausedAt);
  });
});

describe('time model: one clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks each second for every surface that shows it, from a single timer', () => {
    const first = renderHook(() => useClockNow());
    const second = renderHook(() => useClockNow());
    const startedAt = first.result.current;
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(first.result.current).toBe(startedAt + 3000);
    expect(second.result.current).toBe(first.result.current);

    first.unmount();
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
