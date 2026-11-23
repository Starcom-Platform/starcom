/**
 * Closing a mission (interchange rev 11; D-MX, MX12): a dispatched mission is
 * closed as completed or cancelled, and its package is offered for
 * republishing, the same package saying `mission_state: closed`, signed by the
 * key that published it. Nothing is published without the review; closing
 * here does not wait for it.
 *
 * Same setup as MissionService.publishToNavcom.test.ts: the broadcast layer
 * and the capability crypto are mocked, everything else is real.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { missionService, missionProfileLock, missionDistributionLock } from '../MissionService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { intelReportService } from '../IntelReportService';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { verifyManifestSignature } from '../../exchange/signing';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { PackageManifest } from '../../exchange/types';

const publishMissionPackage = vi.fn();

vi.mock('../capability/missionCapability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capability/missionCapability')>();
  return {
    ...actual,
    mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })),
    verifyGrantChain: vi.fn(() => ({ ok: true, reason: undefined })),
  };
});

vi.mock('../MissionPackageBroadcastService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../MissionPackageBroadcastService')>();
  return {
    ...actual,
    MissionPackageBroadcastService: class {
      publishMissionPackage(...args: unknown[]) { return publishMissionPackage(...args); }
      dispose() {}
    },
  };
});

/** A relay takes it, at the coordinate of the key that signed it. */
const accepted = async (manifest: PackageManifest) => ({
  success: true, eventId: `evt-${manifest.profile?.missionState}`, relaysOk: 2, relaysTried: 5,
  coordinate: `30079:${nostrIdentityService.signerPubkey()}:starcom_mission_package_${manifest.id}`,
});

beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});

beforeEach(() => { publishMissionPackage.mockReset(); });

async function dispatched(title: string) {
  const created = await missionService.createMission({
    title, briefing: 'Check which cooling centres are open.', relatedReports: ['report-fixture-1'], visibility: 'public',
    // Field work names something to report (NavCom §4.3; D-MX MX28).
    objectives: ['Count the cooling centres open'],
  });
  const planning = (await missionService.updateStatus(created.id, MissionStatus.PLANNING))!;
  await missionService.saveMission({ ...planning, fieldWork: { jurisdiction: 'us-ca', until: '2099-01-31T23:59:59.000Z' } });
  await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
  publishMissionPackage.mockImplementationOnce(accepted);
  const { mission } = await missionService.publishToNavcom(created.id);
  expect(mission.status).toBe(MissionStatus.DISPATCHED);
  return mission;
}

