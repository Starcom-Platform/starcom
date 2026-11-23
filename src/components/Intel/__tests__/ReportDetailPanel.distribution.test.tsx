/**
 * A report's page says who may receive it (BD3, BD18). It said nothing: the
 * distribution showed only as a question once someone tried to export it.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Report', content: 'Body', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)), updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'DRAFT', collaborators: [], ...over,
});
const show = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: distribution', () => {
  it('draws the chip beside its status and severity', () => {
    show(report({ visibility: 'private', priority: 'MEDIUM' }));
    expect(screen.getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('private');
    expect(screen.getByTestId('report-severity').getAttribute('data-level')).toBe('medium');
  });

  it('says Undecided for a report nobody decided on', () => {
    show(report());
    expect(screen.getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
    expect(screen.getByTestId('distribution-chip').getAttribute('title')).toMatch(/this report/);
  });
});
