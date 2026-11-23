/**
 * Paused before the first eco snapshot, the globe draws no eco disasters and says
 * so, with the time of the first snapshot (decision D-E, settled 2026-09-14 for
 * step 8). Drawing a later snapshot, or live data, would show disasters that had
 * not happened by then.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import EcoNoSnapshotNote, { showsNoEcoSnapshot } from '../EcoNoSnapshotNote';
import type { UseEcoHistoryPlaybackState } from '../../../hooks/useEcoHistoryPlayback';
import { noEcoSnapshotBy } from '../../../services/epistemic/epistemicLanguage';
import { formatUtcDateTime } from '../../../utils/utcTime';

const HOUR = 3_600_000;
const first = Date.UTC(2026, 8, 12, 8);
const moment = Date.UTC(2026, 6, 27, 10, 37);

const playback = (over: Partial<UseEcoHistoryPlaybackState>): UseEcoHistoryPlaybackState => ({
  loading: false,
  snapshotCount: 2,
  minTime: first,
  maxTime: first + HOUR,
  snapshotTimes: [first, first + HOUR],
  historySpanLabel: '1.0 hours captured',
  scrubTime: null,
  setScrubTime: vi.fn(),
  stepToPrevious: vi.fn(),
  stepToNext: vi.fn(),
  isPlaying: false,
  togglePlay: vi.fn(),
  stop: vi.fn(),
  currentSnapshot: null,
  currentEvents: [],
  refresh: vi.fn(),
  ...over,
});

const note = () => screen.queryByTestId('globe-eco-no-snapshot');

describe('showsNoEcoSnapshot', () => {
  // The globe docks the note only when this is true, so an empty slot never takes room.
  it('is true only while paused, loaded, and with no snapshot at or before the moment', () => {
    expect(showsNoEcoSnapshot(playback({}))).toBe(false);
    expect(showsNoEcoSnapshot(playback({ scrubTime: moment, loading: true }))).toBe(false);
    expect(showsNoEcoSnapshot(playback({ scrubTime: first + 60_000, currentSnapshot: { timestamp: first, eventCount: 0, data: [] } }))).toBe(false);
    expect(showsNoEcoSnapshot(playback({ scrubTime: moment }))).toBe(true);
  });
});

describe('EcoNoSnapshotNote', () => {
  it('says nothing while live', () => {
    render(<EcoNoSnapshotNote playback={playback({})} />);
    expect(note()).toBeNull();
  });

  it('says nothing while a snapshot is shown', () => {
    render(<EcoNoSnapshotNote playback={playback({ scrubTime: first + 60_000, currentSnapshot: { timestamp: first, eventCount: 0, data: [] } })} />);
    expect(note()).toBeNull();
  });

  it('says nothing while the snapshots are still loading', () => {
    render(<EcoNoSnapshotNote playback={playback({ scrubTime: moment, loading: true })} />);
    expect(note()).toBeNull();
  });

  it('says no snapshot was captured by the time shown, and when the first was', () => {
    render(<EcoNoSnapshotNote playback={playback({ scrubTime: moment })} />);

    // With the year: a paused moment can be any year back to the quakes' history (D-EQ, EQ15).
    expect(note()).toHaveTextContent(noEcoSnapshotBy(formatUtcDateTime(moment, { year: true }), formatUtcDateTime(first, { year: true })).text);
    expect(noEcoSnapshotBy('27 Jul 10:37Z', '12 Sep 08:00Z').text).toBe('No eco-disaster snapshot captured by 27 Jul 10:37Z; the first is 12 Sep 08:00Z.');
  });

  it('says none was captured by then, or since, when there is none at all', () => {
    render(<EcoNoSnapshotNote playback={playback({ scrubTime: moment, snapshotCount: 0, minTime: null, maxTime: null, snapshotTimes: [] })} />);

    expect(note()).toHaveTextContent(noEcoSnapshotBy(formatUtcDateTime(moment, { year: true }), null).text);
    expect(noEcoSnapshotBy('27 Jul 10:37Z', null).text).toBe('No eco-disaster snapshot captured by 27 Jul 10:37Z, or since.');
  });

  it("says only the other hazards are missing where the quakes are drawn from their own records (D-EQ)", () => {
    render(<EcoNoSnapshotNote playback={playback({ scrubTime: moment, snapshotCount: 0, minTime: null, maxTime: null, snapshotTimes: [] })} quakesDrawn />);
    expect(note()).toHaveTextContent('No snapshot of the other hazards was captured by');
    expect(noEcoSnapshotBy('1 Jan 1965 00:00Z', null, true).text).toBe('No snapshot of the other hazards was captured by 1 Jan 1965 00:00Z. The quakes come from their own records.');
  });
});
