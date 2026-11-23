import { requirementStatus } from '../collection/collectionRequirement';
import type { CollectionRequirement } from '../collection/collectionRequirement';
import type { AttentionItem } from './AttentionItem';

export const STALE_REQUIREMENT_PRODUCER = 'requirement-past-usefulness';

export interface StaleRequirementInput {
  /** Open cases and the questions they are still asking. */
  cases: Array<{ id: string; title: string; requirements?: CollectionRequirement[] }>;
  /** Lifecycle stage of a linked report, so "answered" stays derived. */
  reportStage: (reportId: string) => string | undefined;
}

/**
 * Questions a case asked that nobody answered in time.
 *
 * ─── WHY THIS PRODUCER EXISTS ──────────────────────────────────────────────
 *
 * The queue had three producers and every one of them watched ANALYSIS: a
 * contradiction inside a case, a peer's claim intersecting a case, our own
 * published claim decaying. All three are work for somebody who already has an
 * investigation open.
 *
 * A collector — the person the network most needs and has fewest of — had no
 * queue at all. Nothing anywhere in the app said "this was needed and is not
 * here". That is the one kind of work a collector can actually act on, and its
 * absence is why the app's best "what should I do next" mechanism served only
 * the roles that were already busy.
 *
 * ─── WHY STALE AND NOT MERELY OPEN ─────────────────────────────────────────
 *
 * An open requirement is ordinary; the queue would fill with every question
 * anyone ever asked and stop being read. A requirement past the date its answer
 * stops serving the decision behind it is a different fact — it says the case
 * will now be adjudicated without something it said it needed.
 *
 * Requirements with no deadline never appear here. Absence of a date is not
 * urgency, and treating it as urgency is how a queue fills with things nobody
 * dated.
 */
export function produceStaleRequirementItems(
  input: StaleRequirementInput,
  now: () => Date = () => new Date(),
): AttentionItem[] {
  const stamp = now();
  const at = stamp.toISOString();
  const items: AttentionItem[] = [];

  for (const c of input.cases) {
    for (const requirement of c.requirements ?? []) {
      const status = requirementStatus(requirement, input.reportStage, stamp);
      if (status.state !== 'stale') continue;

      /**
       * Severity grows with how long it has been past use, and is capped.
       *
       * A requirement a day overdue and one overdue by a month are different
       * obligations, but neither should be able to reach 1 and crowd out a
       * contradiction — the same ceiling the decayed-finding producer keeps,
       * and for the same reason.
       */
      const daysPast = Math.max(0, -(status.hoursRemaining ?? 0) / 24);
      /**
       * A claimed requirement is still stale and still listed.
       *
       * Somebody said they were working on it and it is still not answered, so
       * hiding it would let a claim nobody followed through on silently suppress
       * the work — which is exactly the failure a claim-as-lock would cause,
       * arriving by a different route. It ranks lower, because a question
       * somebody is on is genuinely less urgent than one nobody has taken.
       */
      const claimed = requirement.claimedBy !== undefined;
      /**
       * Roughly a month of gradation before the ceiling.
       *
       * The first rate here rose 0.05/day and saturated in eleven, after which
       * a requirement a fortnight overdue and one overdue by a year ranked
       * identically — the ordering stopped carrying information exactly where a
       * collector most needs it. A test comparing two ages caught it by both
       * sitting at the cap.
       */
      const severity = Math.min(0.3 + daysPast * 0.02, 0.85) * (claimed ? 0.6 : 1);

      items.push({
        // The requirement alone. It is one concern however many times the
        // queue is recomputed, and including the elapsed time would resurface
        // it as new on every pass as it ages.
        id: `stale-requirement:${requirement.id}`,
        subject: requirement.question,
        /**
         * A question is not an entity, so neither field can be answered — and
         * `unknown` is the honest answer rather than the fallback one. The type
         * says so itself: "we did not measure" and "we measured, it is fine"
         * are different claims and only one of them is earned.
         *
         * evidenceProvenance especially: an unanswered requirement has no
         * evidence to have provenance ABOUT. Marking it `real` would assert
         * something about material that does not exist.
         */
        subjectKind: 'unknown',
        evidenceProvenance: 'unknown',
        reason: 'requirement-went-stale',
        producedBy: STALE_REQUIREMENT_PRODUCER,
        caseId: c.id,
        firstSeen: at,
        lastSeen: at,
        severity,
        state: 'new',
        /**
         * Carries the JUSTIFICATION, not just the question.
         *
         * `because` is required when a requirement is raised precisely so this
         * sentence can exist: a collector deciding what to chase next needs to
         * know what turns on the answer, and "we needed X" without "for Y" is
         * a task rather than a reason.
         */
        explanation:
          `${c.title}: needed "${requirement.question}" — ${requirement.because}. `
          + `Past usefulness${status.offered > 0 ? `; ${status.offered} report(s) offered, none counting as evidence` : ' with nothing offered'}.`
          + (claimed ? ` ${requirement.claimedBy!.by} said they were on it.` : ''),
      });
    }
  }

  return items;
}
