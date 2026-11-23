/**
 * time model: the scrubber reports the one shared cursor.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md) makes
 * TemporalContext the only owner of live mode and position, and shows times in
 * UTC marked Z. The scrubber kept its own isLive and time. Measured in the
 * running app on 2026-09-13: after a click on the timeline the badge said SCRUB
 * while the scrubber still said LIVE, and the same after a reload that restored
 * the cursor.
 *
 * Each contradiction has a pair. `today:` asserts what happens now, which also
 * proves the setup works. `it.fails('D-E: …')` asserts what D-E requires: it
 * passes while the defect exists and fails once it is fixed. Then delete the
 * `today:` test and turn `it.fails` into `it`.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';

const CURSOR_KEY = 'starcom.temporalCursor.v1';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

const mount = () => render(<TemporalProvider><TimeScrubber /><Handle /></TemporalProvider>);
const liveButton = () => screen.getByRole('button', { name: /LIVE|PAUSED/ });
const pauseElsewhere = () => act(() => temporal!.setCurrentTime(Date.parse('2026-07-27T21:24:00Z')));
const storeCursor = () =>
  localStorage.setItem(CURSOR_KEY, JSON.stringify({ at: Date.now() - 3_600_000, savedAt: Date.now() }));

describe('time model: TimeScrubber follows the shared cursor', () => {
  beforeEach(() => {
    localStorage.clear();
    temporal = null;
  });

  it('D-E: says PAUSED when the shared cursor is paused elsewhere', () => {
    mount();
    pauseElsewhere();
    expect(liveButton()).toHaveTextContent('PAUSED');
    expect(screen.getByText('27 Jul 21:24Z')).toBeInTheDocument();
  });

  it('D-E: says PAUSED when a paused cursor is restored on load', () => {
    storeCursor();
    mount();
    expect(liveButton()).toHaveTextContent('PAUSED');
  });

  it('D-E: shows its position in UTC, marked Z', () => {
    mount();
    expect(screen.getByText(/\d{2}:\d{2}(:\d{2})?Z$/)).toBeInTheDocument();
  });

  it('pauses the shared cursor from its button, and resuming makes it live again', () => {
    mount();
    fireEvent.click(liveButton());
    expect(temporal!.isLive).toBe(false);
    expect(liveButton()).toHaveTextContent('PAUSED');

    // Resuming called setCurrentTime after going live, which left live mode again at once.
    fireEvent.click(liveButton());
    expect(temporal!.isLive).toBe(true);
    expect(liveButton()).toHaveTextContent('LIVE');
  });
});
