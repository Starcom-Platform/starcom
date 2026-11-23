/**
 * IntelAnalyzer's time filter says how many records it places by when they were
 * written, while a range is set (decision D-E).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const state = vi.hoisted(() => ({
  filters: {} as Record<string, unknown>,
  workspace: { reports: [] as unknown[], intelItems: [] as unknown[] },
}));

vi.mock('../../state/FilterContext', () => ({
  useFilter: () => ({ filters: state.filters, updateFilter: vi.fn(), clearFilters: vi.fn() }),
}));
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, setShowClusters: vi.fn() }),
}));
vi.mock('../../state/BoardsContext', () => ({
  useBoards: () => ({
    boards: [], activeBoardId: null,
    addWatchTag: vi.fn(), removeWatchTag: vi.fn(), addWatchEntity: vi.fn(), removeWatchEntity: vi.fn(),
  }),
}));
vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => state.workspace }));

import FilterPanel from '../FilterPanel';

const written = new Date('2026-09-12T08:00:00Z');
const report = (id: string, startDate?: Date) => ({
  id, title: id, category: 'GENERAL', tags: [], latitude: 1, longitude: 2, confidence: 0.5, author: 'analyst', entityRefs: [],
  createdAt: written, updatedAt: written, status: 'SUBMITTED', ...(startDate ? { startDate, timePrecisionMs: 86_400_000 } : {}),
}) as unknown as IntelReportUI;

describe('FilterPanel: records the time range places by when they were written', () => {
  it('says how many, under the range, while a range is set', () => {
    state.workspace = { reports: [report('dated', new Date('2026-07-27T00:00:00Z')), report('undated')], intelItems: [] };
    state.filters = { timeRange: { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z') } };
    render(<FilterPanel />);

    expect(screen.getByTestId('time-range-placed-by-written')).toHaveTextContent(
      '1 of 2 records placed by when it was written — no stated event time.'
    );
  });

  it('says nothing while no range is set', () => {
    state.workspace = { reports: [report('undated')], intelItems: [] };
    state.filters = {};
    render(<FilterPanel />);

    expect(screen.queryByTestId('time-range-placed-by-written')).not.toBeInTheDocument();
  });
});
