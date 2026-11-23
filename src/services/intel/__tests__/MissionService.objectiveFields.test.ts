/**
 * An objective's detail survives being saved.
 *
 * Written after the same question was answered the wrong way for reports: a
 * field added to the UI type reached storage through a mapper that writes an
 * explicit list, was not on that list, and vanished the moment the record was
 * persisted. Every unit test on both sides of that boundary passed.
 *
 * Missions store MissionUI directly and updateMission spreads the record, so
 * these fields SHOULD survive. That is a reason to assert it, not a reason to
 * assume it — reading the write path is exactly what missed it last time.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { missionService } from '../MissionService';
import type { MissionObjective } from '../../../types/intel/MissionUI';

const detail: Omit<MissionObjective, 'id' | 'description' | 'completed'> = {
  expectedArtifact: 'a plain reading of the federal award record',
  evidenceRef: 'intel-report-7',
  effortMinutes: 45,
  limits: ['federal record facts only', 'no inferences about intent'],
  beneficiary: 'public',
  claimedBy: 'Aisha',
};

describe('MissionService — an objective keeps its detail', () => {
  beforeEach(async () => {
    await missionService.listMissions();
  });

  it('survives a save and a re-read, every field', async () => {
    const created = await missionService.createMission({
      title: 'Read the award record',
      briefing: 'Directly observed.',
      objectives: ['Read the federal award record'],
    } as never);

    const objective = { ...created.objectives[0], ...detail };
    await missionService.saveMission({ ...created, objectives: [objective] });

    const reread = await missionService.getMission(created.id);
    expect(reread?.objectives[0]).toMatchObject(detail);
  });

  it('does not invent detail for an objective nobody described', async () => {
    const created = await missionService.createMission({
      title: 'Bare mission', briefing: 'Directly observed.',
      objectives: ['Just a sentence'],
    } as never);

    const reread = await missionService.getMission(created.id);
    const bare = reread!.objectives[0];
    // A default here would be the same defect as a default in the UI: it reads
    // as an answer somebody gave.
    expect(bare.expectedArtifact).toBeUndefined();
    expect(bare.effortMinutes).toBeUndefined();
    expect(bare.beneficiary).toBeUndefined();
    expect(bare.claimedBy).toBeUndefined();
    expect(bare.limits).toBeUndefined();
  });

  it('keeps an unclaimed objective unclaimed, which the globe reads', async () => {
    // openWorkOnEvidence counts exactly this: not completed, and nobody on it.
    const created = await missionService.createMission({
      title: 'Open work', briefing: 'Directly observed.', objectives: ['Do the thing'],
    } as never);
    const reread = await missionService.getMission(created.id);
    expect(reread!.objectives[0].completed).toBe(false);
    expect(reread!.objectives[0].claimedBy).toBeUndefined();
  });
});
