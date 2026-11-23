/**
 * Intel Reports' feed line (decision D-LS, LS6): the relays the reports are read from, how many have answered
 * (sent an event or the end of what they hold); as progress, how many have sent all they hold; in once every
 * relay has (plan H3) or the read's wait ran out; failed only when none answered. Its time is the latest answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { NostrRelayState } from '../../../../services/intel/NostrStarcomIntelIngest';

const ingest = vi.hoisted(() => ({
  active: true,
  relays: [] as NostrRelayState[],
  listeners: new Set<() => void>(),
}));
vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    isActive: () => ingest.active,
    getRelayStatus: () => ingest.relays,
    onChange: (fn: () => void) => { ingest.listeners.add(fn); return () => ingest.listeners.delete(fn); },
  },
}));

import { useIntelReportsFeed, INTEL_READ_WAIT_MS } from '../useIntelReportsFeed';

const T0 = Date.parse('2026-10-17T06:00:00Z');
const relay = (url: string, answeredAt?: number, storedRead?: 'reading' | 'ended'): NostrRelayState => ({
  url, connected: answeredAt !== undefined, ...(answeredAt ? { lastAnsweredAt: answeredAt } : {}), ...(storedRead ? { storedRead } : {}),
});
const changed = () => act(() => { ingest.listeners.forEach((fn) => fn()); });

describe('useIntelReportsFeed', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); ingest.active = true; ingest.listeners.clear(); });
  afterEach(() => vi.useRealTimers());

  it('counts the relays that have sent all they hold as its progress while it reads, and names how many answered', () => {
    ingest.relays = [relay('wss://a', T0 + 1000, 'ended'), relay('wss://b', T0 + 2000, 'reading'), relay('wss://c')];
    const { result } = renderHook(() => useIntelReportsFeed(true));
    expect(result.current).toMatchObject({
      layer: 'IntelReports', shortName: 'Intel Reports', loading: true, progress: { done: 1, total: 3 },
      name: 'Intel Reports from the relays (2 of 3 answered)', lastUpdated: new Date(T0 + 2000).toISOString(),
    });
  });

  /*
   * Mecha Jono's videos, 24 Oct: the planet turned while the reports came in. The line was in at each relay's
   * first note, so whenReady let the camera move with most of the read still to come.
   */
  it("is not in at each relay's first note, while the relays are still sending what they hold (H3)", () => {
    ingest.relays = [relay('wss://a', T0 + 1000, 'reading'), relay('wss://b', T0 + 1200, 'reading')];
    const { result } = renderHook(() => useIntelReportsFeed(true));
    expect(result.current).toMatchObject({ loading: true, progress: { done: 0, total: 2 }, name: 'Intel Reports from the relays (2 of 2 answered)' });
  });

  it('is in once every relay has sent all it holds', () => {
    ingest.relays = [relay('wss://a', T0 + 1000, 'ended'), relay('wss://b', T0 + 1500, 'reading')];
    const { result } = renderHook(() => useIntelReportsFeed(true));
    expect(result.current).toMatchObject({ loading: true });
    ingest.relays = [relay('wss://a', T0 + 1000, 'ended'), relay('wss://b', T0 + 4000, 'ended')];
    changed();
    expect(result.current).toMatchObject({ loading: false, error: null, name: 'Intel Reports from the relays (2 of 2 answered)', lastUpdated: new Date(T0 + 4000).toISOString() });
  });

  it('stops waiting when the read\'s wait runs out, saying how many answered', () => {
    ingest.relays = [relay('wss://a', T0 + 1000, 'ended'), relay('wss://b')];
    const { result } = renderHook(() => useIntelReportsFeed(true));
    act(() => { vi.advanceTimersByTime(INTEL_READ_WAIT_MS + 1000); });
    expect(result.current).toMatchObject({ loading: false, error: null, name: 'Intel Reports from the relays (1 of 2 answered)' });
  });

  it('fails when no relay answered in the wait', () => {
    ingest.relays = [relay('wss://a'), relay('wss://b')];
    const { result } = renderHook(() => useIntelReportsFeed(true));
    act(() => { vi.advanceTimersByTime(INTEL_READ_WAIT_MS + 1000); });
    expect(result.current).toMatchObject({ loading: false, error: 'no relay answered in 30 s', lastUpdated: null });
  });

  it('is nothing while the layer is off, or before the read has begun', () => {
    ingest.relays = [relay('wss://a')];
    expect(renderHook(() => useIntelReportsFeed(false)).result.current).toBeNull();
    ingest.active = false;
    const { result } = renderHook(() => useIntelReportsFeed(true));
    expect(result.current).toMatchObject({ loading: true, progress: { done: 0, total: 1 } });
  });
});
