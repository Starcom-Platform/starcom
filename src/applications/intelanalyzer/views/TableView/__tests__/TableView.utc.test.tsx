/**
 * A row whose time cannot be read shows the value as it was stored (decision D-E,
 * settled 2026-09-14 for step 9). It printed "Invalid Date".
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import TableView from '../TableView';
import { FilterProvider } from '../../../state/FilterContext';
import { SelectionProvider } from '../../../state/SelectionContext';

vi.mock('../../../state/BoardsContext', () => ({
  useBoards: () => ({ boards: [], activeBoardId: null }),
}));
vi.mock('../../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, anomaliesByDay: new Set<string>() }),
}));

describe('TableView: a time it cannot read', () => {
  it('shows the stored value, not a date it cannot know', () => {
    const events = [{
      id: 'e-bad', title: 'Garbled import', timestamp: 'not a time', timeBasis: 'event',
      category: 'GENERAL', tags: [], sourceType: 'REPORT', sourceId: 'r1', entityRefs: [],
    }];
    render(
      <FilterProvider>
        <SelectionProvider>
          <TableView events={events as never} />
        </SelectionProvider>
      </FilterProvider>
    );

    expect(screen.getByText('not a time')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
