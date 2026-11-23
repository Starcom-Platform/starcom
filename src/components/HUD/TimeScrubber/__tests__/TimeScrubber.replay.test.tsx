/**
 * Play as the quakes' replay (D-EQ, EQ7, EQ17): the bar steps the play clock the quakes draw from as it moves the
 * window, and stops it with play; while quakes are drawn, a Decay control beside the rates, kept in this browser.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

const DAY = 86_400_000;
const HOUR = 3_600_000;

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));
let layers: Array<{ id: string; label: string; isActive: boolean; isPrimary: boolean }> = [];
vi.mock('../../../Globe/Hooks/useGlobeLayerControl', () => ({ useGlobeLayerControlOptional: () => ({ layers }) }));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { playClock, replayDecayS, resetPlayClockForTests } from '../../../../features/globe/timebar/playClock';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};
const mount = () => render(<TemporalProvider><TimeScrubber /><Handle /></TemporalProvider>);

describe('the time bar as the quakes\' replay', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPlayClockForTests();
    temporal = null;
    layers = [{ id: 'EcologicalDisasters', label: 'Eco Disasters', isActive: true, isPrimary: true }];
  });
  afterEach(() => { vi.useRealTimers(); });

  it('offers the decay while quakes are drawn, 4 s until chosen, and keeps the choice', () => {
    mount();
    expect(screen.getByTestId('timebar-decay-4')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('timebar-decay-10'));
    expect(screen.getByTestId('timebar-decay-10')).toHaveAttribute('aria-pressed', 'true');
    expect(replayDecayS()).toBe(10);
    expect(localStorage.getItem('starcom:quake-decay')).toBe('10');
  });

  it('offers no decay while no quakes are drawn', () => {
    layers = [{ id: 'EcologicalDisasters', label: 'Eco Disasters', isActive: false, isPrimary: false }];
    mount();
    expect(screen.queryByTestId('timebar-decay')).toBeNull();
  });

  it('steps the play clock with the window, from where play began, and stops it with play', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 12));
    mount();
    const start = Date.UTC(2026, 10, 1, 0);
    act(() => temporal!.setTimeWindow(start - DAY, start, start));
    fireEvent.click(screen.getByTestId('timebar-rate-1h'));
    fireEvent.click(screen.getByTestId('timebar-play'));
    expect(playClock()).toMatchObject({ startMs: start, atMs: start, msPerSecond: HOUR });
    act(() => { vi.advanceTimersByTime(2000); });
    const clock = playClock()!;
    expect(clock.startMs).toBe(start);
    expect(clock.atMs).toBe(temporal!.timeWindow!.end.getTime());
    expect(Math.abs(clock.atMs - (start + 2 * HOUR))).toBeLessThan(5 * 60_000);
    fireEvent.click(screen.getByTestId('timebar-play'));
    expect(playClock()).toBeNull();
  });

  it('pauses for a page held up rather than jumping on: a stall counts as two steps at most', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 1, 12));
    mount();
    const start = Date.UTC(2026, 10, 1, 0);
    act(() => temporal!.setTimeWindow(start - DAY, start, start));
    fireEvent.click(screen.getByTestId('timebar-rate-1h'));
    fireEvent.click(screen.getByTestId('timebar-play'));
    // Ten seconds pass with no step (a held-up page), then one step fires.
    act(() => { vi.setSystemTime(Date.now() + 10_000); vi.advanceTimersToNextTimer(); });
    const moved = temporal!.timeWindow!.end.getTime() - start;
    expect(moved).toBeLessThanOrEqual(HOUR);
    expect(moved).toBeGreaterThan(0);
    expect(temporal!.isLive).toBe(false);
  });
});
