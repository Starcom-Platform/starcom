/**
 * A Mission Package cites the observations its linked reports rest on
 * (decision D-MX: MX19, MX22, MX24): in its event's tags, never its manifest,
 * and only for reports whose distribution reaches as far as the mission's.
 * What was prepared is what is sent; a retry and the closing cite the same.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { missionService } from '../MissionService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { intelReportService } from '../IntelReportService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { PackageManifest } from '../../exchange/types';
import { currentReview, decideReview, type PendingReview } from '../../publishing/publishReview';
import { reviewMissionPackage, reviewMissionRetry, reviewMissionClosing } from '../../publishing/missions';

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

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const RELAY = 'wss://relay.example';
const CITED = [{ eventId: A, relay: RELAY }];

const accepted = async (manifest: PackageManifest) => ({
  success: true, eventId: 'evt-cited', relaysOk: 1, relaysTried: 1,
  coordinate: `30079:${nostrIdentityService.signerPubkey()}:starcom_mission_package_${manifest.id}`,
});
const refused = async () => ({ success: false, error: 'no relay took it', relaysOk: 0, relaysTried: 1 });

const report = (id: string, over: Partial<IntelReportUI>) => intelReportService.importReport({
  id, title: id, content: 'What was there.', author: 'analyst-1', category: 'general', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
} as IntelReportUI, { strategy: 'skip' });

beforeAll(async () => {
  await report('rests-public', { visibility: 'public', cites: CITED });
  await report('rests-limited', { visibility: 'limited', cites: [{ eventId: B }] });
  await report('rests-undecided', { cites: [{ eventId: C }] });
  await report('rests-nothing', { visibility: 'public' });
  // Not linked to any mission here: what it rests on is no package's.
  await report('rests-unlinked', { visibility: 'public', cites: [{ eventId: D }] });
});

beforeEach(() => { publishMissionPackage.mockReset(); });

async function ready(title: string) {
  const created = await missionService.createMission({
    title, briefing: 'Check which cooling centres are open.', visibility: 'public',
    relatedReports: ['rests-public', 'rests-limited', 'rests-undecided', 'rests-nothing'],
  });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
}

describe("a Mission Package's citations", () => {
  it('cites what its Public linked reports rest on, counts the reports held back, and leaves the manifest without them', async () => {
    const prepared = await missionService.prepareMissionPackage((await ready('Cited')).id);
    expect(prepared.cites).toEqual(CITED);
    expect(prepared.heldBack).toBe(2);
    expect(JSON.stringify(prepared.manifest)).not.toContain(A);
  });

  it('sends what was prepared, keeps it with the package, and sends it again on a retry', async () => {
    const mission = await ready('Retried');
    publishMissionPackage.mockImplementationOnce(refused);
    const { mission: packaged } = await missionService.publishPreparedPackage(await missionService.prepareMissionPackage(mission.id));
    expect(publishMissionPackage.mock.calls[0][2]).toEqual(CITED);
    expect(packaged.status).toBe(MissionStatus.PACKAGED);
    expect(packaged.packagedCites).toEqual(CITED);
    publishMissionPackage.mockImplementationOnce(accepted);
    await missionService.retryPublish(mission.id);
    expect(publishMissionPackage.mock.calls[1][2]).toEqual(CITED);
  });

  it('keeps them through a save, whatever the caller held, and drops them with the package', async () => {
    const mission = await ready('Kept');
    publishMissionPackage.mockImplementationOnce(refused);
    const { mission: packaged } = await missionService.publishPreparedPackage(await missionService.prepareMissionPackage(mission.id));
    await missionService.saveMission({ ...packaged, packagedCites: undefined });
    expect((await missionService.getMission(mission.id))?.packagedCites).toEqual(CITED);
    await missionService.updateStatus(mission.id, MissionStatus.READY_FOR_PACKAGE);
    expect((await missionService.getMission(mission.id))?.packagedCites).toBeUndefined();
  });

  it("closes the package citing what it cited", async () => {
    const mission = await ready('Closed');
    publishMissionPackage.mockImplementationOnce(accepted);
    await missionService.publishPreparedPackage(await missionService.prepareMissionPackage(mission.id));
    await missionService.closeMission(mission.id, 'completed');
    const closing = await missionService.prepareClosingPackage(mission.id);
    expect(closing.cites).toEqual(CITED);
    publishMissionPackage.mockImplementationOnce(accepted);
    await missionService.publishPreparedClosing(closing);
    expect(publishMissionPackage.mock.calls[1][2]).toEqual(CITED);
  });
});

/** Waits for the review on screen and answers it as a person does, returning what it showed. */
async function answer(confirmed: boolean): Promise<PendingReview> {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}
const field = (shown: PendingReview, label: string) => shown.content.fields.find((f) => f.label === label)?.value;

describe('the citations, through the review', () => {
  it('the package, its retry and its closing each show what they cite, and send exactly that', async () => {
    const mission = await ready('Reviewed');
    publishMissionPackage.mockImplementationOnce(refused);
    const first = reviewMissionPackage(mission.id);
    const shown = await answer(true);
    await first;
    expect(field(shown, 'Cites')).toContain(`${A} on ${RELAY}`);
    expect(field(shown, 'Not cited')).toMatch(/^2 linked reports rest on observations/);
    expect(publishMissionPackage.mock.calls[0][2]).toEqual(CITED);

    publishMissionPackage.mockImplementationOnce(accepted);
    const retry = reviewMissionRetry(mission.id);
    const shownAgain = await answer(true);
    await retry;
    expect(field(shownAgain, 'Cites')).toContain(A.slice(0, 8));
    expect(publishMissionPackage.mock.calls[1][2]).toEqual(CITED);

    await missionService.closeMission(mission.id, 'completed');
    publishMissionPackage.mockImplementationOnce(accepted);
    const closing = reviewMissionClosing(mission.id);
    const shownClosing = await answer(true);
    await closing;
    expect(field(shownClosing, 'Cites')).toContain(A.slice(0, 8));
    expect(publishMissionPackage.mock.calls[2][2]).toEqual(CITED);
  });
});
