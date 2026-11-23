/**
 * Learns what people are called from where they are already named (plan item
 * 2.1): each team's roster, and the collaborators added to cases, missions and
 * reports. Started once at app start.
 *
 * Kept apart from the services it reads. The team service sends events, and
 * nothing that builds, signs or sends may read a name (namesNeverPublished.test);
 * this module only writes names down.
 */
import { learnName } from './names';
import { realTimeTeamService } from '../RealTimeTeamService';
import { intelWorkspaceManager } from '../intel/IntelWorkspaceManager';
import type { Collaborator } from '../../types/intel/Collaboration';

const TEAM_EVENTS = ['team-created', 'member-joined', 'member-status-updated'] as const;

function fromTeams(): void {
  for (const team of realTimeTeamService.getTeams()) {
    for (const member of team.members) {
      if (member.pubkey) learnName(member.pubkey, member.name, 'team');
    }
  }
}

function fromCollaborators(lists: Array<Collaborator[] | undefined>): void {
  for (const list of lists) {
    for (const collaborator of list ?? []) learnName(collaborator.userId, collaborator.name, 'collaborator');
  }
}

function fromRecords(): void {
  fromCollaborators([
    ...intelWorkspaceManager.getCases().map((c) => c.collaborators),
    ...intelWorkspaceManager.getMissions().map((m) => m.collaborators),
    ...intelWorkspaceManager.getReports().map((r) => (r.metadata as { collaborators?: Collaborator[] } | undefined)?.collaborators),
  ]);
}

/** Starts learning; returns what stops it. */
export function startLearningNames(): () => void {
  let stopped = false;
  fromTeams();
  const stopTeams = TEAM_EVENTS.map((event) => realTimeTeamService.on(event, () => { if (!stopped) fromTeams(); }));

  let stopRecords: () => void = () => {};
  void intelWorkspaceManager.ensureInitialized().then(() => {
    if (stopped) return;
    fromRecords();
    const unsubscribe = intelWorkspaceManager.subscribe(() => { if (!stopped) fromRecords(); });
    stopRecords = () => { unsubscribe(); };
  }).catch(() => {
    // No workspace, no collaborators to learn from; team rosters still are.
  });

  return () => {
    stopped = true;
    stopTeams.forEach((stop) => stop());
    stopRecords();
  };
}
