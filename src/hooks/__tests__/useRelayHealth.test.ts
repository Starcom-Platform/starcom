/**
 * What the Globe's relay lights read (BD11): the ingest's relays, again whenever
 * the ingest says something changed, and the time again every ten seconds, so a
 * light greys by itself when nothing new arrives.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ingest = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    relays: [{ url: 'wss://a', connected: true }] as Array<{ url: string; connected: boolean }>,
    listeners,
    getRelayStatus() { return ingest.relays; },
    onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  };
});
vi.mock('../../services/intel/NostrStarcomIntelIngest', () => ({ nostrStarcomIntelIngest: ingest }));

import { useRelayHealth, RELAY_HEALTH_TICK_MS } from '../useRelayHealth';

afterEach(() => vi.useRealTimers());

describe('useRelayHealth', () => {
  it("reads the ingest's relays, and again when it says they changed", () => {
    const { result } = renderHook(() => useRelayHealth());
    expect(result.current.relays.map((r) => r.url)).toEqual(['wss://a']);
    ingest.relays = [{ url: 'wss://a', connected: true }, { url: 'wss://b', connected: false }];
    act(() => ingest.listeners.forEach((fn) => fn()));
    expect(result.current.relays.map((r) => r.url)).toEqual(['wss://a', 'wss://b']);
  });

  it('moves its clock on every ten seconds, and stops listening when it goes', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useRelayHealth());
    const first = result.current.now;
    expect(RELAY_HEALTH_TICK_MS).toBe(10_000);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.now).toBeGreaterThan(first);
    unmount();
    expect(ingest.listeners.size).toBe(0);
  });
});
