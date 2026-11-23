/**
 * The Mission Package backend (MissionService, MissionPackageBuilder,
 * MissionPackageBroadcastService) was fully built, tested at the service
 * layer, and could sign and broadcast a real package — nothing in the app
 * ever called any of it. This exercises the UI that finally does, end to
 * end: create a mission, attach a real Intel Report and a real Case, move
 * it through DRAFT -> PLANNING -> READY_FOR_PACKAGE, publish, and confirm
 * it reaches DISPATCHED. Mocks only the network broadcast layer (already
 * covered for real in MissionPackageBroadcastService.test.ts), matching
 * MissionService.publishToNavcom.test.ts's own established pattern.
 *
 * Interactions go through data-testid rather than getByRole(..., {name})
 * for the elements inside the detail dialog — MUI's nested Autocomplete/
 * Dialog structure here triggers a `root.getElementById is not a function`
 * crash inside dom-accessibility-api's accessible-name computation in this
 * jsdom setup; testids sidestep that computation entirely. getByText is
 * still used freely for content assertions, which don't hit that path.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import PublishReviewRoot from '../../../../components/Publishing/PublishReviewRoot';
import UndoDeletionRoot from '../../../../components/Undo/UndoDeletionRoot';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { missionService } from '../../../../services/intel/MissionService';
import { isEncryptedAtRest } from '../../../../services/intel/IntelWorkspaceManager';
import { caseManagerAdapter } from '../../../../core/intel/adapters/caseManagerAdapter';
import type { TeamMember } from '../../../../types/cyberInvestigation';
import { MissionStatus, type MissionUI } from '../../../../types/intel/MissionUI';

const publishMissionPackage = vi.fn();

// A plain class, not vi.fn().mockImplementation() — the global afterEach
// (src/setupVitest.ts) calls vi.restoreAllMocks(), which would wipe a
// mockImplementation() set on the constructor itself, and publishToNavcom
// constructs a fresh MissionPackageBroadcastService per call.
/**
 * The capability gate signs a real grant during publish, which jsdom cannot do
 * (its Uint8Array is a different realm and @noble rejects it inside
 * getEventHash) — and this suite needs jsdom for React. The gate's own
 * behaviour, including forgery refusals, is covered with real keys in
 * capability/__tests__/missionCapability.test.ts; here it is stubbed so the
 * panel's lifecycle is what gets tested.
 */
/**
 * The panel now watches the network for Mission Packages other nodes publish.
 * This suite is about the mission lifecycle, not ingest, and mounting a real
 * ingest would open relay sockets from a component test — so the hook is
 * stubbed. Its own behaviour is covered in missionPackageIngest.test.ts.
 */
/**
 * Mutable so one test can put a package on the network. The panel passing this
 * through to the view is the wiring that was missing for as long as the view
 * was: the receiver held verified manifests and the screen showed a count.
 */
const { receivedPackages } = vi.hoisted(() => ({
  receivedPackages: {
    current: {
      accepted: [] as unknown[], refused: [] as unknown[],
      counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} },
      publishers: [] as unknown[],
    },
  },
}));
// NavCom's labels are read from relays; none are reached from here.
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => receivedPackages.current,
}));

vi.mock('../../../../services/intel/capability/missionCapability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/intel/capability/missionCapability')>();
  return {
    ...actual,
    mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })),
    verifyGrantChain: () => ({ ok: true }),
  };
});

vi.mock('../../../../services/intel/MissionPackageBroadcastService', () => ({
  MissionPackageBroadcastService: class {
    publishMissionPackage(...args: unknown[]) { return publishMissionPackage(...args); }
    dispose() {}
  },
  // Capability events sent without destinations of their own default to this.
  // The panel's destinations come from the mission's distribution (plan item 0.4).
  missionPackageRelays: () => ['wss://relay.test.example'],
}));

// Show on the globe needs the globe's providers, which this suite does not render.
// MissionsPanel.showOnGlobe.test.tsx renders the panel inside them.
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
// Reviews read relays; none are reached from here.
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

const member: TeamMember = {
  pubkey: 'pk-collaborator-1',
  walletAddress: 'wallet-1',
  name: 'Aisha Knight',
  role: 'LEAD_ANALYST',
  actorType: 'human',
  specializations: [],
  status: 'ONLINE',
  joinedAt: new Date(),
  lastActivity: new Date(),
};

/**
 * These briefings declare direct observation because READY_FOR_PACKAGE now
 * requires a mission to rest on something. Declaring the basis is the honest
 * minimum for tests about the PUBLISH lifecycle rather than about evidence
 * linking — and it exercises the branch that keeps an unlinked mission's basis
 * a recorded claim instead of an unnoticed absence.
 */
async function createMissionViaUI(title: string, briefing: string) {
  fireEvent.click(await screen.findByRole('button', { name: /new mission/i }));
  const createDialog = await screen.findByTestId('create-mission-dialog');
  fireEvent.change(within(createDialog).getByTestId('mission-title-input'), { target: { value: title } });
  fireEvent.change(within(createDialog).getByTestId('mission-briefing-input'), { target: { value: briefing } });
  // Nothing is pre-selected (plan item 0.5), so every mission made here says who may receive it.
  fireEvent.click(within(createDialog).getByRole('radio', { name: /^Public/ }));
  fireEvent.click(within(createDialog).getByTestId('create-mission-submit'));
  return screen.findByTestId('mission-detail-dialog');
}

