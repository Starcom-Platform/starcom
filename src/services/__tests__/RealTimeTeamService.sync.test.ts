/**
 * Nothing about a team leaves this browser by itself (plan item 0.2).
 *
 * Every two minutes this service published each team's name, description and
 * member count to the public relays (kind 30090), and uploaded every
 * investigation, unencrypted, to IPFS. Nothing anywhere read either back — the
 * service's own comment said so — and the broadcast let anyone watching the
 * relays list the teams and work out each team's chat channel. Measured in the
 * built app on 2026-09-26: five team-state events naming the team within 130
 * seconds of creating it (scripts/check-chat.mjs --team-broadcast).
 *
 * The cycle was removed rather than switched off, so there is no setting that
 * can bring it back quietly. Both publishers stay mocked here so that anyone
 * who wires one back in fails this test.
 */
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { hudSuccess } = vi.hoisted(() => ({ hudSuccess: vi.fn() }));
vi.mock('../../utils/hudNotifications', () => ({ hudSuccess }));

const { loadLegacyTeams } = vi.hoisted(() => ({ loadLegacyTeams: vi.fn() }));
vi.mock('../cyberInvestigationStorage', () => ({
  default: { loadTeams: loadLegacyTeams }
}));

const { publishTeamStateUpdate, publishEvent } = vi.hoisted(() => ({ publishTeamStateUpdate: vi.fn(), publishEvent: vi.fn() }));
vi.mock('../nostrService', () => ({ default: { publishTeamStateUpdate, publishEvent } }));

const { uploadInvestigation, uploadCyberTeam } = vi.hoisted(() => ({ uploadInvestigation: vi.fn(), uploadCyberTeam: vi.fn() }));
vi.mock('../IPFSService', () => ({ default: { uploadInvestigation, uploadCyberTeam } }));

describe('RealTimeTeamService — what leaves by itself', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    loadLegacyTeams.mockReset().mockResolvedValue([]);
    for (const publisher of [publishTeamStateUpdate, publishEvent, uploadInvestigation, uploadCyberTeam]) {
      publisher.mockReset().mockResolvedValue(undefined);
    }
  });

  afterEach(() => vi.useRealTimers());

  it('publishes no team state and uploads no investigation, however long the app stays open', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'B cell', description: 'Newark food banks' }, 'wallet-1');
    await realTimeTeamService.createInvestigation({ title: 'Which sites are closed' }, team.id, 'wallet-1');

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(publishTeamStateUpdate).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
    expect(uploadInvestigation).not.toHaveBeenCalled();
    expect(uploadCyberTeam).not.toHaveBeenCalled();
  });
});
