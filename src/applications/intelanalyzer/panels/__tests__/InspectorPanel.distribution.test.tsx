/**
 * The inspector draws an intel item's distribution as the one chip every
 * screen draws (BD18), where it printed the raw word in a grey chip, and draws
 * none for an item that states none, as before.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ selectedItem: null as unknown }));

vi.mock('../../state/SelectionContext', () => ({ useSelection: () => ({ selectedItem: state.selectedItem }) }));
vi.mock('../../state/FilterContext', () => ({ useFilter: () => ({ updateFilter: () => {} }) }));
vi.mock('../../state/BoardsContext', () => ({
  useBoards: () => ({ addPin: () => {}, setNotes: () => {}, boards: [], activeBoardId: null }),
}));
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ anomaliesByDay: new Map(), showClusters: false, locationConflicts: [] }),
}));
vi.mock('../components/EventDetails', () => ({ default: () => null }));
vi.mock('../components/AnomalyBadge', () => ({ default: () => null }));
vi.mock('../components/ConflictBadge', () => ({ default: () => null }));
vi.mock('../components/ExportDraftButton', () => ({ default: () => null }));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: () => {} }) }));

import InspectorPanel from '../InspectorPanel';

const item = (over: Record<string, unknown>) => ({
  id: 'i1', type: 'intelItem',
  data: { id: 'i1', title: 'Relay chatter', tags: [], categories: [], source: 'OSINT', ...over },
});

describe('InspectorPanel: distribution', () => {
  it("draws an item's distribution as the chip", () => {
    state.selectedItem = item({ visibility: 'limited' });
    render(<MemoryRouter><InspectorPanel /></MemoryRouter>);
    expect(screen.getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('limited');
  });

  it('draws none for an item that states none', () => {
    state.selectedItem = item({});
    render(<MemoryRouter><InspectorPanel /></MemoryRouter>);
    expect(screen.queryByTestId('distribution-chip')).toBeNull();
  });
});
