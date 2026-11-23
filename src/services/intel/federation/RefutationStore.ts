/**
 * Refutations received from other nodes, held against the claims they contest.
 *
 * ─── WHY A SEPARATE STORE ──────────────────────────────────────────────────
 *
 * ForeignFindingStore is keyed by the slot a claim OCCUPIES. A refutation does
 * not occupy a claim's slot and must never be filed as though it did — it is
 * addressed by which claim it argues with, which is a different key with a
 * different arity (author + subject + attribute + publishedAt, four parts, not
 * two). Merging them would mean a refutation could be returned where a claim
 * was asked for.
 *
 * ─── WHY AN UNWEIGHABLE REFUTATION IS REFUSED ──────────────────────────────
 *
 * The NIP is explicit: a refutation MUST carry its own method, because without
 * that requirement the cheapest possible message — "wrong" — outweighs
 * expensive evidence, and refutation becomes a denial-of-service on truth.
 *
 * Following ForeignFindingStore's reasoning, the check is not a field-by-field
 * precondition audit but whether the derivation actually produces a number.
 * Anything else loses the race against a format that keeps growing.
 */
import { verifyFindingSignature } from '../findings/signFinding';
import { contentGateFailure, REFUTATION_GROUNDS, type ContentGateFailure } from './contentGates';
import { ownPublishingKeys } from '../findings/ownPublishingKeys';
import { deriveAttestationWeight } from '../findings/deriveAttestationWeight';
import { refutationIdentifier, contestedState } from '../findings/refutation';
import type { FindingRefutation, ContestedState } from '../findings/refutation';
import type { SignedFinding } from '../findings/signFinding';
import { createLogger } from '@utils/logger';
import { ML_DSA_65_PUBKEY_BYTES, canonicalKeyString } from '../../exchange/signatureEncoding';

const log = createLogger({ prefix: 'Refutations' });

export type RefutationRejection =
  /** Not the shape of a signed payload at all. */
  | 'malformed'
  /** Signature does not verify. A relay serving these is broken or hostile. */
  | 'invalid-signature'
  /** No `refutes`, so nothing identifies what is being contested. */
  | 'not-a-refutation'
  /** Refuses to name which publisher's claim, or which version of it. */
  | 'unaddressed'
  /** Our own refutation, back off a relay we published it to. Not disagreement. */
  | 'own-publication'
  /** A ground outside the registered vocabulary. */
  | 'unknown-ground'
  /** This author already has a NEWER refutation of the same claim on file. */
  | 'superseded'
  /** Fails a gate every shape in this format must pass. */
  | ContentGateFailure
  /** Carries no method a consumer can weigh. See the note above: this is the
   *  difference between disagreement and a denial-of-service. */
  | 'underivable-weight';

export interface StoredRefutation {
  refutation: FindingRefutation;
  /** The ML-DSA key that signed it, NOT the relay that served it. */
  authorPubkey: string;
  /** Derived here once, so a caller cannot substitute a weight of its own. */
  weight: number;
  receivedAt: string;
}

export interface RefutationAcceptResult {
  accepted: boolean;
  reason?: RefutationRejection;
}

export class RefutationStore {
  /** Keyed by refutationIdentifier — the address of the claim being contested. */
  private byClaim = new Map<string, StoredRefutation[]>();
  private rejections = new Map<RefutationRejection, number>();

  constructor(private ownPubkey?: () => string | null) {}

