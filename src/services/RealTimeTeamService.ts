import { CyberTeam, CyberInvestigation, TeamMember } from '../types/cyberInvestigation';
import { generateTeamMemberKeys } from './team/teamMemberKeys';
import { createTeamInviteLink, PUBLIC_IPFS_GATEWAYS } from '../config/publicInfrastructure';
import { publishRelays } from './nostr/publishTargets';
import CyberInvestigationStorage from './cyberInvestigationStorage';
import { createLogger } from '@utils/logger';
import { hudSuccess } from '../utils/hudNotifications';
const log = createLogger({ prefix: 'RealTimeTeamService' });

interface TeamWorkspaceData {
  teams: CyberTeam[];
  investigations: CyberInvestigation[];
  memberActivities: MemberActivity[];
  teamStats: TeamStats;
}

interface MemberActivity {
  id: string;
  teamId: string;
  memberId: string;
  type: 'joined' | 'left' | 'investigation_created' | 'report_submitted' | 'message_sent';
  action?: string; // Optional action field for detailed activity tracking
  timestamp: Date;
  details: string;
  location?: string; // Optional location information
}

interface TeamStats {
  totalTeams: number;
  activeTeams: number;
  totalMembers: number;
  onlineMembers: number;
  activeInvestigations: number;
  recentReports: number;
}

class RealTimeTeamService {
  private teams: Map<string, CyberTeam> = new Map();
  private investigations: Map<string, CyberInvestigation> = new Map();
  private memberActivities: MemberActivity[] = [];
  private eventListeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  /*
   * No sync cycle, on purpose. Every two minutes this used to publish each
   * team's name, description and member count to the public relays (kind 30090)
   * and upload every investigation, unencrypted, to IPFS. Nothing anywhere read
   * either back, and the broadcast let anyone watching the relays list the teams
   * and work out each team's chat channel. Removed rather than switched off (plan
   * item 0.2), so no setting can bring it back quietly; a team's details leave
   * this browser only through something a person chose to send.
   */
  constructor() {
    this.loadPersistedData();
    this.migrateLegacyTeams();
  }

  // One-time, idempotent import of teams created via the older, separate
  // CyberInvestigationStorage path (CyberTeamManager.tsx, pre-consolidation)
  // so they become visible here regardless of which UI a user opens first.
  // Dedupe-by-id makes repeat calls (e.g. hot reload) harmless. Legacy
  // storage is left untouched, not cleared — non-destructive either way.
  private async migrateLegacyTeams(): Promise<void> {
    try {
      const legacyTeams = await CyberInvestigationStorage.loadTeams();
      let imported = 0;
      for (const team of legacyTeams) {
        if (!this.teams.has(team.id)) {
          this.teams.set(team.id, team);
          imported++;
        }
      }
      if (imported > 0) {
        this.persistData();
        log.info(`Migrated ${imported} legacy team(s) from CyberInvestigationStorage`);
      }
    } catch (error) {
      log.error('Failed to migrate legacy teams from CyberInvestigationStorage:', error);
    }
  }

