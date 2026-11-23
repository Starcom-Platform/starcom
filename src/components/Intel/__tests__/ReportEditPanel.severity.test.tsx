/**
 * Severity in the report editor (plan item 1.9, story S7). It offered ROUTINE,
 * PRIORITY and IMMEDIATE and showed ROUTINE for a report nobody had assessed,
 * so saving any edit wrote an assessment nobody made.
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
const saved = () => service.saveReport.mock.calls[0][0] as IntelReportUI;

describe('ReportEditPanel: severity', () => {
  beforeEach(() => {
    service.saveReport.mockReset().mockResolvedValue(undefined);
    service.getReport.mockReset().mockImplementation(async () => saved());
  });

  it('offers the Cases scale as five buttons, and shows a report nobody assessed as not assessed (BD17)', () => {
    renderPanel(report());
    const radios = within(screen.getByRole('radiogroup', { name: /^Severity/ })).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Not assessed', 'Low', 'Medium', 'High', 'Critical']);
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
  });

  it('does not assess a report that an edit elsewhere saves', async () => {
    renderPanel(report());
    fireEvent.change(screen.getByDisplayValue('Report'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().priority).toBeUndefined();
  });

  it('saves the severity chosen', async () => {
    renderPanel(report({ priority: 'LOW' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /^Severity/ })).getByRole('radio', { name: 'Critical' }));
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().priority).toBe('CRITICAL');
  });
});
