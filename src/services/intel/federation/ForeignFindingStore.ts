import { verifyFindingSignature } from '../findings/signFinding';
import { identifierFor } from '../findings/FindingContent';
import { isRetraction } from '../findings/retraction';
import { isRefutation } from '../findings/refutation';
import { ownPublishingKeys } from '../findings/ownPublishingKeys';
import { contentGateFailure } from './contentGates';
import type { FindingAttestation } from '../findings/attestation';
import type { ForeignFinding } from './foreignFinding';
import { createLogger } from '@utils/logger';
import { yieldsUsableWeight } from './deriveClaimWeight';
import { ML_DSA_65_PUBKEY_BYTES, canonicalKeyString } from '../../exchange/signatureEncoding';

const log = createLogger({ prefix: 'ForeignFindings' });

/**
 * Findings received from other instances.
 *
 * Deliberately its own store, not part of the workspace. A foreign finding is
 * never local data and must never be mistaken for it — an operator looking at
 * a conclusion needs to know whether their instance reached it or somebody
 * else's did, and a shared store makes that a matter of remembering to check.
 */

export type RejectionReason =
  | 'invalid-signature'
  | 'unsupported-schema'
  | 'malformed'
  | 'own-publication'
  /**
   * The payload asserts its own confidence or weight.
   *
   * A VALID SIGNATURE OVER A FORBIDDEN PAYLOAD IS STILL A REJECTION. This
   * store previously accepted these: it verified the signature, checked the
   * schema version, and stored a foreign instance's self-declared confidence
   * as though it were evidence. That is precisely the assertion the whole
   * derived-weight design exists to refuse, arriving through the one door
   * that matters — and a signature only proves the bytes are authentic, never
   * that they are permitted.
   */
  | 'declared-weight'
  /**
   * Required fields absent. Found by the same conformance vectors: without
   * this check, `method.timePrecisionMs` being undefined propagates into
   * weight derivation and yields NaN, which sorts and compares as neither
   * high nor low and silently poisons every ranking it touches.
   */
  | 'missing-required-fields'
  /**
   * `method.modality` outside the registered vocabulary. Ratified network-wide
   * as part of the merged confidence model: a claim states HOW it was
   * observed. Coercing an unrecognised value to `unknown` would silently turn
   * a publisher's error into a weaker but accepted claim, so it is refused.
   */
  | 'unknown-modality'
  /**
   * Every field is present and well-formed, and the claim still yields no
   * usable weight.
   *
   * The `missing-required-fields` note above describes this hazard and closes
   * exactly one instance of it, by requiring `method.timePrecisionMs`. The
   * class stayed open: `method.parameters.windowHours` reopens the identical
   * hole, because the derivation multiplies by it and nothing required it.
   *
   * Checking preconditions field by field will always lose this race — the
   * only reliable question is whether the derivation actually produces a
   * number, so that is the question asked.
   */
  | 'underivable-weight';

/** Every field a v2 attestation must carry, per docs/spec/nip-draft-attested-claims.md. */
const REQUIRED_FIELDS = [
  'claim.subjectRef', 'claim.subjectKind', 'claim.attribute', 'claim.value',
  'method.algorithm', 'method.algorithmVersion', 'method.criteria',
  'method.sourceCount', 'method.observedFrom', 'method.observedTo',
  'method.timePrecisionMs', 'method.parameters', 'method.modality',
  'method.weakBacking', 'publishedAt',
] as const;



export interface AcceptResult {
  accepted: boolean;
  reason?: RejectionReason;
}

export class ForeignFindingStore {
  /** Keyed by author + slot: two instances may publish about the same subject, and both are kept. */
  private findings = new Map<string, ForeignFinding>();
  private retractedSlots = new Set<string>();
  private rejections = new Map<RejectionReason, number>();

  constructor(private ownPubkey?: () => string | null) {}

