/**
 * A SECOND, INDEPENDENT IMPLEMENTATION of NIP-XX Attested Claims.
 *
 * Written against docs/spec/nip-draft-attested-claims.md alone. It imports no
 * application code — only the crypto and protocol primitives any implementer
 * would reach for (@noble, nostr-tools, ws). If it needs a behaviour the
 * specification does not state, that is a defect in the specification, and the
 * point of this file is to find those.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. The existing federation gate runs "Alice"
 * and "Bob" from the same services, so it proves the wire protocol works but
 * cannot expose an ambiguity: one implementation cannot disagree with itself.
 * This can. What it still cannot prove is that a STRANGER can implement the
 * spec — I wrote both, and I know what I meant. It tests whether the document
 * is self-sufficient, not whether it is unambiguous to someone else. Item 19
 * is the only thing that tests that.
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export const KIND_ATTESTED_CLAIM = 30082;
export const SCHEMA_VERSION = 2;

/** Saturation and half-life from the NIP's reference derivation. */
const SATURATION = 4;
const HALF_LIFE_DAYS = 180;
const RELAY_DISCOUNT = 0.5;

/**
 * Canonical JSON: keys sorted at every level, non-ASCII left as literal UTF-8.
 *
 * The NIP is explicit that escaping non-ASCII to \\uXXXX yields a different
 * digest and therefore a failed signature. JSON.stringify already emits
 * literal UTF-8, so the only work here is key ordering.
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`;
}

export const digestOf = (content) => sha256(utf8ToBytes(canonical(content)));

/**
 * Commit to the members of an enumeration without publishing them.
 *
 * Sorted, joined with '\n', SHA-256, lowercase hex — per the NIP. Every part
 * of that is a place two implementations diverge silently: an unsorted join
 * makes the digest depend on the order a register happened to return, and a
 * different separator or encoding changes the hash without changing the set.
 */
export function enumeratedSetDigest(members) {
  return bytesToHex(sha256(utf8ToBytes([...members].sort().join('\n'))));
}

/** The `d` tag, per the NIP: percent-encoded subject, colon, percent-encoded attribute. */
export function identifierFor(subjectRef, attribute) {
  return `${encodeURIComponent(subjectRef)}:${encodeURIComponent(attribute)}`;
}

export function signClaim(content, secretKey) {
  return {
    content,
    signature: {
      alg: 'ml-dsa-65',
      pubkey: bytesToHex(ml_dsa65.getPublicKey(secretKey)),
      sig: bytesToHex(ml_dsa65.sign(digestOf(content), secretKey)),
    },
  };
}

/** Signature algorithms this implementation can actually check. */
export const SUPPORTED_SIGNATURE_ALGS = new Set(['ml-dsa-65']);

/**
 * Verify the inner signature, in THREE states rather than two.
 *
 * The specification is explicit that an implementation meeting an algorithm it
 * does not implement must treat the claim as "unverified rather than as
 * invalid, and MUST NOT discard it — a claim it cannot check is not a claim it
 * can refute."
 *
 * This implementation called ml_dsa65.verify unconditionally, ignoring
 * `signature.alg`, so a claim signed with any other primitive read as INVALID:
 * reporting a verdict on evidence it never examined. All three verifiers in
 * this repository did the same thing, which is how a rule stated in our own
 * document went unimplemented in our own reference code.
 *
 *   valid       checked, and it holds
 *   invalid     checked, and it does not
 *   unverified  not checked — we do not implement this algorithm
 */
export function verifySignature(signed) {
  const alg = signed?.signature?.alg ?? null;
  if (!alg) {
    return { state: 'invalid', alg: null, detail: 'no signature algorithm declared' };
  }
  if (!SUPPORTED_SIGNATURE_ALGS.has(alg)) {
    return {
      state: 'unverified',
      alg,
      detail: `this implementation does not implement ${alg}; the claim is not thereby false`,
    };
  }
  try {
    const ok = ml_dsa65.verify(
      hexToBytes(signed.signature.sig),
      digestOf(signed.content),
      hexToBytes(signed.signature.pubkey),
    );
    return { state: ok ? 'valid' : 'invalid', alg, detail: ok ? null : 'signature does not verify over the canonical digest' };
  } catch (error) {
    return { state: 'invalid', alg, detail: `malformed signature material: ${error.message}` };
  }
}

/**
 * Boolean form, for callers that only need "may I act on this".
 *
 * Unchanged semantics: anything not positively verified answers false. That is
 * the right conservative answer for a caller deciding whether to ACCEPT — the
 * rule above is about not reporting a claim as refuted when it was merely
 * unreadable, which is a thing only a caller that reports to a human can get
 * wrong.
 */
export function verifyClaim(signed) {
  return verifySignature(signed).state === 'valid';
}

const REQUIRED = [
  'claim.subjectRef', 'claim.subjectKind', 'claim.attribute', 'claim.value',
  'method.algorithm', 'method.algorithmVersion', 'method.criteria',
  'method.sourceCount', 'method.observedFrom', 'method.observedTo',
  'method.timePrecisionMs', 'method.parameters', 'method.modality',
  'method.weakBacking', 'publishedAt',
];

