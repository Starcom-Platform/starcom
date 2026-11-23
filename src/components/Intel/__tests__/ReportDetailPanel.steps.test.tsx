/**
 * Where a report stands, and how it got there, in words (plan item 1.7). The
 * badge read "SUBMITTED" and the history "STATUS_CHANGED DRAFT→SUBMITTED",
 * without saying who moved it, so an approval did not say whose it was.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report: IntelReportUI = {
  id: 'r1', title: 'Report', content: 'Body', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)), updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'APPROVED', collaborators: [],
  history: [
    { timestamp: '2026-09-14T10:15:00Z', action: 'STATUS_CHANGED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' },
    { timestamp: '2026-09-14T11:15:00Z', action: 'STATUS_CHANGED', fromStatus: 'REVIEWED', toStatus: 'APPROVED', user: 'Aisha' },
  ],
};

describe('ReportDetailPanel: where it stands', () => {
  it('names its status, and each move in its history with who made it, in words', () => {
    const { container } = render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);
    expect(screen.getByTestId('report-status').textContent).toBe('Approved');
    // The one status chip (BD24): done, in green with a check.
    expect(screen.getByTestId('report-status').getAttribute('data-tone')).toBe('done');
    expect(screen.getByText(/Draft → Submitted for review/)).toBeTruthy();
    expect(screen.getByText(/Reviewed → Approved/).textContent).toMatch(/by Aisha/);
    expect(container.textContent).not.toMatch(/STATUS_CHANGED|SUBMITTED|APPROVED/);
  });
});