/**
 * ─── THE PUBLISH BUTTON AND THE GATE MUST AGREE ────────────────────────────
 *
 * The panel disabled Publish from its own copy of the rule:
 * `publishIsPublic && ['CONFIDENTIAL','SECRET','TOP_SECRET']
 * .includes(mission.classification ?? '')`. When Stage 6b moved the service's
 * gate onto `visibility`, the copy kept reading tiers, so the two disagreed in
 * both directions:
 *
 *   visibility 'limited', no tier  -> button ENABLED, publish then throws
 *   SECRET but visibility 'public' -> button DISABLED for a publish that would
 *                                     have been allowed
 *
 * Both are the failure the panel's own comment on restsOnEvidence warns about:
 * "A button enabled by one definition and refused by another is worse than no
 * button."
 *
 * These tests must live HERE, at the render, not at the service. A
 * predicate-vs-gate assertion in MissionService's own suite cannot fail once
 * the gate calls the predicate — mutating one moves both. I wrote that test
 * first and the mutation proved it tautological. Only the rendered button can
 * show that the PANEL asks the shared question.
 */
/**
 * Walk a freshly-created mission to READY_FOR_PACKAGE, which is the only status
 * that renders the Publish button. The handling axes are set through the
 * service before the walk so the panel reads them off the stored record — the
 * same record the gate will read.
 */
async function readyMissionMarked(
  title: string,
  marks: Partial<Pick<MissionUI, 'visibility' | 'classification' | 'relatedReports'>>,
) {
  const dialog = await createMissionViaUI(title, 'Rests on direct observation.');
  if (Object.keys(marks).length) {
    const created = (await missionService.listMissions()).find((m) => m.title === title)!;
    await missionService.saveMission({ ...created, ...marks });
  }
  fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
  await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
  fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
  await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));
  return dialog;
}

