/**
 * What a case still needs to know.
 *
 * ─── WHY NOT src/models/Intel/Requirements.ts ──────────────────────────────
 *
 * That file already models this, in 314 lines, imported by nothing. It was not
 * wired here because three of its fields encode premises this network has
 * explicitly rejected:
 *
 *   `percentSatisfied: number`   asserted by the requirement's own owner, with
 *                                nothing computing it. The declared-confidence
 *                                defect, one tier up.
 *   `customerFeedback.rating`    a 1-5 score of one's own collection.
 *   `status: 'APPROVED'`         implies a body that approves. Authority here
 *                                is rooted in the resource, not issued.
 *
 * It also carries compartments and releasability lists, which belong to a
 * closed system rather than an open-source network. Wiring it would have
 * reintroduced exactly what the attestation model exists to refuse.
 *
 * ─── WHAT REPLACES THEM ────────────────────────────────────────────────────
 *
 * A requirement is a QUESTION, and whether it has been answered is DERIVED from
 * the evidence linked to it — never stated by the person who raised it. Urgency
 * is derived from the deadline and the clock rather than picked from a
 * vocabulary of severities, for the same reason a claim's weight is derived
 * from its method: a label the author chooses tells a reader about the author.
 */

/**
 * Imported, not restated.
 *
 * This file first carried its own copy of the three evidential stages, which is
 * the duplication that makes two places disagree later — the same failure that
 * put a required field in one specification and not the other. There is one
 * definition of what counts as evidence, and requirements use it.
 */
import { EVIDENTIAL_STATUSES } from '../../../applications/intelanalyzer/adapters/eventsAdapter';
import type { FieldMethod } from '../../../types/intel/SourceObservation';
import { decodeGeohash } from '../observations/adapters/geohash';

export interface CollectionRequirement {
  id: string;
  /**
   * What is not known, phrased as a question.
   *
   * A question rather than a title, because "Acme ownership" does not say what
   * would settle it and two collectors will read it two ways. "Who are Acme's
   * registered directors as of 2026?" can be answered or not.
   */
  question: string;
  /**
   * What decision waits on the answer.
   *
   * Required. A requirement nobody can justify is a wish, and a collector
   * choosing what to chase next needs to know what turns on it.
   */
  because: string;
  raisedBy: string;
  raisedAt: string; // ISO
  /**
   * When the answer stops being useful — not when somebody wants it by.
   *
   * A deadline expressing impatience decays into noise once every requirement
   * carries the earliest date its author could type. This one is checkable:
   * after it, an answer no longer serves the decision named in `because`.
   */
  staleAfter?: string; // ISO
  /** Report ids offered as answering this. Satisfaction is derived from these. */
  answeredBy: string[];
  /**
   * Who said they are working on it — a signal of intent, NOT a reservation.
   *
   * ─── WHY A CLAIM AND NOT AN ASSIGNMENT ───────────────────────────────────
   *
   * "Assign" presumes a body with the authority to assign, and this network has
   * none: authority here is rooted in the resource, never issued. A collector
   * takes a question because they can answer it, the same way a mission's
   * dispatch authority roots in whoever created it.
   *
   * ─── WHY IT DOES NOT LOCK ────────────────────────────────────────────────
   *
   * Nothing stops anyone else answering a claimed requirement. A claim that
   * excluded others would become a lock, and a lock held by somebody who has
   * since walked away is worse than no signal at all — the question would look
   * owned and be abandoned, with nothing in the system able to tell the
   * difference. Stating intent costs nothing if it lapses; reserving does.
   */
  claimedBy?: { by: string; at: string };
  /**
   * Withdrawn with a reason, never silently.
   *
   * Same rule as a released containment and an addressed contradiction: an
   * empty field would let a requirement be dropped while looking decided.
   */
  closed?: { reason: string; by: string; at: string };
  /**
   * What kind of field work would answer this — and therefore whether sending
   * a person is any use at all.
   *
   * Starcom is where intelligence is processed; Navcom is where people walk to
   * places. A requirement can only reach them if it says which of the two it
   * needs, because most do not need a person: "who are Acme's registered
   * directors" is answered from a register, and dispatching someone to stand in
   * a street for it puts a person somewhere for no reason and returns nothing.
   *
   * The vocabulary is the FIELD subset of the observation methods, imported so
   * the ask and the answer use one list. A requirement asking for `saw` is
   * asking for exactly what a kind-1911 event carrying `m: saw` files back.
   *
   * Absent means unstated, not "desk only". Nothing infers dispatchability from
   * silence — see `fieldDispatchable`, which requires the field to be present.
   */
  modality?: readonly FieldMethod[];
  /**
   * Where to look, as a geohash cell.
   *
   * ─── WHY A CELL, AND WHY THIS COARSE ─────────────────────────────────────
   *
   * A requirement that travels is a requirement that says where somebody is
   * about to go. Published precisely, it is a schedule of an operator's
   * movements written by us, before they have even accepted it.
   *
   * The precision is deliberately the same as the precision Starcom ACCEPTS on
   * the way back in. Asking more finely than we can ingest would invite an
   * operator to produce something we then drop — the trip taken, the risk
   * carried, the observation refused at our door.
   */
  place?: { geohash: string };
}

