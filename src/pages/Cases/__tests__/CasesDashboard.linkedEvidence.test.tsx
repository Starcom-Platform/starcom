/**
 * The first product writer case.relatedEntities has ever had.
 *
 * linkEntitiesToCase existed on the adapter and was exposed through
 * useCaseManager, with zero callers in src/pages or src/components — so every
 * case in the running app had relatedEntities === []. Any resolver built on
 * that field would have returned nothing for 100% of real records while
 * passing its own fixture tests.
 *
 * Two things this suite insists on, because neither is visible from the UI:
 *
 *  - The field holds RECORD IDS, not display names. That distinction was a
 *    shipped bug once already on this exact field; see contradictionProducer's
 *    doc comment. The fixtures below give a report a title that differs from
 *    its id so a name/id confusion cannot pass.
 *  - The write must reach the ACTIVITY LOG. replayCase has folded
 *    ENTITY_LINKED/ENTITY_UNLINKED keyed on details.entityId since before any
 *    producer existed, and CaseReplayPanel is live in IntelDashboard — so
 *    without the log a populated case reconstructs as linkedEntities: [] and
 *    raises no gap, putting a confidently wrong reconstruction in front of a
 *    real reader of the one artifact built not to require trust.
 *
 * Real persistence throughout. No mocks.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { missionService } from '../../../services/intel/MissionService';
import { replayCase } from '../../../services/intel/replay/replayCase';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';

// CasesDashboard navigates now (build-a-mission-from-this-case). Mocked rather
// than wrapping these real-persistence suites in the whole router provider.
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
// Show on globe needs the globe's providers, which this suite does not render.
// CasesDashboard.showOnGlobe.test.tsx renders the dashboard inside them.
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

// Unique per test: the store persists across tests in this file, so a shared
// title makes the Autocomplete option ambiguous by the second one.
let REPORT_TITLE = '';

async function seedReport() {
  REPORT_TITLE = `Relay Traffic Anomaly ${Math.random().toString(36).slice(2, 8)}`;
  return intelReportService.createReport(
    { title: REPORT_TITLE, content: 'Body', category: 'general', tags: [] },
    'analyst-1'
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

async function openLinkDialog(title: string) {
  await screen.findByText(title);
  // A case opens as its own page now (plan item 1.2), not a dialog.
  fireEvent.click(screen.getByRole('button', { name: `View ${title}` }));
  return screen.findByTestId('case-detail');
}

async function attachReport(dialog: HTMLElement) {
  const input = within(dialog).getByTestId('link-candidate-input').querySelector('input')!;
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: REPORT_TITLE } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(REPORT_TITLE, 'i') }));
  fireEvent.click(within(dialog).getByTestId('attach-action'));
}

describe('CasesDashboard — linked evidence', () => {
  beforeEach(async () => {
    await seedReport();
  });

  afterEach(() => vi.restoreAllMocks());

  it('persists the report ID onto the case, not its title', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Linking ${Date.now()}`);
    const report = (await intelReportService.listReports()).find(r => r.title === REPORT_TITLE)!;
    expect(report.id).not.toBe(report.title); // fixture sanity: id/title differ

    const dialog = await openLinkDialog(title);
    await within(dialog).findByTestId('link-candidate-input');
    await attachReport(dialog);

    await waitFor(async () => {
      const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
      expect(saved.relatedEntities).toContain(report.id);
    });
    const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
    expect(saved.relatedEntities).not.toContain(REPORT_TITLE);
  });

  it('replays with the entity present and raises no unmodelled-action gap', async () => {
    // Red against the old code: no activity entry was written at all, so the
    // reconstruction showed nothing linked AND flagged nothing missing.
    render(<CasesDashboard />);
    const title = await createCase(`Replay ${Date.now()}`);
    const report = (await intelReportService.listReports()).find(r => r.title === REPORT_TITLE)!;

    const dialog = await openLinkDialog(title);
    await within(dialog).findByTestId('link-candidate-input');
    await attachReport(dialog);

    await waitFor(async () => {
      const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
      expect(saved.relatedEntities).toContain(report.id);
    });

    const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
    const replayed = replayCase(saved.activityLog as never);
    expect(replayed.linkedEntities).toContain(report.id);
    expect(replayed.gaps.filter(g => g.kind === 'unmodelled-action')).toHaveLength(0);
    // Attribution carries the REAL identity. nostrService creates or restores a
    // keypair at module load, so a pubkey is available here.
    expect(replayed.unattributed).toHaveLength(0);
    const linkEntry = saved.activityLog.find(e => String(e.action) === 'ENTITY_LINKED')!;
    expect(linkEntry.userId).toBe(nostrIdentityService.getPubkey());
  });

  it('unlinks symmetrically, without a removal-without-addition gap', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Unlink ${Date.now()}`);
    const report = (await intelReportService.listReports()).find(r => r.title === REPORT_TITLE)!;

    const dialog = await openLinkDialog(title);
    await within(dialog).findByTestId('link-candidate-input');
    await attachReport(dialog);
    await waitFor(() => expect(within(dialog).queryByTestId('linked-evidence-list')).toBeTruthy());

    fireEvent.click(within(dialog).getByRole('button', { name: `Unlink ${REPORT_TITLE}` }));

    await waitFor(async () => {
      const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
      expect(saved.relatedEntities).not.toContain(report.id);
    });

    const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
    const replayed = replayCase(saved.activityLog as never);
    expect(replayed.linkedEntities).not.toContain(report.id);
    expect(replayed.gaps.filter(g => g.kind === 'removal-without-addition')).toHaveLength(0);
  });

  it('records an action as UNATTRIBUTED when there is no identity, rather than naming a placeholder', async () => {
    // The only assertion that discriminates a fabricated fallback. With a real
    // pubkey present, 'operative' and the true key both look "attributed" —
    // replayCase's unattributed list is empty either way. Only the no-identity
    // case separates recording ignorance from inventing an actor, which is
    // rule 1 of the replay engine: never guess an actor, because attributing an
    // unattributed action manufactures a chain of custody.
    // Attribution reads who signs (plan item 2.2), so that is what goes missing here.
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(null);

    render(<CasesDashboard />);
    const title = await createCase(`Unattributed ${Date.now()}`);

    const dialog = await openLinkDialog(title);
    await within(dialog).findByTestId('link-candidate-input');
    await attachReport(dialog);

    await waitFor(async () => {
      const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
      expect(saved.relatedEntities).toHaveLength(1);
    });

    const saved = (await intelCaseService.listCases()).find(c => c.title === title)!;
    const replayed = replayCase(saved.activityLog as never);
    expect(replayed.unattributed.map(u => u.action)).toContain('ENTITY_LINKED');
  });

  it('says nothing about unresolvable ids while the candidate pool is still loading', async () => {
    // Deriving the count by filtering an async pool means every linked id looks
    // unresolvable on first render — the dialog would announce records missing
    // when the truth is that it has not looked yet.
    render(<CasesDashboard />);
    const title = await createCase(`Loading ${Date.now()}`);

    const dialog = await openLinkDialog(title);

    expect(within(dialog).queryByTestId('unresolved-links')).toBeNull();
  });

  it('shows the missions built from this case, derived from the forward link', async () => {
    // The back-link is DERIVED: MissionUI.relatedCases is the only stored fact,
    // and nothing is written onto the case. So attaching from the mission side
    // must be visible from the case side with no case-side write at all.
    render(<CasesDashboard />);
    const title = await createCase(`Has Missions ${Date.now()}`);
    const theCase = (await intelCaseService.listCases()).find(c => c.title === title)!;

    const mission = await missionService.createMission({
      title: 'Recon Sweep',
      briefing: 'B',
      objectives: [],
      relatedCases: [theCase.id],
    } as never);

    const dialog = await openLinkDialog(title);

    await within(dialog).findByTestId('case-missions-list');
    expect(within(dialog).getByTestId('case-missions-list').textContent).toContain('Recon Sweep');
    // And nothing was written onto the case to make that true.
    const after = (await intelCaseService.listCases()).find(c => c.id === theCase.id)!;
    expect(JSON.stringify(after)).not.toContain(mission.id);
  });

  it('says none rather than showing a spinner when a case has no missions', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`No Missions ${Date.now()}`);

    const dialog = await openLinkDialog(title);

    await within(dialog).findByTestId('no-case-missions');
  });

  it('shows an empty state once loaded, rather than a phantom missing-record count', async () => {
    render(<CasesDashboard />);
    const title = await createCase(`Empty ${Date.now()}`);

    const dialog = await openLinkDialog(title);

    await within(dialog).findByTestId('no-linked-evidence');
    expect(within(dialog).queryByTestId('unresolved-links')).toBeNull();
  });
});
