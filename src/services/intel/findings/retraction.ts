import { FINDING_SCHEMA_VERSION_V2 } from './attestation';

/**
 * Withdrawing a published finding.
 *
 * Kind 30082 is parameterized-replaceable, so a retraction is published to the
 * SAME `d` tag as the finding it withdraws. Relays keep only the latest event
 * per slot, which means any consumer that queries the slot gets the retraction
 * instead of the claim — the withdrawal propagates through the same mechanism
 * the finding did, with no separate subscription to remember.
 *
 * This matters more than a tidy-up. The data model permits findings about
 * named individuals, published to public relays, by an instance that can be
 * wrong. Without a withdrawal path, the first mistaken claim about a real
 * person is permanent and unanswerable. Retraction is the difference between a
 * system that can be wrong and one that cannot admit it.
 *
 * What replacement does NOT solve, stated plainly: a consumer that fetched the
 * original and cached it will not learn of the retraction unless it re-queries.
 * That is a real limit of the transport, not something this file can fix, which
 * is why the consumer obligation is written into the spec rather than assumed.
 */

export type RetractionReason =
  /** A newer finding replaces this one. The claim was not wrong, it is stale. */
  | 'superseded'
  /** The claim was wrong — bad input, bad derivation, or bad data. */
  | 'error'
  /** A contributing source withdrew or was discredited after publication. */
  | 'source-withdrawn'
  /** Withdrawn at the request of, or on behalf of, the subject. */
  | 'subject-request'
  /** Withdrawn because publishing it was against policy, whatever its accuracy. */
  | 'policy'
  /**
   * Withdrawn because it decayed and was never rechecked.
   *
   * Distinct from 'superseded', which asserts that a NEWER FINDING replaces
   * this one. In a decay retraction there is no newer finding — that is the
   * whole reason for withdrawing. Reusing 'superseded' would tell consumers a
   * replacement exists and leave them looking for it.
   *
   * It is also the most honest thing a publisher can say here: not that the
   * claim was wrong, but that they are no longer willing to stand behind it
   * unexamined.
   */
  | 'decayed';

export interface FindingRetraction {
  schemaVersion: number;
  /** Marks this payload as a withdrawal. A consumer MUST check it before reading a claim. */
  retracted: true;
  /** Identifies the finding withdrawn — the same subject/attribute pair that forms its `d` tag. */
  retracts: { subjectRef: string; attribute: string };
  retractedAt: string;
  reason: RetractionReason;
  /**
   * Optional human explanation.
   *
   * Deliberately optional and deliberately free text: a retraction should never
   * be blocked on composing a justification. Withdrawing a wrong claim quickly
   * matters more than explaining it well.
   */
  note?: string;
}

export function buildRetraction(
  retracts: { subjectRef: string; attribute: string },
  reason: RetractionReason,
  note?: string,
  now: () => Date = () => new Date(),
): FindingRetraction {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    retracted: true,
    retracts,
    retractedAt: now().toISOString(),
    reason,
    ...(note ? { note } : {}),
  };
}

/** Type guard for consumers reading a 30082 payload, which may now be either. */
export function isRetraction(payload: unknown): payload is FindingRetraction {
  return Boolean(payload) && (payload as FindingRetraction).retracted === true;
}
