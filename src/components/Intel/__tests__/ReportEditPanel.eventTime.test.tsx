/**
 * Editing a report's event time (decision D-E). A report written before the
 * composer asked for one can be given one here.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const service = vi.hoisted(() => ({ saveReport: vi.fn(), getReport: vi.fn(), updateStatus: vi.fn(), deleteReport: vi.fn() }));
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: service }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { getPubkey: () => null, signerPubkey: () => null } }));

import ReportEditPanel from '../ReportEditPanel';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1',
  title: 'Report',
  content: 'Long enough content',
  author: 'a',
  category: 'GENERAL',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  status: 'DRAFT',
  ...over,
});

const renderPanel = (r: IntelReportUI) =>
  render(<ReportEditPanel report={r} onCancel={() => {}} onSaved={() => {}} onStatusChanged={() => {}} />);
const saved = () => service.saveReport.mock.calls[0][0] as IntelReportUI;

describe('ReportEditPanel: event time', () => {
  beforeEach(() => {
    service.saveReport.mockReset().mockResolvedValue(undefined);
    service.getReport.mockReset().mockImplementation(async () => saved());
  });

  it('starts from the event time the report records', () => {
    renderPanel(report({ startDate: new Date('2026-07-27T00:00:00Z'), timePrecisionMs: 86_400_000 }));
    expect(screen.getByLabelText('Start date (UTC)')).toHaveValue('2026-07-27');
    expect(screen.getByLabelText('Time unknown')).toBeChecked();
  });

  it('saves an event time added to a report that had none', async () => {
    renderPanel(report());
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2026-07-27' } });
    fireEvent.change(screen.getByLabelText('Start time (UTC)'), { target: { value: '21:24' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().startDate?.toISOString()).toBe('2026-07-27T21:24:00.000Z');
    expect(saved().timePrecisionMs).toBe(60_000);
  });

  it('leaves the event time as it was when the edit is elsewhere', async () => {
    // No precision stated, and a time with seconds: an edit to the title must not round it or state one.
    renderPanel(report({ startDate: new Date('2026-07-27T21:24:30Z') }));
    fireEvent.change(screen.getByDisplayValue('Report'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(service.saveReport).toHaveBeenCalledTimes(1));
    expect(saved().startDate?.toISOString()).toBe('2026-07-27T21:24:30.000Z');
    expect(saved().timePrecisionMs).toBeUndefined();
  });

  it('will not save an event time it cannot read', () => {
    renderPanel(report());
    fireEvent.change(screen.getByDisplayValue('Report'), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2026-07-27' } });
    fireEvent.change(screen.getByLabelText('End date (UTC)'), { target: { value: '2026-07-01' } });

    expect(screen.getByText('Save Changes')).toBeDisabled();
  });
});