/**
 * What a REFUTATION must carry, which is not what a claim carries.
 *
 * A refutation names the claim it contests instead of asserting one of its
 * own: it has `refutes`, never `claim`. Judged by REQUIRED above it was
 * rejected for missing `claim.subjectRef` — a field the format does not have
 * and must not have.
 *
 * So this implementation could publish a refutation and could not accept one,
 * and contesting a claim worked in exactly one direction. The published
 * vectors said so on every run.
 *
 * The method block is shared deliberately: a refutation is weighed by its
 * disclosed method exactly as a claim is, which is what stops "anyone may
 * contest anyone" from becoming "any contest counts equally".
 */
const REFUTATION_REQUIRED = [
  'ground',
  'refutes.authorPubkey', 'refutes.subjectRef', 'refutes.attribute', 'refutes.publishedAt',
  'method.algorithm', 'method.algorithmVersion', 'method.criteria',
  'method.sourceCount', 'method.observedFrom', 'method.observedTo',
  'method.timePrecisionMs', 'method.parameters', 'method.modality',
  'method.weakBacking', 'publishedAt',
];

/**
 * For a refutation, a BLANK string is as absent as a missing key.
 *
 * refutation-unaddressed carries refutes.publishedAt as "" — present, and
 * saying nothing. A refutation that names no version of the claim it contests
 * applies to every later revision of that slot, including one that fixed the
 * very problem being refuted, so "" must be refused exactly as an omission is.
 *
 * Applied only to the refutation fields, where a value is an IDENTIFIER of
 * something else. Elsewhere an empty string can be a legitimate value and
 * conflating the two would reject well-formed claims.
 */

/**
 * Decided by what the content CARRIES, not by a kind number the sender chose.
 * A sender picks its own kind; it cannot pick what its fields mean.
 */
function isRefutation(content) {
  return !!content && typeof content === 'object' && 'refutes' in content;
}

/** Not a ranking. See the Modality section of the NIP. */
const MODALITIES = new Set([
  'in_person', 'field_attested', 'direct_contact', 'primary_record',
  'secondary_record', 'inference', 'self_attested', 'unknown',
]);

/**
 * Everything a conforming consumer must refuse.
 *
 * A valid signature proves the bytes are authentic. It does not prove they are
 * complete, and it does not prove the format permits them.
 */
export function rejectionReason(content) {
  if (!content || typeof content !== 'object') return 'malformed';
  if (content.schemaVersion !== SCHEMA_VERSION) return 'unsupported-schema';
  if ('confidence' in content || 'weight' in content || 'score' in content) return 'declared-weight';

  const refutation = isRefutation(content);
  const required = refutation ? REFUTATION_REQUIRED : REQUIRED;
  const missing = required.filter((f) => {
    const value = f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), content);
    if (value === undefined) return true;
    return refutation && typeof value === 'string' && value.trim() === '';
  });
  if (missing.length) return 'missing-required-fields';

  const m = content.method;
  if (m.parameters?.matchedBy === 'enumeration'
    && !(typeof m.enumeratedBoundary === 'string' && m.enumeratedBoundary.trim())) {
    return 'missing-required-fields';
  }
  if (!MODALITIES.has(m.modality)) return 'unknown-modality';

  // An empty array is a positive statement — the publisher checked and found
  // none. Anything that is not an array of strings is not that statement.
  if (!Array.isArray(m.weakBacking) || m.weakBacking.some((w) => typeof w !== 'string')) {
    return 'malformed';
  }

  // Optional. Present, it must be complete: a citation a reader cannot follow
  // implies a provenance they cannot check, which is worse than no citation.
  if (m.derivesFrom !== undefined) {
    const d = m.derivesFrom;
    const complete = d && typeof d === 'object'
      && ['node', 'method', 'specification'].every((k) => typeof d[k] === 'string' && d[k].trim());
    if (!complete) return 'malformed';
  }

  // Optional, but a malformed one is worse than none: a reader would compare
  // their own digest against a value that could never match anything.
  if (m.enumeratedSetDigest !== undefined
    && !/^[0-9a-f]{64}$/.test(String(m.enumeratedSetDigest))) {
    return 'malformed';
  }

  /**
   * LAST, AND ONLY AFTER EVERYTHING ELSE PASSES: the published facts must
   * actually yield a usable weight.
   *
   * Every rule above checks that a field is present and shaped correctly. None
   * of them checks that the fields work TOGETHER. A claim can satisfy all of
   * them and still be unrankable — omit parameters.windowHours and the
   * derivation multiplies by NaN, so the claim is accepted, published, and
   * silently sorts below everything for every consumer that receives it.
   *
   * That was not hypothetical. It is how the first batch generator written
   * against this spec behaved, and conformance passed all 191 of its claims.
   *
   * The check is deliberately the derivation itself rather than a list of its
   * preconditions. A restatement of what deriveWeight needs would be a second
   * copy of that knowledge, free to drift from the first, and the drift would
   * reopen exactly this hole. Calling it cannot drift.
   *
   * Consumers derive weight independently — that is the point of the protocol —
   * so a claim that yields NaN here yields NaN for all of them.
   */
  const { weight } = deriveWeight(content);
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) return 'underivable-weight';

  return null;
}

