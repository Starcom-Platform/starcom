/* @vitest-environment jsdom */
/**
 * The Inspector's controls do what they say, or say why they cannot (critique
 * audit of 2026-10-01, section 8; plan block F, item 5).
 *
 * "Open in Dashboard" went to /intel?selected=, which reads only reportId and
 * redirects home, so the selection was lost and the reader left the Analyzer.
 * Pin to Board did nothing, silently, when no board was open.
 */
import { vi } from 'vitest';
import React, { PropsWithChildren, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationRouterProvider } from '../../../../components/Router/ApplicationRouter';
import { BoardsProvider } from '../../state/BoardsContext';
import { FilterProvider, useFilter } from '../../state/FilterContext';
import { SelectionProvider, useSelection, SelectionItem } from '../../state/SelectionContext';
import BoardsPanel from '../BoardsPanel';
import InspectorPanel from '../InspectorPanel';

// Reduce file handle usage by stubbing icon modules used by the panels
// Use inline factory functions to avoid hoist issues in Vitest
vi.mock('@mui/icons-material/Save', () => ({ default: () => null }));
vi.mock('@mui/icons-material/DeleteOutline', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Launch', () => ({ default: () => null }));
vi.mock('@mui/icons-material/PushPin', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Link', () => ({ default: () => null }));
vi.mock('@mui/icons-material/LocationOn', () => ({ default: () => null }));
vi.mock('@mui/icons-material/AccessTime', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ViewCarousel', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ViewArraySharp', () => ({ default: () => null }));

// Also stub the MUI icons barrel import used by InspectorPanel to prevent loading many files
vi.mock('@mui/icons-material', () => {
  const Icon = () => null;
  return {
    __esModule: true,
    PushPin: Icon,
    Link: Icon,
    Launch: Icon,
    LocationOn: Icon,
    AccessTime: Icon,
    default: {}
  };
});

// Stub EventDetails to avoid its internal icon/dependency imports during tests
vi.mock('../components/EventDetails', () => ({ default: () => null }));
// The workspace a saved selection is found again in (resolveSelection). A board
// restores what it saved only if the item is still there, as in the app.
const workspace = vi.hoisted(() => ({
  reports: [{
    id: 'rep-42', title: 'Event 999', content: 'words', author: 'me', category: 'OSINT', tags: ['alpha'], status: 'SUBMITTED',
    createdAt: new Date('2025-01-01T00:00:00Z'), updatedAt: new Date('2025-01-01T00:00:00Z'),
  }] as unknown[],
}));
vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => ({ reports: workspace.reports, intelItems: [] }) }));


const router = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
vi.mock('../../../../hooks/useApplicationRouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useApplicationRouter')>()),
  useApplicationRouter: () => ({ navigateToApp: router.navigateToApp }),
}));

// Provide a lightweight CorrelationContext mock so InspectorPanel can render
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({
    showClusters: false,
    anomaliesByDay: new Set<string>(),
    cooccurrence: [],
    tagCooccurrence: [],
    placeClusters: [],
    locationConflicts: [],
    setShowClusters: () => {}
  })
}));

const Harness: React.FC<PropsWithChildren<{
  initialActiveBoardId?: string | null;
  initialView?: 'timeline' | 'map' | 'graph' | 'table';
  presetSelection?: SelectionItem | null;
}>> = ({ initialActiveBoardId = null, initialView = 'timeline', presetSelection }) => {
  const [activeBoardId, setActiveBoardId] = useState<string | null>(initialActiveBoardId);
  const [currentView, setCurrentView] = useState<'timeline' | 'map' | 'graph' | 'table'>(initialView);
  return (
    <ApplicationRouterProvider>
      <MemoryRouter>
        <BoardsProvider>
          <FilterProvider>
            <SelectionProvider>
              <InnerHarness
                activeBoardId={activeBoardId}
                setActiveBoardId={setActiveBoardId}
                currentView={currentView}
                setCurrentView={setCurrentView}
                presetSelection={presetSelection}
              />
            </SelectionProvider>
          </FilterProvider>
        </BoardsProvider>
      </MemoryRouter>
    </ApplicationRouterProvider>
  );
};

const InnerHarness: React.FC<{
  activeBoardId: string | null;
  setActiveBoardId: (id: string | null) => void;
  currentView: 'timeline' | 'map' | 'graph' | 'table';
  setCurrentView: (v: 'timeline' | 'map' | 'graph' | 'table') => void;
  presetSelection?: SelectionItem | null;
}> = ({ activeBoardId, setActiveBoardId, currentView, setCurrentView, presetSelection }) => {
  const { setSelectedItem } = useSelection();
  const { setFilters } = useFilter();

  useEffect(() => {
    // Ensure deterministic base state
    setFilters({});
    if (presetSelection !== undefined) setSelectedItem(presetSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 360px', gap: 8 }}>
      <div>
        <BoardsPanel
          currentView={currentView}
          setCurrentView={setCurrentView}
          activeBoardId={activeBoardId}
          onActiveBoardChange={setActiveBoardId}
        />
      </div>
      <div />
      <div>
        <InspectorPanel />
      </div>
    </div>
  );
};

const fromReport = (): SelectionItem => ({
  id: 'evt-report-rep-42', type: 'event',
  data: { id: 'evt-report-rep-42', title: 'Event from a report', timestamp: '2025-01-01T00:00:00Z', category: 'OSINT', tags: [], sourceType: 'REPORT', sourceId: 'rep-42' },
} as unknown as SelectionItem);
const fromObservation = (): SelectionItem => ({
  id: 'evt-item-obs-7', type: 'event',
  data: { id: 'evt-item-obs-7', title: 'An observation', timestamp: '2025-01-01T00:00:00Z', category: 'OSINT', tags: [], sourceType: 'INTEL_ITEM', sourceId: 'obs-7' },
} as unknown as SelectionItem);

describe('the Inspector\'s controls', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); router.navigateToApp.mockReset(); });

  it('opens the dashboard on the report the selection came from', async () => {
    render(<Harness presetSelection={fromReport()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Dashboard' }));
    expect(router.navigateToApp).toHaveBeenCalledWith('inteldashboard', undefined, { reportId: 'rep-42', from: 'intelanalyzer' });
  });

  it('says it cannot when the selection is not a report, rather than going nowhere', async () => {
    render(<Harness presetSelection={fromObservation()} />);
    const open = await screen.findByRole('button', { name: /Open in Dashboard/ });
    expect(open).toBeDisabled();
    expect(screen.getByLabelText(/only a report has a dashboard page/i)).toBeInTheDocument();
  });

  it('pin is disabled, saying why, until a board is open', async () => {
    render(<Harness presetSelection={fromReport()} />);
    const pin = await screen.findByRole('button', { name: /Pin to Board/ });
    expect(pin).toBeDisabled();
    expect(screen.getByLabelText(/open or create a board to pin to/i)).toBeInTheDocument();
  });
});