describe('MissionsPanel — times in UTC', () => {
  it('gives every time on a mission’s comments and activity in UTC with the year, and the local time on hover', async () => {
    // They were the browser's local time with no zone (decision D-E, step 9).
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Times Mission', 'Rests on direct observation.');
    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
    fireEvent.change(within(dialog).getByTestId('add-collaborator-input'), { target: { value: 'Aisha' } });
    fireEvent.click(await screen.findByText('Aisha Knight'));
    await waitFor(() => expect(within(dialog).getByText('Aisha Knight')).toBeTruthy());
    fireEvent.change(within(dialog).getByTestId('comment-input'), { target: { value: 'Timed comment.' } });
    fireEvent.click(within(dialog).getByTestId('post-comment'));
    await waitFor(() => expect(within(dialog).getByText('Timed comment.')).toBeTruthy());

    // One each for the collaborator and the comment, and more for the activity they made.
    const times = [...dialog.querySelectorAll('time')];
    expect(times.length).toBeGreaterThan(2);
    for (const time of times) {
      expect(time.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}Z$/);
      expect(time.getAttribute('title')).toMatch(/^Local: /);
    }
    expect(dialog.textContent).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});

describe('MissionsPanel — the publish button reflects the real gate', () => {
  it("disables Publish for a 'limited' mission when this build has no internal relay, with the gate's own words", async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await readyMissionMarked('Limited Mission', { visibility: 'limited' });

    await waitFor(() => {
      const button = within(dialog).getByTestId('publish-to-navcom') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
    expect(within(dialog).getByTestId('publish-destination').textContent).toMatch(/This mission is Limited, and this build has no internal relay/);
    // Its distribution is locked with the package, so the refusal says how to change it (plan item 9.13).
    expect(within(dialog).getByTestId('publish-destination').textContent).toMatch(/or mark it Public\. Its package is locked, so move it back to Planning to change it\.$/);
  });

  // Plan item 0.4: Limited goes to the team's internal relay, and only there.
  it("sends a 'limited' mission only to the team's internal relay", async () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
    try {
      render(<MissionsPanel teamMembers={[member]} />);
      const dialog = await readyMissionMarked('Team Mission', { visibility: 'limited' });

      await waitFor(() => {
        expect((within(dialog).getByTestId('publish-to-navcom') as HTMLButtonElement).disabled).toBe(false);
      });
      const destination = within(dialog).getByTestId('publish-destination').textContent ?? '';
      expect(destination).toMatch(/wss:\/\/team\.relay\.example · Internal/);
      expect(destination).not.toMatch(/Public:/);
    } finally {
      delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    }
  });

  it("leaves Publish enabled for a legacy SECRET mission overridden to 'public'", async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    /*
     * `relatedReports` rather than the direct-observation briefing the other
     * two use, and the reason is a separate pre-existing defect this test
     * uncovered: a legacy SECRET mission has its briefing ENCRYPTED at rest,
     * and restsOnEvidence regex-matches `mission.briefing` — so it cannot see
     * the direct-observation declaration inside ciphertext and refuses the
     * transition with "it rests on no evidence... say so in the briefing",
     * which the operator already did.
     *
     * Verified pre-existing at Stage 5b, before any of the handling-axis work.
     * Recorded as a follow-up rather than fixed here; a linked report keeps
     * THIS test about the button predicate instead of about that.
     */
    const dialog = await readyMissionMarked('Released Mission', {
      visibility: 'public', relatedReports: ['report-fixture-1'],
    });

    // The tier-reading copy disabled this one. The gate would have allowed it,
    // so the button must too — an explicit release is how a record gets out.
    await waitFor(() => {
      const button = within(dialog).getByTestId('publish-to-navcom') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });

  // Plan item 3.7 (decision D8): the button names the object, and where it goes beneath it.
  it('says "Publish Mission Package", with where it goes beneath', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await readyMissionMarked('Named Mission', { visibility: 'public' });
    expect(within(dialog).getByTestId('publish-to-navcom').textContent).toBe('Publish Mission Package');
    expect(within(dialog).getByTestId('publish-destination-line').textContent).toMatch(/^Goes to Navcom: \d+ public relays? \?$/);
  });

  // Plan item 0.5: a mission nobody has decided on goes nowhere. It used to publish.
  it('disables Publish for a mission nobody has decided on, and says so', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await readyMissionMarked('Unmarked Mission', { visibility: undefined });

    await waitFor(() => {
      const button = within(dialog).getByTestId('publish-to-navcom') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
    expect(within(dialog).getByTestId('publish-destination').textContent).toMatch(/Nobody has decided who may receive this mission/);
    expect(within(dialog).getByTestId('publish-destination').textContent).toMatch(/Choose Public, Limited or Private\. Its package is locked, so move it back to Planning to choose\.$/);
  });
});

/*
 * Plan items 0.4 and 0.5, decision D2: ask every time, in plain words, and let
 * the answer change until the package locks.
 */
describe('MissionsPanel — who may receive a mission', () => {
  it('asks for a new mission, with nothing chosen, and creates it only once someone chooses', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    fireEvent.click(await screen.findByRole('button', { name: /new mission/i }));
    const createDialog = await screen.findByTestId('create-mission-dialog');
    fireEvent.change(within(createDialog).getByTestId('mission-title-input'), { target: { value: 'Asked' } });
    fireEvent.change(within(createDialog).getByTestId('mission-briefing-input'), { target: { value: 'Rests on direct observation.' } });

    const radios = within(createDialog).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    expect((within(createDialog).getByTestId('create-mission-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(createDialog).getByRole('radio', { name: /^Private/ }));
    expect(within(createDialog).getByTestId('mission-distribution-consequence').textContent).toMatch(/never published/);
    fireEvent.click(within(createDialog).getByTestId('create-mission-submit'));

    await screen.findByTestId('mission-detail-dialog');
    expect((await missionService.listMissions()).find((m) => m.title === 'Asked')?.visibility).toBe('private');
  });

  it('changes who may receive a mission while it can be edited, and not once the package locks', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Changing Mission', 'Rests on direct observation.');
    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));

    fireEvent.click(within(dialog).getByRole('radio', { name: /^Limited/ }));
    await waitFor(async () => {
      expect((await missionService.listMissions()).find((m) => m.title === 'Changing Mission')?.visibility).toBe('limited');
    });

    fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
    await waitFor(async () => {
      expect((await missionService.listMissions()).find((m) => m.title === 'Changing Mission')?.visibility).toBe('public');
    });
    fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));
    expect((within(dialog).getByRole('radio', { name: /^Limited/ }) as HTMLInputElement).disabled).toBe(true);
  });
});