  // Team Management
  async createTeam(teamData: Partial<CyberTeam>, creatorId: string, creatorPubkey?: string): Promise<CyberTeam> {
    const leadKeys = await generateTeamMemberKeys();
    const team: CyberTeam = {
      // Random suffix, not just Date.now() — two calls within the same
      // millisecond (rapid succession, or concurrent calls) would otherwise
      // collide, and since id is a Map key (this.teams.set below), a
      // collision silently overwrites the earlier team rather than erroring.
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: teamData.name || 'New Team',
      type: teamData.type || 'INCIDENT_RESPONSE',
      lead: creatorId,
      // The lead is a member and gets keys like any other. Skipping them here
      // would mean the one person guaranteed to be on every team is the one
      // person without keys.
      members: [{
        keys: leadKeys,
        pubkey: creatorPubkey,
        walletAddress: creatorId,
        name: 'Team Lead',
        role: 'LEAD_ANALYST',
        actorType: 'human',
        specializations: teamData.specializations || [],
        status: 'ONLINE',
        joinedAt: new Date(),
        lastActivity: new Date()
      }],
      specializations: teamData.specializations || [],
      status: 'ACTIVE',
      currentInvestigations: [],
      autoShareFindings: true,
      allowExternalCollaboration: false,
      preferredCommunicationChannels: ['secure-chat'],
      ...(teamData.relayUrl ? { relayUrl: teamData.relayUrl } : {}),
      ...(teamData.relayPubkey ? { relayPubkey: teamData.relayPubkey } : {}),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.teams.set(team.id, team);
    this.persistData();
    
    // Log activity
    this.addMemberActivity({
      id: `activity-${Date.now()}`,
      teamId: team.id,
      memberId: creatorId,
      type: 'joined',
      timestamp: new Date(),
      details: `Team "${team.name}" created`
    });

    // Emit event for real-time updates
    this.emit('team-created', { team });

    return team;
  }

  async joinTeam(teamId: string, member: Partial<TeamMember>): Promise<boolean> {
    const team = this.teams.get(teamId);
    if (!team) return false;

    // `members` is a plain array, not keyed storage — re-joining an
    // identity (pubkey, or an explicit walletAddress for a legacy
    // pubkey-less member) already on this team's roster would otherwise
    // silently push a second, duplicate entry rather than being a no-op.
    // Reachable in practice: Mecha Jono's "Invite Mecha Jono" button
    // (Cycle 8) has no per-team "already joined" state and can be clicked
    // again for a team it's already on, and this same path backs every
    // human invite-code redemption too. Skipped when the caller supplied
    // neither (falls back to the shared 'unknown' walletAddress default
    // below) — that pre-existing "distinct pubkey-only members can share
    // 'unknown'" case is deliberately still allowed, matching Cycle 1's
    // dedupeMembers fix.
    const identityKey = member.pubkey ?? member.walletAddress;
    if (identityKey && team.members.some(m => (m.pubkey ?? m.walletAddress) === identityKey)) {
      return true; // already a member — joining again is a successful no-op, not a duplicate
    }

    /**
     * Every member gets post-quantum keys, by default and without asking.
     *
     * This used to happen only for teams created through CyberTeamManager — a
     * 1,016-line screen behind a sidebar popup — so whether your keys existed
     * depended on which of two team surfaces you happened to find. A security
     * property that varies by entry point is not a property.
     *
     * Not offered as a tier either: an opt-in security level is one that gets
     * skipped, and on a shared network a peer cannot tell which tier a team
     * chose, so the weaker path degrades everyone's ability to reason about
     * teams rather than only the team that chose it.
     */
    const keys = await generateTeamMemberKeys();

    const newMember: TeamMember = {
      keys,
      pubkey: member.pubkey,
      walletAddress: member.walletAddress || 'unknown',
      name: member.name || 'New Member',
      role: member.role || 'CYBER_ANALYST',
      actorType: member.actorType || 'human',
      specializations: member.specializations || [],
      status: 'ONLINE',
      joinedAt: new Date(),
      lastActivity: new Date()
    };

    team.members.push(newMember);
    team.updatedAt = new Date();
    
    this.teams.set(teamId, team);
    this.persistData();

    // Log activity
    this.addMemberActivity({
      id: `activity-${Date.now()}`,
      teamId,
      memberId: newMember.walletAddress,
      type: 'joined',
      timestamp: new Date(),
      details: `${newMember.name} joined the team`
    });

    this.emit('member-joined', { teamId, member: newMember });

    // Phase T4.1 (Teams & Chat operational-reliability roadmap) — every
    // current caller of joinTeam (invite-code redemption, "Invite Mecha
    // Jono") is something the LOCAL user just triggered, not a
    // cross-device echo (this service has no real cross-device sync —
    // publishTeamUpdatesToNostr is a stub), so notifying here is always
    // meaningful. createTeam's own creator-as-first-member push doesn't
    // go through joinTeam, so this never double-fires on team creation.
    hudSuccess('Team Member Joined', `${newMember.name} joined ${team.name}`);

    return true;
  }

  /**
   * Records the real chat channel bound to this team — set by
   * TeamWorkspaceApplication.tsx's Chat tab once it resolves/creates the
   * team's channel via SecureChatIntegrationService.createChannel (a
   * deterministic hash of `Team: ${teamId}`, so this is idempotent /
   * always re-derivable; persisting it here is a convenience for other
   * future consumers to read directly, not a correctness requirement).
   */
  setTeamChannelId(teamId: string, channelId: string): void {
    const team = this.teams.get(teamId);
    if (!team || team.channelId === channelId) return;
    team.channelId = channelId;
    team.updatedAt = new Date();
    this.teams.set(teamId, team);
    this.persistData();
  }

  /**
   * Take a key off a team's roster (plan item 9.8): called once the team's
   * relay has removed or banned them. Removal on the relay left the roster
   * untouched, and chat fell back to the roster when the relay's list was
   * not to hand. Returns false when the team has nobody with that key.
   */
  async removeMemberByKey(teamId: string, pubkey: string): Promise<boolean> {
    const team = this.teams.get(teamId);
    if (!team || !team.members.some((m) => m.pubkey === pubkey)) return false;
    team.members = team.members.filter((m) => m.pubkey !== pubkey);
    team.updatedAt = new Date();
    this.teams.set(teamId, team);
    this.persistData();
    this.emit('member-left', { teamId, pubkey });
    return true;
  }

  async updateMemberStatus(teamId: string, memberId: string, status: 'ONLINE' | 'OFFLINE' | 'AWAY'): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) return;