describe('closing a mission', () => {
  it('closes a dispatched mission as completed or cancelled, and records how it ended', async () => {
    const done = await dispatched('Done');
    const calledOff = await dispatched('Called off');
    expect((await missionService.closeMission(done.id, 'completed')).closedAs).toBe('completed');
    const closed = await missionService.closeMission(calledOff.id, 'cancelled');
    expect(closed.status).toBe(MissionStatus.CLOSED);
    expect(closed.closedAs).toBe('cancelled');
    // Closing here publishes nothing: the closing is offered, and reviewed.
    expect(publishMissionPackage).toHaveBeenCalledTimes(2);
  });

  it('closes only what was dispatched, and never through updateStatus, which cannot say how it ended', async () => {
    const created = await missionService.createMission({ title: 'Never sent', briefing: '...' });
    await expect(missionService.closeMission(created.id, 'cancelled')).rejects.toThrow(/dispatched/);
    const sent = await dispatched('Sent');
    await expect(missionService.updateStatus(sent.id, MissionStatus.CLOSED)).rejects.toThrow(/completed or cancelled/);
  });

  it('keeps a closed mission locked: what was published stays as it went out', async () => {
    const closed = await missionService.closeMission((await dispatched('Locked')).id, 'completed');
    await expect(missionService.saveMission({ ...closed, briefing: 'Something else.' })).rejects.toThrow(/locked/);
    // A comment still saves.
    await missionService.saveMission({ ...closed, comments: [{ id: 'c1', content: 'Thanks all.', createdAt: new Date().toISOString(), createdBy: 'me', mentions: [], attachments: [] }] });
  });

  it('builds the closing as the same package saying closed: its address, its region and its end unchanged', async () => {
    const closed = await missionService.closeMission((await dispatched('Closing')).id, 'completed');
    const prepared = await missionService.prepareClosingPackage(closed.id);
    expect(prepared.manifest.id).toBe(closed.id);
    expect(prepared.manifest.profile).toEqual({
      missionState: 'closed', claims: 'many',
      fieldWork: { jurisdiction: 'us-ca', validUntil: Date.parse('2099-01-31T23:59:59.000Z') / 1000 },
    });
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });

  it('sends the closing, signed, and records that its package now says closed', async () => {
    const closed = await missionService.closeMission((await dispatched('Sent closed')).id, 'cancelled');
    publishMissionPackage.mockImplementationOnce(accepted);
    const { mission, broadcast } = await missionService.publishPreparedClosing(await missionService.prepareClosingPackage(closed.id));

    expect(broadcast.success).toBe(true);
    const [sent] = publishMissionPackage.mock.calls[1];
    expect(sent.profile.missionState).toBe('closed');
    expect(await verifyManifestSignature(sent)).toBe(true);
    expect(mission.status).toBe(MissionStatus.CLOSED);
    expect(mission.closingReceipt).toMatchObject({ eventId: 'evt-closed', relaysAccepted: 2, relaysTried: 5 });
    expect((await missionService.getMission(closed.id))!.closingReceipt).toBeTruthy();
  });

  it('refuses to send, as a closing, a package that does not say closed', async () => {
    const closed = await missionService.closeMission((await dispatched('Not a closing')).id, 'completed');
    const prepared = await missionService.prepareClosingPackage(closed.id);
    const open = { ...prepared, manifest: { ...prepared.manifest, profile: { ...prepared.manifest.profile!, missionState: 'open' as const } } };
    await expect(missionService.publishPreparedClosing(open)).rejects.toThrow(/not a closing/);
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });

  it('refuses a closing the mission no longer matches', async () => {
    const closed = await missionService.closeMission((await dispatched('Changed after review')).id, 'completed');
    const prepared = await missionService.prepareClosingPackage(closed.id);
    // Changed underneath, as a record from elsewhere could be.
    await intelWorkspaceManager.updateMission({ ...(await missionService.getMission(closed.id))!, briefing: 'Something else entirely.' });
    await expect(missionService.publishPreparedClosing(prepared)).rejects.toThrow(/changed after its closing was reviewed/);
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });

  it('refuses a closing once its package is known to be another key\'s, even after its review', async () => {
    const closed = await missionService.closeMission((await dispatched('Key changed')).id, 'completed');
    const prepared = await missionService.prepareClosingPackage(closed.id);
    await intelWorkspaceManager.updateMission({ ...(await missionService.getMission(closed.id))!, publishedAs: `30079:${'c'.repeat(64)}:starcom_mission_package_${closed.id}` });
    await expect(missionService.publishPreparedClosing(prepared)).rejects.toThrow(/another key/);
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });

  it('keeps the closing\'s receipt when a comment is saved from the mission as held before it', async () => {
    const closed = await missionService.closeMission((await dispatched('Receipt kept')).id, 'completed');
    publishMissionPackage.mockImplementationOnce(accepted);
    await missionService.publishPreparedClosing(await missionService.prepareClosingPackage(closed.id));
    await missionService.saveMission({ ...closed, comments: [{ id: 'c2', content: 'Closed out.', createdAt: new Date().toISOString(), createdBy: 'me', mentions: [], attachments: [] }] });
    const stored = (await missionService.getMission(closed.id))!;
    expect(stored.closingReceipt?.eventId).toBe('evt-closed');
    expect(stored.closedAs).toBe('completed');
  });

  it('says why a closed mission\'s distribution, who takes it and its field work stay as they went out', () => {
    expect(missionProfileLock({ status: MissionStatus.CLOSED })).toMatch(/published, so who takes it and its field work stay as they went out/);
    expect(missionDistributionLock({ status: MissionStatus.CLOSED, visibility: 'public' })).toMatch(/published, so who may receive it stays as it went out/);
  });

  it('records a closing no relay took, and the mission stays closed', async () => {
    const closed = await missionService.closeMission((await dispatched('Unsent closing')).id, 'completed');
    publishMissionPackage.mockResolvedValueOnce({ success: false, relaysOk: 0, relaysTried: 5, error: 'no relay reachable' });
    const { mission } = await missionService.publishPreparedClosing(await missionService.prepareClosingPackage(closed.id));
    expect(mission.status).toBe(MissionStatus.CLOSED);
    expect(mission.closingReceipt).toBeUndefined();
    expect(mission.lastPublishAttempt?.error).toBe('no relay reachable');
  });

  it('offers the closing of a dispatched mission too, for deleting it', async () => {
    const sent = await dispatched('To delete');
    const prepared = await missionService.prepareClosingPackage(sent.id);
    expect(prepared.manifest.profile?.missionState).toBe('closed');
  });

  it('refuses a closing under another key than the one that published it, which could not replace its package', async () => {
    const sent = await dispatched('Other key');
    await intelWorkspaceManager.updateMission({ ...sent, publishedAs: `30079:${'b'.repeat(64)}:starcom_mission_package_${sent.id}` });
    await expect(missionService.prepareClosingPackage(sent.id)).rejects.toThrow(/another key/);
  });

  it('refuses a closing for a mission dispatched before where it went was recorded', async () => {
    const sent = await dispatched('No address');
    await intelWorkspaceManager.updateMission({ ...sent, publishedAs: undefined });
    await expect(missionService.prepareClosingPackage(sent.id)).rejects.toThrow(/cannot be replaced/);
  });

  it('refuses a closing of a mission never published', async () => {
    const created = await missionService.createMission({ title: 'Draft', briefing: '...' });
    await expect(missionService.prepareClosingPackage(created.id)).rejects.toThrow(/published/);
  });
});
