/**
 * Who may receive a report, in its editor (BD16, decided 2026-10-05). The
 * editor had no distribution at all: a report took one only when someone
 * exported it. It asks as the form does, and a report that has one keeps
 * having one: Decide later is offered only while nobody has decided.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const service = vi.hoisted(() => ({ saveReport: vi.fn(), getReport: vi.fn(), updateStatus: vi.fn(), deleteReport: vi.fn() }));
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: service }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { getPubkey: () => null, signerPubkey: () => null } }));

import ReportEditPanel from '../ReportEditPanel';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Report', content: 'Long enough content', author: 'a', category: 'GENERAL',
  tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
});
const renderPanel = (r: IntelReportUI) =>
  render(<ReportEditPanel report={r} onCancel={() => {}} onSaved={() => {}} onStatusChanged={() => {}} />);
const ask = () => screen.getByTestId('report-distribution');
const saved = () => service.saveReport.mock.calls[0][0] as IntelReportUI;

describe('ReportEditPanel: distribution', () => {
  beforeEach(() => {
    service.saveReport.mockReset().mockResolvedValue(undefined);
    service.getReport.mockReset().mockImplementation(async () => saved());
  });

  it('asks for an undecided report, Decide later held, and saves the choice', async () => {
    renderPanel(report());
    expect((within(ask()).getAllByRole('radio') as HTMLInputElement[]).filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
    expect(screen.getByText('Save Changes')).toHaveProperty('disabled', true);
    fireEvent.click(within(ask()).getByRole('radio', { name: /^Limited/ }));
    expect(within(ask()).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('limited');
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().visibility).toBe('limited');
  });

  it('changes a decided one, and offers no way back to undecided', async () => {
    renderPanel(report({ visibility: 'public' }));
    expect((within(ask()).getAllByRole('radio') as HTMLInputElement[]).map((r) => r.value)).toEqual(['public', 'limited', 'private']);
    fireEvent.click(within(ask()).getByRole('radio', { name: /^Private/ }));
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().visibility).toBe('private');
  });

  it('leaves the distribution as it was when an edit elsewhere saves', async () => {
    renderPanel(report());
    fireEvent.change(screen.getByDisplayValue('Report'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().visibility).toBeUndefined();
  });
});
