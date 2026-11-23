/**
 * ─── THIS FILE WAS EXCLUDED FROM THE SUITE, AND WHY IT IS BACK ─────────────
 *
 * It passed its one assertion and leaked asynchronously three separate ways,
 * so it was excluded on that evidence rather than on its filename. All three
 * are fixed, and the record lives here because this is where someone meeting
 * the file will look — the exclusion it was attached to no longer exists.
 *
 *   1. IntelWorkspaceManager read localStorage from a deferred tick with no
 *      guard. Once the environment was gone it threw ReferenceError into an
 *      unhandled rejection: no test failed, and the run exited non-zero with
 *      the cause reported against whichever file happened to run last. Now
 *      routed through a storage() accessor that treats an absent store as
 *      empty.
 *
 *   2. The vi.mock below pointed at a path that does not resolve, so nothing
 *      was mocked and the real context's async load() outlived the test. See
 *      its own comment.
 *
 *   3. Repeated "Cannot read properties of undefined (reading 'ok')", which
 *      turned out not to be a leak at all: GeoEventsDataProvider CATCHES its
 *      own fetch failures and logs them. Noise on stderr, reaching the
 *      unhandled path only while (2) was still true.
 *
 * ─── WHAT WAS MEASURED, INCLUDING THE PART THAT DOES NOT FIT ──────────────
 *
 * Clean in: 10 isolated runs, 2 runs of the applications shard (where the leak
 * originally surfaced), 3 full-suite runs, 2 `npm test` runs, and one run with
 * the vite/vitest caches deleted.
 *
 * NOT clean once: a single run reported 2 unhandled errors, immediately after
 * this comment block was first added — a cold transform, so a slower start.
 * It has not reproduced since, including when the cache was cleared
 * deliberately to try. One observation in eighteen.
 *
 * That is recorded rather than rounded away, because "fixed" and "has not
 * failed lately" are different claims and only the second is supported. If
 * this file starts failing a run again, the thread to pull is what is still
 * running after the test resolves — not causes 1 and 2 above, which are
 * genuinely gone.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';

/*
 * Mock IntelWorkspaceContext to avoid the real manager.
 *
 * The path was '../../services/…', which from this __tests__ directory
 * resolves to src/applications/services/… — a directory that does not exist.
 * So nothing was mocked: the real context loaded, its async load() resolved
 * after the environment was torn down, and React's setState threw
 * `ReferenceError: window is not defined` into an unhandled rejection. No test
 * failed and the run exited 1.
 *
 * Three levels up, matching AnalysisWorkbench's own import of the same module
 * from one directory higher.
 */
vi.mock('../../../services/intel/IntelWorkspaceContext', () => {
  const Ctx = React.createContext({ reports: [], intelItems: [], refresh: async () => {}, loading: false });
  const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => React.createElement(Ctx.Provider, { value: { reports: [], intelItems: [], refresh: async () => {}, loading: false } }, children);
  return {
    IntelWorkspaceProvider: Provider,
    useIntelWorkspace: () => React.useContext(Ctx)
  };
});

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

// Mock InspectorPanel only
vi.mock('../panels/InspectorPanel', () => ({ default: () => React.createElement('div', { 'data-testid': 'inspector-panel' }) }));
vi.mock('../views/MapView/MapView', () => ({ default: () => null }));
vi.mock('../views/GraphView/GraphView', () => ({ default: () => null }));
vi.mock('../views/TimelineView/TimelineView', () => ({ default: () => null }));
vi.mock('../views/TableView/TableView', () => ({ default: () => React.createElement('div', null) }));

// Targeted icon mocks to avoid EMFILE from many icon files
vi.mock('@mui/icons-material/DeleteOutline', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/Save', () => ({ default: () => React.createElement('span', null) }));
vi.mock('@mui/icons-material/Launch', () => ({ default: () => React.createElement('span', null) }));

import AnalysisWorkbench from '../AnalysisWorkbench';

const STORAGE_KEY = 'intelAnalyzer.boards';

describe('Deep Link integration — board and filters', () => {
  beforeEach(() => {
    // Reset storage
    localStorage.removeItem(STORAGE_KEY);
    // Preload a board with timeRange as strings
    const board = {
      id: 'b1',
      name: 'Board One',
      savedAt: Date.now(),
      state: {
        view: 'table',
        filters: {
          timeRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
          tags: ['alpha']
        },
        selection: null
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([board]));
  });

  it('applies board from URL and revives timeRange to Date', async () => {
    render(
      <ApplicationRouterProvider>
        <MemoryRouter initialEntries={[{ pathname: '/', search: '?view=graph&board=b1' }]}>
          <AnalysisWorkbench />
        </MemoryRouter>
      </ApplicationRouterProvider>
    );

  // Active board label appears
  const activeLabel = await screen.findByTestId('active-board-label');
  expect(activeLabel.textContent || '').toMatch(/Active:\s*Board One/i);

  // The FilterPanel Apply button for time range should be enabled due to valid revived dates in inputs
  const applyButton = await screen.findByTestId('apply-time-range');
  expect(applyButton.getAttribute('disabled')).toBeNull();
  });
});

/**
 * A board opened by a link is the board pins and the watchlist write to
 * (critique audit of 2026-10-01, section 8). `?board=` set only the
 * workbench's own copy of the active board; the boards context, which every
 * pin, note and watch writes through, stayed on none, so they went nowhere.
 */
describe('Deep Link integration — the board a link opens', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'b1', name: 'Board One', savedAt: Date.now(), state: { view: 'table', filters: {}, selection: null } }]));
  });

  it('takes a watched tag', async () => {
    render(
      <ApplicationRouterProvider>
        <MemoryRouter initialEntries={[{ pathname: '/', search: '?board=b1' }]}>
          <AnalysisWorkbench />
        </MemoryRouter>
      </ApplicationRouterProvider>
    );
    const input = await screen.findByPlaceholderText('Add tag to watch…');
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'harbour' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(await screen.findByText('#harbour')).toBeInTheDocument();
  });
});

/**
 * The "one run in eighteen" above, found: the workbench's URL sync made a new
 * debounced updater on every change and never cancelled one, so a write still
 * pending at unmount fired afterwards — onto the next page's URL in the app,
 * and after teardown in a test, as the recorded `window is not defined`.
 */
describe('Deep Link integration — the pending URL write', () => {
  it('is cancelled when the workbench unmounts, not written onto the next page', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const { unmount } = render(
      <ApplicationRouterProvider>
        <MemoryRouter initialEntries={[{ pathname: '/', search: '?view=table' }]}>
          <AnalysisWorkbench />
        </MemoryRouter>
      </ApplicationRouterProvider>
    );
    await screen.findByTestId('inspector-panel');
    replace.mockClear();
    unmount();
    // Past the updater's 300 ms delay, in real time — its timer is a real one.
    await new Promise((r) => setTimeout(r, 450));
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });
});
