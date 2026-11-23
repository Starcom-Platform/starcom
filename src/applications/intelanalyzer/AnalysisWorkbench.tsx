import React, { useState, useMemo, useEffect } from 'react';
import { Box, Button } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { IntelWorkspaceProvider, useIntelWorkspace } from '../../services/intel/IntelWorkspaceContext';
import { FilterProvider, useFilter, FilterState } from './state/FilterContext';
import { SelectionProvider, useSelection } from './state/SelectionContext';
import { BoardsProvider, useBoards } from './state/BoardsContext';
import { resolveSelection } from './state/resolveSelection';
import WorkbenchLayout from './layout/WorkbenchLayout';
import TimelineView from './views/TimelineView/TimelineView';
import MapView from './views/MapView/MapView';
import GraphView from './views/GraphView/GraphView';
import TableView from './views/TableView/TableView';
import FilterPanel from './panels/FilterPanel';
import InspectorPanel from './panels/InspectorPanel';
import BoardsPanel from './panels/BoardsPanel';
import EntityResolutionPanel from './panels/EntityResolutionPanel';
import FindingsPanel from './panels/FindingsPanel';
import FindingsOutboxStatus from './panels/FindingsOutboxStatus';
import StructuralFindingsPanel from './panels/StructuralFindingsPanel';
import CorroborationGapsPanel from './panels/CorroborationGapsPanel';
import PeerClaimsPanel from './panels/PeerClaimsPanel';
import FieldObservationsPanel from './panels/FieldObservationsPanel';
import PublishedClaimsPanel from './panels/PublishedClaimsPanel';
import AttentionPanelContainer from './panels/AttentionPanelContainer';
import { adaptWorkspaceToEvents } from './adapters/eventsAdapter';
import { CorrelationProvider } from './state/CorrelationContext';
import GlobeIntelPublisher from '../../services/intel/globe/GlobeIntelPublisher';
import {
  decodeDeepLink,
  encodeFilters,
  decodeFilters,
  DebouncedURLUpdater,
  reviveFilterState
} from './utils/deepLink';

const DeepLinkSync: React.FC = () => {
  const { setFilters } = useFilter();
  const { setSelectedItem } = useSelection();
  const { reports, intelItems } = useIntelWorkspace();
  const location = useLocation();

  // Initialize from URL on mount
  useEffect(() => {
    const urlState = decodeDeepLink(location.search);
    if (urlState.filters) {
      const decodedFilters = decodeFilters(urlState.filters);
      setFilters(reviveFilterState(decodedFilters as FilterState));
    }
    if (urlState.selected) {
      // Found again in the workspace, the same way a board's selection is (resolveSelection).
      try {
        const found = resolveSelection(urlState.selected, reports, intelItems);
        if (found) {
          setSelectedItem(found);
          return;
        }
      } catch (err) {
        // Non-fatal: selection restoration best-effort
        console.warn('DeepLinkSync: failed to restore selection from URL', err);
      }
    }
  }, [setFilters, setSelectedItem, reports, intelItems, location.search]);

  return null; // This component doesn't render anything
};

