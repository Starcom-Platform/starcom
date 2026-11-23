/**
 * IntelAnalyzer's table filters rows by overlap and says which time placed each
 * row (decision D-E).
 */
import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import TableView from '../TableView';
import { FilterProvider, useFilter } from '../../../state/FilterContext';
import { SelectionProvider } from '../../../state/SelectionContext';

vi.mock('../../../state/BoardsContext', () => ({
  useBoards: () => ({ boards: [], activeBoardId: null }),
}));
vi.mock('../../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, anomaliesByDay: new Set<string>() }),
}));

const DAY = 86_400_000;
const events = [
  {
    id: 'e-span', title: 'Grid outage', timestamp: '2026-07-01T00:00:00.000Z', timeBasis: 'event',
    timeEndMs: Date.parse('2026-07-10T00:00:00Z'), timePrecisionMs: DAY,
    category: 'GENERAL', tags: [], sourceType: 'REPORT', sourceId: 'r1', entityRefs: [],
  },
  {
    id: 'e-written', title: 'Undated note', timestamp: '2026-09-14T09:05:00.000Z', timeBasis: 'written',
    category: 'GENERAL', tags: [], sourceType: 'REPORT', sourceId: 'r2', entityRefs: [],
  },
];

const WithRange: React.FC<{ range?: { start: Date; end: Date } }> = ({ range }) => {
  const { updateFilter } = useFilter();
  useEffect(() => {
    if (range) updateFilter('timeRange', range);
  }, [range, updateFilter]);
  return null;
};

const renderTable = (range?: { start: Date; end: Date }) =>
  render(
    <FilterProvider>
      <SelectionProvider>
        <WithRange range={range} />
        <TableView events={events as never} />
      </SelectionProvider>
    </FilterProvider>
  );

describe('TableView: event time', () => {
  it('says a row was placed by when it was written, and that no event time was stated', () => {
    renderTable();
    expect(screen.getByText('Written 14 Sep 2026 09:05Z (no stated event time)')).toBeInTheDocument();
  });

  it('keeps a row whose span meets the time range, though it starts before it', async () => {
    renderTable({ start: new Date('2026-07-05T00:00:00Z'), end: new Date('2026-07-05T12:00:00Z') });
    expect(await screen.findByText('Grid outage')).toBeInTheDocument();
    expect(screen.queryByText('Undated note')).not.toBeInTheDocument();
  });
});