  /**
   * Ingest a payload received from a relay.
   *
   * Verification happens BEFORE storage, always. An unverified finding in the
   * store is worse than no finding: it looks exactly like a verified one at
   * every later point, and nothing downstream re-checks.
   */
  accept(payload: unknown, receivedAt: string = new Date().toISOString()): AcceptResult {
    const signed = payload as { content?: unknown; signature?: { pubkey?: string } };
    if (!signed?.content || !signed?.signature?.pubkey) {
      return this.reject('malformed');
    }

    if (!verifyFindingSignature(signed as never)) {
      // Loudly. A relay serving payloads whose signatures do not verify is
      // either broken or hostile, and either is worth an operator knowing.
      log.warn(`Rejected finding from ${signed.signature.pubkey.slice(0, 16)}…: signature does not verify`);
      return this.reject('invalid-signature');
    }

    /*
     * Canonical hex, whatever encoding arrived.
     *
     * This took the key as written. A peer emitting base64 and the same peer
     * emitting hex would have been TWO authors here — their findings split
     * across two identities that never merge, and their own-publication check
     * below missing its own key. Tolerating both encodings on the wire (see
     * signatureEncoding.ts) is only safe if identity is canonicalised at the
     * boundary where it is derived, which is this line.
     */
    const author = canonicalKeyString(signed.signature.pubkey, ML_DSA_65_PUBKEY_BYTES);

    // Our own publications come back from relays we broadcast to. Counting
    // them as foreign corroboration would be an instance corroborating itself.
    /**
     * Asked of the keys we actually PUBLISH under.
     *
     * This compared `author` — a 3904-character ML-DSA-65 key — against the
     * Nostr identity, which is 64 characters of secp256k1. They can never be
     * equal, so this branch never fired once and every claim we published came
     * back off the relays and was stored as a FOREIGN finding: this instance
     * corroborating itself, which is exactly what the line below says must not
     * happen.
     */
    if (ownPublishingKeys.has(author)) return this.reject('own-publication');

    if (isRetraction(signed.content)) {
      const slot = identifierFor(signed.content.retracts.subjectRef, signed.content.retracts.attribute);
      // A retraction withdraws the claim; keeping the finding "for reference"
      // would mean continuing to act on something its author has disowned.
      this.findings.delete(`${author}::${slot}`);
      this.retractedSlots.add(slot);
      log.info(`Foreign finding retracted: ${slot} (${signed.content.reason})`);
      return { accepted: true };
    }

    const content = signed.content as FindingAttestation;
    /**
     * A claim OR a refutation, because those are the two shapes this format
     * carries and only one of them has `claim`.
     * A refutation is turned away HERE, before anything reads `claim`.
     *
     * This store files claims, addressed by `claim.subjectRef`. A refutation
     * has no claim, so there is no address to file it at — RefutationStore
     * owns that shape and indexes it by what it contests.
     *
     * The history is worth keeping, because I got it wrong in the obvious
     * direction. A review found the refutation branch here unreachable, and I
     * made it REACHABLE — after which a refutation passed every gate and then
     * threw a TypeError on `content.claim.subjectRef`, out of accept(), out of
     * the relay subscription callback, and out of the conformance gate, which
     * died mid-run instead of reporting. Unreachable code was the symptom; the
     * defect was that the branch existed at all in the store that cannot file
     * its shape. Deleting it is the fix. Widening the gate to admit a shape the
     * storage line cannot address turned a safe rejection into a crash.
     */
    if (isRefutation(content)) {
      return this.reject('unsupported-schema');
    }
    if (content.schemaVersion < 2 || !content.method || !content.claim) {
      return this.reject('unsupported-schema');
    }

    /**
     * The gates shared with RefutationStore, so the two stores in this app
     * cannot disagree about what a conforming payload is.
     *
     * Kept as one call rather than a second hand-written copy: 'score' was
     * missing here while the reference peer rejected it, and a declared
     * confidence nested inside method.parameters passed both. A rule enforced
     * in one store and forgotten in the other is how a payload gets stored on
     * one side of an app and refused on the other.
     */
    const gateFailure = contentGateFailure(content);
    if (gateFailure) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: ${gateFailure}`);
      return this.reject(gateFailure);
    }

    const missing = REQUIRED_FIELDS.filter((f: string) => {
      const value = f.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], content);
      return value === undefined;
    });
    if (missing.length) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: missing required field(s): ${missing.join(', ')}`);
      return this.reject('missing-required-fields');
    }

    const claimMethod = (content as { method?: { modality?: unknown; weakBacking?: unknown } }).method;

    // An empty array is a positive statement — the publisher checked and found
    // no thin inputs. Anything that is not an array of strings is not that
    // statement, and must not be read as one.
    const weak = claimMethod?.weakBacking;
    if (!Array.isArray(weak) || weak.some((w) => typeof w !== 'string')) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: malformed method.weakBacking`);
      return this.reject('malformed');
    }

    /**
     * Crediting someone else's method is optional; crediting it partially is
     * not. A citation a consumer cannot follow implies a provenance they cannot
     * check, which is worse than claiming none.
     *
     * It changes no weight term. An implementation that scored a claim higher
     * for citing a respected method would have re-invented author-declared
     * confidence with an extra step — trustworthiness by association rather
     * than by disclosure.
     */
    const derivesFrom = (claimMethod as { derivesFrom?: unknown } | undefined)?.derivesFrom;
    if (derivesFrom !== undefined) {
      const d = derivesFrom as Record<string, unknown> | null;
      const complete = Boolean(d) && typeof d === 'object'
        && ['node', 'method', 'specification'].every(
          (k) => typeof d[k] === 'string' && (d[k] as string).trim());
      if (!complete) {
        log.warn(`Rejected finding from ${author.slice(0, 16)}…: incomplete method.derivesFrom`);
        return this.reject('malformed');
      }
    }

    // An enumeration is a census, and `enumeratedBoundary` states what was
    // counted. Without it the count cannot be re-run by anyone, which makes it
    // indistinguishable from an invented number — so it is rejected here
    // rather than merely weighed down. Conditionally required, hence not in
    // REQUIRED_FIELDS: it is required only for matchedBy 'enumeration'.
    const method = (content as { method?: { parameters?: { matchedBy?: string }; enumeratedBoundary?: unknown } }).method;
    if (method?.parameters?.matchedBy === 'enumeration'
      && !(typeof method.enumeratedBoundary === 'string' && method.enumeratedBoundary.trim())) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: enumeration without method.enumeratedBoundary`);
      return this.reject('missing-required-fields');
    }

    // A set commitment is optional; a malformed one is not tolerable. A reader
    // comparing their own digest against a value that cannot match anything
    // concludes their data differs, which is worse than having no commitment.
    const digest = (method as { enumeratedSetDigest?: unknown } | undefined)?.enumeratedSetDigest;
    if (digest !== undefined && !/^[0-9a-f]{64}$/.test(String(digest))) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: malformed enumeratedSetDigest`);
      return this.reject('malformed');
    }

    /**
     * LAST: the claim must actually be rankable.
     *
     * A claim that derives NaN is worse than one that is rejected. Rejected,
     * it is counted and visible. Stored, it sits in the set comparing false
     * against every threshold — never surfacing, never erroring, and quietly
     * making the store's contents differ from what any operator believes it
     * holds.
     */
    if (!yieldsUsableWeight(content as unknown as Parameters<typeof yieldsUsableWeight>[0])) {
      log.warn(`Rejected finding from ${author.slice(0, 16)}…: published facts yield no usable weight`);
      return this.reject('underivable-weight');
    }

    const slot = identifierFor(content.claim.subjectRef, content.claim.attribute);
    this.findings.set(`${author}::${slot}`, { authorPubkey: author, slot, content, receivedAt });
    return { accepted: true };
  }

  private reject(reason: RejectionReason): AcceptResult {
    this.rejections.set(reason, (this.rejections.get(reason) ?? 0) + 1);
    return { accepted: false, reason };
  }

  /** Foreign findings for a slot — possibly several, from different instances. */
  forSlot(slot: string): ForeignFinding[] {
    return [...this.findings.values()].filter(f => f.slot === slot);
  }

  all(): ForeignFinding[] {
    return [...this.findings.values()];
  }

  /** Instances we have heard from. The raw material for a trust list. */
  knownAuthors(): string[] {
    return [...new Set([...this.findings.values()].map(f => f.authorPubkey))];
  }

  /**
   * Rejection counts by reason.
   *
   * Surfaced rather than swallowed: a peer whose findings never verify is a
   * fact an operator should be able to see, and silent rejection would make a
   * hostile relay indistinguishable from a quiet one.
   */
  rejectionCounts(): Record<string, number> {
    return Object.fromEntries(this.rejections);
  }

  wasRetracted(slot: string): boolean {
    return this.retractedSlots.has(slot);
  }

  reset(): void {
    this.findings.clear();
    this.retractedSlots.clear();
    this.rejections.clear();
  }
}
