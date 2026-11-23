/**
 * Mission packages through the publish review (plan item 0.1).
 *
 * The properties that matter: nothing is sent without a yes; the fingerprint
 * shown is the one the ML-DSA signature covers; what was reviewed is what is
 * signed and sent, retries included; and a mission that changed after its
 * review is refused rather than sent as it now stands.
 *
 * Same setup as MissionService.record.test.ts: the broadcast layer and the
 * capability crypto are mocked, everything else is real.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import { missionService } from '../../intel/MissionService';
import { intelReportService } from '../../intel/IntelReportService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../types/intel/MissionUI';
import { manifestDigest, verifyManifestSignature } from '../../exchange/signing';
import { currentReview, decideReview } from '../publishReview';
import { reviewMissionPackage, reviewMissionRetry, reviewMissionClosing, showManifest } from '../missions';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { nip19 } from 'nostr-tools';
import type { PackageManifest } from '../../exchange/types';

const publishMissionPackage = vi.fn();

vi.mock('../../intel/capability/missionCapability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intel/capability/missionCapability')>();
  return {
    ...actual,
    mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })),
    verifyGrantChain: vi.fn(() => ({ ok: true, reason: undefined })),
  };
});

vi.mock('../../intel/MissionPackageBroadcastService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intel/MissionPackageBroadcastService')>();
  return {
    ...actual,
    MissionPackageBroadcastService: class {
      publishMissionPackage(...args: unknown[]) { return publishMissionPackage(...args); }
      dispose() {}
    },
  };
});

async function readyMission(title: string, visibility: 'public' | 'limited' = 'public') {
  const created = await missionService.createMission({ title, briefing: 'Two of the five sites look closed.', relatedReports: ['report-fixture-1'], visibility });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
}

/** Waits for the review on screen, and returns what it shows before answering. */
async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  // The first publish from a key must carry the publisher acknowledgement.
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

const accepted = { success: true, eventId: 'evt-ok', relaysOk: 3, relaysTried: 5, coordinate: '30079:pk:x' };
const failed = { success: false, eventId: 'evt-no', relaysOk: 0, relaysTried: 5, error: 'no relay reachable' };


/*
 * The missions here rest on 'report-fixture-1', and the evidence gate counts
 * only records held in this workspace (plan item 0.6), so the fixture is held.
 */
beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});

