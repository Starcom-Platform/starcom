/**
 * Eco playback follows the shared time (decision D-E, settled 2026-09-14 for step
 * 8). It kept its own scrubber time and its own LIVE, so the globe could replay one
 * moment of eco disasters while its reports and its badge showed another.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEcoHistoryPlayback } from '../useEcoHistoryPlayback';
import { ecoHistoryStore, type EcoHistorySnapshot } from '../../services/history/EcoHistoryStore';
import { TemporalProvider, useTemporalState } from '../../context/TemporalContext';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Three snapshots on one UTC day, so the step a moment selects holds all three.
const t1 = Date.UTC(2026, 8, 12, 8);
const t2 = t1 + 2 * HOUR;
const t3 = t1 + 4 * HOUR;

const snap = (timestamp: number, id: string): EcoHistorySnapshot => ({
  timestamp,
  eventCount: 1,
  data: [{ id, lat: 0, lng: 0, type: 'earthquake', magnitude: 5, source: 'USGS' }],
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(ecoHistoryStore, 'getSnapshotsSince').mockResolvedValue([snap(t1, 'a'), snap(t2, 'b'), snap(t3, 'c')]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const renderShared = async () => {
  const { result } = renderHook(
    () => ({ playback: useEcoHistoryPlayback({ enabled: true }), temporal: useTemporalState() }),
    { wrapper: ({ children }: { children: React.ReactNode }) => <TemporalProvider>{children}</TemporalProvider> },
  );
  await waitFor(() => expect(result.current.playback.snapshotCount).toBe(3));
  return result;
};

describe('useEcoHistoryPlayback: the shared time', () => {
  it('shows no snapshot while the shared time is live', async () => {
    const r = await renderShared();
    expect(r.current.playback.scrubTime).toBeNull();
    expect(r.current.playback.currentSnapshot).toBeNull();
  });

  it('shows the last snapshot captured at or before the moment the shared time is paused at', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setCurrentTime(t2 + MINUTE));

    expect(r.current.playback.scrubTime).toBe(t2 + MINUTE);
    expect(r.current.playback.currentSnapshot?.timestamp).toBe(t2);
  });

  it('reads the paused moment, not the end of the window around it', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setCurrentTime(t1 + MINUTE));

    // The window is the day around the moment, and holds a later snapshot.
    expect(r.current.temporal.timeWindow!.end.getTime()).toBeGreaterThan(t3);
    expect(r.current.playback.currentSnapshot?.timestamp).toBe(t1);
  });

  it('reads the end of a dragged window, where its moment stops', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setTimeWindow(t1 - HOUR, t2 + MINUTE));
    expect(r.current.playback.currentSnapshot?.timestamp).toBe(t2);
  });

  it('moves the shared time when eco is scrubbed', async () => {
    const r = await renderShared();
    act(() => r.current.playback.setScrubTime(t3));

    expect(r.current.temporal.isLive).toBe(false);
    expect(r.current.temporal.currentTime).toBe(t3);
  });

  it('steps the shared time between snapshots, and returns it to live past the newest', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setCurrentTime(t1));

    act(() => r.current.playback.stepToNext());
    expect(r.current.temporal.currentTime).toBe(t2);
    act(() => r.current.playback.stepToPrevious());
    expect(r.current.temporal.currentTime).toBe(t1);

    act(() => r.current.temporal.setCurrentTime(t3));
    act(() => r.current.playback.stepToNext());
    expect(r.current.temporal.isLive).toBe(true);
  });

  it('steps back from live to the newest snapshot', async () => {
    const r = await renderShared();
    act(() => r.current.playback.stepToPrevious());

    expect(r.current.temporal.isLive).toBe(false);
    expect(r.current.temporal.currentTime).toBe(t3);
  });

  it('makes its LIVE the shared LIVE', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setCurrentTime(t2));
    act(() => r.current.playback.stop());

    expect(r.current.temporal.isLive).toBe(true);
    expect(r.current.playback.scrubTime).toBeNull();
  });

  it('plays by stepping the shared time through the snapshots, and stops at the last', async () => {
    const r = await renderShared();
    vi.useFakeTimers();
    act(() => r.current.temporal.setCurrentTime(t1));
    act(() => r.current.playback.togglePlay());

    act(() => { vi.advanceTimersByTime(900); });
    expect(r.current.temporal.currentTime).toBe(t2);
    act(() => { vi.advanceTimersByTime(900); });
    expect(r.current.temporal.currentTime).toBe(t3);
    act(() => { vi.advanceTimersByTime(900); });
    expect(r.current.playback.isPlaying).toBe(false);
    expect(r.current.temporal.currentTime).toBe(t3);
  });

  it('shows nothing when paused before the first snapshot, and steps forward to it', async () => {
    const r = await renderShared();
    act(() => r.current.temporal.setCurrentTime(t1 - DAY));

    expect(r.current.playback.scrubTime).toBe(t1 - DAY);
    expect(r.current.playback.currentSnapshot).toBeNull();
    expect(r.current.playback.currentEvents).toEqual([]);

    act(() => r.current.playback.stepToNext());
    expect(r.current.temporal.currentTime).toBe(t1);
  });
});
