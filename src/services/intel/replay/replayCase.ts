import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { CaseActivityAction, type ActivityLogEntry } from '../../../types/intel/IntelCaseUI';

/**
 * Reconstruct what a case looked like at a moment in the past.
 *
 * Phase IV.D's premise: "this is what makes output usable by a journalist or a
 * court rather than merely persuasive." A conclusion you cannot walk back
 * through has to be taken on trust, and trust is the thing this whole project
 * is trying not to require.
 *
 * A pure fold over the activity log, with three rules that shape everything:
 *
 *  1. **Never guess an actor.** An entry with no `userId` replays as an
 *     unattributed action, permanently. Attributing it to the case owner, or
 *     to whoever acted last, would manufacture a chain of custody — which is
 *     precisely the artefact a court would rely on and precisely the one it
 *     must not be able to.
 *
 *  2. **Gaps are output, not noise.** A log that references a state it never
 *     recorded reaching is incomplete, and the reconstruction says so.
 *     Silently smoothing over it produces a plausible history, which is worse
 *     than an obviously partial one: a reader cannot tell the difference
 *     between a complete record and a convincing one.
 *
 *  3. **Deterministic.** The same log always yields the same reconstruction,
 *     including when entries share a timestamp — resolved by id, never by
 *     array order, because array order depends on how the log was loaded.
 */

/** Something the log could not account for. */
export interface ReplayGap {
  kind:
    /** The log does not begin with a creation, so the starting state is unknown. */
    | 'no-creation-entry'
    /** A status change whose stated `from` disagrees with the replayed state. */
    | 'status-discontinuity'
    /** An unlink or removal for something the log never recorded being added. */
    | 'removal-without-addition'
    /** Two entries share a timestamp; their true order is not recorded. */
    | 'simultaneous-entries'
    /** An entry whose action this reconstruction does not model. */
    | 'unmodelled-action';
  at: string;
  detail: string;
}

export interface ReplayedCase {
  /** Null until a CREATED entry is seen — an uncreated case has no status. */
  status: string | null;
  linkedEntities: string[];
  collaborators: string[];
  assignedTo: string[];
  commentCount: number;
  /** The articles the case rests on, by link (D-DP, DP7). */
  sources: string[];
  /** The timestamp of the last entry applied. */
  asOf: string | null;
  /** How many entries were applied to reach this state. */
  applied: number;
  /**
   * Actions with no recorded actor.
   *
   * Counted and listed rather than attributed. `computeContributionSummary`
   * already refuses to guess at these; this refuses in the same way and for
   * the same reason.
   */
  unattributed: Array<{ id: string; action: string; at: string }>;
  /** Everything the log could not account for. */
  gaps: ReplayGap[];
}

/**
 * Widened on `action` so an unrecognised value is representable.
 *
 * `ActivityLogEntry` types action to the CaseActivityAction enum, but a log is
 * DATA — read from storage, possibly written by an older version or another
 * instance. A reconstruction that could not represent an action outside the
 * current enum would have to either crash or drop it, and dropping evidence
 * silently is the failure this module exists to avoid.
 */
type Entry = Omit<ActivityLogEntry, 'action'> & { action: CaseActivityAction | string };

/**
 * Stable ordering.
 *
 * By timestamp, then by id. Array order is deliberately NOT a tiebreak: it
 * depends on how the log was loaded — insertion order, a database's natural
 * order, the order a JSON file happened to serialise — and a reconstruction
 * that changes with any of those is not a reconstruction, it is a rendering.
 */
