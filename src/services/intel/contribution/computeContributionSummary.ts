import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

/**
 * Actor ids that are NOT people.
 *
 * `'operative'` is IntelWorkspaceManager's sentinel for "no identity was
 * available"; `'import'` marks an entry created by a bulk import rather than
 * by anyone. Both were being counted as contributors, so a placeholder and a
 * batch job appeared in a list of analysts alongside real ones — which is a
 * quieter version of the thing this function already refuses to do when it
 * declines to guess at unattributed entries.
 *
 * Their activity is not discarded. It is reported under `systemActivity`,
 * because "37 actions by nobody in particular" is a real and useful fact about
 * a record; it is just not a contribution by a person.
 */
export const NON_PERSON_ACTORS = new Set(['operative', 'import', 'system', 'unknown']);

export interface ContributorSummary {
  userId: string;
  /** Count of cases/missions/reports where this userId appears in collaborators[]. */
  collaborations: number;
  /** Count of activityLog (Case/Mission) + history (Report, only entries with `user` set) entries authored by this userId. */
  activityCount: number;
  /** Per-action-type breakdown, e.g. { CREATED: 3, STATUS_CHANGED: 1 }. */
  actionsByType: Record<string, number>;
  /** Most recent ISO timestamp seen for this userId, across activity entries and Collaborator.lastActive. Null if none recorded. */
  lastActive: string | null;
}

/**
 * Surfaces existing collaborators[]/activityLog/history data as a
 * per-analyst summary — no new data model, per the roadmap ("the gap
 * isn't infrastructure, it's surfacing"). Deliberately does NOT compute
 * "findings corroborated" or "contradictions resolved": neither is
 * attributed to a specific analyst anywhere in the data model today
 * (EntityAliasRegistry's AliasRecord and computeLocationConflicts'
 * LocationConflict both carry no userId) — inventing per-analyst counts
 * for them here would be exactly the kind of fabrication Phase 1's
 * mock-data audits exist to catch, not surface honestly. What's real and
 * attributable today is collaboration membership and logged activity;
 * that's what this reports.
 *
 * Reports only count `history` entries that HAVE a `user` set. An
 * unattributed entry contributes to nobody's count rather than being silently
 * attached to a guessed identity. (UPDATED entries carried no user at all
 * until IV.D Step 2 fixed that at the write site; entries written before then
 * stay unattributed, because backfilling them would be guessing.)
 *
 * Entries by NON_PERSON_ACTORS are separated out rather than counted as
 * analysts — see that constant.
 */
export function computeContributionSummary(
  cases: Pick<IntelCaseUI, 'collaborators' | 'activityLog'>[],
  missions: Pick<MissionUI, 'collaborators' | 'activityLog'>[],
  reports: Pick<IntelReportUI, 'collaborators' | 'history'>[]
): ContributorSummary[] {
  interface Mutable {
    collaborations: number;
    activityCount: number;
    actionsByType: Record<string, number>;
    lastActive: string | null;
  }
  const byUser = new Map<string, Mutable>();

  const entry = (userId: string): Mutable => {
    let e = byUser.get(userId);
    if (!e) {
      e = { collaborations: 0, activityCount: 0, actionsByType: {}, lastActive: null };
      byUser.set(userId, e);
    }
    return e;
  };

  const noteTimestamp = (e: Mutable, ts: string | undefined) => {
    if (!ts) return;
    if (!e.lastActive || new Date(ts).getTime() > new Date(e.lastActive).getTime()) {
      e.lastActive = ts;
    }
  };

  const countCollaborators = (collaborators: { userId: string; lastActive?: string }[] | undefined) => {
    for (const c of collaborators || []) {
      const e = entry(c.userId);
      e.collaborations += 1;
      noteTimestamp(e, c.lastActive);
    }
  };

  const countActivity = (log: { userId: string; action: string; timestamp: string }[] | undefined) => {
    for (const a of log || []) {
      const e = entry(a.userId);
      e.activityCount += 1;
      e.actionsByType[a.action] = (e.actionsByType[a.action] || 0) + 1;
      noteTimestamp(e, a.timestamp);
    }
  };

  for (const c of cases) {
    countCollaborators(c.collaborators);
    countActivity(c.activityLog as unknown as { userId: string; action: string; timestamp: string }[]);
  }
  for (const m of missions) {
    countCollaborators(m.collaborators);
    countActivity(m.activityLog as unknown as { userId: string; action: string; timestamp: string }[]);
  }
  for (const r of reports) {
    countCollaborators(r.collaborators);
    for (const h of r.history || []) {
      if (!h.user) continue; // unattributed — see doc comment, never guessed
      const e = entry(h.user);
      e.activityCount += 1;
      e.actionsByType[h.action] = (e.actionsByType[h.action] || 0) + 1;
      noteTimestamp(e, h.timestamp);
    }
  }

  const summaries: ContributorSummary[] = Array.from(byUser.entries())
    // Placeholders and batch jobs are not analysts. Filtered here rather than
    // at the write site so the underlying entries keep their real actor value
    // — the record should say 'import' if that is what happened.
    .filter(([userId]) => !NON_PERSON_ACTORS.has(userId))
    .map(([userId, e]) => ({
    userId,
    collaborations: e.collaborations,
    activityCount: e.activityCount,
    actionsByType: e.actionsByType,
    lastActive: e.lastActive
  }));

  summaries.sort((a, b) =>
    (b.activityCount + b.collaborations) - (a.activityCount + a.collaborations) ||
    a.userId.localeCompare(b.userId)
  );

  return summaries;
}
