/**
 * The time bar's History range (D-EQ, EQ15): its axis from 1900, or from 2150 BC, to now; a moment chosen on it
 * selects the decade, year or month round it, which the clock names; and play runs at a month or a year a second.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { resetTimebarRangeForTests } from '../../../../features/globe/timebar/timebarRange';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};
const mount = () => render(<TemporalProvider><TimeScrubber /><Handle /></TemporalProvider>);

describe('TimeScrubber: History', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTimebarRangeForTests();
    temporal = null;
  });

  it('runs the axis from 1900 and offers the span, the unit and its own play rates', () => {
    mount();
    expect(screen.queryByTestId('timebar-history')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('timebar-range-history'));
    expect(screen.getByTestId('timebar-history')).toBeInTheDocument();
    expect(screen.getByText('1900')).toBeInTheDocument();
    expect(screen.getByTestId('timebar-rate-1yr')).toBeInTheDocument();
    expect(screen.queryByTestId('timebar-rate-1h')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('timebar-history-atlas'));
    expect(screen.getByText('2150 BC')).toBeInTheDocument();
  });

  it('selects the year round a moment chosen, and names it on the clock', () => {
    mount();
    fireEvent.click(screen.getByTestId('timebar-range-history'));
    // Half way along 1900 to now is about 1963.
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '500' } });
    const window = temporal!.timeWindow!;
    const year = window.start.getUTCFullYear();
    expect(year).toBeGreaterThan(1955);
    expect(year).toBeLessThan(1970);
    expect(window.start.getTime()).toBe(Date.UTC(year, 0, 1));
    expect(window.end.getTime()).toBe(Date.UTC(year + 1, 0, 1));
    expect(screen.getByTestId('timebar-clock')).toHaveTextContent(String(year));
  });

  it('selects the decade round it once Decade is chosen', () => {
    mount();
    fireEvent.click(screen.getByTestId('timebar-range-history'));
    fireEvent.click(screen.getByTestId('timebar-history-decade'));
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '500' } });
    const start = temporal!.timeWindow!.start.getUTCFullYear();
    expect(start % 10).toBe(0);
    expect(temporal!.timeWindow!.end.getUTCFullYear()).toBe(start + 10);
    act(() => undefined);
    expect(screen.getByTestId('timebar-clock')).toHaveTextContent(`the ${start}s`);
  });
});