describe('MissionsPanel — end-to-end assembly and publish', () => {
  it('records objectives being added, completed and removed', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    // Objectives were settable only at creation, and toggling one wrote
    // nothing to the log — so three vocabulary entries had no producer. A log
    // showing a mission's objectives changing is the difference between a
    // record of the work and a snapshot of its final state.
    const dialog = await createMissionViaUI('Objective Mission', 'Rests on direct observation.');

    fireEvent.change(within(dialog).getByTestId('new-objective-input'), {
      target: { value: 'Observe the north approach' },
    });
    fireEvent.click(within(dialog).getByTestId('add-objective'));

    await waitFor(() => expect(within(dialog).getByText('Observe the north approach')).toBeTruthy());

    const mission = (await missionService.listMissions()).find((m) => m.title === 'Objective Mission');
    expect(mission?.objectives).toHaveLength(1);
    expect(mission?.activityLog.some((a) => a.action === 'OBJECTIVE_ADDED')).toBe(true);
  });

  beforeEach(() => {
    publishMissionPackage.mockReset();
  });

  it('creates a mission, attaches a real report and case, and shows them', async () => {
    await intelReportService.createReport(
      { title: 'Anomalous relay traffic', content: 'Details...', category: 'general', tags: [] },
      'analyst-1'
    );
    const caseId = await caseManagerAdapter.addCase({ title: 'Operation Night Watch', description: 'Tracking activity.' });
    expect(caseId).not.toBeNull();

    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Recon Sweep', 'Assess the anomaly.');
    expect(within(dialog).getByText('Recon Sweep')).toBeTruthy();

    fireEvent.change(within(dialog).getByTestId('attach-report-input'), { target: { value: 'Anomalous' } });
    fireEvent.click(await screen.findByText('Anomalous relay traffic'));
    await waitFor(() => expect(within(dialog).getByText('Anomalous relay traffic')).toBeTruthy());

    fireEvent.change(within(dialog).getByTestId('attach-case-input'), { target: { value: 'Night Watch' } });
    fireEvent.click(await screen.findByText('Operation Night Watch'));
    await waitFor(() => expect(within(dialog).getByText('Operation Night Watch')).toBeTruthy());
  });

  it('moves a mission through its full lifecycle and publishes a signed, broadcast package', async () => {
    publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 3, relaysTried: 5 });

    render(<><MissionsPanel teamMembers={[member]} /><PublishReviewRoot /></>);
    const dialog = await createMissionViaUI('Full Cycle Mission', 'Full lifecycle test. Rests on direct observation.');

    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));

    fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));

    fireEvent.click(within(dialog).getByTestId('publish-to-navcom'));
    // Plan item 0.1: the publish review opens first, and nothing goes until it is confirmed.
    const confirm = await screen.findByTestId('publish-review-confirm');
    expect(confirm.textContent).toMatch(/^Publish Mission Package to \d+ (public|local) relays?/);
    expect(publishMissionPackage).not.toHaveBeenCalled();
    // The first publish from a key asks "you are the publisher" first.
    const understand = screen.queryByRole('checkbox', { name: 'I understand' });
    if (understand) fireEvent.click(understand);
    fireEvent.click(confirm);

    await waitFor(() => expect(publishMissionPackage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('DISPATCHED'));
    expect(await within(dialog).findByText(/broadcast to navcom/i)).toBeTruthy();
    // Plan item 0.7: the receipt, kept and shown.
    expect(within(dialog).getByTestId('dispatch-receipt').textContent).toContain('Sent to 3 of 5 relays');
  });

  it('leaves a mission at PACKAGED on a failed broadcast, and Retry Publish recovers it', async () => {
    publishMissionPackage
      .mockResolvedValueOnce({ success: false, error: 'relay unreachable', relaysOk: 0, relaysTried: 5 })
      .mockResolvedValueOnce({ success: true, eventId: 'evt-2', relaysOk: 2, relaysTried: 5 });

    render(<><MissionsPanel teamMembers={[member]} /><PublishReviewRoot /></>);
    const dialog = await createMissionViaUI('Flaky Relay Mission', 'Should recover from a failed broadcast. Rests on direct observation.');

    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
    fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));

    fireEvent.click(within(dialog).getByTestId('publish-to-navcom'));
    const firstConfirm = await screen.findByTestId('publish-review-confirm');
    const understand = screen.queryByRole('checkbox', { name: 'I understand' });
    if (understand) fireEvent.click(understand);
    fireEvent.click(firstConfirm);
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PACKAGED'));
    expect(await within(dialog).findByText(/^Nothing was published: no relay took it\./)).toBeTruthy();
    // Plan item 0.7: DISPATCHED comes only from a relay's receipt, never a button.
    expect(within(dialog).queryByTestId('transition-to-DISPATCHED')).toBeNull();
    expect(within(dialog).getByTestId('last-publish-attempt').textContent).toContain('0 of 5 relays');

    fireEvent.click(within(dialog).getByTestId('retry-publish'));
    // The retry is reviewed too, and shows the package kept at packaging.
    const again = await screen.findByTestId('publish-review-confirm');
    expect(again.textContent).toMatch(/^Send Mission Package again to/);
    fireEvent.click(again);
    await waitFor(() => expect(publishMissionPackage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('DISPATCHED'));
    // The retry sent the package that was signed, not a rebuilt one.
    expect(publishMissionPackage.mock.calls[1][0]).toEqual(publishMissionPackage.mock.calls[0][0]);
    expect(within(dialog).getByTestId('dispatch-receipt').textContent).toContain('Sent to 2 of 5 relays');
  });

  // Work package W1c: a package no relay took waits on this device, signed, and goes by itself.
  it('says a package no relay took waits on this device, in place of Retry Publish, until it goes or is cancelled', async () => {
    const signed = { id: `e${'2'.repeat(63)}`, pubkey: 'a'.repeat(64), kind: 30079, created_at: 1, tags: [['d', 'starcom_mission_package_w']], content: '{}', sig: 'x' };
    publishMissionPackage.mockResolvedValueOnce({ success: false, error: 'relay unreachable', relaysOk: 0, relaysTried: 5, signed });

    render(<><MissionsPanel teamMembers={[member]} /><PublishReviewRoot /></>);
    const dialog = await createMissionViaUI('Offline Mission', 'Sent from a train. Rests on direct observation.');
    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
    fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));
    fireEvent.click(within(dialog).getByTestId('publish-to-navcom'));
    const confirm = await screen.findByTestId('publish-review-confirm');
    const understand = screen.queryByRole('checkbox', { name: 'I understand' });
    if (understand) fireEvent.click(understand);
    fireEvent.click(confirm);

    const line = await within(dialog).findByTestId('mission-package-kept');
    expect(line.textContent).toMatch(/^Your Mission Package waits to send: no relay answered\./);
    expect(within(dialog).queryByText(/^Nothing was published/)).toBeNull();
    expect(within(dialog).queryByTestId('retry-publish')).toBeNull();
    expect(within(dialog).queryByTestId('last-publish-attempt')).toBeNull();

    fireEvent.click(within(line).getByRole('button', { name: 'Cancel sending' }));
    await waitFor(() => expect(within(dialog).queryByTestId('mission-package-kept')).toBeNull());
    expect(within(dialog).getByTestId('retry-publish')).toBeTruthy();
  });

  // Plan item 1.6, story S18: a mission card was a Paper with onClick, so it
  // could not be reached or opened from the keyboard.
  it('opens a mission from the keyboard', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Keyboard Mission', 'Rests on direct observation.');
    fireEvent.click(within(dialog).getByRole('button', { name: /^close$/i }));
    await waitFor(() => expect(screen.queryByTestId('mission-detail-dialog')).toBeNull());

    const card = await screen.findByRole('button', { name: /Keyboard Mission/ });
    card.focus();
    expect(document.activeElement).toBe(card);
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(await screen.findByTestId('mission-detail-dialog')).toBeTruthy();
  });

  it('locks what the package carries from READY_FOR_PACKAGE on, and says how to unlock it', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Locking Mission', 'Rests on direct observation.');
    expect((within(dialog).getByTestId('attach-report-input') as HTMLInputElement).disabled).toBe(false);

    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
    fireEvent.click(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));

    expect(within(dialog).getByTestId('package-locked').textContent).toMatch(/Move it back to Planning to edit it\./);
    // Its distribution locks with it, and says so where it is shown (plan item 9.13).
    expect(within(dialog).getByTestId('mission-distribution-consequence').textContent).toMatch(/^Its package is locked, so move it back to Planning to change it\./);
    expect((within(dialog).getByTestId('attach-report-input') as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByTestId('new-objective-input') as HTMLInputElement).disabled).toBe(true);
  });

  it('posts a comment and adds a collaborator from the team roster', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Collab Mission', 'Team coordination test.');

    fireEvent.change(within(dialog).getByTestId('add-collaborator-input'), { target: { value: 'Aisha' } });
    fireEvent.click(await screen.findByText('Aisha Knight'));
    await waitFor(() => expect(within(dialog).getByText('Aisha Knight')).toBeTruthy());

    fireEvent.change(within(dialog).getByTestId('comment-input'), { target: { value: 'Looks good to proceed.' } });
    fireEvent.click(within(dialog).getByTestId('post-comment'));
    await waitFor(() => expect(within(dialog).getByText('Looks good to proceed.')).toBeTruthy());
  });

  /**
   * Arriving from a case attaches that case — to THAT mission, and no other.
   *
   * The ref guarding this was checked and never set, so the arrival case stayed
   * attached to every mission created afterwards in the same visit. That
   * matters because relatedCases is what assertRestsOnEvidence reads: a mission
   * could clear the evidence gate on a case nobody chose for it, satisfied by
   * an accident of navigation. A mission resting on the wrong thing is harder
   * to notice than one resting on nothing.
   */
  it('attaches the arrival case to the mission built from it', async () => {
    const [existing] = await caseManagerAdapter.getCases();
    render(<MissionsPanel teamMembers={[member]} missionFromCase={existing.id} />);

    const createDialog = await screen.findByTestId('create-mission-dialog');
    fireEvent.change(within(createDialog).getByTestId('mission-title-input'), { target: { value: 'From the case' } });
    fireEvent.change(within(createDialog).getByTestId('mission-briefing-input'), { target: { value: 'Rests on the case that led here.' } });
    fireEvent.click(within(createDialog).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(createDialog).getByTestId('create-mission-submit'));

    await screen.findByTestId('mission-detail-dialog');
    const created = (await missionService.listMissions()).find((m) => m.title === 'From the case');
    expect(created?.relatedCases).toContain(existing.id);
  });

  it('does NOT attach it to a mission created by hand afterwards', async () => {
    const [existing] = await caseManagerAdapter.getCases();
    render(<MissionsPanel teamMembers={[member]} missionFromCase={existing.id} />);

    // Arrive from the case, then change your mind.
    const arrival = await screen.findByTestId('create-mission-dialog');
    fireEvent.click(within(arrival).getByTestId('create-mission-cancel'));

    await createMissionViaUI('Manual afterwards', 'Rests on direct observation.');

    const manual = (await missionService.listMissions()).find((m) => m.title === 'Manual afterwards');
    expect(manual?.relatedCases ?? []).not.toContain(existing.id);
  });
});

