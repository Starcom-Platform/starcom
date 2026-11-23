import { FINDING_SCHEMA_VERSION_V2, type AttestationMethod } from './attestation';

/**
 * Refutation — "I checked your finding, and it does not hold."
 *
 * Corroboration without refutation is agreement-counting. Contradiction
 * detection today is INTERNAL only: an instance can notice that its own
 * observations disagree, and has no way to say so about anyone else's published
 * claim. That is the structural difference between a network that converges on
 * truth and one that amplifies its first guess.
 *
 * THE RULE THAT MAKES THIS SAFE: a refutation is itself an attestation. It
 * carries its own `method`, and its weight is derived exactly as a finding's
 * is. You cannot refute by assertion any more than you can corroborate by
 * assertion — otherwise refutation becomes a denial-of-service on truth, where
 * the cheapest possible message ("wrong") outweighs expensive evidence.
 *
 * Kind 30083: its own kind rather than a replacement of 30082, because a
 * refutation is a claim by a DIFFERENT author about a different subject (the
 * finding itself). Publishing it into the finding's slot would let anyone
 * overwrite anyone's claim, which is the opposite of what checkability means.
 */

export const REFUTATION_KIND = 30083;

/**
 * The `d` tag a refutation is addressed by.
 *
 * ─── WHY A REFUTATION NEEDS ONE AT ALL ─────────────────────────────────────
 *
 * Kind 30083 sits in NIP-01's addressable range (30000–39999), where relays
 * keep one event per (pubkey, kind, d-tag). The published specification called
 * refutation a "regular" event, which the number contradicts — and specified no
 * `d` tag, so relays treated it as absent and collapsed every refutation an
 * author published into a single slot. An author could hold exactly one
 * refutation on a relay, ever.
 *
 * Reported 2026-08-26, confirmed independently by Mecha Jono against NIP-01's
 * own ranges rather than against nostr-tools, and resolved by both implementers
 * choosing to keep 30083 and specify this tag rather than relocate the kind.
 *
 * ─── WHY THIS IS THE RIGHT SEMANTICS, NOT A COMPROMISE ─────────────────────
 *
 * The objection to keeping 30083 was that two grounds for refuting one claim
 * would collapse into one slot. Mecha Jono's reading, which is better than the
 * one this codebase started with: the identifier includes `attribute`, so a
 * refutation of one attribute and a refutation of another coexist. Only two
 * refutations of the SAME attribute collide, and there "the refuter's latest
 * word on this point supersedes their own earlier word" is closer to how
 * correction actually works than an accumulating pile of superseded attempts.
 *
 * Addressability at a kind that is not 30082 never touches a claim's slot, so
 * "a refutation must not overwrite the claim" is satisfied by using a different
 * KIND — not by being regular. The two requirements were conflated.
 *
 * ─── EVERY COMPONENT IS ENCODED, INCLUDING THE TIMESTAMP ───────────────────
 *
 * The proposal in the defect report left `publishedAt` raw. ISO-8601 timestamps
 * contain colons, so `…:2026-08-26T12:00:00.000Z` splits into six parts on the
 * separator instead of four, and the identifier stops being unambiguously
 * decomposable. Found while implementing the fix, which is the argument for
 * implementing a spec change before ratifying it.
 */
export function refutationIdentifier(refutes: {
  authorPubkey: string;
  subjectRef: string;
  attribute: string;
  publishedAt: string;
}): string {
  return [
    encodeURIComponent(refutes.authorPubkey),
    encodeURIComponent(refutes.subjectRef),
    encodeURIComponent(refutes.attribute),
    encodeURIComponent(refutes.publishedAt),
  ].join(':');
}

export type RefutationGround =
  /** I hold observations that conflict with this claim. */
  | 'contradicting-evidence'
  /** I ran your stated method against my data and did not get your result. */
  | 'failed-reproduction'
  /** A source this finding depended on has been discredited or withdrawn. */
  | 'source-defect'
  /** The claim was true when made and no longer is. Not an accusation of error. */
  | 'superseded-by-time';

export interface FindingRefutation {
  schemaVersion: number;
  refutes: {
    subjectRef: string;
    attribute: string;
    /**
     * WHICH instance's finding. Two instances can publish about the same
     * subject and attribute, so subject+attribute alone does not identify a
     * claim once more than one publisher exists.
     */
    authorPubkey: string;
    /**
     * The `publishedAt` of the specific finding being refuted.
     *
     * Without it a refutation would silently apply to every later revision of
     * the same slot — including one that fixed the very problem being refuted.
     * A refutation is about a claim as it was made, not about a subject
     * forever.
     */
    publishedAt: string;
  };
  ground: RefutationGround;
  /**
   * The refuter's OWN evidence, in the same shape a finding uses.
   *
   * This is what makes a refutation weighable rather than merely loud. A
   * consumer derives its weight with the same function it uses on the claim,
   * and compares like with like.
   */
  method: AttestationMethod;
  publishedAt: string;
}

/**
 * Which shape this content is, decided by what it CARRIES rather than by a
 * kind number the sender chose. A refutation names what it contests; nothing
 * else does.
 *
 * Lives here, beside every other refutation primitive, because two definitions
 * of "what counts as a refutation" is exactly how one payload gets routed to
 * the claim store on one side of the app and the refutation store on the other.
 */
export function isRefutation(content: unknown): content is FindingRefutation {
  return typeof content === 'object' && content !== null && 'refutes' in content;
}

export function buildRefutation(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  method: AttestationMethod,
  now: () => Date = () => new Date(),
): FindingRefutation {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    refutes,
    ground,
    method,
    publishedAt: now().toISOString(),
  };
}

/**
 * What a consumer should conclude when it holds a claim and some refutations.
 *
 * `refuted` deliberately does not mean "deleted". A refuted claim stays visible
 * and stays checkable — the point of an open network is that disagreement is
 * legible, not that the loudest party wins and the record is quietly amended.
 */
export type ContestedState =
  /** No refutations, or none that carry meaningful weight. */
  | 'uncontested'
  /** Refuted, but the original still carries comparable or greater weight. */
  | 'contested'
  /** Refutation weight clearly exceeds the claim's. */
  | 'refuted';

/**
 * Compare derived weights — never counts.
 *
 * Counting refutations would make refutation a voting system, and a voting
 * system on an open network is won by whoever can run the most instances. One
 * well-evidenced refutation should outweigh ten empty ones, and does, because
 * each is weighed by its own method.
 */
export function contestedState(claimWeight: number, refutationWeights: number[]): ContestedState {
  const strongest = refutationWeights.length ? Math.max(...refutationWeights) : 0;
  if (strongest <= 0) return 'uncontested';
  // A decisive margin, not a bare majority: overturning a published claim
  // should require clearly better evidence, not marginally better.
  if (strongest > claimWeight * 1.5) return 'refuted';
  return 'contested';
}
