/**
 * The scrubber shows the selected window with two handles while paused, and a
 * single position handle while live (decision D-E, settled 2026-09-14).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

const DAY = 86_400_000;
const first = Date.UTC(2026, 6, 1);
const last = Date.UTC(2026, 7, 31);

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

const mount = () => render(<TemporalProvider><TimeScrubber /><Handle /></TemporalProvider>);

// The scrubber's range: the events plus a tenth of their span each side (timelineSpan).
const pad = (last - first) * 0.1;
const rangeStart = first - pad;
const rangeSpan = last - first + 2 * pad;

describe('TimeScrubber: the selected window', () => {
  beforeEach(() => {
    localStorage.clear();
    temporal = null;
  });

  it('shows one position handle while live', () => {
    mount();
    expect(screen.getByLabelText('Position')).toBeInTheDocument();
    expect(screen.queryByLabelText('Window start')).not.toBeInTheDocument();
  });

  it('shows the selected window with two handles and a band while paused', () => {
    mount();
    act(() => temporal!.setTimeWindow(rangeStart + 0.25 * rangeSpan, rangeStart + 0.5 * rangeSpan));

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Window start')).toHaveValue('250');
    expect(screen.getByLabelText('Window end')).toHaveValue('500');
    expect(screen.getByTestId('scrubber-window-band')).toHaveStyle({ left: '25%', width: '25%' });
  });

  it('selects a new window when a handle is pulled', () => {
    mount();
    act(() => temporal!.setTimeWindow(rangeStart + 0.25 * rangeSpan, rangeStart + 0.5 * rangeSpan));

    fireEvent.change(screen.getByLabelText('Window end'), { target: { value: '800' } });

    const w = temporal!.timeWindow!;
    expect(Math.abs(w.start.getTime() - (rangeStart + 0.25 * rangeSpan))).toBeLessThan(DAY / 100);
    expect(Math.abs(w.end.getTime() - (rangeStart + 0.8 * rangeSpan))).toBeLessThan(DAY / 100);
  });

  it('does not let a handle pass the other and collapse the window', () => {
    mount();
    act(() => temporal!.setTimeWindow(rangeStart + 0.25 * rangeSpan, rangeStart + 0.5 * rangeSpan));

    fireEvent.change(screen.getByLabelText('Window start'), { target: { value: '900' } });

    const w = temporal!.timeWindow!;
    expect(w.start.getTime()).toBeLessThan(w.end.getTime());
    expect(Math.abs(w.end.getTime() - (rangeStart + 0.5 * rangeSpan))).toBeLessThan(DAY / 100);
  });
});