describe('MissionsPanel — a protected briefing that declares direct observation', () => {
  it('offers Ready for Package, because the check reads the briefing it encrypted', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Protected Witness', 'Rests on direct observation.');
    const created = (await missionService.listMissions()).find((m) => m.title === 'Protected Witness')!;
    await missionService.saveMission({ ...created, sensitivity: 'protected' });
    // Otherwise this would pass for the wrong reason.
    await waitFor(async () => {
      const stored = (await missionService.listMissions()).find((m) => m.id === created.id);
      expect(isEncryptedAtRest(stored?.briefing)).toBe(true);
    });

    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));

    const ready = within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE') as HTMLButtonElement;
    await waitFor(() => expect(ready.disabled).toBe(false));
    fireEvent.click(ready);
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('READY_FOR_PACKAGE'));
  });
});

/**
 * ─── LOOP-BACKS FROM A MISSION ─────────────────────────────────────────────
 *
 * Two ways a mission feeds the pipeline again, both previously a trip through
 * other screens: a comment that says a report is needed becomes that report,
 * attached where it was asked for; and a dispatched mission offers to start the
 * mission that follows from it, linked to it but resting on nothing of its own
 * until someone attaches evidence.
 */
describe('MissionsPanel — loop-backs from a mission', () => {
  it('turns a comment into a new report, attached to the mission, without leaving it', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Relay Outage Mission', 'Rests on direct observation.');

    fireEvent.change(within(dialog).getByTestId('comment-input'), { target: { value: 'The relay outage needs its own report.' } });
    fireEvent.click(within(dialog).getByTestId('post-comment'));
    const [fromComment] = await within(dialog).findAllByTestId(/^report-from-comment-comment-/);
    fireEvent.click(fromComment);

    const reportDialog = await screen.findByTestId('report-from-comment-dialog');
    expect((within(reportDialog).getByTestId('report-content-input') as HTMLTextAreaElement).value)
      .toBe('The relay outage needs its own report.');
    fireEvent.change(within(reportDialog).getByTestId('report-title-input'), { target: { value: 'Relay outage, 13 September' } });
    fireEvent.click(within(reportDialog).getByTestId('report-from-comment-submit'));

    await waitFor(() => expect(within(dialog).getByText('Relay outage, 13 September')).toBeTruthy());
    const report = (await intelReportService.listReports()).find((r) => r.title === 'Relay outage, 13 September');
    expect(report).toBeTruthy();
    const mission = (await missionService.listMissions()).find((m) => m.title === 'Relay Outage Mission')!;
    expect(mission.relatedReports).toContain(report!.id);
    const link = mission.activityLog.filter((e) => e.action === 'REPORT_LINKED').at(-1);
    expect(link?.details).toMatchObject({ reportId: report!.id, fromCommentId: mission.comments[0].id });
  });

  it('offers no follow-up before a mission is dispatched', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Undispatched Mission', 'Rests on direct observation.');

    expect(within(dialog).queryByTestId('follow-up-prompt')).toBeNull();
  });

  it('starts a follow-up from a dispatched mission, linked to it and resting on nothing of its own yet', async () => {
    render(<MissionsPanel teamMembers={[member]} />);
    await createMissionViaUI('Dispatched Mission', 'Rests on direct observation.');
    const original = (await missionService.listMissions()).find((m) => m.title === 'Dispatched Mission')!;
    // Dispatched the only way a mission can be: published, with a relay's receipt.
    await missionService.saveMission({ ...original, relatedCases: ['case-evidence-1'] });
    await missionService.updateStatus(original.id, MissionStatus.PLANNING);
    await missionService.updateStatus(original.id, MissionStatus.READY_FOR_PACKAGE);
    publishMissionPackage.mockResolvedValueOnce({ success: true, eventId: 'evt-follow', relaysOk: 1, relaysTried: 5 });
    await missionService.publishToNavcom(original.id);

    fireEvent.click(await screen.findByTestId('start-follow-up'));
    const createDialog = await screen.findByTestId('create-mission-dialog');
    expect((within(createDialog).getByTestId('mission-title-input') as HTMLInputElement).value).toBe('Follow-up: Dispatched Mission');
    expect(within(createDialog).getByTestId('follow-up-note')).toBeTruthy();
    fireEvent.change(within(createDialog).getByTestId('mission-briefing-input'), { target: { value: 'What came out of it.' } });
    fireEvent.click(within(createDialog).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(createDialog).getByTestId('create-mission-submit'));

    await waitFor(() => expect(screen.getByTestId('open-followed-mission').textContent).toContain('Dispatched Mission'));
    const followUp = (await missionService.listMissions()).find((m) => m.title === 'Follow-up: Dispatched Mission')!;
    expect(followUp.metadata.followUpOf).toBe(original.id);
    expect(followUp.relatedCases).toEqual([]);
    expect(followUp.relatedReports).toEqual([]);

    fireEvent.click(screen.getByTestId('open-followed-mission'));
    await waitFor(() => expect(screen.getByTestId(`open-follow-up-${followUp.id}`)).toBeTruthy());
  });
});

