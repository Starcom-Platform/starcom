/**
 * The timeline reaching ahead (space-weather-visualization.md, SW19): while a layer that forecasts is
 * shown, the scrubber's axis runs on to its last moment, the part past now marked as forecast, and a
 * moment there can be chosen. The intel's own range, which the timeline's steps are taken from (D-E),
 * stays the intel's.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

const first = Date.UTC(2026, 6, 1);
const last = Date.UTC(2026, 7, 31);
const NOW = Date.UTC(2026, 8, 10, 12);
const UNTIL = Date.UTC(2026, 8, 14, 18);

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(first) }, { startTime: new Date(last) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { publishForecastReach, resetForecastReachForTest } from '../../../../services/globe/forecastReach';
import { formatUtcDate, formatUtcDateTime } from '../../../../utils/utcTime';

// The events plus a tenth of their span each side (timelineSpan).
const pad = (last - first) * 0.1;
const rangeStart = first - pad;
const dataEnd = last + pad;

let seen: ReturnType<typeof useTemporalState> | null = null;
const Reader = () => { seen = useTemporalState(); return null; };
const mount = () => render(<TemporalProvider><TimeScrubber /><Reader /></TemporalProvider>);
const labels = () => screen.getAllByText(/^\d{1,2} [A-Z][a-z]{2}/).map((e) => e.textContent);

beforeEach(() => { vi.useFakeTimers({ now: NOW, toFake: ['Date'] }); });
afterEach(() => { act(() => resetForecastReachForTest()); vi.useRealTimers(); localStorage.clear(); seen = null; });

describe('TimeScrubber: the forecast ahead', () => {
  it('runs on to the forecast\'s last moment, the part past now marked, while one is shown', () => {
    mount();
    act(() => publishForecastReach('enlil', { until: UNTIL, by: 'ENLIL' }));
    expect(labels()).toContain(formatUtcDate(UNTIL));
    const zone = screen.getByTestId('scrubber-forecast');
    expect(parseFloat(zone.style.left)).toBeCloseTo(((NOW - rangeStart) / (UNTIL - rangeStart)) * 100, 3);
    expect(zone).toHaveAttribute('title', `Forecast ahead: ENLIL, to ${formatUtcDateTime(UNTIL)}`);
  });

  it('lets a moment ahead be chosen, and keeps the intel\'s range the intel\'s', () => {
    mount();
    act(() => publishForecastReach('enlil', { until: UNTIL, by: 'ENLIL' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Position' }), { target: { value: '1000' } });
    expect(seen!.isLive).toBe(false);
    expect(seen!.currentTime).toBe(UNTIL);
    expect(seen!.dataRange).toEqual({ start: rangeStart, end: dataEnd });
  });

  it('keeps to the intel without a forecast, or with one already past', () => {
    mount();
    expect(screen.queryByTestId('scrubber-forecast')).toBeNull();
    expect(labels()).toContain(formatUtcDate(dataEnd));
    act(() => publishForecastReach('enlil', { until: NOW - 3_600_000, by: 'ENLIL' }));
    expect(screen.queryByTestId('scrubber-forecast')).toBeNull();
    expect(labels()).toContain(formatUtcDate(dataEnd));
  });
});