/**
 * The one number, kept honest by a test rather than an import.
 *
 * navcomAdapter's ACCEPTED_GEOHASH_LENGTHS is the authority; importing it here
 * would pull an entire Nostr adapter into a type module for one integer. The
 * test beside this file asserts the two agree, so the coupling is enforced
 * without the dependency.
 */
export const REQUIREMENT_PLACE_CHARS = 4;

/**
 * A place a requirement may carry, or null.
 *
 * Returns null rather than throwing, and null rather than a repaired value: a
 * requirement raised with an unusable location should be raised without one and
 * say so, not silently carry a cell somebody did not mean.
 */
export function requirementPlace(geohash: string | undefined | null): { geohash: string } | null {
  const g = (geohash ?? '').trim().toLowerCase();
  if (!g) return null;
  const cell = decodeGeohash(g);
  if (!cell || cell.precisionChars !== REQUIREMENT_PLACE_CHARS) return null;
  return { geohash: g };
}

/**
 * Whether this is a question a person on the ground could actually answer.
 *
 * Requires BOTH halves, and that is the whole point of the predicate. A
 * modality with no place is a request to go and look with nowhere to go; a
 * place with no modality does not say whether standing there would settle
 * anything. Either alone reads as actionable in a queue and is not.
 */
export function fieldDispatchable(requirement: CollectionRequirement): boolean {
  return Boolean(requirement.place && requirement.modality && requirement.modality.length > 0);
}

export type RequirementState =
  /** Nothing offered against it yet. */
  | 'open'
  /** Evidence linked, none of it yet at a stage that counts. */
  | 'pending-evidence'
  /** At least one evidential report answers it. */
  | 'answered'
  /** Past its usefulness with no answer. Not a failure to record — a fact. */
  | 'stale'
  /** Withdrawn, with a stated reason. */
  | 'closed';

export interface RequirementStatus {
  state: RequirementState;
  /** Reports linked, whatever their lifecycle stage. */
  offered: number;
  /** Of those, how many actually count as evidence. */
  evidential: number;
  /**
   * Hours until it stops being useful; negative once past. Null when no
   * `staleAfter` was set — absent, not infinite. A caller must not read "no
   * deadline" as "plenty of time".
   */
  hoursRemaining: number | null;
}

/**
 * What a requirement's state actually is, computed from what is linked to it.
 *
 * `reportStage` resolves a linked report id to its lifecycle stage. Ids it does
 * not know return undefined and count as offered but not evidential — a link to
 * something unreadable is not an answer, and guessing otherwise would let a
 * deleted report keep a question closed.
 */
export function requirementStatus(
  requirement: CollectionRequirement,
  reportStage: (reportId: string) => string | undefined,
  now: Date = new Date(),
): RequirementStatus {
  const offered = requirement.answeredBy.length;
  const evidential = requirement.answeredBy
    .filter((id) => EVIDENTIAL_STATUSES.has(reportStage(id) ?? '')).length;

  const hoursRemaining = requirement.staleAfter
    ? (Date.parse(requirement.staleAfter) - now.getTime()) / 3_600_000
    : null;

  // Order matters. A closed requirement is closed whatever else is true — it
  // was withdrawn deliberately, and reporting it as stale or answered would
  // overwrite a human decision with a computed one.
  const state: RequirementState = requirement.closed
    ? 'closed'
    : evidential > 0
      ? 'answered'
      : hoursRemaining !== null && hoursRemaining < 0
        ? 'stale'
        : offered > 0
          ? 'pending-evidence'
          : 'open';

  return { state, offered, evidential, hoursRemaining };
}

/**
 * What a collector should pick up next.
 *
 * Sorted by how soon each stops being useful, with undated requirements LAST
 * rather than first. An undated requirement is not urgent by default, and
 * treating absence as urgency is how every queue fills with things nobody
 * dated.
 *
 * Answered and closed requirements are omitted: this answers "what is still
 * needed", and a list including settled questions is one nobody reads twice.
 */
export function collectionQueue(
  requirements: CollectionRequirement[],
  reportStage: (reportId: string) => string | undefined,
  now: Date = new Date(),
): Array<{ requirement: CollectionRequirement; status: RequirementStatus }> {
  return requirements
    .map((requirement) => ({ requirement, status: requirementStatus(requirement, reportStage, now) }))
    .filter(({ status }) => status.state !== 'answered' && status.state !== 'closed')
    .sort((a, b) => {
      const ah = a.status.hoursRemaining;
      const bh = b.status.hoursRemaining;
      if (ah === null && bh === null) return a.requirement.raisedAt.localeCompare(b.requirement.raisedAt);
      if (ah === null) return 1;
      if (bh === null) return -1;
      return ah - bh;
    });
}
