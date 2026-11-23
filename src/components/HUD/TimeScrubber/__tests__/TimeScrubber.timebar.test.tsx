/**
 * The one time bar (critique-2026-11-01, OR4, OR17, OR27; plan C1): range presets kept per browser, the last day
 * opened when dragged from live, and playing the window forward until it reaches now.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

const DAY = 86_400_000;

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { publishEcoHistory } from '../../../../features/globe/timebar/ecoHistoryOnBar';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};
const mount = () => render(<TemporalProvider><TimeScrubber /><Handle /></TemporalProvider>);

describe('the one time bar', () => {
  beforeEach(() => {
    localStorage.clear();
    temporal = null;
  });
  afterEach(() => { vi.useRealTimers(); act(() => publishEcoHistory(null)); });

  // Plan C2: Eco's floating player folded into the bar.
  it("shows Eco Disasters' captured history while it is drawn, with a step to the snapshot before and after", () => {
    mount();
    expect(screen.queryByTestId('timebar-eco')).toBeNull();
    const stepToPrevious = vi.fn();
    const stepToNext = vi.fn();
    act(() => publishEcoHistory({ times: [Date.UTC(2026, 6, 10), Date.UTC(2026, 6, 11)], spanLabel: '1.0 days captured', stepToPrevious, stepToNext }));
    expect(screen.getByTestId('timebar-eco')).toHaveTextContent('1.0 days captured');
    fireEvent.click(screen.getByLabelText('Eco snapshot before'));
    fireEvent.click(screen.getByLabelText('Eco snapshot after'));
    expect(stepToPrevious).toHaveBeenCalledTimes(1);
    expect(stepToNext).toHaveBeenCalledTimes(1);
  });

  it('spans the data by default, a preset up to now when chosen, and keeps the choice in this browser', () => {
    mount();
    expect(screen.getByTestId('timebar-range-all')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('timebar-range-7d'));
    expect(screen.getByTestId('timebar-range-7d')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('starcom:timebar-range')).toBe('7d');
    // Live sits at the axis's end: now is the end of a preset's span.
    expect(screen.getByLabelText('Position')).toHaveValue('1000');
  });

  it('opens the last day up to the moment dragged to from live (OR27)', () => {
    mount();
    fireEvent.click(screen.getByTestId('timebar-range-30d'));
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '500' } });
    const w = temporal!.timeWindow!;
    expect(temporal!.isLive).toBe(false);
    expect(w.end.getTime() - w.start.getTime()).toBe(DAY);
    expect(temporal!.currentTime).toBe(w.end.getTime());
  });

  it('plays the window forward at the rate chosen, and returns to live on reaching now', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 12));
    mount();
    const start = Date.UTC(2026, 10, 1, 0);
    act(() => temporal!.setTimeWindow(start - DAY, start, start));
    fireEvent.click(screen.getByTestId('timebar-rate-1h'));
    fireEvent.click(screen.getByTestId('timebar-play'));
    // Two seconds at an hour a second: the window's end moves two hours on.
    act(() => { vi.advanceTimersByTime(2000); });
    const end = temporal!.timeWindow!.end.getTime();
    expect(Math.abs(end - (start + 2 * 3_600_000))).toBeLessThan(5 * 60_000);
    expect(temporal!.timeWindow!.end.getTime() - temporal!.timeWindow!.start.getTime()).toBe(DAY);
    // Faster: a day a second reaches now within a second, and the bar is live again.
    fireEvent.click(screen.getByTestId('timebar-rate-1d'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(temporal!.isLive).toBe(true);
    expect(screen.getByTestId('timebar-play')).toHaveAttribute('aria-pressed', 'false');
  });
});
