/**
 * IntelAnalyzer's time range is the shared window (decision D-E, settled
 * 2026-09-14 for step 8). It was the analyzer's own filter, so the analyzer and
 * the globe could show different stretches of time with nothing to say so.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { FilterProvider, useFilter } from '../FilterContext';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';

const start = new Date(Date.UTC(2026, 6, 27));
const end = new Date(Date.UTC(2026, 7, 3));

let temporal: ReturnType<typeof useTemporalState>;
let screenA: ReturnType<typeof useFilter>;
let screenB: ReturnType<typeof useFilter>;
const Temporal: React.FC = () => {
  temporal = useTemporalState();
  return null;
};
const ScreenA: React.FC = () => {
  screenA = useFilter();
  return null;
};
const ScreenB: React.FC = () => {
  screenB = useFilter();
  return null;
};

beforeEach(() => {
  localStorage.clear();
});

const renderShared = () =>
  render(
    <TemporalProvider>
      <Temporal />
      <FilterProvider><ScreenA /></FilterProvider>
      <FilterProvider><ScreenB /></FilterProvider>
    </TemporalProvider>,
  );

describe('FilterContext: the time range is the shared window', () => {
  it('reads the shared window as its range while paused, and has none while live', () => {
    renderShared();
    expect(screenA.filters.timeRange).toBeUndefined();

    act(() => temporal.setTimeWindow(start.getTime(), end.getTime()));
    expect(screenA.filters.timeRange).toEqual({ start, end });

    act(() => temporal.setIsLive(true));
    expect(screenA.filters.timeRange).toBeUndefined();
  });

  it('sets the shared window from a range chosen in the analyzer, paused at its end', () => {
    renderShared();
    act(() => screenA.updateFilter('timeRange', { start, end }));

    expect(temporal.isLive).toBe(false);
    expect(temporal.timeWindow).toEqual({ start, end });
    expect(temporal.currentTime).toBe(end.getTime());
  });

  it('shows another screen the range one screen chose', () => {
    renderShared();
    act(() => screenA.updateFilter('timeRange', { start, end }));
    expect(screenB.filters.timeRange).toEqual({ start, end });
  });

  it('returns to live when the range is cleared', () => {
    renderShared();
    act(() => screenA.updateFilter('timeRange', { start, end }));
    act(() => screenA.updateFilter('timeRange', undefined));

    expect(temporal.isLive).toBe(true);
    expect(temporal.timeWindow).toBeNull();
  });

  it('sets restored filters’ range as the shared window, and returns to live for filters without one', () => {
    renderShared();
    act(() => screenA.setFilters({ tags: ['grid'], timeRange: { start, end } }));
    expect(temporal.timeWindow).toEqual({ start, end });
    expect(screenA.filters.tags).toEqual(['grid']);

    act(() => screenA.setFilters({ tags: ['water'] }));
    expect(temporal.isLive).toBe(true);
    expect(screenA.filters).toEqual({ tags: ['water'] });
  });

  it('returns to live when every filter is cleared', () => {
    renderShared();
    act(() => screenA.setFilters({ tags: ['grid'], timeRange: { start, end } }));
    act(() => screenA.clearFilters());

    expect(temporal.isLive).toBe(true);
    expect(screenA.filters).toEqual({});
  });

  it('keeps its other filters to itself', () => {
    renderShared();
    act(() => screenA.updateFilter('tags', ['grid']));

    expect(temporal.isLive).toBe(true);
    expect(screenB.filters.tags).toBeUndefined();
  });

  it('sets nothing when the range is already the window, so a view that sends it again cannot loop', () => {
    renderShared();
    act(() => screenA.updateFilter('timeRange', { start, end }));
    const chosen = temporal.timeWindow;
    act(() => screenA.updateFilter('timeRange', { start, end }));
    expect(temporal.timeWindow).toBe(chosen);

    // A range with no width is a moment, which selects the step around it.
    act(() => screenA.updateFilter('timeRange', { start, end: start }));
    const moment = temporal.timeWindow;
    act(() => screenA.updateFilter('timeRange', { start, end: start }));
    expect(temporal.timeWindow).toBe(moment);
  });

  it('keeps a range of its own where there is no shared time state', () => {
    render(<FilterProvider><ScreenA /></FilterProvider>);
    act(() => screenA.updateFilter('timeRange', { start, end }));
    expect(screenA.filters.timeRange).toEqual({ start, end });
  });
});
