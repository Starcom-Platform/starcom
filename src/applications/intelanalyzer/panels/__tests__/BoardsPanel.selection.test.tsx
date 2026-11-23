/**
 * Saving or opening a board keeps the Analyzer standing (found running the
 * app, 2026-10-02; plan block F, item 5).
 *
 * A board restored its selection as `{ id, type, data: null }`, and the
 * Inspector's event details read the time from null: the whole Analyzer was
 * replaced by its error screen. Saving a board opens it, so saving with an
 * event selected was enough. EventDetails is real here; a test that mocks it
 * cannot see this.
 */
import React, { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { adaptReportsToEvents } from '../../adapters/eventsAdapter';

const report = {
  id: 'rep-42', title: 'Harbour fire report', content: 'Smoke over the harbour.', author: 'me', category: 'OSINT', tags: ['harbour'],
  status: 'SUBMITTED', createdAt: new Date('2026-09-30T10:00:00Z'), updatedAt: new Date('2026-09-30T10:00:00Z'),
} as unknown as IntelReportUI;
const workspace = vi.hoisted(() => ({ reports: [] as unknown[] }));
vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => ({ reports: workspace.reports, intelItems: [] }) }));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: () => {} }) }));
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, anomaliesByDay: new Set(), cooccurrence: [], tagCooccurrence: [], placeClusters: [], locationConflicts: [], setShowClusters: () => {} }),
}));
vi.mock('../components/ExportDraftButton', () => ({ default: () => null }));

import { BoardsProvider } from '../../state/BoardsContext';
import { FilterProvider } from '../../state/FilterContext';
import { SelectionProvider, useSelection, type SelectionItem } from '../../state/SelectionContext';
import BoardsPanel from '../BoardsPanel';
import InspectorPanel from '../InspectorPanel';
import { useBoards } from '../../state/BoardsContext';

const Select: React.FC<{ item: SelectionItem }> = ({ item }) => {
  const { setSelectedItem } = useSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedItem(item); }, []);
  return null;
};
const Panels: React.FC = () => {
  const { activeBoardId, setActiveBoardId } = useBoards();
  const [view, setView] = useState<'timeline' | 'table' | 'map' | 'graph'>('table');
  return (
    <>
      <BoardsPanel currentView={view} setCurrentView={setView} activeBoardId={activeBoardId} onActiveBoardChange={setActiveBoardId} />
      <InspectorPanel />
    </>
  );
};
const mount = (item: SelectionItem) => render(
  <MemoryRouter>
    <BoardsProvider><FilterProvider><SelectionProvider>
      <Select item={item} />
      <Panels />
    </SelectionProvider></FilterProvider></BoardsProvider>
  </MemoryRouter>,
);

beforeEach(() => { localStorage.clear(); cleanup(); workspace.reports = [report]; });

describe('a board and its selection', () => {
  const event = () => adaptReportsToEvents([report])[0];

  it('saving a board with an event selected keeps the Inspector, and the event', async () => {
    mount({ id: event().id, type: 'event', data: event() } as SelectionItem);
    expect(await screen.findByText('Harbour fire report')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('New board name'), { target: { value: 'Harbour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));
    expect(await screen.findByText('Harbour fire report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pin to Board' })).toBeEnabled();
  });

  it('a selection no longer in the workspace is no selection, not a broken one', async () => {
    mount({ id: event().id, type: 'event', data: event() } as SelectionItem);
    await screen.findByText('Harbour fire report');
    fireEvent.change(screen.getByPlaceholderText('New board name'), { target: { value: 'Harbour' } });
    workspace.reports = [];
    fireEvent.click(screen.getByRole('button', { name: 'Save board' }));
    expect(await screen.findByText(/Select an item/i)).toBeInTheDocument();
  });

  it('the Inspector shows no selection, not an error, if handed one with nothing behind it', async () => {
    mount({ id: 'evt-report-gone', type: 'event', data: null } as unknown as SelectionItem);
    expect(await screen.findByText(/Select an item/i)).toBeInTheDocument();
  });
});
