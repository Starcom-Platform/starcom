/**
 * Add to case, from the report (plan item 1.3, story S10).
 *
 * A report could reach a case only from the case's side: open the case, search
 * for the report, attach it. The report now offers it: pick a case, say whether
 * the report supports it or argues against it (never both), or start a new
 * case from it.
 *
 * Real persistence, like the Cases suites.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReportDetailPanel from '../ReportDetailPanel';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

function makeReport(id: string, title = 'Newark food bank 3 is closed'): IntelReportUI {
  const now = new Date();
  return {
    id, title, content: 'Seen closed at 10:00.', author: 'tester', category: 'GENERAL', tags: [],
    createdAt: now, updatedAt: now, status: 'DRAFT', collaborators: [],
  };
}

async function seedCase(title: string, links: { evidence?: string[]; contradicts?: string[] } = {}) {
  const id = await caseManagerAdapter.addCase({ title, description: 'Body', visibility: 'public' });
  if (!id) throw new Error('fixture: the case was not stored');
  if (links.evidence) await caseManagerAdapter.linkEntitiesToCase(id, links.evidence);
  if (links.contradicts) await caseManagerAdapter.linkContradictionsToCase(id, links.contradicts);
  return id;
}

const renderPanel = (report: IntelReportUI) =>
  render(<ReportDetailPanel report={report} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

async function openAddToCase(caseTitle: string) {
  fireEvent.click(screen.getByRole('button', { name: /add to case/i }));
  const form = await screen.findByTestId('add-to-case');
  const picker = within(form).getByLabelText(/case/i) as HTMLSelectElement;
  await waitFor(() => expect(within(picker).getByRole('option', { name: new RegExp(caseTitle) })).toBeTruthy());
  const option = within(picker).getByRole('option', { name: new RegExp(caseTitle) }) as HTMLOptionElement;
  fireEvent.change(picker, { target: { value: option.value } });
  return form;
}

describe('Add to case, from a report', () => {
  it('adds the report to a case as evidence', async () => {
    const reportId = `report-${Math.random().toString(36).slice(2, 8)}`;
    const caseId = await seedCase('Newark food banks A');
    renderPanel(makeReport(reportId));

    const form = await openAddToCase('Newark food banks A');
    fireEvent.click(within(form).getByRole('radio', { name: /supports it \(evidence\)/i }));
    fireEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(async () => {
      const [stored] = (await caseManagerAdapter.getCases()).filter((c) => c.id === caseId);
      expect(stored.relatedEntities).toContain(reportId);
    });
    expect(await within(form).findByText(/Added to/)).toBeTruthy();
  });

  it('will not add as evidence a report the case already records as arguing against it, and says why', async () => {
    const reportId = `report-${Math.random().toString(36).slice(2, 8)}`;
    await seedCase('Newark food banks B', { contradicts: [reportId] });
    renderPanel(makeReport(reportId));

    const form = await openAddToCase('Newark food banks B');
    const evidence = within(form).getByRole('radio', { name: /supports it \(evidence\)/i }) as HTMLInputElement;
    expect(evidence.disabled).toBe(true);
    expect(within(form).getByText(/already recorded as arguing against this case/)).toBeTruthy();
  });

  it('starts a new case from the report, with the report as its evidence', async () => {
    const reportId = `report-${Math.random().toString(36).slice(2, 8)}`;
    const title = `Paterson shelters ${reportId}`;
    renderPanel(makeReport(reportId, title));

    fireEvent.click(screen.getByRole('button', { name: /add to case/i }));
    const form = await screen.findByTestId('add-to-case');
    const picker = within(form).getByLabelText(/case/i) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: '__new' } });
    fireEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(async () => {
      const created = (await caseManagerAdapter.getCases()).find((c) => c.title === title);
      expect(created?.relatedEntities).toEqual([reportId]);
    });
  });

  it('shows the report reaching the case', async () => {
    const reportId = `report-${Math.random().toString(36).slice(2, 8)}`;
    await seedCase('Newark food banks C');
    renderPanel(makeReport(reportId));
    expect((await screen.findByTestId('report-usage')).textContent).toMatch(/Not yet used/);

    const form = await openAddToCase('Newark food banks C');
    fireEvent.click(within(form).getByRole('radio', { name: /supports it \(evidence\)/i }));
    fireEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(screen.getByTestId('report-usage').textContent).toMatch(/Used by 1 case/));
  });
});