describe('reviewMissionPackage', () => {
  beforeEach(() => { publishMissionPackage.mockReset(); });
  afterEach(async () => {
    for (let i = 0; i < 50 && currentReview(); i++) {
      decideReview(currentReview()!.id, false);
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  it('shows the package, and the signature covers exactly what was shown', async () => {
    const ready = await readyMission('Newark food banks');
    publishMissionPackage.mockResolvedValue(accepted);

    const outcome = reviewMissionPackage(ready.id);
    const shown = await answer(true);
    const result = await outcome;

    expect(shown.act).toBe('Publish Mission Package');
    expect(shown.content.title).toBe('Newark food banks');
    expect(shown.content.fields.find((f) => f.label === 'Evidence')?.value).toMatch(/1 linked report\(s\) and 0 linked case\(s\), counted only/);
    expect(result.status).toBe('sent');
    const signed = (await missionService.getMission(ready.id))!.packagedManifest!;
    expect(bytesToHex(manifestDigest(signed))).toBe(shown.digest);
    expect(await verifyManifestSignature(signed)).toBe(true);
    expect(publishMissionPackage.mock.calls[0][0]).toEqual(signed);
    expect((await missionService.getMission(ready.id))!.status).toBe(MissionStatus.DISPATCHED);
  });

  it('shows where the distribution sends it: a Limited mission, only the internal relay', async () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
    try {
      const ready = await readyMission('For the team', 'limited');
      const outcome = reviewMissionPackage(ready.id);
      const shown = await answer(false);

      expect(shown.destinations).toEqual([{ address: 'wss://team.relay.example', kind: 'internal' }]);
      expect(shown.confirmLabel).toBe('Publish Mission Package to 1 internal relay');
      expect((await outcome).status).toBe('cancelled');
    } finally {
      delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    }
  });

  // Plan item 2.2: the review named this browser's key, or nobody, as the
  // signer, while an installed extension was what signed.
  it("names the extension's key as the signer when one is installed", async () => {
    const extensionPubkey = 'e'.repeat(64);
    (globalThis as { nostr?: unknown }).nostr = {
      getPublicKey: async () => extensionPubkey,
      signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: extensionPubkey, id: 'y', sig: 'x' }),
    };
    try {
      const ready = await readyMission('Signed by the extension');
      const outcome = reviewMissionPackage(ready.id);
      const shown = await answer(false);
      await outcome;

      expect(shown.signer).toBe(extensionPubkey);
    } finally {
      delete (globalThis as { nostr?: unknown }).nostr;
    }
  });

  it('sends nothing on cancel, and leaves the mission ready', async () => {
    const ready = await readyMission('Cancelled');

    const outcome = reviewMissionPackage(ready.id);
    await answer(false);

    expect((await outcome).status).toBe('cancelled');
    expect(publishMissionPackage).not.toHaveBeenCalled();
    expect((await missionService.getMission(ready.id))!.status).toBe(MissionStatus.READY_FOR_PACKAGE);
  });

  it('refuses to send a package the mission no longer matches', async () => {
    const ready = await readyMission('Changed underneath');
    const outcome = reviewMissionPackage(ready.id);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());

    // Edited in another window while the review was open: back to PLANNING, changed, and ready again.
    const planning = (await missionService.updateStatus(ready.id, MissionStatus.PLANNING))!;
    await missionService.saveMission({ ...planning, briefing: 'Three of the five sites look closed.' });
    await missionService.updateStatus(ready.id, MissionStatus.READY_FOR_PACKAGE);
    decideReview(currentReview()!.id, true, { acknowledged: true });

    await expect(outcome).rejects.toThrow(/changed after its package was reviewed/);
    expect(publishMissionPackage).not.toHaveBeenCalled();
  });

  it('shows the kept package on a retry, and sends exactly it again', async () => {
    const ready = await readyMission('Retried');
    publishMissionPackage.mockResolvedValueOnce(failed);
    const first = reviewMissionPackage(ready.id);
    await answer(true);
    await first;
    const kept = (await missionService.getMission(ready.id))!.packagedManifest!;

    publishMissionPackage.mockResolvedValueOnce(accepted);
    const retry = reviewMissionRetry(ready.id);
    const shown = await answer(true);
    const result = await retry;

    expect(shown.act).toBe('Send Mission Package again');
    expect(shown.digest).toBe(bytesToHex(manifestDigest(kept)));
    expect(result.status).toBe('sent');
    expect(publishMissionPackage.mock.calls[1][0]).toEqual(kept);
  });

  it('will not resend a kept package that is not the one reviewed', async () => {
    const ready = await readyMission('Wrong digest');
    publishMissionPackage.mockResolvedValueOnce(failed);
    const first = reviewMissionPackage(ready.id);
    await answer(true);
    await first;

    await expect(missionService.retryPublish(ready.id, 'f'.repeat(64))).rejects.toThrow(/not the one that was reviewed/);
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });

  it('refuses a retry for a mission that is not packaged, without a review', async () => {
    const ready = await readyMission('Not packaged');

    await expect(reviewMissionRetry(ready.id)).rejects.toThrow(/Only a PACKAGED mission can be retried/);
    expect(currentReview()).toBeNull();
    expect(publishMissionPackage).not.toHaveBeenCalled();
  });
});

