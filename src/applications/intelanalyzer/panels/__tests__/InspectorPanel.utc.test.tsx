/**
 * The inspector shows when a record was created and updated in UTC, with its
 * year, and the local time on hover (decision D-E, settled 2026-09-14 for step 9).
 * It printed both in the browser's local time with no zone.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
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
// "Open in Dashboard" hands over through the app router (plan block F, item 5).
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: () => {} }) }));

import InspectorPanel from '../InspectorPanel';
import { localTimeTitle } from '../../../../utils/utcTime';

const created = Date.UTC(2026, 6, 27, 8, 5);
const updated = Date.UTC(2026, 8, 14, 19, 33);

const renderInspector = (selectedItem: unknown) => {
  state.selectedItem = selectedItem;
  return render(<MemoryRouter><InspectorPanel /></MemoryRouter>);
};

describe('InspectorPanel: when a record was created and updated', () => {
  it('shows a report’s times in UTC with the year, and the local time on hover', () => {
    renderInspector({
      id: 'r1', type: 'report',
      data: { id: 'r1', title: 'Substation fire', tags: [], createdAt: new Date(created), updatedAt: new Date(updated) },
    });

    expect(screen.getByText('27 Jul 2026 08:05Z')).toHaveAttribute('title', localTimeTitle(created));
    expect(screen.getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(updated));
  });

  it('shows an intel item’s times the same way when they are stored as strings', () => {
    renderInspector({
      id: 'i1', type: 'intelItem',
      data: {
        id: 'i1', title: 'Relay chatter', tags: [], categories: [], source: 'OSINT',
        createdAt: new Date(created).toISOString(), updatedAt: new Date(updated).toISOString(),
      },
    });

    expect(screen.getByText('27 Jul 2026 08:05Z')).toHaveAttribute('title', localTimeTitle(created));
    expect(screen.getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(updated));
  });
});
