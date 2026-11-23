/**
 * While the shared time is paused, eco playback gives the same snapshot and the
 * same events on every render until the time or the snapshots change. It built
 * them afresh each render, and since step 8b a paused shared time sets the time eco
 * shows, so the globe's eco effects, which depend on those events, ran after every
 * render and set state again: React's "Maximum update depth exceeded", hundreds of
 * times, and a globe that stopped answering clicks.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEcoHistoryPlayback } from '../useEcoHistoryPlayback';
import { ecoHistoryStore, type EcoHistorySnapshot } from '../../services/history/EcoHistoryStore';
import { TemporalProvider, useTemporalState } from '../../context/TemporalContext';

const HOUR = 3_600_000;
const t1 = Date.UTC(2026, 8, 12, 8);

const snap = (timestamp: number, id: string): EcoHistorySnapshot => ({
  timestamp,
  eventCount: 1,
  data: [{ id, lat: 0, lng: 0, type: 'earthquake', magnitude: 5, source: 'USGS' }],
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(ecoHistoryStore, 'getSnapshotsSince').mockResolvedValue([snap(t1, 'a')]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderShared = async () => {
  const hook = renderHook(
    () => ({ playback: useEcoHistoryPlayback({ enabled: true }), temporal: useTemporalState() }),
    { wrapper: ({ children }: { children: React.ReactNode }) => <TemporalProvider>{children}</TemporalProvider> },
  );
  await waitFor(() => expect(hook.result.current.playback.snapshotCount).toBe(1));
  return hook;
};

describe('useEcoHistoryPlayback: the same values while nothing changes', () => {
  it('gives the same snapshot and events on every render while paused at a snapshot', async () => {
    const { result, rerender } = await renderShared();
    act(() => result.current.temporal.setCurrentTime(t1 + HOUR));
    const { currentSnapshot, currentEvents } = result.current.playback;
    expect(currentSnapshot).not.toBeNull();

    rerender();
    expect(result.current.playback.currentSnapshot).toBe(currentSnapshot);
    expect(result.current.playback.currentEvents).toBe(currentEvents);
  });

  it('gives the same empty events on every render while paused before the first snapshot', async () => {
    const { result, rerender } = await renderShared();
    act(() => result.current.temporal.setCurrentTime(t1 - HOUR));
    const { currentEvents } = result.current.playback;
    expect(currentEvents).toEqual([]);

    rerender();
    expect(result.current.playback.currentEvents).toBe(currentEvents);
  });
});
