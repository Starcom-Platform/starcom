/**
 * NavCom's labels on the packages shown, held while shown (D-MX, MX1, MX5):
 * public claims by package, nothing said before a relay answers, a lapsed
 * claim dropped as it lapses, and nothing asked when nothing is shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MissionLabel } from '../missionLabels';

const fake = vi.hoisted(() => ({
  started: [] as string[][],
  stopped: 0,
  emit: null as null | ((label: MissionLabel) => void),
  answer: null as null | (() => void),
}));

vi.mock('../MissionLabelIngest', () => ({
  MissionLabelIngest: class {
    subscribe(listener: (label: MissionLabel) => void) { fake.emit = listener; return () => { fake.emit = null; }; }
    onAnswered(listener: () => void) { fake.answer = listener; return () => { fake.answer = null; }; }
    start(coordinates: string[]) { fake.started.push(coordinates); }
    stop() { fake.stopped += 1; }
  },
}));

import { useMissionLabels } from '../useMissionLabels';

const PKG = '30079:' + '6'.repeat(64) + ':starcom_mission_package_field-heat_relief';
const NOW = Math.floor(Date.UTC(2026, 9, 6, 12) / 1000);
const claim = (o: Partial<MissionLabel> = {}): MissionLabel => ({
  id: 'c1', pubkey: 'a'.repeat(64), value: 'claimed', coordinates: [PKG], createdAt: NOW - 60, ...o,
});

beforeEach(() => {
  fake.started = []; fake.stopped = 0; fake.emit = null; fake.answer = null;
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW * 1000);
});
afterEach(() => { vi.useRealTimers(); });

describe('useMissionLabels', () => {
  it('asks again when a team relay is joined: a relay that requires sign-in refused the first ask (plan 0.3)', async () => {
    const { joinRelay, leaveRelay } = await import('../../nostr/joinedRelays');
    renderHook(() => useMissionLabels([PKG]));
    act(() => { joinRelay({ url: 'wss://crew.example.org', relayPubkey: '9'.repeat(64), team: 'Crew' }); });
    expect(fake.started).toEqual([[PKG], [PKG]]);
    expect(fake.stopped).toBe(1);
    leaveRelay('wss://crew.example.org');
  });

  it('asks once for the packages shown, however the list is ordered, and nothing when none are', () => {
    const { rerender } = renderHook(({ c }) => useMissionLabels(c), { initialProps: { c: [PKG, 'b', 'b'] } });
    rerender({ c: ['b', PKG] });
    expect(fake.started).toEqual([['b', PKG].sort()]);
    renderHook(() => useMissionLabels(['', '  ']));
    expect(fake.started).toHaveLength(1);
  });

  it('holds public claims by package, and says when a relay has answered', () => {
    const { result } = renderHook(() => useMissionLabels([PKG]));
    expect(result.current.answered).toBe(false);
    act(() => { fake.emit?.(claim()); fake.emit?.(claim()); fake.answer?.(); });
    expect(result.current.claims(PKG)).toEqual([{ pubkey: 'a'.repeat(64), at: NOW - 60 }]);
    expect(result.current.answered).toBe(true);
  });

  it('drops a claim as it lapses, and stops reading when no longer shown', () => {
    const { result, unmount } = renderHook(() => useMissionLabels([PKG]));
    act(() => { fake.emit?.(claim({ expiresAt: NOW + 30 })); });
    expect(result.current.claims(PKG)).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.claims(PKG)).toEqual([]);
    unmount();
    expect(fake.stopped).toBe(1);
  });
});
