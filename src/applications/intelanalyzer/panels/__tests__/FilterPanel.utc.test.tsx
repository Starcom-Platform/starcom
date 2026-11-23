/**
 * IntelAnalyzer's filter panel takes its time range in UTC, marked Z, with the
 * local time beside it, and shows an applied range in UTC (decision D-E, settled
 * 2026-09-14 for step 9). It took the range in the browser's local time with no
 * zone shown, so the range typed was not the range the badge and timeline show.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  filters: {} as Record<string, unknown>,
  updateFilter: (() => {}) as (...args: unknown[]) => void,
}));

vi.mock('../../state/FilterContext', () => ({
  useFilter: () => ({ filters: state.filters, updateFilter: state.updateFilter, clearFilters: () => {} }),
}));
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, setShowClusters: () => {} }),
}));
vi.mock('../../state/BoardsContext', () => ({
  useBoards: () => ({
    boards: [], activeBoardId: null,
    addWatchTag: () => {}, removeWatchTag: () => {}, addWatchEntity: () => {}, removeWatchEntity: () => {},
  }),
}));
vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({
  useIntelWorkspace: () => ({ reports: [], intelItems: [] }),
}));

import FilterPanel from '../FilterPanel';
import { localWindowTitle } from '../../../../utils/utcTime';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 8, 7, 19, 7);
const end = Date.UTC(2026, 8, 14, 19, 7);
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

beforeEach(() => {
  state.filters = {};
  state.updateFilter = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FilterPanel: the time range, in UTC', () => {
  it('takes the start and end in UTC', () => {
    render(<FilterPanel />);
    type('Start date (UTC)', '2026-09-07');
    type('Start time (UTC)', '19:07');
    type('End date (UTC)', '2026-09-14');
    type('End time (UTC)', '19:07');
    fireEvent.click(screen.getByTestId('apply-time-range'));

    expect(state.updateFilter).toHaveBeenCalledWith('timeRange', { start: new Date(start), end: new Date(end) });
  });

  it('says what the range is in local time, beside the fields', () => {
    render(<FilterPanel />);
    type('Start date (UTC)', '2026-09-07');
    type('Start time (UTC)', '19:07');
    type('End date (UTC)', '2026-09-14');
    type('End time (UTC)', '19:07');

    expect(screen.getByTestId('time-range-local')).toHaveTextContent(localWindowTitle(start, end));
  });

  it('takes a date without a time as the start of that UTC day', () => {
    render(<FilterPanel />);
    type('Start date (UTC)', '2026-09-07');
    type('End date (UTC)', '2026-09-14');
    fireEvent.click(screen.getByTestId('apply-time-range'));

    expect(state.updateFilter).toHaveBeenCalledWith('timeRange', {
      start: new Date(Date.UTC(2026, 8, 7)),
      end: new Date(Date.UTC(2026, 8, 14)),
    });
  });

  it('will not apply an end before its start', () => {
    render(<FilterPanel />);
    type('Start date (UTC)', '2026-09-14');
    type('End date (UTC)', '2026-09-07');

    expect(screen.getByTestId('apply-time-range')).toBeDisabled();
  });

  it('fills a preset in UTC', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(end);
    render(<FilterPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 24h' }));

    expect(state.updateFilter).toHaveBeenCalledWith('timeRange', { start: new Date(end - 24 * HOUR), end: new Date(end) });
    expect(field('Start date (UTC)').value).toBe('2026-09-13');
    expect(field('Start time (UTC)').value).toBe('19:07');
    expect(field('End date (UTC)').value).toBe('2026-09-14');
    expect(field('End time (UTC)').value).toBe('19:07');
  });

  it('shows an applied range in UTC, in its fields and in its chip, with the local time on hover', () => {
    state.filters = { timeRange: { start: new Date(start), end: new Date(end) } };
    render(<FilterPanel />);

    expect(field('Start date (UTC)').value).toBe('2026-09-07');
    expect(field('Start time (UTC)').value).toBe('19:07');
    expect(field('End date (UTC)').value).toBe('2026-09-14');
    const chip = screen.getByText('7 Sep 19:07Z – 14 Sep 19:07Z');
    expect(chip.closest('[title]')).toHaveAttribute('title', localWindowTitle(start, end));
  });
});