function ordered(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Replay a case's activity log up to a point in time.
 *
 * `until` is inclusive of entries at that exact instant, because a timestamp
 * names a moment rather than a boundary, and excluding it would make
 * "the state at 14:00" differ from the state immediately after the 14:00 entry
 * for no reason a reader could anticipate.
 */
export function replayCase(entries: Entry[], until?: string): ReplayedCase {
  const state: ReplayedCase = {
    status: null,
    linkedEntities: [],
    collaborators: [],
    assignedTo: [],
    commentCount: 0,
    sources: [],
    asOf: null,
    applied: 0,
    unattributed: [],
    gaps: [],
  };

  const all = ordered(entries);
  const relevant = until ? all.filter((e) => e.timestamp <= until) : all;

  // Simultaneous entries are reported even though ordering by id makes the
  // result deterministic: determinism is not the same as correctness, and the
  // true order genuinely is not recorded.
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i].timestamp === relevant[i - 1].timestamp) {
      state.gaps.push({
        kind: 'simultaneous-entries',
        at: relevant[i].timestamp,
        detail: `${relevant[i - 1].id} and ${relevant[i].id} share a timestamp; their real order is not recorded. Replayed by id for determinism.`,
      });
    }
  }

  if (relevant.length > 0 && relevant[0].action !== CaseActivityAction.CREATED) {
    state.gaps.push({
      kind: 'no-creation-entry',
      at: relevant[0].timestamp,
      detail: 'The log does not begin with a creation, so the state before the first entry is unknown rather than empty.',
    });
  }

  const remove = (list: string[], value: string | null, kind: ReplayGap['kind'], at: string, what: string) => {
    if (!value) return;
    const i = list.indexOf(value);
    if (i === -1) {
      state.gaps.push({ kind, at, detail: `${what} "${value}" was removed but the log never records it being added.` });
      return;
    }
    list.splice(i, 1);
  };

  for (const entry of relevant) {
    state.applied++;
    state.asOf = entry.timestamp;

    // Attribution is recorded, never inferred.
    if (!str(entry.userId)) {
      state.unattributed.push({ id: entry.id, action: String(entry.action), at: entry.timestamp });
    }

    const d = entry.details ?? {};
    switch (entry.action) {
      case CaseActivityAction.CREATED:
        state.status = str(d.status) ?? 'NEW';
        break;

      case CaseActivityAction.STATUS_CHANGED: {
        const from = str(d.from);
        const to = str(d.to);
        if (from && state.status && from !== state.status) {
          state.gaps.push({
            kind: 'status-discontinuity',
            at: entry.timestamp,
            detail: `Entry says the status moved from "${from}", but the replayed state was "${state.status}". An entry is missing, or one was recorded wrongly.`,
          });
        }
        if (to) state.status = to;
        break;
      }

      case CaseActivityAction.CLOSED: state.status = 'CLOSED'; break;
      case CaseActivityAction.REOPENED: state.status = str(d.to) ?? 'OPEN'; break;

      case CaseActivityAction.ENTITY_LINKED: {
        const id = str(d.entityId) ?? str(entry.entityId);
        if (id && !state.linkedEntities.includes(id)) state.linkedEntities.push(id);
        break;
      }
      case CaseActivityAction.ENTITY_UNLINKED:
        remove(state.linkedEntities, str(d.entityId) ?? str(entry.entityId), 'removal-without-addition', entry.timestamp, 'Entity');
        break;

      case CaseActivityAction.COLLABORATOR_ADDED: {
        const id = str(d.userId) ?? str(entry.entityId);
        if (id && !state.collaborators.includes(id)) state.collaborators.push(id);
        break;
      }
      case CaseActivityAction.COLLABORATOR_REMOVED:
        remove(state.collaborators, str(d.userId) ?? str(entry.entityId), 'removal-without-addition', entry.timestamp, 'Collaborator');
        break;

      case CaseActivityAction.ASSIGNED: {
        const id = str(d.assignedTo) ?? str(entry.entityId);
        if (id && !state.assignedTo.includes(id)) state.assignedTo.push(id);
        break;
      }

      case CaseActivityAction.COMMENTED:
        state.commentCount++;
        break;

      case CaseActivityAction.SOURCE_ADDED: {
        const url = str(d.url);
        if (url && !state.sources.includes(url)) state.sources.push(url);
        break;
      }
      case CaseActivityAction.SOURCE_REMOVED:
        remove(state.sources, str(d.url), 'removal-without-addition', entry.timestamp, 'Source');
        break;

      // Actions that legitimately do not change reconstructed state. RESTORED
      // among them: Undo brings back the very record that was deleted.
      case CaseActivityAction.UPDATED:
      case CaseActivityAction.SHARED:
      case CaseActivityAction.CASE_LINKED:
      case CaseActivityAction.CASE_UNLINKED:
      case CaseActivityAction.RESTORED:
        break;

      default:
        // An action nobody taught this reducer about is a HOLE in the
        // reconstruction, not a no-op. Skipping it silently would produce a
        // state that looks complete while ignoring evidence.
        state.gaps.push({
          kind: 'unmodelled-action',
          at: entry.timestamp,
          detail: `Action "${String(entry.action)}" is not modelled by this reconstruction; its effect on the case is unaccounted for.`,
        });
    }
  }

  return state;
}

