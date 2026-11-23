/**
 * A report read from a relay can be reviewed from its detail (plan item 5.1);
 * one written here and never read from a relay has nothing to review yet.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

const author = 'a'.repeat(64);
const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Berth 4 cranes at night', content: 'Body', author, category: 'GENERAL', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', collaborators: [], ...over,
});
const open = (r: IntelReportUI) => render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: reviews', () => {
  it('offers the reviews of a report read from a relay', async () => {
    open(report({ id: `30023:${author}:intel-1`, nostrEventId: 'e'.repeat(64), nostrKind: 30023 }));
    expect(await screen.findByTestId('report-reviews')).toBeTruthy();
  });
  it('offers none for a report never read from a relay', () => {
    open(report());
    expect(screen.queryByTestId('report-reviews')).toBeNull();
  });
});
