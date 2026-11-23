/**
 * What the Missions app receives (decision D-MF, step 1). It asked only for packages published in the last
 * 24 hours and kept 50, so a first visit on 2026-10-16 saw 16 of the 85 open packages on The Record. And it
 * added each event it heard, so a package republished during a visit was listed twice. And each view that
 * showed packages started its own read (step 5a).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AcceptedPackage } from '../MissionPackageIngest';

const ingest = vi.hoisted(() => ({
  starts: [] as Array<number | undefined>,
  stops: 0,
  accept: null as null | ((p: AcceptedPackage) => void),
  settle: null as null | (() => void),
}));

vi.mock('../MissionPackageIngest', () => ({
  MissionPackageIngest: vi.fn(function () {
    return {
      onAccepted: (listener: (p: AcceptedPackage) => void) => { ingest.accept = listener; return () => {}; },
      onRefused: () => () => {},
      onSettled: (listener: () => void) => { ingest.settle = listener; return () => {}; },
      stats: () => ({ seen: 0, accepted: 0, refused: 0, refusedBy: {} }),
      seenPublishers: () => [],
      start: (since?: number) => { ingest.starts.push(since); },
      stop: () => { ingest.stops += 1; },
    };
  }),
}));

// The read is shared, so each test loads the module afresh, with nothing received and no read open.
let useReceivedPackages: typeof import('../useReceivedPackages').useReceivedPackages;

const PUBKEY = 'a'.repeat(64);
const pkg = (d: string, createdAt: number, id = `${d}-${createdAt}`): AcceptedPackage => ({
  event: { id, pubkey: PUBKEY, created_at: createdAt, kind: 30079, tags: [['d', d]], content: '{}', sig: '' },
  check: { ok: true } as AcceptedPackage['check'],
  relay: 'wss://record.example',
});

describe('useReceivedPackages', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
    ({ useReceivedPackages } = await import('../useReceivedPackages'));
    ingest.starts.length = 0; ingest.stops = 0; ingest.accept = null; ingest.settle = null;
  });

  it('asks for every package the relays hold, not only the last day', () => {
    renderHook(() => useReceivedPackages());
    expect(ingest.starts).toEqual([undefined]);
  });

  it('reads again when a team relay is joined, keeping what it has (plan 0.3)', async () => {
    const { joinRelay, leaveRelay } = await import('../../nostr/joinedRelays');
    const { result } = renderHook(() => useReceivedPackages());
    act(() => { ingest.accept!(pkg('starcom_mission_package_kept', 1_000)); });
    act(() => { joinRelay({ url: 'wss://crew.example.org', relayPubkey: '9'.repeat(64), team: 'Crew' }); });
    expect(ingest.starts).toHaveLength(2);
    expect(ingest.stops).toBe(1);
    expect(result.current.accepted).toHaveLength(1);
    leaveRelay('wss://crew.example.org');
  });

  it('keeps every package it receives, past fifty', () => {
    const { result } = renderHook(() => useReceivedPackages());
    act(() => { for (let i = 0; i < 85; i++) ingest.accept!(pkg(`starcom_mission_package_m${i}`, 1_000 + i)); });
    expect(result.current.accepted).toHaveLength(85);
  });

  it('holds one package per coordinate, the newest', () => {
    const { result } = renderHook(() => useReceivedPackages());
    act(() => {
      ingest.accept!(pkg('starcom_mission_package_naloxone', 1_000));
      ingest.accept!(pkg('starcom_mission_package_naloxone', 2_000));
      ingest.accept!(pkg('starcom_mission_package_naloxone', 1_500));
    });
    expect(result.current.accepted.map((p) => p.event.created_at)).toEqual([2_000]);
  });

  it('lists the newest first', () => {
    const { result } = renderHook(() => useReceivedPackages());
    act(() => {
      ingest.accept!(pkg('starcom_mission_package_b', 2_000));
      ingest.accept!(pkg('starcom_mission_package_a', 3_000));
      ingest.accept!(pkg('starcom_mission_package_c', 1_000));
    });
    expect(result.current.accepted.map((p) => p.event.tags[0][1])).toEqual([
      'starcom_mission_package_a', 'starcom_mission_package_b', 'starcom_mission_package_c',
    ]);
  });

  it('reads once however many views show packages, and each sees the same', () => {
    const missions = renderHook(() => useReceivedPackages());
    const grants = renderHook(() => useReceivedPackages());
    expect(ingest.starts).toHaveLength(1);
    act(() => { ingest.accept!(pkg('starcom_mission_package_naloxone', 1_000)); });
    expect(missions.result.current.accepted).toHaveLength(1);
    expect(grants.result.current.accepted).toBe(missions.result.current.accepted);
  });

  it('keeps the read open a minute after the last view closes, and what it received', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useReceivedPackages());
    act(() => { ingest.accept!(pkg('starcom_mission_package_naloxone', 1_000)); });
    first.unmount();
    act(() => { vi.advanceTimersByTime(30_000); });
    const again = renderHook(() => useReceivedPackages());
    expect(ingest.starts).toHaveLength(1);
    expect(again.result.current.accepted).toHaveLength(1);
    again.unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(ingest.stops).toBe(1);
    vi.useRealTimers();
  });

  it('reads nothing for a view that is not reading', () => {
    const { result } = renderHook(() => useReceivedPackages(false));
    expect(ingest.starts).toEqual([]);
    expect(result.current.accepted).toEqual([]);
  });

  it('says the read is whole only once every relay has sent everything and it is verified, and again after reading anew', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useReceivedPackages());
    act(() => { ingest.accept!(pkg('starcom_mission_package_naloxone', 1_000)); });
    expect(first.result.current.loaded).toBe(false);
    act(() => { ingest.settle!(); });
    expect(first.result.current.loaded).toBe(true);
    first.unmount();
    act(() => { vi.advanceTimersByTime(61_000); });
    const again = renderHook(() => useReceivedPackages());
    expect(ingest.starts).toHaveLength(2);
    expect(again.result.current.accepted).toHaveLength(1);
    expect(again.result.current.loaded).toBe(false);
    act(() => { ingest.settle!(); });
    expect(again.result.current.loaded).toBe(true);
    vi.useRealTimers();
  });
});
