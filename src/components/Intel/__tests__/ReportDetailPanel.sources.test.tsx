/**
 * A report's detail in the Intel Dashboard follows it to where it was published (D-CT, CT2), and
 * badges the big-three lenses it is sorted under (CT6).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import ReportDetailPanel from '../ReportDetailPanel';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Report', content: 'Body', author: 'a', category: 'GEOINT', tags: ['nostr'],
  createdAt: new Date(Date.UTC(2026, 9, 16, 9, 5)), updatedAt: new Date(Date.UTC(2026, 9, 16, 9, 30)),
  status: 'SUBMITTED', collaborators: [], ...over,
});
const renderPanel = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: sources and lenses', () => {
  it('lists its sources in order under a heading of its own, the first the original', () => {
    renderPanel(report({ sourceLinks: ['https://www.npa.go.jp/x', 'https://www.moj.go.jp/psia/y'], hashtags: ['lens:idc'] }));
    const section = screen.getByTestId('report-detail-sources');
    expect(within(section).getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    expect(within(section).getAllByRole('link').map((a) => a.textContent)).toEqual(['npa.go.jp', 'moj.go.jp']);
    expect(within(section).getByText('Original source')).toBeInTheDocument();
    expect(screen.getByLabelText('Lens: International Death Cults')).toHaveTextContent('IDC');
  });

  it('has no such section for a report that names no source, and no badge without a lens', () => {
    renderPanel(report());
    expect(screen.queryByTestId('report-detail-sources')).toBeNull();
    expect(screen.queryByTestId('lens-badges')).toBeNull();
  });
});
