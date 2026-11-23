/**
 * Collection requirements, driven through the UI that produces them.
 *
 * ─── WHY A COMPONENT TEST AND NOT MORE ADAPTER TESTS ───────────────────────
 *
 * The adapter suite already proves raiseRequirement, answerRequirement and
 * closeRequirement write what they should. What it cannot prove is that
 * anything CALLS them, and REQUIREMENT_ANSWERED sat in RECORDED_CASE_ACTIONS
 * for a while with no UI caller at all — so CaseReplayPanel was promising to
 * account for an event nothing could produce.
 *
 * guard-activity-action-coverage greps for references and says plainly that it
 * cannot answer this. A grep-based reachability check was tried and removed;
 * its doc comment records why. The remedy that works is this: drive the real
 * screen, and assert the record changed.
 *
 * Real persistence throughout. No mocks.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { CaseActivityAction } from '../../../types/intel/IntelCaseUI';

// CasesDashboard navigates now (build-a-mission-from-this-case). Mocked rather
// than wrapping these real-persistence suites in the whole router provider.
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
// Show on globe needs the globe's providers, which this suite does not render.
// CasesDashboard.showOnGlobe.test.tsx renders the dashboard inside them.
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

let REPORT_TITLE = '';

async function seedReport() {
  REPORT_TITLE = `Registry Extract ${Math.random().toString(36).slice(2, 8)}`;
  return intelReportService.createReport(
    { title: REPORT_TITLE, content: 'Body', category: 'general', tags: [] },
    'analyst-1',
  );
}

async function createCase(title: string) {
  fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/^title/i), { target: { value: title } });
  fireEvent.change(within(dialog).getByLabelText(/^description/i), { target: { value: 'Body' } });
  // Asked every time (plan item 0.5): nothing is chosen until someone chooses.
  fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
  // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
  return title;
}

async function openConnections(title: string) {
  await screen.findByText(title);
  // A case opens as its own page now (plan item 1.2), not a dialog.
  fireEvent.click(screen.getByRole('button', { name: `View ${title}` }));
  return screen.findByTestId('case-detail');
}

async function raise(dialog: HTMLElement, question: string, because: string) {
  fireEvent.change(within(dialog).getByTestId('requirement-question'), { target: { value: question } });
  fireEvent.change(within(dialog).getByTestId('requirement-because'), { target: { value: because } });
  fireEvent.click(within(dialog).getByTestId('raise-requirement'));
}

const saved = async (title: string) =>
  (await intelCaseService.listCases()).find((c) => c.title === title)!;

describe('CasesDashboard — collection requirements', () => {
  beforeEach(async () => { await seedReport(); });

  it('raises a requirement from the screen, with its justification', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Requirements ${Date.now()}`);
    const dialog = await openConnections(title);

    await raise(dialog, 'Who are the registered directors?', 'The mission cannot name a responsible party.');

    await waitFor(async () => {
      const c = await saved(title);
      expect(c.requirements?.[0]?.question).toBe('Who are the registered directors?');
    });
    const c = await saved(title);
    expect(c.requirements![0].because).toBe('The mission cannot name a responsible party.');
    // Nothing asserts satisfaction at creation. It is derived, always.
    expect(c.requirements![0].answeredBy).toEqual([]);
  });

  it('will not raise a requirement with no stated justification', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Unjustified ${Date.now()}`);
    const dialog = await openConnections(title);

    fireEvent.change(within(dialog).getByTestId('requirement-question'), { target: { value: 'Who owns it?' } });
    // The control stays disabled: a requirement nobody can justify is a wish.
    expect(within(dialog).getByTestId('raise-requirement')).toBeDisabled();
  });

  it('writes REQUIREMENT_RAISED to the activity log, so a replay can account for it', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Logged ${Date.now()}`);
    const dialog = await openConnections(title);
    await raise(dialog, 'What is the vessel registry number?', 'Needed before the package can name it.');

    await waitFor(async () => {
      const c = await saved(title);
      expect(c.activityLog.some((e) => e.action === CaseActivityAction.REQUIREMENT_RAISED)).toBe(true);
    });
  });

  it('shows a requirement as open until evidence is offered', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Open ${Date.now()}`);
    const dialog = await openConnections(title);
    await raise(dialog, 'Who signed the lease?', 'Determines which entity is liable.');

    await within(dialog).findByTestId('requirement-queue');
    expect(within(dialog).getByTestId('requirement-state-open')).toBeTruthy();
  });

  it('keeps a requirement short of answered when the offered report is a draft', async () => {
    // The property the whole model turns on: offering is not settling. A draft
    // linked as an answer must not close the question.
    render(<CasesDashboard />);
    const title = await createCase(`Draft ${Date.now()}`);
    const report = (await intelReportService.listReports()).find((r) => r.title === REPORT_TITLE)!;
    expect(report.status).toBe('DRAFT');

    const dialog = await openConnections(title);
    // Attach it as evidence first — only linked evidence can be offered.
    const input = within(dialog).getByTestId('link-candidate-input').querySelector('input')!;
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: REPORT_TITLE } });
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(REPORT_TITLE, 'i') }));
    fireEvent.click(within(dialog).getByTestId('attach-action'));
    // Wait for the attachment to reach the record: only linked evidence can be
    // offered, so raising before it lands renders an empty option list.
    await waitFor(async () => {
      const c = await saved(title);
      expect(c.relatedEntities).toContain(report.id);
    });

    await raise(dialog, 'Which registry holds it?', 'Decides where to file the request.');
    await within(dialog).findByTestId('requirement-queue');

    const sel = await within(dialog).findByTestId('answer-requirement');
    await waitFor(() => expect((sel as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(sel, { target: { value: report.id } });

    await waitFor(async () => {
      const c = await saved(title);
      expect(c.requirements![0].answeredBy).toContain(report.id);
    });
    // Recorded as offered, and the state still is not "answered".
    expect(within(dialog).queryByTestId('requirement-state-answered')).toBeNull();
    const c = await saved(title);
    expect(c.activityLog.some((e) => e.action === CaseActivityAction.REQUIREMENT_ANSWERED)).toBe(true);
  });
});
