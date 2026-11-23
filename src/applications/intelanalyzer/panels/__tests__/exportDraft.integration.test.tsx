import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock intelReportService
vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: {
    createReport: vi.fn(async (input: any, _author: string) => ({
      id: 'draft-123',
      ...input,
      author: 'ANALYST',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'DRAFT'
    })),
  saveReport: vi.fn(async (_report: any) => {}),
    // The board below pins one report; its digest is read from the report itself (plan item 4.3).
    getReport: vi.fn(async (id: string) => id === 'r1' ? {
      id: 'r1', title: 'Pinned report', content: 'c', author: 'npub-a', category: 'GENERAL', tags: [], status: 'SUBMITTED',
      createdAt: new Date('2026-09-10T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'), reliability: 'C',
      latitude: 38.7, longitude: -9.1, jurisdictions: ['pt'],
    } : null),
  }
}));

// Mock heavy libs that expect browser APIs
vi.mock('maplibre-gl', () => {
  class MockMap {
    listeners: Record<string, Function[]> = {};
    on(ev: string, cb: any) { (this.listeners[ev] ||= []).push(cb); if (ev === 'load' && typeof cb === 'function') cb(); }
    off() {}
    addSource() {}
    addLayer() {}
    getSource() { return { setData: () => {} }; }
    getBounds() { return { getWest: () => -180, getEast: () => 180, getSouth: () => -85, getNorth: () => 85 }; }
    getZoom() { return 2; }
    queryRenderedFeatures() { return []; }
    remove() {}
  }
  return { Map: MockMap, setWorkerUrl: () => {} };
});

vi.mock('react-force-graph-2d', () => ({ default: () => null }));

// Mock dialog to auto-confirm without user interaction to keep test deterministic
vi.mock('../components/ExportDraftDialog', () => ({
  __esModule: true,
  default: ({ open, onConfirm }: any) => open ? React.createElement('button', { 'data-testid': 'confirm-export', onClick: () => onConfirm({ title: 'Draft From Test', includeFilters: true, includeWatchlists: true, redactSensitive: false }) }) : null
}));

// Mock Map/Graph views to avoid mounting heavy components
vi.mock('../../views/MapView/MapView', () => ({ default: () => null }));
vi.mock('../../views/GraphView/GraphView', () => ({ default: () => null }));
// Targeted icon mocks to reduce file opens
vi.mock('@mui/icons-material/DeleteOutline', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/Save', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/Launch', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/PushPin', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/Link', () => ({ default: () => React.createElement('span', null) }));

// Minimal app harness: BoardsProvider with one active board + InspectorPanel with Export button
import { BoardsProvider, useBoards } from '../../state/BoardsContext';
import ExportDraftButton from '../components/ExportDraftButton';

const ActivateBoard: React.FC<{ id: string }> = ({ id }) => {
  const { setActiveBoardId } = useBoards();
  React.useEffect(() => { setActiveBoardId(id); }, [id, setActiveBoardId]);
  return null;
};

const STORAGE_KEY = 'intelAnalyzer.boards';

// Mock useApplicationRouter to observe the handoff into the Intel Dashboard app.
const navigateToAppMock = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: navigateToAppMock }),
}));

describe('Export to Draft flow', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    const board = {
      id: 'b1', name: 'Test Board', savedAt: Date.now(),
      state: { view: 'table', filters: {}, selection: null, notes: 'n', pins: [{ id: 'r1', type: 'report', title: 'Pinned report' }], watch: { tags: [], entities: [] } }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([board]));
  navigateToAppMock.mockReset();
  });

  it('hands off to the Intel Dashboard app with the new draft selected, after export', async () => {
    render(
      <MemoryRouter>
        <BoardsProvider>
          <ActivateBoard id="b1" />
          <ExportDraftButton source="inspector" variant="outlined" size="small">Export</ExportDraftButton>
        </BoardsProvider>
      </MemoryRouter>
    );

    // Export button in Inspector header exists (panel mocked closed if no selection, but button still mounted)
    const exportButtons = await screen.findAllByText('Export');
    fireEvent.click(exportButtons[0]);

    // Auto-confirm mocked dialog
    const confirm = await screen.findByTestId('confirm-export');
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(navigateToAppMock).toHaveBeenCalledWith(
        'inteldashboard',
        undefined,
        expect.objectContaining({ reportId: 'draft-123', from: 'intelanalyzer' })
      );
    });

  // Verify deep-link propagated on save
  const svc = await import('../../../../services/intel/IntelReportService');
  const saveMock = (svc.intelReportService.saveReport as any);
  const savedArg = saveMock.mock.calls[0][0];
  expect(savedArg.analysisDeepLink).toBeDefined();

  // The draft carries what its pinned report rests on, read from the report itself.
  const createMock = (svc.intelReportService.createReport as any);
  const content = createMock.mock.calls[0][0].content as string;
  expect(content).toContain('## What the pinned reports rest on');
  expect(content).toContain('- Reliability: 1 graded C.');
  expect(content).toContain('Countries named: Portugal.');
  });
});
