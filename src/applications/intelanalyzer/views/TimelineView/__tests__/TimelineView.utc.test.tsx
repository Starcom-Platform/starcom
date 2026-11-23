/**
 * IntelAnalyzer's timeline says its time filter in UTC, with the local time on
 * hover (decision D-E, settled 2026-09-14 for step 9). It printed both ends in
 * the browser's local time with no zone.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ filters: {} as Record<string, unknown> }));

vi.mock('../../../state/FilterContext', () => ({ useFilter: () => ({ filters: state.filters }) }));
vi.mock('../../../state/SelectionContext', () => ({ useSelection: () => ({ selectedItem: null, setSelectedItem: () => {} }) }));
vi.mock('../../../state/CorrelationContext', () => ({ useCorrelation: () => ({ showClusters: false, anomaliesByDay: new Map() }) }));
vi.mock('../../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => ({ reports: [], intelItems: [] }) }));
vi.mock('../components/TimelineHistogram', () => ({ default: () => null }));
vi.mock('../components/TimeMapBands', () => ({ default: () => null }));

import TimelineView from '../TimelineView';
import { localWindowTitle } from '../../../../../utils/utcTime';

const start = Date.UTC(2026, 8, 7, 19, 7);
const end = Date.UTC(2026, 8, 14, 19, 7);

describe('TimelineView (IntelAnalyzer): the time filter line', () => {
  it('says the time filter in UTC, with the local time on hover', () => {
    state.filters = { timeRange: { start: new Date(start), end: new Date(end) } };
    render(<TimelineView />);

    const shown = screen.getByText('7 Sep 19:07Z – 14 Sep 19:07Z');
    expect(shown).toHaveAttribute('title', localWindowTitle(start, end));
    expect(shown.parentElement).toHaveTextContent('Time filter: 7 Sep 19:07Z – 14 Sep 19:07Z');
  });

  // Plan item 1.5: "Time filter: None", "Events loaded: 0", "Selected: None" and
  // "Histogram brush active" were debug output. The filter is said when there is one.
  it('says nothing about a time filter while none is set, and prints no debug counters', () => {
    state.filters = {};
    render(<TimelineView />);
    expect(screen.queryByText(/Time filter/)).toBeNull();
    expect(screen.queryByText(/Events loaded/)).toBeNull();
    expect(screen.queryByText(/^Selected:/)).toBeNull();
    expect(screen.queryByText(/Histogram brush active/)).toBeNull();
  });
});
