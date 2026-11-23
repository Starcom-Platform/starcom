/**
 * A published adjudication must not claim the contradictions were ignored.
 *
 * statePosition has accepted an `addressed` map — contradiction id to how it
 * was answered — since it was written. This screen never passed it, so
 * CasePosition.addressed was always {} and every PUBLISHED adjudication told
 * every peer that ingests it that NO contradictions were addressed. A false
 * factual claim about the analysis, and unfalsifiable from the UI because there
 * was no way to say otherwise.
 *
 * The adapter was already defensive: it keeps only ids the case actually
 * carries, and only with a non-empty reason, "otherwise the count published
 * later would overstate the work done". So the gap was purely the collection
 * UI, and these assertions are about the round trip rather than the widget.
 *
 * Real persistence, no mocks on the case store — matching this directory.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../services/intel/IntelReportService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
// Show on globe needs the globe's providers, which this suite does not render.
// CasesDashboard.showOnGlobe.test.tsx renders the dashboard inside them.
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

let REPORT_TITLE = '';

async function seedReport() {
  REPORT_TITLE = `Contradicting Source ${Math.random().toString(36).slice(2, 8)}`;
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

async function raiseContradiction(dialog: HTMLElement) {
  const input = within(dialog).getByTestId('link-candidate-input').querySelector('input')!;
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: REPORT_TITLE } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(REPORT_TITLE, 'i') }));
  fireEvent.click(within(dialog).getByTestId('attach-contradiction-action'));
}

describe('CasesDashboard — addressing contradictions', () => {
  beforeEach(async () => { await seedReport(); });
  afterEach(() => vi.restoreAllMocks());

  it('offers a field per contradiction once one exists', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Addressed ${Date.now()}`);
    const dialog = await openConnections(title);

    // Nothing to answer yet, so nothing is asked.
    expect(within(dialog).queryByTestId('addressed-contradictions')).toBeNull();

    await raiseContradiction(dialog);
    await waitFor(() => expect(within(dialog).getByTestId('addressed-contradictions')).toBeTruthy());
  });

  it('persists HOW a contradiction was answered onto the position', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Addressed ${Date.now()}`);
    const dialog = await openConnections(title);
    await raiseContradiction(dialog);

    const report = (await intelReportService.listReports()).find((r) => r.title === REPORT_TITLE)!;
    const field = await within(dialog).findByTestId(`addressed-${report.id}`);
    fireEvent.change(field, { target: { value: 'Source retracted its own figure on 2026-08-02.' } });

    fireEvent.change(within(dialog).getByTestId('position-input'), {
      target: { value: 'Acme operated the shell network.' },
    });
    fireEvent.change(within(dialog).getByTestId('verdict-select'), { target: { value: 'substantiated' } });
    fireEvent.click(within(dialog).getByTestId('state-position'));

    await waitFor(async () => {
      const cases = await intelCaseService.listCases();
      const rec = cases.find((c) => c.title === title)!;
      // The whole point: the map reaches the stored position, keyed by the
      // contradiction's RECORD ID, carrying the reason.
      expect(rec.position?.addressed?.[report.id]).toMatch(/retracted its own figure/);
    });
  });

  it('records silence as silence rather than as an answer', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Addressed ${Date.now()}`);
    const dialog = await openConnections(title);
    await raiseContradiction(dialog);

    // Left blank on purpose. The adapter drops blank reasons, so an unanswered
    // contradiction must NOT appear as addressed — otherwise the published
    // count overstates the work.
    fireEvent.change(within(dialog).getByTestId('position-input'), {
      target: { value: 'Position with an unanswered contradiction.' },
    });
    fireEvent.change(within(dialog).getByTestId('verdict-select'), { target: { value: 'inconclusive' } });
    fireEvent.click(within(dialog).getByTestId('state-position'));

    await waitFor(async () => {
      const cases = await intelCaseService.listCases();
      const rec = cases.find((c) => c.title === title)!;
      expect(rec.position?.statement).toContain('unanswered contradiction');
      expect(Object.keys(rec.position?.addressed ?? {})).toEqual([]);
    });
  });

  // Plan item 1.3: a record supports a case or argues against it, not both.
  it('no longer offers a contradiction as evidence', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Exclusive ${Math.random().toString(36).slice(2, 8)}`);
    const page = await openConnections(title);
    await raiseContradiction(page);
    await within(page).findByTestId('contradiction-list');

    const input = within(page).getByTestId('link-candidate-input').querySelector('input')!;
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: REPORT_TITLE } });
    await waitFor(() => expect(screen.queryByRole('option', { name: new RegExp(REPORT_TITLE, 'i') })).toBeNull());
  });
});
