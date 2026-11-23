/**
 * Removing someone on the team's relay left them on the roster kept here
 * (plan item 9.8), which chat still used when the relay's list was not to
 * hand. The roster now loses them too.
 */
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/hudNotifications', () => ({ hudSuccess: vi.fn() }));
vi.mock('../cyberInvestigationStorage', () => ({ default: { loadTeams: vi.fn(async () => []) } }));

const AISHA = 'b'.repeat(64);
const CHEN = 'c'.repeat(64);

describe('realTimeTeamService.removeMemberByKey', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it('takes the key off the roster, keeps it off after a reload, and says so', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Newark desk', relayUrl: 'wss://relay.newark.example' }, 'me', 'a'.repeat(64));
    await realTimeTeamService.joinTeam(team.id, { pubkey: AISHA, name: 'Aisha' });
    await realTimeTeamService.joinTeam(team.id, { pubkey: CHEN, name: 'Chen' });
    const heard = vi.fn();
    realTimeTeamService.on('member-left', heard);

    expect(await realTimeTeamService.removeMemberByKey(team.id, AISHA)).toBe(true);
    const keys = realTimeTeamService.getTeam(team.id)!.members.map((m) => m.pubkey);
    expect(keys).not.toContain(AISHA);
    expect(keys).toContain(CHEN);
    expect(heard).toHaveBeenCalledWith({ teamId: team.id, pubkey: AISHA });

    vi.resetModules();
    const reloaded = (await import('../RealTimeTeamService')).realTimeTeamService;
    expect(reloaded.getTeam(team.id)!.members.map((m) => m.pubkey)).not.toContain(AISHA);
  });

  it('says so when there was nobody to take off', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Camden desk' }, 'me', 'a'.repeat(64));
    expect(await realTimeTeamService.removeMemberByKey(team.id, AISHA)).toBe(false);
    expect(await realTimeTeamService.removeMemberByKey('no-such-team', AISHA)).toBe(false);
  });
});
