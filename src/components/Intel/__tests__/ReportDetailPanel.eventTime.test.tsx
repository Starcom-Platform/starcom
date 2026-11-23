/**
 * The report detail shows when the event happened, apart from when the report
 * was written, and both in UTC (decision D-E).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1',
  title: 'Report',
  content: 'Body',
  author: 'a',
  category: 'GENERAL',
  tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)),
  updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'DRAFT',
  collaborators: [],
  ...over,
});

const renderPanel = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: when it happened, and when it was written', () => {
  it('shows when the event happened, as closely as it is known, with the local time on hover', () => {
    renderPanel(report({ startDate: new Date(Date.UTC(2026, 6, 27)), timePrecisionMs: 86_400_000 }));
    expect(screen.getByText('Happened: 27 Jul 2026')).toHaveAttribute('title', expect.stringMatching(/^Local: /));
  });

  it('says nothing about when it happened when the report does not say', () => {
    renderPanel(report());
    expect(screen.queryByText(/^Happened:/)).not.toBeInTheDocument();
  });

  it('shows when it was written in UTC, marked Z', () => {
    renderPanel(report());
    expect(screen.getByText('Created: 14 Sep 2026 09:05Z')).toBeInTheDocument();
    expect(screen.getByText('Updated: 14 Sep 2026 09:30Z')).toBeInTheDocument();
  });
});