const WorkbenchContent: React.FC = () => {
  const { reports, intelItems } = useIntelWorkspace();
  const location = useLocation();
  type WorkbenchView = 'timeline' | 'table' | 'map' | 'graph';
  const [currentView, setCurrentView] = useState<WorkbenchView>('timeline');
  // Bring filter + selection into scope for deep-link syncing including view param
  const { filters, updateFilter } = useFilter();
  const { selectedItem } = useSelection();
  // The boards context's active board, the one pins, notes and the watchlist
  // write to. The workbench kept its own copy, which a `?board=` link set while
  // the context stayed on none (critique audit of 2026-10-01, section 8).
  const { activeBoardId, setActiveBoardId } = useBoards();

  // Adapt workspace data to events
  const events = useMemo(() => {
    return adaptWorkspaceToEvents(reports, intelItems);
  }, [reports, intelItems]);

  // Initialize current view from deep link on mount (inbound parse)
  useEffect(() => {
    const urlState = decodeDeepLink(location.search);
    const allowedViews: WorkbenchView[] = ['timeline', 'table', 'map', 'graph'];
    if (urlState.view && allowedViews.includes(urlState.view as WorkbenchView)) {
      setCurrentView(urlState.view as WorkbenchView);
    }
    if (urlState.board) {
      setActiveBoardId(urlState.board);
    }
  }, [location.search, setActiveBoardId]);

  // Left rail with filters
  const leftRail = (
    <Box>
      {/* First, and only while something is waiting: these go out by themselves
          at startup and on reconnect, so they are shown where nobody has to
          scroll to find them (plan item 0.2). */}
      <FindingsOutboxStatus />
      <BoardsPanel
        currentView={currentView}
        setCurrentView={(v) => setCurrentView(v as 'timeline' | 'table')}
        activeBoardId={activeBoardId}
        onActiveBoardChange={setActiveBoardId}
      />
      {/* Above the rest of the rail on purpose: this is the one panel that
          says what needs doing rather than what you navigated to. */}
      <AttentionPanelContainer />
      <FilterPanel />
      <EntityResolutionPanel />
      <FindingsPanel />
      <PeerClaimsPanel />
      {/* What people published through NavCom, each one to read and to write a report on (D-MX, MX21). */}
      <FieldObservationsPanel />
      {/* Your own claims, each with its refutations and reviews (plan item 5.1). */}
      <PublishedClaimsPanel />
      <CorroborationGapsPanel />
      <StructuralFindingsPanel />
    </Box>
  );

  // Center view based on selection
  const centerView = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* View Switcher */}
      <Box sx={{ p: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <Button
          variant={currentView === 'timeline' ? 'contained' : 'outlined'}
          onClick={() => setCurrentView('timeline')}
          sx={{ mr: 1 }}
        >
          Timeline
        </Button>
  <Button variant={currentView === 'table' ? 'contained' : 'outlined'} onClick={() => setCurrentView('table')}>Table</Button>
  <Button variant={currentView === 'map' ? 'contained' : 'outlined'} onClick={() => setCurrentView('map')}>Map</Button>
  <Button variant={currentView === 'graph' ? 'contained' : 'outlined'} onClick={() => setCurrentView('graph')}>Graph</Button>
      </Box>

      {/* Current View */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {currentView === 'timeline' ? (
          <TimelineView onTimeFilterChange={(timeRange) => {
            if (timeRange) {
              updateFilter('timeRange', { start: timeRange.start, end: timeRange.end });
            } else {
              updateFilter('timeRange', undefined);
            }
          }} />
        ) : currentView === 'table' ? (
          <TableView events={events} />
        ) : currentView === 'map' ? (
          <MapView />
        ) : (
          <GraphView />
        )}
      </Box>
    </Box>
  );

  // Right inspector
  const rightInspector = <InspectorPanel />;

  // Unified deep link outbound sync including view param (view auto-updates on change)
  useEffect(() => {
    const updater = new DebouncedURLUpdater();
    updater.update({
      filters: encodeFilters(filters),
      selected: selectedItem?.id,
    view: currentView,
    board: activeBoardId || undefined
    });
    /*
     * Cancelled on the next change and on unmount. Without this, each change
     * made a fresh updater and nothing cancelled the last one, so nothing was
     * debounced — every change wrote the URL 300 ms later — and a write still
     * pending when the workbench unmounted landed on whatever page came next,
     * stamping this app's filters onto its URL. In tests it landed after the
     * environment was torn down: the intermittent "window is not defined" that
     * deepLink.integration.test.tsx recorded as one run in eighteen.
     */
    return () => updater.cancel();
  }, [filters, selectedItem, currentView, activeBoardId]);

  return (
    <WorkbenchLayout
      leftRail={leftRail}
      centerView={centerView}
      rightInspector={rightInspector}
    />
  );
};

/**
 * Analysis Workbench - New IntelAnalyzer
 *
 * Replaces the old IntelAnalyzer with a workbench for analysis:
 * - Left: Filters and boards
 * - Center: Timeline/Map/Graph/Table views
 * - Right: Inspector
 */

const AnalysisWorkbench: React.FC = () => {
  return (
    // The analyzer's surfaces are black. It had its own dark theme because MUI's
    // light default made secondary text black on black; the root theme is the
    // token palette now (plan item 8.1), dark everywhere.
    <IntelWorkspaceProvider>
      <BoardsProvider>
        <FilterProvider>
          <SelectionProvider>
            <CorrelationProvider>
              <DeepLinkSync />
              {/* Publishes correlation output to the globe. Renders nothing;
                  must be inside CorrelationProvider, which is where the
                  findings come from. */}
              <GlobeIntelPublisher />
              <WorkbenchContent />
            </CorrelationProvider>
          </SelectionProvider>
        </FilterProvider>
      </BoardsProvider>
    </IntelWorkspaceProvider>
  );
};

export default AnalysisWorkbench;