describe('MissionsPanel — packages received from other nodes', () => {
  it('shows what arrived from the network, not only how much', async () => {
    // The receiver verified this; the screen used to render the number 1 and
    // nothing else, so an operator could not see which mission had arrived.
    receivedPackages.current = {
      accepted: [{
        event: { id: 'evt-1', pubkey: 'b778a0d16f78f237bedca54c1a65f893', created_at: 1, kind: 30079, tags: [], content: '', sig: '' },
        check: {
          ok: true,
          manifest: {
            id: 'pkg-1', name: 'Coastal survey handoff', version: '1.0.0',
            description: 'Objectives only.', visibility: 'public',
            createdAt: '2026-07-27T21:24:00.000Z', author: 'Navcom', license: 'CC-BY-4.0',
            reports: [], intel: [], assets: [], metadata: {},
          },
        },
        relay: 'wss://record.cosmiccodex.app',
      }],
      refused: [],
      counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
      publishers: [{ pubkey: 'b778a0d16f78f237bedca54c1a65f893', accepted: 1, refused: 0 }],
    };
    render(<MissionsPanel teamMembers={[member]} />);
    await waitFor(() => expect(screen.getByTestId('received-packages')).toBeTruthy());
    expect(screen.getByTestId('received-package-row').textContent).toContain('Coastal survey handoff');
    // A person's own missions come under them (D-MF, MF1); MissionsPanel.ownMissions.test says the empty line.
    expect(screen.getByTestId('own-missions-heading').textContent).toBe('Your missions');
    receivedPackages.current = {
      accepted: [], refused: [],
      counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} },
      publishers: [],
    };
  });
});

