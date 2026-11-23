import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { TemporalProvider, useTemporalState } from '../TemporalContext';

/**
 * The scrubbed cursor survives a reload.
 *
 * Losing it silently returns the operator to "now" while they are still
 * reading a moment in the past — the surface changes meaning without saying
 * so. Live mode is not restored, because live is the correct default for a
 * fresh session and restoring it would be restoring nothing.
 */

const KEY = 'starcom.temporalCursor.v1';
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TemporalProvider>{children}</TemporalProvider>
);

describe('temporal cursor persistence', () => {
  beforeEach(() => localStorage.clear());

  it('starts live when nothing is stored', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    expect(result.current.isLive).toBe(true);
  });

  it('records a scrubbed position and leaves live mode', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    const target = Date.parse('2026-08-19T12:00:00Z');

    act(() => result.current.setCurrentTime(target));

    expect(result.current.isLive).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).at).toBe(target);
  });

  it('restores the scrubbed position on remount — the actual requirement', () => {
    const target = Date.parse('2026-08-19T12:00:00Z');
    localStorage.setItem(KEY, JSON.stringify({ at: target, savedAt: Date.now() }));

    const { result } = renderHook(() => useTemporalState(), { wrapper });

    expect(result.current.currentTime).toBe(target);
    expect(result.current.isLive).toBe(false);
  });

  it('discards a cursor older than a day rather than resuming in the archive', () => {
    // A cursor restored from last week is not where you left off.
    localStorage.setItem(KEY, JSON.stringify({
      at: Date.parse('2026-08-01T00:00:00Z'),
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    }));

    const { result } = renderHook(() => useTemporalState(), { wrapper });
    expect(result.current.isLive).toBe(true);
  });

  it('clears the stored position when the operator returns to live', () => {
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    act(() => result.current.setCurrentTime(Date.parse('2026-08-19T12:00:00Z')));
    expect(localStorage.getItem(KEY)).not.toBeNull();

    act(() => result.current.setIsLive(true));

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current.isLive).toBe(true);
  });

  it('ignores malformed stored state instead of throwing', () => {
    localStorage.setItem(KEY, 'not json');
    const { result } = renderHook(() => useTemporalState(), { wrapper });
    expect(result.current.isLive).toBe(true);
  });
});