/**
 * Every point at which the case changed, for walking an investigation forward.
 *
 * Returns the state AFTER each entry, so a reader can step through and see
 * what each action did rather than inferring it from a diff.
 */
export function replayTimeline(entries: Entry[]): Array<{ entry: Entry; state: ReplayedCase }> {
  const all = ordered(entries);
  return all.map((entry, i) => ({
    entry,
    state: replayCase(all.slice(0, i + 1)),
  }));
}

/**
 * A digest of the log a replay was built from.
 *
 * Covers the ORDERED entries and their fields, so any reordering, edit,
 * insertion or deletion changes it. An exported replay carries this, and a
 * reader who also has the log can confirm the two correspond — which is what
 * makes a published replay checkable rather than merely presented.
 *
 * What this DOES NOT give you, stated plainly because the gap is the important
 * part: it is not tamper evidence against whoever holds the log. Someone who
 * edits the log and recomputes the digest produces a consistent pair, and
 * nothing here would notice. Real tamper evidence needs each entry to commit
 * to its predecessor AT THE WRITE SITE, and to be signed — neither of which
 * the existing activity log does. That is a change to how entries are
 * recorded, not something a reader-side function can retrofit.
 *
 * So: this detects a replay that does not match its log. It does not detect a
 * log that was rewritten wholesale. Tracked rather than implied.
 */
export function digestLog(entries: Entry[]): string {
  const canonical = ordered(entries).map((e) => JSON.stringify([
    e.id, String(e.action), e.timestamp, e.userId ?? '', e.entityId ?? '',
    // Details keys sorted, so an object rebuilt in a different order digests
    // the same — otherwise the digest would change on a round trip through
    // storage and report tampering that never happened.
    Object.entries(e.details ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ])).join('\n');
  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

export interface ReplayArtifact {
  subject: string;
  /** The reconstruction, at `asOf`. */
  state: ReplayedCase;
  /** Digest of the log this was built from. */
  logDigest: string;
  entryCount: number;
  exportedAt: string;
  /**
   * What this artifact cannot prove. Carried IN the artifact rather than in
   * documentation, because the two get separated and the caveat is the half
   * most likely to be dropped.
   */
  limits: string[];
  version: 1;
}

/** Package a replay so someone else can check it against the log. */
export function exportReplay(
  subject: string,
  entries: Entry[],
  until?: string,
  now: Date = new Date(),
): ReplayArtifact {
  const state = replayCase(entries, until);
  return {
    subject,
    state,
    logDigest: digestLog(entries),
    entryCount: entries.length,
    exportedAt: now.toISOString(),
    limits: [
      'The digest proves this replay matches the log it was built from. It does NOT prove the log itself was not rewritten — entries are not individually signed and do not commit to their predecessors.',
      ...(state.unattributed.length ? [`${state.unattributed.length} action(s) have no recorded actor and are deliberately left unattributed.`] : []),
      ...(state.gaps.length ? [`${state.gaps.length} gap(s) in the record; see state.gaps.`] : []),
    ],
    version: 1,
  };
}