/**
 * ─── DELETES YOU CAN TAKE BACK (plan item 0.6) ─────────────────────────────
 *
 * No screen could delete a mission. An objective's removal could not be taken
 * back, and its log entry kept only its text. And a link to a deleted report
 * still counted as evidence, while the screen dropped it from view: a mission
 * read as resting on something nobody could see.
 */
describe('MissionsPanel — deletes you can take back', () => {
  const withUndo = () => render(<><MissionsPanel teamMembers={[member]} /><UndoDeletionRoot /></>);

  it('deletes a mission from its dialog, and Undo brings it back to the list', async () => {
    withUndo();
    const dialog = await createMissionViaUI('Short-lived mission', 'Rests on direct observation.');

    fireEvent.click(within(dialog).getByTestId('delete-mission'));
    await waitFor(() => expect(screen.queryByTestId('mission-detail-dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Short-lived mission')).toBeNull());
    expect(screen.getByText('Mission "Short-lived mission" deleted.')).toBeTruthy();

    fireEvent.click(screen.getByText('Undo'));
    expect(await screen.findByText('Short-lived mission')).toBeTruthy();
  });

  it('removes an objective with Undo, which puts the same one back where it was', async () => {
    withUndo();
    const dialog = await createMissionViaUI('Objectives with undo', 'Rests on direct observation.');
    for (const text of ['First step', 'Second step']) {
      fireEvent.change(within(dialog).getByTestId('new-objective-input'), { target: { value: text } });
      fireEvent.click(within(dialog).getByTestId('add-objective'));
      await waitFor(() => expect(within(dialog).getByText(text)).toBeTruthy());
    }

    fireEvent.click(within(dialog).getByLabelText('Remove objective "First step"'));
    await waitFor(() => expect(within(dialog).queryByText('First step')).toBeNull());

    fireEvent.click(await screen.findByText('Undo'));
    await waitFor(() => expect(within(dialog).getByText('First step')).toBeTruthy());
    const mission = (await missionService.listMissions()).find((m) => m.title === 'Objectives with undo')!;
    expect(mission.objectives.map((o) => o.description)).toEqual(['First step', 'Second step']);
  });

  it('shows a link to a deleted report as deleted, and does not let the mission rest on it', async () => {
    await intelReportService.createReport(
      { title: 'Sole basis report', content: 'Seen at the site.', category: 'general', tags: [] }, 'analyst-1',
    );
    withUndo();
    const dialog = await createMissionViaUI('Rests on one report', 'Assess the site.');
    fireEvent.change(within(dialog).getByTestId('attach-report-input'), { target: { value: 'Sole basis' } });
    fireEvent.click(await screen.findByText('Sole basis report'));
    await waitFor(() => expect(within(dialog).getByText('Sole basis report')).toBeTruthy());
    fireEvent.click(within(dialog).getByTestId('transition-to-PLANNING'));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING'));
    expect(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE')).not.toHaveProperty('disabled', true);

    const report = (await intelReportService.listReports()).find((r) => r.title === 'Sole basis report')!;
    await act(async () => { await intelReportService.deleteReport(report.id); });

    expect(await within(dialog).findByText('Sole basis report (deleted)')).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE')).toHaveProperty('disabled', true));

    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(within(dialog).getByText('Sole basis report')).toBeTruthy());
    await waitFor(() => expect(within(dialog).getByTestId('transition-to-READY_FOR_PACKAGE')).toHaveProperty('disabled', false));
  });
});

