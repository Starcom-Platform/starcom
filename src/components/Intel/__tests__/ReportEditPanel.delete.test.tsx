/**
 * Deleting a report (plan item 0.6, story S14). It asked "This cannot be
 * undone" and meant it. A deletion is now held ten seconds with Undo, so the
 * question is gone: Delete deletes, and the Undo bar is the way back.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const service = vi.hoisted(() => ({ saveReport: vi.fn(), getReport: vi.fn(), updateStatus: vi.fn(), deleteReport: vi.fn() }));
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: service }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { getPubkey: () => null, signerPubkey: () => null } }));

import ReportEditPanel from '../ReportEditPanel';

const report: IntelReportUI = {
  id: 'r1', title: 'Bridge', content: 'Long enough content', author: 'a', category: 'GENERAL',
  tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
};

afterEach(() => { vi.restoreAllMocks(); });

describe('ReportEditPanel: Delete', () => {
  it('deletes without asking, and closes the editor', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    service.deleteReport.mockReset().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<ReportEditPanel report={report} onCancel={onCancel} onSaved={() => {}} onStatusChanged={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(service.deleteReport).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});
