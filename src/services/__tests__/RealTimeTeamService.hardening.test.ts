/**
 * RealTimeTeamService — Cycle 1 hardening pass (robustness/edge cases/
 * error handling). No dedicated test file existed for this service before,
 * despite it backing the entire team model.
 *
 * Stays on this project's default jsdom environment (real localStorage,
 * needed by loadPersistedData/persistData) rather than the Node environment
 * some other crypto tests use (no localStorage there). jsdom itself has no
 * crypto.subtle, which generateSecureInviteCode/resolveInviteCode need —
 * polyfilled locally, only here, from Node's real webcrypto, leaving
 * jsdom's own crypto.getRandomValues untouched. Same technique as
 * IntelWorkspaceManager.classifiedEncryption.test.ts.
 */
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { hudSuccess } = vi.hoisted(() => ({ hudSuccess: vi.fn() }));
vi.mock('../../utils/hudNotifications', () => ({ hudSuccess }));

const { loadLegacyTeams } = vi.hoisted(() => ({ loadLegacyTeams: vi.fn() }));
vi.mock('../cyberInvestigationStorage', () => ({
  default: { loadTeams: loadLegacyTeams }
}));

describe('RealTimeTeamService — hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    loadLegacyTeams.mockReset().mockResolvedValue([]);
  });

  /**
   * A generous timeout, because this test is CPU-bound and the suite is not
   * alone on the machine.
   *
   * Each createTeam produces a real Schnorr signature. Twenty concurrently is
   * a few seconds in isolation — the whole file runs in 3.8s — but the suite
   * runs several forks in parallel, and under that contention it has crossed
   * the 15s default and timed out. It was one of the three flakes D11 named
   * and could not pin down, and it always passed when run alone.
   *
   * The number stays at 20: the assertion is about collision resistance under
   * immediate succession, and lowering it to fit a timeout would be tuning the
   * evidence to fit the clock. If this ever fails at 30s, that is not
   * contention and should be investigated as a real defect.
   */
  it('createTeam ids do not collide even when called many times in immediate succession', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const teams = await Promise.all(
      Array.from({ length: 20 }, (_, i) => realTimeTeamService.createTeam({ name: `Team ${i}` }, 'wallet-1'))
    );
    const ids = teams.map(t => t.id);
    expect(new Set(ids).size).toBe(20);
  }, 30_000);

  it('createInvestigation ids do not collide even when called many times in immediate succession', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Investigating Team' }, 'wallet-1');
    const investigations = await Promise.all(
      Array.from({ length: 20 }, (_, i) => realTimeTeamService.createInvestigation({ title: `Inv ${i}` }, team.id, 'wallet-1'))
    );
    const ids = investigations.map(i => i.id);
    expect(new Set(ids).size).toBe(20);
    // Same shape and same cost as the createTeam case above — twenty real
    // signatures — so it gets the same room under contention.
  }, 30_000);

  it('a corrupted starcom_teams value (valid JSON, wrong shape) does not prevent investigations/activities from loading', async () => {
    localStorage.setItem('starcom_teams', JSON.stringify({ not: 'an array' }));
    localStorage.setItem('starcom_investigations', JSON.stringify([
      { id: 'inv-1', title: 'Recovered Investigation', assignedTeam: 'team-x', currentInvestigations: [] }
    ]));

    const { realTimeTeamService } = await import('../RealTimeTeamService');

    expect(realTimeTeamService.getTeams()).toEqual([]);
    expect(realTimeTeamService.getInvestigation('inv-1')).toBeDefined();
  });

  it('malformed JSON in one persisted key does not throw during construction and leaves other state empty but usable', async () => {
    localStorage.setItem('starcom_teams', '{not valid json');

    const { realTimeTeamService } = await import('../RealTimeTeamService');

    expect(realTimeTeamService.getTeams()).toEqual([]);
    // The service itself must still be usable after a corrupted load — this
    // constitutes the assertion that construction didn't throw and leave a
    // broken instance.
    const team = await realTimeTeamService.createTeam({ name: 'Fresh Team' }, 'wallet-1');
    expect(team.id).toBeTruthy();
  });

  it('joinTeam does not silently merge two distinct pubkey-only members sharing the fallback walletAddress', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Roster Team' }, 'wallet-1');

    await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-a', name: 'Agent A', actorType: 'ai' });
    await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-b', name: 'Agent B', actorType: 'ai' });

    const reloaded = realTimeTeamService.getTeam(team.id);
    // Both members are present in the underlying array (dedup happens at the
    // UI layer, not here) — this asserts the service itself never conflates
    // them into one record. createTeam also auto-adds a lead member (a
    // separate, real member with its own walletAddress) — filtered out here
    // since this test is specifically about the two 'unknown'-wallet joins.
    const unknownWalletMembers = reloaded?.members.filter(m => m.walletAddress === 'unknown') ?? [];
    expect(unknownWalletMembers).toHaveLength(2);
    expect(unknownWalletMembers.map(m => m.pubkey).sort()).toEqual(['pk-a', 'pk-b']);
  });

  it('joinTeam is idempotent for the same pubkey on the same team — a second join does not duplicate the roster entry (Cycle 8 hardening)', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Mecha Jono Team' }, 'wallet-1');

    const first = await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-mecha-jono', name: 'Mecha Jono', actorType: 'ai' });
    const second = await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-mecha-jono', name: 'Mecha Jono', actorType: 'ai' });

    expect(first).toBe(true);
    expect(second).toBe(true); // already a member — a successful no-op, not a rejection

    const reloaded = realTimeTeamService.getTeam(team.id);
    const mechaJonoEntries = reloaded?.members.filter(m => m.pubkey === 'pk-mecha-jono') ?? [];
    expect(mechaJonoEntries).toHaveLength(1);
  });

  it('joinTeam is idempotent for the same explicit walletAddress on the same team (no pubkey)', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    const team = await realTimeTeamService.createTeam({ name: 'Legacy Roster Team' }, 'wallet-1');

    await realTimeTeamService.joinTeam(team.id, { walletAddress: 'wallet-legacy-1', name: 'Legacy Member' });
    await realTimeTeamService.joinTeam(team.id, { walletAddress: 'wallet-legacy-1', name: 'Legacy Member' });

    const reloaded = realTimeTeamService.getTeam(team.id);
    const entries = reloaded?.members.filter(m => m.walletAddress === 'wallet-legacy-1') ?? [];
    expect(entries).toHaveLength(1);
  });

  it('joinTeam returns false, not a throw, for a team that does not exist', async () => {
    const { realTimeTeamService } = await import('../RealTimeTeamService');
    await expect(realTimeTeamService.joinTeam('never-existed', { name: 'Nobody' })).resolves.toBe(false);
  });

  // Phase T2 (Teams & Chat consolidation roadmap) — the real chat-channel
  // binding TeamWorkspaceApplication.tsx's Chat tab persists onto the team
  // record once it resolves/creates the team's channel.
  describe('setTeamChannelId (Phase T2)', () => {
    it('sets channelId on the team and persists it', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      const team = await realTimeTeamService.createTeam({ name: 'Channel Team' }, 'wallet-1');
      expect(team.channelId).toBeUndefined();

      realTimeTeamService.setTeamChannelId(team.id, 'abc123');

      const updated = realTimeTeamService.getTeam(team.id);
      expect(updated?.channelId).toBe('abc123');

      // A fresh module load (simulating a reload) reads the same persisted value.
      vi.resetModules();
      const { realTimeTeamService: reloaded } = await import('../RealTimeTeamService');
      expect(reloaded.getTeam(team.id)?.channelId).toBe('abc123');
    });

    it('is a no-op for an unknown teamId — does not throw', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      expect(() => realTimeTeamService.setTeamChannelId('never-existed', 'abc123')).not.toThrow();
    });

    it('is a no-op when called with the already-current channelId — does not bump updatedAt', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      const team = await realTimeTeamService.createTeam({ name: 'Idempotent Channel Team' }, 'wallet-1');
      realTimeTeamService.setTeamChannelId(team.id, 'abc123');
      const afterFirstSet = realTimeTeamService.getTeam(team.id)!.updatedAt;

      realTimeTeamService.setTeamChannelId(team.id, 'abc123');
      const afterSecondSet = realTimeTeamService.getTeam(team.id)!.updatedAt;

      expect(afterSecondSet).toEqual(afterFirstSet);
    });
  });

  // Invites are signed links now (plan item 2.3): see
  // services/team/__tests__/joiningATeam.test.ts.

  // Phase T4.1 (Teams & Chat operational-reliability roadmap)
  describe('joinTeam notifications (Phase T4.1)', () => {
    beforeEach(() => {
      hudSuccess.mockReset();
    });

    it('fires a real notification with the actual member/team names on a successful join', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      const team = await realTimeTeamService.createTeam({ name: 'Notify Team' }, 'wallet-1');

      await realTimeTeamService.joinTeam(team.id, { name: 'New Analyst', walletAddress: 'wallet-2' });

      expect(hudSuccess).toHaveBeenCalledTimes(1);
      const [title, message] = hudSuccess.mock.calls[0];
      expect(title).toMatch(/joined/i);
      expect(message).toContain('New Analyst');
      expect(message).toContain('Notify Team');
    });

    it('does not fire a notification when the join fails (unknown team)', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      await realTimeTeamService.joinTeam('never-existed', { name: 'Nobody' });
      expect(hudSuccess).not.toHaveBeenCalled();
    });

    it('does not fire a notification for an already-a-member no-op re-join', async () => {
      const { realTimeTeamService } = await import('../RealTimeTeamService');
      const team = await realTimeTeamService.createTeam({ name: 'Rejoin Team' }, 'wallet-1');
      await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-1', name: 'Analyst' });
      hudSuccess.mockReset();

      await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-1', name: 'Analyst' });
      expect(hudSuccess).not.toHaveBeenCalled();
    });
  });

  describe('migrateLegacyTeams (Phase T6)', () => {
    const legacyTeamFixture = (overrides: Record<string, unknown> = {}) => ({
      id: 'legacy-team-1',
      name: 'Legacy Team',
      type: 'INCIDENT_RESPONSE',
      lead: 'legacy-lead',
      members: [{
        walletAddress: 'legacy-lead',
        name: 'Legacy Lead',
        role: 'LEAD_ANALYST',
        specializations: [],
        status: 'ONLINE',
        joinedAt: new Date(),
        lastActivity: new Date()
      }],
      specializations: [],
      status: 'ACTIVE',
      currentInvestigations: [],
      autoShareFindings: true,
      allowExternalCollaboration: false,
      preferredCommunicationChannels: ['secure-chat'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    });

    it('imports a team that exists in the old CyberInvestigationStorage but not locally', async () => {
      loadLegacyTeams.mockResolvedValue([legacyTeamFixture()]);

      const { realTimeTeamService } = await import('../RealTimeTeamService');
      await vi.waitFor(() => {
        expect(realTimeTeamService.getTeam('legacy-team-1')).toBeTruthy();
      });
      expect(realTimeTeamService.getTeam('legacy-team-1')?.name).toBe('Legacy Team');
      expect(realTimeTeamService.getTeams()).toHaveLength(1);
    });

    it('does not overwrite a team that already exists locally under the same id', async () => {
      localStorage.setItem('starcom_teams', JSON.stringify([legacyTeamFixture({ name: 'Local Version' })]));
      loadLegacyTeams.mockResolvedValue([legacyTeamFixture({ name: 'Legacy Version (should be ignored)' })]);

      const { realTimeTeamService } = await import('../RealTimeTeamService');
      // Give the async migration a tick to run (it's a no-op here either way).
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(realTimeTeamService.getTeam('legacy-team-1')?.name).toBe('Local Version');
    });
  });
});
