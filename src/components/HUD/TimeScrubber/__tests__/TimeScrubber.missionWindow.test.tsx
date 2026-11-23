/**
 * A psi mission's window on the time bar (decision D-PW, PW92): while one is open, its window shaded from start to
 * end, its peak marked, the axis reaching it; gone when it closes.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider } from '../../../../context/TemporalContext';
import { clearMissionWindow, markMissionWindow, resetMissionWindowMarkForTests } from '../../../../features/psi/missionWindowMark';

afterEach(() => { resetMissionWindowMarkForTests(); localStorage.clear(); });

describe('TimeScrubber: an open psi mission\'s window', () => {
  it('shades it, its peak marked, the axis reaching it past the data; and goes when it closes', () => {
    render(<TemporalProvider><TimeScrubber /></TemporalProvider>);
    expect(screen.queryByTestId('scrubber-mission-window')).toBeNull();
    act(() => markMissionWindow('card', { key: 'k', title: 'Focus', fromMs: Date.UTC(2026, 9, 1), peakMs: Date.UTC(2026, 9, 2), untilMs: Date.UTC(2026, 9, 3) }));
    const band = screen.getByTestId('scrubber-mission-window');
    // Past the data's end, so the axis ends where the window does.
    expect(parseFloat(band.style.left) + parseFloat(band.style.width)).toBeCloseTo(100, 5);
    expect(band).toHaveAttribute('aria-label', 'Psi mission window: Focus, 1 Oct 00:00Z to 3 Oct 00:00Z, peak 2 Oct 00:00Z');
    act(() => clearMissionWindow('card'));
    expect(screen.queryByTestId('scrubber-mission-window')).toBeNull();
  });
});
