/**
 * Undo, for each thing that can be deleted (plan item 0.6, stories S14 and
 * S23). Deleting a case, mission or report holds it for ten seconds; Undo
 * brings back the same record, and a case's or mission's own history says it
 * was restored.
 *
 * Real persistence: jsdom, crypto.subtle and fake-indexeddb, as in the
 * workspace suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect } from 'vitest';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { missionService } from '../MissionService';
import { intelReportService } from '../IntelReportService';
import { heldDeletions, undoDeletion } from '../deletionHolding';
import { CaseActivityAction } from '../../../types/intel/IntelCaseUI';
import { MissionActivityAction } from '../../../types/intel/MissionUI';

const heldFor = (label: RegExp) => heldDeletions().find((h) => label.test(h.label));

describe('Undo after a delete', () => {
  it('brings back a deleted case, the same record, with its history saying so', async () => {
    const id = await caseManagerAdapter.addCase({ title: 'Newark food banks', description: 'Which are closed.' });
    await caseManagerAdapter.deleteCase(id!);
    expect((await caseManagerAdapter.getCases()).some((c) => c.id === id)).toBe(false);

    const held = heldFor(/Case "Newark food banks"/);
    expect(held).toBeDefined();
    expect(await undoDeletion(held!.id)).toBe(true);

    const back = (await caseManagerAdapter.getCases()).find((c) => c.id === id);
    expect(back?.title).toBe('Newark food banks');
    expect(back?.activityLog.at(-1)?.action).toBe(CaseActivityAction.RESTORED);
    // When it was deleted, so the history reads "deleted then, restored now".
    expect(typeof back?.activityLog.at(-1)?.details?.deletedAt).toBe('string');
  });

  it('brings back a deleted mission, with its history saying so', async () => {
    const mission = await missionService.createMission({ title: 'Paterson shelters', briefing: 'Beds tonight.' });
    await missionService.deleteMission(mission.id);
    expect(await missionService.getMission(mission.id)).toBeNull();

    expect(await undoDeletion(heldFor(/Mission "Paterson shelters"/)!.id)).toBe(true);
    const back = await missionService.getMission(mission.id);
    expect(back?.title).toBe('Paterson shelters');
    expect(back?.activityLog.at(-1)?.action).toBe(MissionActivityAction.RESTORED);
    expect(typeof back?.activityLog.at(-1)?.details?.deletedAt).toBe('string');
  });

  it('brings back a deleted report', async () => {
    const report = await intelReportService.createReport(
      { title: 'Newark food bank 3 is closed', content: 'Seen closed.', category: 'general', tags: [] },
      'analyst-1',
    );
    await intelReportService.deleteReport(report.id);
    expect(await intelReportService.getReport(report.id)).toBeNull();

    expect(await undoDeletion(heldFor(/Report "Newark food bank 3 is closed"/)!.id)).toBe(true);
    expect((await intelReportService.getReport(report.id))?.title).toBe('Newark food bank 3 is closed');
  });

  it('brings back a removed objective: the whole objective, in the same place', async () => {
    const mission = await missionService.createMission({
      title: 'Camden pantries', briefing: 'Hours and stock.',
      objectives: ['Call the first pantry', 'Visit the second', 'Photograph the notice board'],
    });
    const second = { ...mission.objectives[1], expectedArtifact: 'a field note', effortMinutes: 45 };
    await missionService.saveMission({ ...mission, objectives: [mission.objectives[0], second, mission.objectives[2]] });

    await missionService.removeObjective(mission.id, second.id, 'pk-analyst');
    const after = (await missionService.getMission(mission.id))!;
    expect(after.objectives.map((o) => o.id)).not.toContain(second.id);
    // The log keeps the whole objective and where it was, not only its text.
    const removed = after.activityLog.at(-1)!;
    expect(removed.action).toBe(MissionActivityAction.OBJECTIVE_REMOVED);
    expect(removed.details).toMatchObject({ objectiveId: second.id, index: 1, objective: second });

    expect(await undoDeletion(heldFor(/Objective "Visit the second"/)!.id)).toBe(true);
    const back = (await missionService.getMission(mission.id))!;
    expect(back.objectives[1]).toEqual(second);
    expect(back.activityLog.at(-1)).toMatchObject({ action: MissionActivityAction.RESTORED, details: { objectiveId: second.id } });
  });
});
