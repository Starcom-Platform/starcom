/**
 * A report's history gives each change's time in UTC, with the year and the local
 * time on hover (decision D-E, settled 2026-09-14 for step 9). It printed the
 * browser's local time with no zone.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { localTimeTitle } from '../../../utils/utcTime';

const changedAt = Date.UTC(2026, 8, 14, 10, 15);

const report: IntelReportUI = {
  id: 'r1',
  title: 'Report',
  content: 'Body',
  author: 'a',
  category: 'GENERAL',
  tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)),
  updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'SUBMITTED',
  collaborators: [],
  history: [{ timestamp: new Date(changedAt).toISOString(), action: 'STATUS_CHANGED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }],
};

describe('ReportDetailPanel: its history', () => {
  it('gives when each change happened in UTC, with the year and the local time on hover', () => {
    render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);
    expect(screen.getByText('14 Sep 2026 10:15Z')).toHaveAttribute('title', localTimeTitle(changedAt));
  });
});
