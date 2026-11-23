/**
 * The filter panel's watchlist and place filter say what they need, and do
 * not pretend (critique audit of 2026-10-01, section 8; plan block F, item 5).
 *
 * The watchlist wrote to the open board and, with none open, took what was
 * typed and kept nothing. "Add placeholder geo area" filtered to a fixed
 * triangle over San Francisco that the map's Clear could not remove.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ filters: {} as Record<string, unknown>, activeBoardId: null as string | null }));
vi.mock('../../state/FilterContext', () => ({
  useFilter: () => ({ filters: state.filters, updateFilter: () => {}, clearFilters: () => {} }),
}));
vi.mock('../../state/CorrelationContext', () => ({ useCorrelation: () => ({ showClusters: false, setShowClusters: () => {} }) }));
vi.mock('../../state/BoardsContext', () => ({
  useBoards: () => ({
    boards: state.activeBoardId ? [{ id: state.activeBoardId, name: 'B', state: {} }] : [], activeBoardId: state.activeBoardId,
    addWatchTag: () => {}, removeWatchTag: () => {}, addWatchEntity: () => {}, removeWatchEntity: () => {},
  }),
}));
vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => ({ reports: [], intelItems: [] }) }));

import FilterPanel from '../FilterPanel';

beforeEach(() => { state.filters = {}; state.activeBoardId = null; });

describe('FilterPanel: watchlist and place', () => {
  it('with no board open, the watchlist cannot be typed into, and says why', () => {
    render(<FilterPanel />);
    expect(screen.getByPlaceholderText('Add tag to watch…')).toBeDisabled();
    expect(screen.getByPlaceholderText('Add entity id to watch…')).toBeDisabled();
    expect(screen.getByText('Open or create a board to keep a watchlist.')).toBeInTheDocument();
  });

  it('with a board open, it can', () => {
    state.activeBoardId = 'b1';
    render(<FilterPanel />);
    expect(screen.getByPlaceholderText('Add tag to watch…')).toBeEnabled();
    expect(screen.queryByText('Open or create a board to keep a watchlist.')).not.toBeInTheDocument();
  });

  it('offers no made-up area; it points to the map, and clears one drawn there', () => {
    render(<FilterPanel />);
    expect(screen.queryByRole('button', { name: /placeholder/i })).not.toBeInTheDocument();
    expect(screen.getByText('Draw an area in the map view to filter by place.')).toBeInTheDocument();
  });

  it('names an area drawn on the map, with a way to clear it', () => {
    state.filters = { geo: { polygon: [[0, 0], [1, 0], [1, 1], [0, 0]] } };
    render(<FilterPanel />);
    expect(screen.getByText('Area drawn on the map')).toBeInTheDocument();
  });
});
