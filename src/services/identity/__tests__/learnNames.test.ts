/**
 * Names are learned from where people are already named (plan item 2.1): a
 * team's roster, and the collaborators added to cases and missions.
 *
 * Real persistence, as in the workspace suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startLearningNames } from '../learnNames';
import { nameOf, forgetNames } from '../names';
import { realTimeTeamService } from '../../RealTimeTeamService';
import { missionService } from '../../intel/MissionService';

const LEAD = 'c'.repeat(64);
const AISHA = 'd'.repeat(64);
const MARCUS = 'f'.repeat(64);
let stop: () => void = () => {};

beforeEach(() => { forgetNames(); });
afterEach(() => { stop(); });

describe('learning names', () => {
  it("learns a team's roster, and a member who joins later", async () => {
    const team = await realTimeTeamService.createTeam({ name: 'Newark desk' }, 'lead-wallet', LEAD);
    stop = startLearningNames();
    await realTimeTeamService.joinTeam(team.id, { pubkey: AISHA, name: 'Aisha Knight', walletAddress: 'aisha-wallet' });

    await expect.poll(() => nameOf(AISHA)).toMatchObject({ name: 'Aisha Knight', source: 'team' });
  });

  it('learns the collaborators added to a mission', async () => {
    stop = startLearningNames();
    const mission = await missionService.createMission({ title: 'Paterson shelters', briefing: 'Beds tonight.' });
    await missionService.saveMission({
      ...mission,
      collaborators: [{ userId: MARCUS, name: 'Marcus Webb', addedAt: new Date().toISOString(), addedBy: LEAD }],
    });

    await expect.poll(() => nameOf(MARCUS)).toMatchObject({ name: 'Marcus Webb', source: 'collaborator' });
  });

  it('stops learning when stopped', async () => {
    stop = startLearningNames();
    stop();
    const mission = await missionService.createMission({ title: 'Camden pantries', briefing: 'Hours.' });
    await missionService.saveMission({
      ...mission,
      collaborators: [{ userId: 'e'.repeat(64), name: 'Late Collaborator', addedAt: new Date().toISOString(), addedBy: LEAD }],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(nameOf('e'.repeat(64))).toBeNull();
  });
});