describe('MissionsPanel — sample material (plan item 0.9)', () => {
  it('marks a sample mission, and will not offer to publish it, saying why', async () => {
    const created = await missionService.createMission({
      title: 'Seeded mission', briefing: 'Rests on direct observation.', visibility: 'public', sample: true,
    });
    await missionService.updateStatus(created.id, MissionStatus.PLANNING);
    await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
    render(<MissionsPanel teamMembers={[member]} />);
    fireEvent.click(await screen.findByTestId(`open-mission-${created.id}`));
    const dialog = await screen.findByTestId('mission-detail-dialog');

    expect(within(dialog).getByText('Sample')).toBeTruthy();
    expect(within(dialog).getByTestId('publish-destination').textContent).toMatch(/sample material/i);
    // Going nowhere, it lists nowhere: relay addresses under "never published" contradict it.
    expect(within(dialog).getByTestId('publish-destination').textContent).not.toMatch(/wss:\/\//);
    expect(within(dialog).getByTestId('publish-to-navcom')).toHaveProperty('disabled', true);
  });

  // Plan item 9.13: a locked mission's refusal says how to choose a distribution, where one would help.
  it('says only that sample material is never published, even when nobody has decided on it', async () => {
    const created = await missionService.createMission({ title: 'Seeded, undecided', briefing: 'Rests on direct observation.', sample: true });
    await missionService.updateStatus(created.id, MissionStatus.PLANNING);
    await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
    render(<MissionsPanel teamMembers={[member]} />);
    fireEvent.click(await screen.findByTestId(`open-mission-${created.id}`));
    const dialog = await screen.findByTestId('mission-detail-dialog');

    const destination = within(dialog).getByTestId('publish-destination').textContent ?? '';
    expect(destination).toMatch(/sample material/i);
    // No distribution would change that, so it does not say how to change one.
    expect(destination).not.toMatch(/move it back to Planning/);
  });
});

describe('MissionsPanel — steps in words (plan item 1.7, story S19)', () => {
  it('moves a mission on in words, and says what it needs before it is ready', async () => {
    // "Move to PLANNING" and "Move to READY_FOR_PACKAGE" were the steps.
    render(<MissionsPanel teamMembers={[member]} />);
    const dialog = await createMissionViaUI('Steps Mission', 'Count the cranes.');
    const steps = within(dialog).getByTestId('mission-steps');
    expect(steps.textContent).not.toMatch(/Move to|[A-Z]{2,}_/);
    expect(within(dialog).getByTestId('mission-status-chip').textContent).toBe('Draft');
    fireEvent.click(within(steps).getByRole('button', { name: 'Start planning' }));
    await waitFor(() => expect(within(dialog).getByTestId('mission-status-chip').textContent).toBe('Planning'));
    expect(within(steps).getByRole('button', { name: 'Mark ready to publish' })).toHaveProperty('disabled', true);
    expect(within(steps).getByTestId('blocked-READY_FOR_PACKAGE').textContent).toMatch(/Attach an intel report or case first/);
  });
});

describe('MissionsPanel — counts that agree (plan item 1.8)', () => {
  it('counts on the card the reports its detail counts: through its cases too, and none that are gone', async () => {
    // The card said "0 reports" while the detail said "1 report behind this mission".
    const report = await intelReportService.createReport({ title: 'Cranes at night', content: 'Three cranes working after 02:00.', category: 'GENERAL', tags: [] } as never, 'npub-a');
    const caseId = await caseManagerAdapter.addCase({ title: 'Night loading', description: 'Is berth 4 loading at night?' });
    await caseManagerAdapter.linkEntitiesToCase(caseId!, [report.id]);
    const mission = await missionService.createMission({
      title: 'Counted Mission', briefing: 'Watch the berth.', relatedCases: [caseId!, 'intelcase-deleted'], relatedReports: ['intel-deleted-1', 'intel-deleted-2'],
    } as never);
    render(<MissionsPanel teamMembers={[member]} />);
    const card = await screen.findByTestId(`open-mission-${mission.id}`);
    await waitFor(() => expect(card.textContent).toMatch(/1 report behind/));
    expect(card.textContent).toMatch(/1 case(?!s)/);
    fireEvent.click(card);
    const dialog = await screen.findByTestId('mission-detail-dialog');
    expect((await within(dialog).findByTestId('mission-corroboration')).textContent).toMatch(/1 report behind/);
  });
});

describe('MissionsPanel — reviews on a dispatched package (plan item 5.1)', () => {
  it('offers the reviews of a package once it is dispatched, and not before', async () => {
    const mission = await missionService.createMission({ title: 'Reviewed Mission', briefing: 'Rests on direct observation.' } as never);
    render(<MissionsPanel teamMembers={[member]} />);
    fireEvent.click(await screen.findByTestId(`open-mission-${mission.id}`));
    let dialog = await screen.findByTestId('mission-detail-dialog');
    expect(within(dialog).queryByTestId('mission-reviews')).toBeNull();
    // As publishing records it: saveMission keeps these as they were, so the record cannot claim a dispatch.
    const { intelWorkspaceManager } = await import('../../../../services/intel/IntelWorkspaceManager');
    await intelWorkspaceManager.updateMission({
      ...(await missionService.getMission(mission.id))!,
      publishedAs: `30079:${'f'.repeat(64)}:starcom_mission_package_${mission.id}`,
      dispatchReceipt: { eventId: 'e'.repeat(64), relaysAccepted: 1, relaysTried: 1, at: '2026-09-27T00:00:00Z' },
    });
    dialog = await screen.findByTestId('mission-detail-dialog');
    expect(await within(dialog).findByTestId('mission-reviews')).toBeTruthy();
  });
});
