/**
 * A report's own Export follows the rule Export as file does (plan item
 * 9.13b, decision G8d). It wrote any report out in the clear, whatever its
 * distribution, while its case's bundle kept the same Private report back.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const setRecordDistribution = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../../services/intel/attention/setRecordDistribution', () => ({ setRecordDistribution }));

const report = (overrides: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Harbour master ledger', content: 'Body', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)), updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'DRAFT', collaborators: [], history: [], ...overrides,
});

let clicked: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  setRecordDistribution.mockClear();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() });
  clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

const panel = (r: IntelReportUI) => render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe("a report's Export", () => {
  it('writes a Limited report out as it is', () => {
    panel(report({ visibility: 'limited' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(clicked).toHaveBeenCalled();
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).download).toBe('report-r1-v1.intelReport.json');
  });

  it('keeps a Private report here, says so, and points to the copy sealed to you', () => {
    panel(report({ visibility: 'private' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'This report is Private: it stays in this workspace, and is never sent or exported to anyone else. To keep a copy for yourself, use Export all my work under Your key.',
    );
    expect(clicked).not.toHaveBeenCalled();
  });

  it('asks about an undecided report first, keeps the choice, then writes it out', async () => {
    panel(report());
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const asking = await screen.findByTestId('report-export-ask');
    expect(clicked).not.toHaveBeenCalled();
    fireEvent.click(within(asking).getByLabelText(/^Limited/));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(setRecordDistribution).toHaveBeenCalledWith({ kind: 'report', id: 'r1' }, 'limited');
  });

  it('writes nothing out when the choice is Private, and says it stays here', async () => {
    panel(report());
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(within(await screen.findByTestId('report-export-ask')).getByLabelText(/^Private/));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^This report is Private: it stays in this workspace/);
    expect(setRecordDistribution).toHaveBeenCalledWith({ kind: 'report', id: 'r1' }, 'private');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('writes out a report someone published, which the relay feed brought here', () => {
    panel(report({ history: [{ action: 'IMPORTED', timestamp: '2026-09-28T00:00:00.000Z', user: 'nostr' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(clicked).toHaveBeenCalled();
  });
});
