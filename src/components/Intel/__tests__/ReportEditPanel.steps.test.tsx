/**
 * A report moves on in words, through the moves its table allows (plan item
 * 1.7, story S9). The editor offered every status as a code, allowed or not,
 * and let the author approve their own report.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const service = vi.hoisted(() => ({ saveReport: vi.fn(), getReport: vi.fn(), updateStatus: vi.fn(), deleteReport: vi.fn() }));
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: service }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { getPubkey: () => 'my-key', signerPubkey: () => 'my-key' } }));

import ReportEditPanel from '../ReportEditPanel';

const report = (over: Partial<IntelReportUI>): IntelReportUI => ({
  id: 'r1', title: 'Bridge', content: 'Long enough content', author: 'my-key', category: 'GENERAL',
  tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
});
const open = (r: IntelReportUI) => render(<ReportEditPanel report={r} onCancel={() => {}} onSaved={() => {}} onStatusChanged={() => {}} />);

describe('ReportEditPanel: steps', () => {
  it('offers a draft for review in words, and no status codes', async () => {
    service.updateStatus.mockReset().mockResolvedValue(report({ status: 'SUBMITTED' }));
    open(report({}));
    const steps = screen.getByTestId('report-steps');
    expect(steps.textContent).not.toMatch(/DRAFT|SUBMITTED|REVIEWED|APPROVED|ARCHIVED/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(service.updateStatus).toHaveBeenCalledWith('r1', 'SUBMITTED', 'my-key'));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('does not let its author approve it, and says so', () => {
    open(report({ status: 'REVIEWED' }));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('blocked-APPROVED').textContent).toMatch(/^Approve: someone other than its author approves it/i);
  });

  it('lets anyone else approve it', () => {
    open(report({ status: 'REVIEWED', author: 'their-key' }));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