/** The NIP's reference derivation, from published facts only. */
export function deriveWeight(content, evaluatedAt = new Date()) {
  const m = content.method;
  const isCensus = m.parameters.matchedBy === 'enumeration';

  const corroboration = isCensus
    ? (m.enumeratedBoundary && String(m.enumeratedBoundary).trim() ? 1 : 0)
    : (() => {
        const relayed = Array.isArray(m.relayedVia) && m.relayedVia.length > 0;
        const effective = relayed
          ? Math.min(1 + (m.sourceCount - 1) * RELAY_DISCOUNT, SATURATION - 1)
          : m.sourceCount;
        return Math.min(effective, SATURATION) / SATURATION;
      })();

  const windowMs = m.parameters.windowHours * 3_600_000;
  const precision = (isCensus || m.parameters.matchedBy === 'equality')
    ? 1
    : m.timePrecisionMs > 0 ? Math.min(windowMs / m.timePrecisionMs, 1) : 1;

  // An enumeration ages from the snapshot it describes, not from publication.
  const basis = isCensus && Number.isFinite(Date.parse(m.observedTo))
    ? Date.parse(m.observedTo)
    : Date.parse(content.publishedAt);
  const ageDays = Math.max(0, (evaluatedAt.getTime() - basis) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);

  return { corroboration, precision, recency, ageDays, weight: corroboration * precision * recency };
}

/** Build the outer Nostr event body for a signed claim. */
export function eventFor(signed) {
  return {
    kind: KIND_ATTESTED_CLAIM,
    created_at: Math.floor(Date.parse(signed.content.publishedAt) / 1000),
    tags: [
      ['d', identifierFor(signed.content.claim.subjectRef, signed.content.claim.attribute)],
      ['t', 'attested-claim'],
      ['schema_version', String(SCHEMA_VERSION)],
    ],
    content: JSON.stringify(signed),
  };
}

/**
 * A payload at a claim's slot is no longer guaranteed to be a claim.
 *
 * A retraction is published to the SAME `d` tag under the same kind, so a
 * consumer that reads `claim` without checking `retracted` first will read a
 * withdrawn slot as though it still held a claim — and under a
 * parameterized-replaceable kind that is the only payload left.
 */
export function isRetraction(payload) {
  return Boolean(payload) && payload.retracted === true;
}

const RETRACTION_REASONS = new Set([
  'superseded', 'error', 'source-withdrawn', 'subject-request', 'policy', 'decayed',
]);

/**
 * Everything a conforming consumer must refuse in a retraction.
 *
 * `note` is deliberately optional: withdrawing a wrong claim quickly matters
 * more than explaining it well, and a retraction must never be blocked on
 * composing a justification.
 */
export function retractionRejectionReason(payload) {
  if (!isRetraction(payload)) return 'not-a-retraction';
  if (payload.schemaVersion !== SCHEMA_VERSION) return 'unsupported-schema';
  const r = payload.retracts;
  if (!r || typeof r.subjectRef !== 'string' || !r.subjectRef
    || typeof r.attribute !== 'string' || !r.attribute) {
    return 'missing-required-fields';
  }
  if (typeof payload.retractedAt !== 'string' || Number.isNaN(Date.parse(payload.retractedAt))) {
    return 'missing-required-fields';
  }
  /**
   * An unrecognised reason does NOT refuse the retraction.
   *
   * I had this backwards first. The reasons are genuinely not interchangeable
   * — `superseded` sends a consumer looking for a replacement, `decayed` says
   * there is none — so it is tempting to refuse what cannot be interpreted,
   * the way an absent enumeratedBoundary is refused.
   *
   * The asymmetry says otherwise. Wrongly honouring a withdrawal costs a claim
   * the author can republish. Wrongly ignoring one means continuing to publish
   * something its author has disowned — and `subject-request` exists precisely
   * for a person asking to be removed. A consumer that refuses to stop because
   * it did not recognise the justification has chosen the failure that cannot
   * be undone by the person it harms.
   *
   * So the withdrawal is honoured and the reason is reported as unrecognised:
   * a third state, not a guess between two it might have meant.
   */
  return null;
}

/** True when the reason is one this implementation understands. */
export function isKnownRetractionReason(reason) {
  return RETRACTION_REASONS.has(reason);
}

/**
 * The slot a retraction withdraws — which must be the claim's own slot.
 *
 * Published to the same `d` tag on purpose: the withdrawal then propagates
 * through the exact mechanism the claim did. A retraction landing anywhere
 * else withdraws nothing, and nothing about it would look wrong.
 */
export function retractionSlot(payload) {
  return identifierFor(payload.retracts.subjectRef, payload.retracts.attribute);
}