describe('reviewMissionClosing (D-MX, MX12)', () => {
  beforeEach(() => { publishMissionPackage.mockReset(); });
  afterEach(async () => {
    for (let i = 0; i < 50 && currentReview(); i++) {
      decideReview(currentReview()!.id, false);
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  it('shows the closing, the mission state Closed, and sends exactly what it showed', async () => {
    const ready = await readyMission('Closing reviewed');
    // A relay takes each, at the coordinate of the key that signed it.
    publishMissionPackage.mockImplementation(async (manifest: PackageManifest) => ({
      success: true, eventId: 'evt-' + String(manifest.profile?.missionState), relaysOk: 2, relaysTried: 5,
      coordinate: '30079:' + nostrIdentityService.signerPubkey() + ':starcom_mission_package_' + manifest.id,
    }));
    const first = reviewMissionPackage(ready.id);
    await answer(true);
    await first;
    await missionService.closeMission(ready.id, 'completed');

    const outcome = reviewMissionClosing(ready.id);
    const shown = await answer(true);
    const result = await outcome;

    expect(shown.act).toBe('Publish the closing');
    expect(shown.content.fields.find((f) => f.label === 'Mission state')?.value).toBe('Closed');
    expect(result.status).toBe('sent');
    const sent = publishMissionPackage.mock.calls[1][0] as PackageManifest;
    expect(bytesToHex(manifestDigest(sent))).toBe(shown.digest);
    expect((await missionService.getMission(ready.id))!.closingReceipt?.eventId).toBe('evt-closed');
  });

  it('sends nothing on cancel, and the mission stays closed', async () => {
    const ready = await readyMission('Closing declined');
    publishMissionPackage.mockImplementation(async (manifest: PackageManifest) => ({
      success: true, eventId: 'evt', relaysOk: 1, relaysTried: 5,
      coordinate: '30079:' + nostrIdentityService.signerPubkey() + ':starcom_mission_package_' + manifest.id,
    }));
    const first = reviewMissionPackage(ready.id);
    await answer(true);
    await first;
    await missionService.closeMission(ready.id, 'cancelled');

    const outcome = reviewMissionClosing(ready.id);
    await answer(false);
    expect((await outcome).status).toBe('cancelled');
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
    const stored = (await missionService.getMission(ready.id))!;
    expect(stored.status).toBe(MissionStatus.CLOSED);
    expect(stored.closingReceipt).toBeUndefined();
  });
});

describe('the author the review shows (D-MX, MX7)', () => {
  const manifest = (author: string): PackageManifest => ({
    id: 'm-1', name: 'Heat relief', version: '0.1.0', description: 'Check the cooling centres.',
    createdAt: '2026-10-06T00:00:00.000Z', author, license: 'PROPRIETARY',
    reports: [], intel: [], assets: [], metadata: {},
  });
  const authorRow = (author: string) => showManifest(manifest(author)).fields.find((f) => f.label === 'Author')?.value;

  it('names a key as yours, and points to where a callsign is set', () => {
    expect(authorRow(nip19.npubEncode('a'.repeat(64)))).toMatch(/^your key, npub1.+ \(set a callsign with \/callsign\)$/);
  });

  it('shows a callsign as it is', () => {
    expect(authorRow('Night Owl')).toBe('Night Owl');
  });
});

describe('what the review shows of the profile NavCom reads (rev 11; D-MX, MX2, MX13)', () => {
  const manifest = (profile?: PackageManifest['profile']): PackageManifest => ({
    id: 'm-1', name: 'Heat relief', version: '0.1.0', description: 'Check the cooling centres.',
    createdAt: '2026-10-06T00:00:00.000Z', author: 'Night Owl', license: 'PROPRIETARY',
    reports: [], intel: [], assets: [], metadata: {}, ...(profile ? { profile } : {}),
  });
  const row = (profile: PackageManifest['profile'], label: string) =>
    showManifest(manifest(profile)).fields.find((f) => f.label === label)?.value;

  it('says whether it is open, and whether one person takes it or anybody joins', () => {
    expect(row({ missionState: 'open', claims: 'many' }, 'Mission state')).toBe('Open');
    expect(row({ missionState: 'closed', claims: 'many' }, 'Mission state')).toBe('Closed');
    expect(row({ missionState: 'open', claims: 'many' }, 'Who takes it')).toBe('Anybody who joins');
    expect(row({ missionState: 'open', claims: 'one' }, 'Who takes it')).toBe('One person');
  });

  it('names field work by its region and its end in UTC, as tagged for NavCom, never as shown there', () => {
    const fieldWork = { jurisdiction: 'us-ca', validUntil: Date.parse('2026-11-30T23:59:59Z') / 1000 };
    expect(row({ missionState: 'open', claims: 'many', fieldWork }, 'Field work')).toBe("us-ca until 30 Nov 2026 23:59Z, in the tags NavCom's map reads");
    expect(row({ missionState: 'open', claims: 'many' }, 'Field work')).toBe('No: desk work, naming no region');
  });

  it('names the agent that posted it, when an agent did (MX14)', () => {
    expect(row({ missionState: 'open', claims: 'many', agent: 'mecha_jono' }, 'Agent')).toBe('Posted by an agent, as mecha_jono');
    expect(row({ missionState: 'open', claims: 'many' }, 'Agent')).toBeUndefined();
  });

  it('shows no profile rows for a package without one', () => {
    const labels = showManifest(manifest()).fields.map((f) => f.label);
    for (const label of ['Mission state', 'Who takes it', 'Field work']) expect(labels).not.toContain(label);
  });
});
