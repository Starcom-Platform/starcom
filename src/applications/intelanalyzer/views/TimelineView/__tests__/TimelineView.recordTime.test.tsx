/**
 * IntelAnalyzer's timeline says how many records it placed by when they were
 * written (decision D-E).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import type { IntelReportUI } from '../../../../../types/intel/IntelReportUI';

const workspace = vi.hoisted(() => ({ value: { reports: [] as unknown[], intelItems: [] as unknown[] } }));

vi.mock('../../../state/FilterContext', () => ({ useFilter: () => ({ filters: {} }) }));
vi.mock('../../../state/SelectionContext', () => ({ useSelection: () => ({ selectedItem: null, setSelectedItem: vi.fn() }) }));
vi.mock('../../../state/CorrelationContext', () => ({ useCorrelation: () => ({ showClusters: false, anomaliesByDay: new Set<string>() }) }));
vi.mock('../../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => workspace.value }));
vi.mock('../components/TimelineHistogram', () => ({ default: () => null }));
vi.mock('../components/TimeMapBands', () => ({ default: () => null }));

import TimelineView from '../TimelineView';

const written = new Date('2026-09-12T08:00:00Z');
const report = (id: string, startDate?: Date) => ({
  id, title: id, category: 'GENERAL', tags: [], latitude: 1, longitude: 2, confidence: 0.5, author: 'analyst', entityRefs: [],
  createdAt: written, updatedAt: written, status: 'SUBMITTED', ...(startDate ? { startDate, timePrecisionMs: 86_400_000 } : {}),
}) as unknown as IntelReportUI;

describe('IntelAnalyzer TimelineView: records placed by when they were written', () => {
  it('says how many of the records on the timeline sit where they were written', () => {
    workspace.value = { reports: [report('dated', new Date('2026-07-27T00:00:00Z')), report('undated-a'), report('undated-b')], intelItems: [] };
    render(<TimelineView />);

    expect(screen.getByTestId('timeline-placed-by-written')).toHaveTextContent(
      '2 of 3 records placed by when they were written — no stated event time.'
    );
  });

  it('says nothing when every record states when its event happened', () => {
    workspace.value = { reports: [report('dated', new Date('2026-07-27T00:00:00Z'))], intelItems: [] };
    render(<TimelineView />);

    expect(screen.queryByTestId('timeline-placed-by-written')).not.toBeInTheDocument();
  });
});
