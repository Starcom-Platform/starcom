/**
 * A mission's record does not lie (plan item 0.7, closes story S22).
 *
 * Four ways it could:
 *
 *  - PACKAGED -> DISPATCHED was a button. A mission could read DISPATCHED when
 *    no relay had ever accepted its package.
 *  - Nothing kept what a publish achieved, so "dispatched" could not say where
 *    to, or to how many of the relays it tried.
 *  - saveMission wrote whatever record it was handed, status included, and
 *    createMission accepted a starting status: two doors around the state
 *    machine that updateStatus guards.
 *  - A retry stepped back to READY_FOR_PACKAGE and rebuilt the package from the
 *    mission as it stood by then, and nothing stopped the mission changing in
 *    between. What was packaged was not necessarily what was sent.
 *
 * Same setup as MissionService.publishToNavcom.test.ts: the broadcast layer and
 * the capability crypto are mocked, everything else is real.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { missionService } from '../MissionService';
import { intelReportService } from '../IntelReportService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { CreateMissionInput } from '../../../types/intel/MissionUI';

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

async function makeReadyMission(title: string) {
  // Public, because a mission nobody has decided on goes nowhere (plan item 0.5).
  const created = await missionService.createMission({ title, briefing: 'Two of the five sites look closed.', relatedReports: ['report-fixture-1'], visibility: 'public' });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
}

const failed = { success: false, eventId: 'evt-failed', relaysOk: 0, relaysTried: 5, error: 'no relay reachable' };
const accepted = (eventId: string, relaysOk: number) => ({ success: true, eventId, relaysOk, relaysTried: 5, coordinate: `30079:pk:starcom_mission_package_${eventId}` });


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

describe('MissionService — a record that does not lie', () => {
  beforeEach(() => {
    publishMissionPackage.mockReset();
  });

  describe('dispatch comes only from a relay receipt', () => {
    it('refuses to mark a mission dispatched by hand', async () => {
      const ready = await makeReadyMission('By hand');
      publishMissionPackage.mockResolvedValue(failed);
      await missionService.publishToNavcom(ready.id);

      await expect(missionService.updateStatus(ready.id, MissionStatus.DISPATCHED)).rejects.toThrow(/only by publishing/i);
      expect((await missionService.getMission(ready.id))?.status).toBe(MissionStatus.PACKAGED);
    });

    it('refuses to mark a mission packaged by hand', async () => {
      const ready = await makeReadyMission('Packaged by hand');

      await expect(missionService.updateStatus(ready.id, MissionStatus.PACKAGED)).rejects.toThrow(/only by publishing/i);
      expect((await missionService.getMission(ready.id))?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it('keeps the receipt: the event id, and relays accepted out of relays tried', async () => {
      const ready = await makeReadyMission('With a receipt');
      publishMissionPackage.mockResolvedValue(accepted('evt-9', 3));

      const { mission } = await missionService.publishToNavcom(ready.id);

      expect(mission.status).toBe(MissionStatus.DISPATCHED);
      expect(mission.dispatchReceipt).toMatchObject({ eventId: 'evt-9', relaysAccepted: 3, relaysTried: 5 });
      expect((await missionService.getMission(ready.id))?.dispatchReceipt).toMatchObject({ relaysAccepted: 3, relaysTried: 5 });
    });

    it('records what a failed attempt reached, without calling it a dispatch', async () => {
      const ready = await makeReadyMission('Reached nothing');
      publishMissionPackage.mockResolvedValue(failed);

      const { mission } = await missionService.publishToNavcom(ready.id);

      expect(mission.status).toBe(MissionStatus.PACKAGED);
      expect(mission.dispatchReceipt).toBeUndefined();
      expect(mission.lastPublishAttempt).toMatchObject({ relaysAccepted: 0, relaysTried: 5, error: 'no relay reachable' });
    });
  });

  describe('status changes go through one door', () => {
    it('saveMission cannot change a status', async () => {
      const created = await missionService.createMission({ title: 'Save around the door', briefing: 'b' });

      await expect(missionService.saveMission({ ...created, status: MissionStatus.DISPATCHED })).rejects.toThrow(/status/i);
      expect((await missionService.getMission(created.id))?.status).toBe(MissionStatus.DRAFT);
    });

    it('createMission cannot start past DRAFT', async () => {
      const input = { title: 'Born dispatched', briefing: 'b', status: MissionStatus.DISPATCHED } as unknown as CreateMissionInput;

      await expect(missionService.createMission(input)).rejects.toThrow(/DRAFT/);
    });
  });

  describe('editing locks from READY', () => {
    it('refuses a change to what the package carries once the mission is ready', async () => {
      const ready = await makeReadyMission('Locked');

      await expect(missionService.saveMission({ ...ready, briefing: 'Something else entirely.' })).rejects.toThrow(/locked/i);
      await expect(missionService.saveMission({ ...ready, relatedReports: [] })).rejects.toThrow(/locked/i);
      expect((await missionService.getMission(ready.id))?.briefing).toBe('Two of the five sites look closed.');
    });

    it('says how to change it, in the words the status steps use (plan item 9.13)', async () => {
      const ready = await makeReadyMission('Worded');

      await expect(missionService.saveMission({ ...ready, visibility: 'private' })).rejects.toThrow(
        'This mission is locked from Ready to publish on: that change would alter its package. Move it back to Planning to change it.',
      );
    });

    it('still takes a comment on a locked mission', async () => {
      const ready = await makeReadyMission('Commented');
      const comment = { id: 'c-1', content: 'Checked by phone.', createdAt: new Date().toISOString(), createdBy: 'pk-analyst' };

      await missionService.saveMission({ ...ready, comments: [...ready.comments, comment] });

      expect((await missionService.getMission(ready.id))?.comments.map((c) => c.id)).toContain('c-1');
    });

    it('unlocks when the mission goes back to PLANNING', async () => {
      const ready = await makeReadyMission('Reopened');
      const planning = (await missionService.updateStatus(ready.id, MissionStatus.PLANNING))!;

      await missionService.saveMission({ ...planning, briefing: 'Three of the five sites look closed.' });

      expect((await missionService.getMission(ready.id))?.briefing).toBe('Three of the five sites look closed.');
    });
  });

  describe('a retry sends the frozen package', () => {
    it('sends exactly the package that was signed, from PACKAGED, without stepping back through READY', async () => {
      const ready = await makeReadyMission('Retried');
      publishMissionPackage.mockResolvedValueOnce(failed);
      await missionService.publishToNavcom(ready.id);
      publishMissionPackage.mockResolvedValueOnce(accepted('evt-retry', 2));

      const { mission, broadcast } = await missionService.retryPublish(ready.id);

      expect(broadcast.success).toBe(true);
      expect(mission.status).toBe(MissionStatus.DISPATCHED);
      expect(mission.dispatchReceipt).toMatchObject({ eventId: 'evt-retry', relaysAccepted: 2, relaysTried: 5 });
      expect(publishMissionPackage.mock.calls[1][0]).toEqual(publishMissionPackage.mock.calls[0][0]);
      const steps = mission.activityLog
        .filter((entry) => entry.action === 'STATUS_CHANGED')
        .map((entry) => (entry.details as { toStatus: MissionStatus }).toStatus);
      expect(steps.slice(-2)).toEqual([MissionStatus.PACKAGED, MissionStatus.DISPATCHED]);
    });

    it('refuses to retry a mission that is not packaged', async () => {
      const ready = await makeReadyMission('Not packaged');

      await expect(missionService.retryPublish(ready.id)).rejects.toThrow(/PACKAGED/);
      expect(publishMissionPackage).not.toHaveBeenCalled();
    });

    it('drops the kept package when the mission goes back to READY, so the next publish builds anew', async () => {
      const ready = await makeReadyMission('Unpackaged');
      publishMissionPackage.mockResolvedValueOnce(failed);
      await missionService.publishToNavcom(ready.id);

      const back = await missionService.updateStatus(ready.id, MissionStatus.READY_FOR_PACKAGE);

      expect(back?.packagedManifest).toBeUndefined();
    });
  });
});