    const member = team.members.find(m => m.walletAddress === memberId);
    if (!member) return;

    member.status = status;
    member.lastActivity = new Date();
    team.updatedAt = new Date();

    this.teams.set(teamId, team);
    this.persistData();
    this.emit('member-status-updated', { teamId, memberId, status });
  }

  // Investigation Management
  async createInvestigation(investigationData: Partial<CyberInvestigation>, teamId: string, creatorId: string): Promise<CyberInvestigation> {
    const investigation: CyberInvestigation = {
      // Same collision reasoning as createTeam's id — this.investigations.set below is also a Map keyed by id.
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: investigationData.title || 'New Investigation',
      description: investigationData.description || '',
      type: investigationData.type || 'INCIDENT_RESPONSE',
      visibility: investigationData.visibility ?? 'public',
      priority: investigationData.priority || 'MEDIUM',
      severity: investigationData.severity || 'MEDIUM',
      detectedDate: new Date(),
      incidentDate: investigationData.incidentDate || new Date(),
      reportedBy: creatorId,
      assignedTeam: teamId,
      status: 'INITIATED',
      progress: 0,
      affectedSystems: investigationData.affectedSystems || [],
      affectedUsers: [],
      estimatedImpact: investigationData.estimatedImpact || 'MEDIUM',
      intelPackages: [],
      timeline: [{
        id: `timeline-${Date.now()}`,
        timestamp: new Date(),
        type: 'INCIDENT_DETECTED',
        description: `Investigation "${investigationData.title}" initiated`,
        author: creatorId,
        relatedReports: [],
        evidence: []
      }],
      ioCs: [],
      evidence: [],
      collaboratingTeams: [],
      sharedWith: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      recommendedActions: []
    };

    this.investigations.set(investigation.id, investigation);
    
    // Add to team's current investigations
    const team = this.teams.get(teamId);
    if (team) {
      team.currentInvestigations.push(investigation.id);
      team.updatedAt = new Date();
      this.teams.set(teamId, team);
    }

    this.persistData();

    // Log activity
    this.addMemberActivity({
      id: `activity-${Date.now()}`,
      teamId,
      memberId: creatorId,
      type: 'investigation_created',
      timestamp: new Date(),
      details: `Investigation "${investigation.title}" created`
    });

    this.emit('investigation-created', { investigation, teamId });
    return investigation;
  }

  async updateInvestigationStatus(investigationId: string, status: CyberInvestigation['status']): Promise<void> {
    const investigation = this.investigations.get(investigationId);
    if (!investigation) return;

    investigation.status = status;
    investigation.updatedAt = new Date();
    
    // Update progress based on status
    switch (status) {
      case 'INITIATED':
        investigation.progress = 10;
        break;
      case 'INVESTIGATING':
        investigation.progress = 30;
        break;
      case 'CONTAINING':
        investigation.progress = 60;
        break;
      case 'ANALYZING':
        investigation.progress = 80;
        break;
      case 'RECOVERING':
        investigation.progress = 90;
        break;
      case 'CLOSED':
        investigation.progress = 100;
        break;
    }

    this.investigations.set(investigationId, investigation);
    this.persistData();
    this.emit('investigation-updated', { investigation });
  }

  // Data Access Methods
  getTeams(): CyberTeam[] {
    return Array.from(this.teams.values());
  }

  getTeam(teamId: string): CyberTeam | undefined {
    return this.teams.get(teamId);
  }

  getUserTeams(userId: string): CyberTeam[] {
    return Array.from(this.teams.values()).filter(team => 
      team.members.some(member => member.walletAddress === userId)
    );
  }

  getTeamInvestigations(teamId: string): CyberInvestigation[] {
    return Array.from(this.investigations.values()).filter(inv => 
      inv.assignedTeam === teamId
    );
  }

  getInvestigation(investigationId: string): CyberInvestigation | undefined {
    return this.investigations.get(investigationId);
  }

  getTeamStats(): TeamStats {
    const teams = Array.from(this.teams.values());
    const investigations = Array.from(this.investigations.values());
    
    const totalMembers = teams.reduce((sum, team) => sum + team.members.length, 0);
    const onlineMembers = teams.reduce((sum, team) => 
      sum + team.members.filter(m => m.status === 'ONLINE').length, 0
    );

    return {
      totalTeams: teams.length,
      activeTeams: teams.filter(t => t.status === 'ACTIVE').length,
      totalMembers,
      onlineMembers,
      activeInvestigations: investigations.filter(i => 
        ['INITIATED', 'INVESTIGATING', 'ANALYZING', 'CONTAINING', 'RECOVERING'].includes(i.status)
      ).length,
      recentReports: investigations.filter(i => 
        i.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };
  }

  getTeamWorkspaceData(teamId?: string): TeamWorkspaceData {
    const teams = teamId ? 
      (this.teams.get(teamId) ? [this.teams.get(teamId)!] : []) : 
      this.getTeams();
    
    const investigations = teamId ? 
      this.getTeamInvestigations(teamId) : 
      Array.from(this.investigations.values());

    const memberActivities = teamId ? 
      this.memberActivities.filter(a => a.teamId === teamId) : 
      this.memberActivities;

    return {
      teams,
      investigations,
      memberActivities: memberActivities.slice(0, 50), // Recent activities
      teamStats: this.getTeamStats()
    };
  }

  // Real-time Communication
  generateTeamInvite(teamId: string): string {
    const team = this.teams.get(teamId);
    if (!team) throw new Error('Team not found');
    
    return createTeamInviteLink(teamId, team.name);
  }

  // Event Management
  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          log.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Private Methods
  private addMemberActivity(activity: MemberActivity): void {
    this.memberActivities.unshift(activity);
    
    // Keep only recent activities (last 1000)
    if (this.memberActivities.length > 1000) {
      this.memberActivities = this.memberActivities.slice(0, 1000);
    }
    
    this.emit('activity-added', { activity });
  }

  private loadPersistedData(): void {
    // Each section gets its own try/catch — previously a single shared one
    // meant a valid-JSON-but-wrong-shape value in an EARLIER key (e.g.
    // starcom_teams corrupted to `{}` instead of an array, so .forEach
    // throws) aborted the whole method, silently losing investigations/
    // activities too even though those parsed fine and were never reached.
    try {
      const teamsData = localStorage.getItem('starcom_teams');
      if (teamsData) {
        const teams = JSON.parse(teamsData);
        if (Array.isArray(teams)) {
          (teams as CyberTeam[]).forEach(team => this.teams.set(team.id, team));
        } else {
          log.error('Ignoring starcom_teams — persisted value is not an array');
        }
      }
    } catch (error) {
      log.error('Failed to load persisted teams:', error);
    }

    try {
      const investigationsData = localStorage.getItem('starcom_investigations');
      if (investigationsData) {
        const investigations = JSON.parse(investigationsData);
        if (Array.isArray(investigations)) {
          (investigations as CyberInvestigation[]).forEach(inv => this.investigations.set(inv.id, inv));
        } else {
          log.error('Ignoring starcom_investigations — persisted value is not an array');
        }
      }
    } catch (error) {
      log.error('Failed to load persisted investigations:', error);
    }

    try {
      const activitiesData = localStorage.getItem('starcom_activities');
      if (activitiesData) {
        const activities = JSON.parse(activitiesData);
        this.memberActivities = Array.isArray(activities) ? activities : [];
        if (!Array.isArray(activities)) {
          log.error('Ignoring starcom_activities — persisted value is not an array');
        }
      }
    } catch (error) {
      log.error('Failed to load persisted activities:', error);
    }
  }

  private persistData(): void {
    try {
      localStorage.setItem('starcom_teams', JSON.stringify(Array.from(this.teams.values())));
      localStorage.setItem('starcom_investigations', JSON.stringify(Array.from(this.investigations.values())));
      localStorage.setItem('starcom_activities', JSON.stringify(this.memberActivities));
    } catch (error) {
      log.error('Failed to persist data:', error);
    }
  }

  // Infrastructure Health Check
  async checkInfrastructureHealth(): Promise<{
    nostrRelays: { connected: number; total: number };
    ipfsGateways: { available: number; total: number };
    status: 'healthy' | 'degraded' | 'offline';
  }> {
    // Probe what the app ACTUALLY uses. This list had drifted to twelve
    // hand-maintained endpoints including three already recorded as dead, so
    // the health check reported degraded infrastructure partly by dialling
    // things known not to answer — a self-inflicted red light. It then probed
    // the seven-relay measured pool while chat used five; it probes chat's now.
    const nostrRelayUrls = publishRelays('CHAT');

    // Same reasoning as the relays above. PUBLIC_IPFS_GATEWAYS carries the
    // /ipfs/ path suffix these probes do not want, so trim it.
    const ipfsGatewayUrls = PUBLIC_IPFS_GATEWAYS.map(g => g.replace(/\/ipfs\/$/, ''));

    // Test Nostr relay connections
    let connectedRelays = 0;
    const relayPromises = nostrRelayUrls.map(async (url) => {
      try {
        const ws = new WebSocket(url);
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 3000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        });
      } catch {
        return false;
      }
    });

    const relayResults = await Promise.allSettled(relayPromises);
    connectedRelays = relayResults.filter(
      (result) => result.status === 'fulfilled' && result.value === true
    ).length;

    // Test IPFS gateway availability
    let availableGateways = 0;
    const gatewayPromises = ipfsGatewayUrls.map(async (url) => {
      try {
        const response = await fetch(`${url}/ipfs/QmQPeNsJPyVWPFDVHb77w8G42Fvo15z4bG2X8D2GhfbSXc/readme`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        return response.ok;
      } catch {
        return false;
      }
    });

    const gatewayResults = await Promise.allSettled(gatewayPromises);
    availableGateways = gatewayResults.filter(
      (result) => result.status === 'fulfilled' && result.value === true
    ).length;

    // Determine overall status
    const relayHealthRatio = connectedRelays / nostrRelayUrls.length;
    const gatewayHealthRatio = availableGateways / ipfsGatewayUrls.length;
    const overallHealthRatio = (relayHealthRatio + gatewayHealthRatio) / 2;

    let status: 'healthy' | 'degraded' | 'offline';
    if (overallHealthRatio >= 0.7) {
      status = 'healthy';
    } else if (overallHealthRatio >= 0.3) {
      status = 'degraded';
    } else {
      status = 'offline';
    }

    return {
      nostrRelays: { connected: connectedRelays, total: nostrRelayUrls.length },
      ipfsGateways: { available: availableGateways, total: ipfsGatewayUrls.length },
      status
    };
  }

  /**
   * Records a team this person joined through its relay (plan item 2.3). The
   * relay decided membership, by the invite's claim; this keeps the team in
   * this browser's list, with the person on its roster. Joining the same
   * relay again returns the team already recorded.
   */
  async recordJoinedTeam(input: { name: string; relayUrl: string; relayPubkey: string; memberPubkey: string }): Promise<CyberTeam> {
    const same = (url?: string) => (url ?? '').trim().replace(/\/+$/, '').toLowerCase();
    const existing = [...this.teams.values()].find((t) => same(t.relayUrl) === same(input.relayUrl));
    if (existing) return existing;
    const team: CyberTeam = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name || 'Team',
      type: 'INCIDENT_RESPONSE',
      // Who leads it is the relay's business, and this browser was not told.
      lead: '',
      members: [],
      specializations: [],
      status: 'ACTIVE',
      currentInvestigations: [],
      autoShareFindings: true,
      allowExternalCollaboration: false,
      preferredCommunicationChannels: ['secure-chat'],
      relayUrl: input.relayUrl,
      relayPubkey: input.relayPubkey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.teams.set(team.id, team);
    this.persistData();
    await this.joinTeam(team.id, { pubkey: input.memberPubkey, walletAddress: input.memberPubkey, name: 'You', role: 'CYBER_ANALYST' });
    this.emit('team-created', { team });
    return this.teams.get(team.id)!;
  }
}

// Export singleton instance
export const realTimeTeamService = new RealTimeTeamService();
export default realTimeTeamService;