  accept(payload: unknown, receivedAt: string = new Date().toISOString()): RefutationAcceptResult {
    const signed = payload as Partial<SignedFinding>;
    if (!signed?.content || !signed?.signature?.pubkey) return this.reject('malformed');

    if (!verifyFindingSignature(signed as SignedFinding)) {
      log.warn(`Rejected refutation from ${signed.signature.pubkey.slice(0, 16)}…: signature does not verify`);
      return this.reject('invalid-signature');
    }

    /**
     * Our own voice, returning off the relays we broadcast to.
     *
     * isOwn existed here, was documented as the rule, and was called from
     * nowhere — and the key it would have compared was the Nostr identity,
     * which can never equal an ML-DSA signature key. So this node's own
     * refutations came back, were stored, and were counted by contestedFor as
     * independent disagreement: an instance contesting itself.
     */
    // Canonical hex before the comparison: ownPublishingKeys holds the form we
    // emit, so a key that arrived base64-encoded would never match it. Same
    // reasoning as ForeignFindingStore's author line.
    const author = canonicalKeyString(signed.signature.pubkey, ML_DSA_65_PUBKEY_BYTES);
    if (ownPublishingKeys.has(author)) return this.reject('own-publication');

    const content = signed.content as Partial<FindingRefutation>;
    if (!content.refutes) return this.reject('not-a-refutation');

    /**
     * The same gates the claim store applies, because this is the same wire
     * format. Skipping them here meant a refutation could carry a declared
     * confidence, an unregistered modality, or a schema version this build does
     * not speak — refused by the reference peer, stored by us, and then used to
     * mark somebody's claim refuted.
     */
    const gateFailure = contentGateFailure(content);
    if (gateFailure) {
      log.warn(`Rejected refutation from ${signed.signature.pubkey.slice(0, 16)}…: ${gateFailure}`);
      return this.reject(gateFailure);
    }

    // Closed, like every other vocabulary in this format. Accepting an
    // unregistered ground would silently turn a publisher's error into a
    // weaker-but-accepted contest, and there would be no way to report it.
    if (!REFUTATION_GROUNDS.has(String(content.ground))) {
      return this.reject('unknown-ground');
    }

    const { authorPubkey, subjectRef, attribute, publishedAt } = content.refutes;
    if (!authorPubkey || !subjectRef || !attribute || !publishedAt) {
      // Subject and attribute stop identifying a claim the moment two
      // publishers exist, and without the timestamp the refutation would apply
      // to every later revision — including one that fixed the very problem.
      return this.reject('unaddressed');
    }

    // Wrapped, because the derivation reads nested method fields and a payload
    // that omits them throws rather than returning a non-number. Either way the
    // answer is the same and it is the only question worth asking: no number,
    // no weight, no standing to contest anything.
    let weight: number;
    try {
      weight = deriveAttestationWeight(content as FindingRefutation);
    } catch {
      return this.reject('underivable-weight');
    }
    if (!Number.isFinite(weight) || weight <= 0) return this.reject('underivable-weight');

    const key = refutationIdentifier(content.refutes);
    const existing = this.byClaim.get(key) ?? [];

    // One live refutation per author per claim: the kind is addressable, so a
    // republish by the same author REPLACES rather than accumulates. Counting
    // both would let an author manufacture weight by republishing.
    /**
     * Replace only with something NEWER.
     *
     * This dropped whatever the author had on file unconditionally, so an
     * out-of-order delivery — routine across six relays — let a stale, weak
     * refutation overwrite the strong one that arrived first, and a hostile
     * peer could force it by rebroadcasting the author's own older event,
     * which still verifies.
     */
    const held = existing.find((r) => r.authorPubkey === signed.signature!.pubkey);
    if (held && Date.parse(String(held.refutation.publishedAt)) > Date.parse(String(content.publishedAt))) {
      return this.reject('superseded');
    }
    const next = existing.filter((r) => r.authorPubkey !== signed.signature!.pubkey);
    next.push({
      refutation: content as FindingRefutation,
      authorPubkey: author,
      weight,
      receivedAt,
    });
    this.byClaim.set(key, next);
    return { accepted: true };
  }

  /** Every refutation held against one specific claim, as that claim was made. */
  forClaim(refutes: FindingRefutation['refutes']): StoredRefutation[] {
    return this.byClaim.get(refutationIdentifier(refutes)) ?? [];
  }

  /**
   * What a consumer should conclude about a claim it holds.
   *
   * Weights are compared, never counts — a voting system on an open network is
   * won by whoever runs the most instances.
   */
  contestedFor(
    claim: { method: unknown; publishedAt: string },
    refutes: FindingRefutation['refutes'],
  ): ContestedState {
    const held = this.forClaim(refutes);
    if (held.length === 0) return 'uncontested';

    /**
     * Guarded, as accept() already guards the same call.
     *
     * A malformed or legacy ledger entry makes this throw, and this runs inside
     * CorrelationContext's render-time useMemo — so one bad row took the panel
     * down rather than being reported.
     *
     * The fallback is 'contested', not 'uncontested'. Refutations exist by this
     * point; what failed is our ability to show the claim outweighs them.
     * Returning 'uncontested' would hide real disagreement behind an internal
     * error, which is exactly the failure this whole mechanism exists to
     * prevent — an interface that can only show who agrees reports consensus
     * whether or not consensus exists.
     */
    let claimWeight: number;
    try {
      claimWeight = deriveAttestationWeight(
        claim as Parameters<typeof deriveAttestationWeight>[0],
      );
    } catch {
      return 'contested';
    }
    return contestedState(claimWeight, held.map((r) => r.weight));
  }

  /** Own publications return from relays we broadcast to; they are not disagreement. */
  isOwn(pubkey: string): boolean {
    return this.ownPubkey?.() === pubkey;
  }

  contestedClaimCount(): number {
    return this.byClaim.size;
  }

  rejectionCounts(): Record<string, number> {
    return Object.fromEntries(this.rejections);
  }

  reset(): void {
    this.byClaim.clear();
    this.rejections.clear();
  }

  private reject(reason: RefutationRejection): RefutationAcceptResult {
    this.rejections.set(reason, (this.rejections.get(reason) ?? 0) + 1);
    return { accepted: false, reason };
  }
}
