/**
 * Who an objective was given to travels with the mission's bundle (plan item
 * 2.5), as the rest of the record does. A package, which leaves the team,
 * never carries it (MissionPackageBuilder's own tests hold that).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import nostrService from '../../../nostrService';
import { intelWorkspaceManager } from '../../IntelWorkspaceManager';
import { makeBundleOf } from '../collectBundle';

describe('a mission bundle', () => {
  it('carries who each objective was given to', async () => {
    nostrService.ensureIdentity('handing a mission to a teammate');
    await intelWorkspaceManager.ensureInitialized();
    const aisha = 'a'.repeat(64);
    const mission = await intelWorkspaceManager.addMission({ title: 'Watch berth 4', briefing: 'Rests on direct observation.', visibility: 'limited' });
    await intelWorkspaceManager.updateMission({
      ...intelWorkspaceManager.getMission(mission.id)!,
      objectives: [{ id: 'o1', description: 'Photograph the cranes', completed: false, claimedBy: aisha }],
    });
    const { file } = await makeBundleOf({ type: 'mission', id: mission.id });
    const record = file.envelopes.find((e) => e.type === 'mission' && e.id === mission.id)?.record as { objectives: Array<{ claimedBy?: string }> };
    expect(record.objectives[0].claimedBy).toBe(aisha);
  });
});
