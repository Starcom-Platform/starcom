/**
 * Generates the conformance vectors in docs/spec/vectors/.
 *
 * I.C.5: "signed example events others can test against." A spec nobody can
 * test against is a description; vectors are what make it a format.
 *
 * Design notes, each forced by something the spec left open:
 *
 *  - Signing is DETERMINISTIC here (`extraEntropy: false`, the FIPS 204
 *    deterministic mode), and keys come from fixed seeds. Regenerating must
 *    produce byte-identical files, otherwise every regeneration looks like a
 *    format change in the diff and nobody can tell a real one from noise.
 *    Deterministic signing is for VECTORS ONLY — application signing keeps its
 *    hedged randomness, which protects against fault attacks and a weak RNG.
 *
 *  - Each vector publishes its `canonical` string and `digest` alongside the
 *    event. Canonicalization, not ML-DSA, is where an independent
 *    implementation actually goes wrong: key ordering, unicode escaping,
 *    number formatting. An implementer whose digest differs can see exactly
 *    which byte diverged instead of only learning "signature invalid".
 *
 *  - Weight vectors pin `evaluatedAt`. Weight is a function of (event,
 *    evaluation time) — see the NIP draft — so a vector without one is not
 *    checkable.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/make-vectors.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { stableStringify, contentDigest } from '../src/services/intel/findings/signFinding';

const OUT = path.join(process.cwd(), 'docs/spec/vectors');
fs.mkdirSync(OUT, { recursive: true });

/** Fixed seeds — the vectors must be byte-stable across regeneration. */
const key = (n: number) => ml_dsa65.keygen(new Uint8Array(32).fill(n));
const ALICE = key(1);
const MALLORY = key(2);

/** Deterministic signing. Vectors only — never the application path. */
function signDeterministic(content: unknown, sk: Uint8Array) {
  const digest = contentDigest(content as never);
  return {
    content,
    signature: {
      alg: 'ml-dsa-65' as const,
      pubkey: bytesToHex(ml_dsa65.getPublicKey(sk)),
      sig: bytesToHex(ml_dsa65.sign(digest, sk, { extraEntropy: false })),
    },
  };
}

const PUBLISHED = '2026-01-15T00:00:00.000Z';
/**
 * A small member set, deliberately unsorted, and its digest.
 *
 * Sorted, joined with '\n', SHA-256, lowercase hex.
 */
const ENUMERATED_SET_MEMBERS = ['07168188', '00686734', 'SC303142', '11743365'];
const ENUMERATED_SET_DIGEST = bytesToHex(sha256(utf8ToBytes([...ENUMERATED_SET_MEMBERS].sort().join('\n'))));

const EVALUATED = '2026-03-16T00:00:00.000Z'; // exactly 60 days later

const claim = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  claim: {
    subjectRef: 'MV Northwind',
    subjectKind: 'object',
    attribute: 'location',
    value: { lat: 51.5, lon: -0.12 },
  },
  publishedAt: PUBLISHED,
  method: {
    algorithm: 'location-corroboration',
    algorithmVersion: 1,
    criteria: '3 independent sources placed this subject within 24h and 5km',
    sourceCount: 3,
    observedFrom: '2026-01-14T04:00:00.000Z',
    observedTo: '2026-01-15T00:00:00.000Z',
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    modality: 'primary_record',
    weakBacking: [],
    inputFingerprints: ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)],
  },
  ...over,
});

type Vector = {
  name: string;
  description: string;
  expect: Record<string, unknown>;
  event: unknown;
};

const vectors: Vector[] = [];

const add = (name: string, description: string, content: unknown, sk: Uint8Array, expect: Record<string, unknown>, mutate?: (e: never) => void) => {
  const event = signDeterministic(content, sk);
  if (mutate) mutate(event as never);
  vectors.push({
    name,
    description,
    expect: {
      canonical: stableStringify((event as { content: unknown }).content),
      digest: bytesToHex(contentDigest((event as { content: never }).content)),
      ...expect,
    },
    event,
  });
};

// 1. The happy path, with a fully worked weight derivation.
//    corroboration = min(3,4)/4 = 0.75
//    precision     = min(24h / 1h, 1) = 1
//    recency       = 0.5 ^ (60/180) = 0.793700525984100
add('valid-attestation', 'A well-formed attested claim. Signature verifies; weight derives to the values shown.', claim(), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    corroboration: 0.75,
    precision: 1,
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.75 * 1 * Math.pow(0.5, 60 / 180),
    note: 'Reference derivation with N=4 and a 180-day half-life. Other parameters are conformant; the CONSTRAINT is that no input may be author-asserted.',
  },
});

// 2. Tampered after signing. The canonical string and digest published here are
//    those of the TAMPERED content — that is what a consumer actually receives,
//    and reproducing this digest is how they confirm they parsed it correctly
//    before concluding the signature is bad.
add('tampered-value', 'Signed honestly, then the claimed location was edited. MUST be rejected.', claim(), ALICE.secretKey, {
  signatureValid: false,
  rejectReason: 'signature-invalid',
  weight: null,
  weightNote: 'A consumer MUST NOT derive a weight here. Every input to the derivation lives in the payload the tamperer controlled.',
}, (e: never) => { ((e as unknown as { content: { claim: { value: unknown } } }).content.claim.value = { lat: 0, lon: 0 }); });

// 3. Wrong signer: Alice's claim, Mallory's key in the signature block.
add('wrong-pubkey', "The signature block names a different key than the one that signed. MUST be rejected.", claim(), ALICE.secretKey, {
  signatureValid: false,
  rejectReason: 'signature-invalid',
  weight: null,
}, (e: never) => { ((e as unknown as { signature: { pubkey: string } }).signature.pubkey = bytesToHex(MALLORY.publicKey)); });

// 4. The rule the whole format exists to enforce.
add('declared-confidence', 'Carries an author-declared confidence. MUST be rejected even though the signature is valid.', claim({ confidence: 0.99 }), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'declared-weight-forbidden',
  weight: null,
  note: 'The signature is genuine. This is a SPEC violation, not a forgery — a valid signature over a payload the format does not permit. Consumers that only check signatures will accept this and be wrong.',
});

// 5. Missing required fields.
const incomplete = claim() as Record<string, never>;
delete (incomplete.claim as unknown as Record<string, unknown>).subjectKind;
delete (incomplete.method as unknown as Record<string, unknown>).observedFrom;
add('missing-required-fields', 'Validly signed, but missing claim.subjectKind and method.observedFrom. MUST be rejected, not rendered with gaps.', incomplete, ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'missing-required-fields',
  missing: ['claim.subjectKind', 'method.observedFrom'],
  weight: null,
});

// 6. Coarse timing. Precision must PENALISE, not be ignored: a claim timed only
//    to the week cannot support a 24-hour-window assertion.
add('coarse-timing', 'Timing known only to one week against a 24h window. Precision must drop below 1.', claim({
  method: { ...claim().method, timePrecisionMs: 7 * 24 * 3_600_000 },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    corroboration: 0.75,
    precision: (24 * 3_600_000) / (7 * 24 * 3_600_000),
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.75 * ((24 * 3_600_000) / (7 * 24 * 3_600_000)) * Math.pow(0.5, 60 / 180),
  },
});

// 8. A census. Same sourceCount as a single-source claim, but weighed on
//    completeness of the stated boundary rather than on independence.
add('enumeration-census', 'A count from a complete enumeration of one authoritative register. Weighed on completeness, not corroboration.', claim({
  claim: { subjectRef: '71-75 SHELTON STREET, WC2H 9JQ', subjectKind: 'place', attribute: 'companiesAtRegisteredAddress', value: 12645 },
  method: {
    ...claim().method,
    algorithm: 'address-enumeration',
    sourceCount: 1,
    criteria: '12645 companies filed this registered address, counted from a complete enumeration',
    parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
    enumeratedBoundary: 'Every company whose registered postcode district is EC1V or WC2H, Companies House snapshot 2025-06-01',
    enumeratedSetDigest: ENUMERATED_SET_DIGEST,
    observedFrom: '2025-06-01T00:00:00.000Z',
    observedTo: '2025-06-01T00:00:00.000Z',
  },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  /**
   * The members, as TEST DATA rather than as part of the event.
   *
   * `enumeratedSetDigest` is a commitment, not a disclosure — the event never
   * carries the members, which is the whole point. But then nothing pins HOW
   * it is computed, and sort order, separator and encoding are three places
   * two implementations diverge without either noticing. Publishing the
   * members here lets a conformance runner recompute the digest and compare.
   *
   * Deliberately given out of order, so an implementation that forgets to sort
   * fails this vector instead of passing by luck.
   */
  enumeratedSet: { members: ENUMERATED_SET_MEMBERS, digest: ENUMERATED_SET_DIGEST },
  weight: {
    corroboration: 1,
    precision: 1,
    // Aged from method.observedTo (the register snapshot), NOT publishedAt.
    // This vector deliberately publishes a snapshot older than the publication
    // date so the two differ: a consumer using publishedAt derives 0.7937 instead of 0.3299.
    recency: Math.pow(0.5, 288 / 180),
    weight: Math.pow(0.5, 288 / 180),
    note: 'sourceCount is 1: a consumer applying the corroboration term computes 0.25 and understates a complete national register fourfold. Recency runs from the SNAPSHOT — publishedAt is chosen by the publisher, so ageing from it would score a stale register republished today as fresh.',
  },
});

// 9. The same census with no stated boundary. MUST be REJECTED, not weighed low.
add('enumeration-no-boundary', 'An enumeration with no stated boundary. A count nobody can re-run is rejected outright.', claim({
  claim: { subjectRef: '71-75 SHELTON STREET, WC2H 9JQ', subjectKind: 'place', attribute: 'companiesAtRegisteredAddress', value: 12645 },
  method: {
    ...claim().method,
    algorithm: 'address-enumeration',
    sourceCount: 1,
    criteria: '12645 companies filed this registered address',
    parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' },
  },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  rejectReason: 'missing-required-fields',
  weight: null,
  note: 'The signature is VALID. A valid signature over a claim that cannot be re-run is still a rejection.',
});

// 10. A retraction, on the SAME slot as the claim it withdraws.
add('retraction-valid', 'A well-formed retraction. Published to the claim\'s own d tag, so the withdrawal propagates through the mechanism the claim did.', {
  schemaVersion: 2,
  retracted: true,
  retracts: { subjectRef: 'MV Northwind', attribute: 'location' },
  retractedAt: '2026-02-01T00:00:00.000Z',
  reason: 'error',
  note: 'Contributing source republished a correction.',
} as never, ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: null,
  retraction: { slot: 'MV%20Northwind:location', reason: 'error' },
  note: 'The slot equals identifierFor(subjectRef, attribute) — the same tag valid-attestation occupies. A retraction landing anywhere else withdraws nothing, and nothing about it would look wrong. No weight is derived: a retracted slot is ABSENT, not a negative finding.',
});

// 11. A retraction with no `note`, which is legal and deliberately so.
add('retraction-no-note', 'A retraction without a note. Withdrawing a wrong claim quickly matters more than explaining it well.', {
  schemaVersion: 2,
  retracted: true,
  retracts: { subjectRef: 'MV Northwind', attribute: 'location' },
  retractedAt: '2026-02-01T00:00:00.000Z',
  reason: 'decayed',
} as never, ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: null,
  retraction: { slot: 'MV%20Northwind:location', reason: 'decayed' },
  note: '`decayed` is not `superseded`: it says there is NO replacement, so a consumer must not go hunting for one. A retraction must never be blocked on composing a justification.',
});

// 12. An unrecognised reason. HONOURED, with the reason reported as unknown.
add('retraction-unknown-reason', 'A retraction whose reason the format does not define. The withdrawal still stands.', {
  schemaVersion: 2,
  retracted: true,
  retracts: { subjectRef: 'MV Northwind', attribute: 'location' },
  retractedAt: '2026-02-01T00:00:00.000Z',
  reason: 'changed-my-mind',
} as never, ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: null,
  retraction: { slot: 'MV%20Northwind:location', reason: 'changed-my-mind', reasonRecognised: false },
  note: 'The withdrawal is honoured and the reason is reported as unrecognised — a third state, not a guess between `superseded` (go find the replacement) and `decayed` (there is none). Refusing the retraction would mean continuing to publish a claim its author disowned, and subject-request exists for a person asking to be removed: that is the failure the affected person cannot undo.',
});

// 7. Relayed sources. Same source count as `valid-attestation`, lower weight,
//    because every source arrived through one aggregator.
add('relayed-sources', 'Three sources, all relayed through one aggregator. Corroboration is discounted; the raw sourceCount is unchanged.', claim({
  method: { ...claim().method, relayedVia: ['wikidata'] },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    // 1 + (3-1) * 0.5 = 2 effective sources, against a saturation of 4.
    corroboration: 0.5,
    precision: 1,
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.5 * 1 * Math.pow(0.5, 60 / 180),
    note: 'Same sourceCount as valid-attestation (3), lower corroboration (0.5 vs 0.75). A consumer that ignores relayedVia will compute 0.75 and overstate the claim.',
  },
});

// 7. Unicode and key ordering — the canonicalization trap.
add('canonicalization-edge', 'Non-ASCII subject, keys deliberately out of alphabetical order in the source. Tests the canonical stringifier, not the signature.', claim({
  claim: { value: { lat: 60.17, lon: 24.94 }, subjectRef: 'Ålesund «Kværner» 号', attribute: 'location', subjectKind: 'place' },
}), ALICE.secretKey, {
  signatureValid: true,
  note: 'If your digest differs, compare against the published canonical string before suspecting your ML-DSA implementation.',
});

// 8. Modality and weak backing — ratified network-wide. A claim MUST say how it
//    was observed and MUST declare its own thin inputs. Absence is rejection;
//    an empty weakBacking is the positive statement "I checked and found none".
const omit = <T extends object>(o: T, k: string) => {
  const c = { ...o } as Record<string, unknown>;
  delete c[k];
  return c;
};

add('missing-modality', 'No method.modality. MUST be rejected — how a thing was observed is not optional and MUST NOT be guessed.', claim({
  method: omit(claim().method, 'modality'),
}), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'missing-required-fields',
  weight: null,
});

add('unknown-modality', 'A modality outside the registered vocabulary. MUST be rejected rather than coerced to unknown.', claim({
  method: { ...claim().method, modality: 'carrier-pigeon' },
}), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'unknown-modality',
  weight: null,
  note: 'Coercing an unrecognised modality to `unknown` would silently convert a publisher error into a weaker but accepted claim.',
});

add('missing-weak-backing', 'No method.weakBacking. MUST be rejected — an absent array is not the same statement as an empty one.', claim({
  method: omit(claim().method, 'weakBacking'),
}), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'missing-required-fields',
  weight: null,
});

// 9. The positive case, and the one that matters most. A claim that names its
//    own thin input is ACCEPTED, and derives the SAME weight as one that does
//    not. Declaring weakness is not a penalty the format applies — it is
//    information the consumer weighs. An implementation that silently
//    discounts weakBacking has re-invented author-declared confidence with the
//    sign flipped.
add('declared-weak-backing', 'A conformant claim naming its own unreproducible input. Accepted, and weighs exactly the same as valid-attestation.', claim({
  method: { ...claim().method, weakBacking: ['gleif-golden-copy: undated source url, no archived copy'] },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    corroboration: 0.75,
    precision: 1,
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.75 * 1 * Math.pow(0.5, 60 / 180),
    note: 'Identical to valid-attestation. weakBacking is disclosure, not a discount — the consumer decides what it costs.',
  },
});

// 10. Modality is not a ranking. Same claim observed in person derives the same
//     weight as one from a primary record. An implementation that returns a
//     different number here has built a hidden trust hierarchy into the format.
add('modality-not-a-ranking', 'Same claim, modality in_person instead of primary_record. Weight is UNCHANGED — the vocabulary describes, it does not rank.', claim({
  method: { ...claim().method, modality: 'in_person' },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    corroboration: 0.75,
    precision: 1,
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.75 * 1 * Math.pow(0.5, 60 / 180),
    note: 'Deliberately equal to valid-attestation. If your derivation differs, you are ranking modality inside the format instead of leaving it to the consumer.',
  },
});

// 11. Crediting someone else's method. ACCEPTED, and derives EXACTLY the weight
//     of valid-attestation. This is the load-bearing assertion: an
//     implementation that scored a claim higher for citing a respected method
//     would have re-invented author-declared confidence with an extra step —
//     trustworthiness by association instead of by disclosure.
const CREDIT = {
  node: 'starcom',
  method: 'location-corroboration@1',
  specification: 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy',
};

add('method-credit', "Cites another node's method. Accepted, and weighs exactly the same as valid-attestation.", claim({
  method: { ...claim().method, derivesFrom: CREDIT },
}), ALICE.secretKey, {
  signatureValid: true,
  evaluatedAt: EVALUATED,
  weight: {
    corroboration: 0.75,
    precision: 1,
    recency: Math.pow(0.5, 60 / 180),
    weight: 0.75 * 1 * Math.pow(0.5, 60 / 180),
    note: 'Deliberately identical to valid-attestation. derivesFrom is a citation, never a credential — if your derivation differs you are letting a publisher buy weight by naming a method.',
  },
});

// 12. A citation a reader cannot follow implies a provenance they cannot check,
//     which is worse than claiming none. Rejected rather than ignored.
add('partial-method-credit', 'derivesFrom present but missing `specification`. MUST be rejected — an unfollowable citation is worse than no citation.', claim({
  method: { ...claim().method, derivesFrom: { node: 'starcom', method: 'location-corroboration@1' } },
}), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'malformed',
  weight: null,
});

// 13. Every field is present and correctly shaped, and the claim is still
//     unrankable: parameters.windowHours is absent, so the derivation multiplies
//     by NaN. Conformance passed 191 real claims in this state before anyone
//     noticed they all sorted below everything, which is why the rule now runs
//     the derivation instead of restating its preconditions.
add('underivable-weight', 'All required fields present and well-formed, but parameters.windowHours is missing so the published facts yield no usable weight. MUST be rejected.', claim({
  method: {
    ...claim().method,
    parameters: { distanceThresholdKm: 5, matchedBy: 'proximity' },
  },
}), ALICE.secretKey, {
  signatureValid: true,
  rejectReason: 'underivable-weight',
  weight: null,
});

/**
 * ─── CASE ADJUDICATION ─────────────────────────────────────────────────────
 *
 * A human read the evidence and reached a conclusion. It is an attested claim
 * like any other, at the same kind, distinguished only by `method.algorithm` —
 * which the NIP has always called an implementation-defined identifier.
 *
 * These vectors exist mainly to pin ONE property, which is the property that
 * makes new methods possible at all: a consumer that has never heard of
 * `case-adjudication` must still derive a weight for it. Nothing in the
 * derivation reads `algorithm`. If an implementation refuses these because the
 * identifier is unfamiliar, it has turned every future method into a
 * negotiation, and the format stops being extensible.
 */
const adjudication = (over: Record<string, unknown> = {}, methodOver: Record<string, unknown> = {}) => {
  // `parameters` is pulled out before the spread below. Left in, `...methodOver`
  // would REPLACE the whole parameters object rather than merge into it, and
  // overriding one count would silently drop windowHours — which the precision
  // factor divides by, producing NaN and an unweighable claim. The conformance
  // runner caught exactly that, on a vector meant to prove weights derive.
  const { parameters: paramOver = {}, ...restMethod } = methodOver as
    { parameters?: Record<string, unknown> } & Record<string, unknown>;
  return ({
  schemaVersion: 2,
  claim: {
    subjectRef: 'Northwind Shipping Ltd',
    subjectKind: 'organization',
    // The case number is part of the attribute: kind 30082 replaces on
    // (author, subject, attribute), so two investigations of one subject would
    // otherwise share a slot and the second would delete the first.
    attribute: 'case-adjudication:C-042',
    value: 'substantiated',
  },
  publishedAt: PUBLISHED,
  method: {
    algorithm: 'case-adjudication',
    algorithmVersion: 1,
    criteria:
      'A human adjudicator reviewed 3 linked report(s) and 2 recorded contradiction(s), '
      + 'addressing 2 of them in writing, and concluded the case is substantiated. '
      + "The adjudicator's reasoning is held by the publishing node and is not part of this claim.",
    sourceCount: 3,
    observedFrom: '2026-01-01T00:00:00.000Z',
    observedTo: '2026-01-15T00:00:00.000Z',
    // A person weighing reports over days does not have finer resolution than
    // a day, and claiming minutes would earn precision nobody earned.
    timePrecisionMs: 86_400_000,
    parameters: {
      // 14 days. NO distanceThresholdKm: nothing here matched by distance, and
      // publishing 0 would read as an extremely precise radius.
      windowHours: 336,
      reportsBehind: 3,
      contradictionsTotal: 2,
      contradictionsAddressed: 2,
      ...paramOver,
    },
    modality: 'inference',
    weakBacking: [],
    ...restMethod,
  },
  ...over,
  });
};

// precision = min(336h / 24h, 1) = 1 — day-precision amply supports a 14-day claim.
add('case-adjudication',
  'A human adjudication of a case, published as an attested claim. A consumer that has never seen this algorithm MUST still derive a weight: nothing in the derivation reads `algorithm`.',
  adjudication(), ALICE.secretKey, {
    signatureValid: true,
    evaluatedAt: EVALUATED,
    weight: {
      corroboration: 0.75,
      precision: 1,
      recency: Math.pow(0.5, 60 / 180),
      weight: 0.75 * 1 * Math.pow(0.5, 60 / 180),
      note: 'Identical derivation to location-corroboration. That is the point: the method identifier does not enter the arithmetic, so an unfamiliar one costs a consumer nothing.',
    },
  });

add('case-adjudication-no-distance-threshold',
  'The same claim, checked for what it does NOT carry. `distanceThresholdKm` is absent because nothing matched by distance; a consumer MUST NOT treat its absence as zero, nor require it.',
  adjudication(), ALICE.secretKey, {
    signatureValid: true,
    mustNotRequire: ['method.parameters.distanceThresholdKm'],
    note: 'A 0 here would read as an extremely precise radius. An algorithm with no radius publishes no radius.',
  });

add('case-adjudication-unaddressed-contradictions',
  'An adjudication that left recorded contradictions unanswered. Valid, weighable, and it says so in `weakBacking` rather than in the counts alone.',
  adjudication({}, {
    parameters: { contradictionsAddressed: 0 },
    weakBacking: ['2 of 2 linked contradictions were not addressed by the adjudicator'],
  }), ALICE.secretKey, {
    signatureValid: true,
    evaluatedAt: EVALUATED,
    note: 'The counts alone would require a reader to subtract. weakBacking is where a reader looks for exactly this, so the publisher states it there too. NOT a rejection: an honest disclosure of thin work outranks a silent omission.',
  });

/**
 * ─── REFUTATION ────────────────────────────────────────────────────────────
 *
 * Starcom publishes and consumes these; nobody else can yet, because the
 * format had a prose section and no vectors. A network whose claims cannot be
 * contested amplifies its first guess, so the ability for another node to say
 * WE are wrong is worth more than most things this file could describe.
 *
 * The timestamps below contain colons deliberately. The address derivation is
 * the part a second implementer is most likely to get wrong, and getting it
 * wrong is silent: the refutation lands at a slot nobody queries, and the claim
 * it contests goes on looking uncontested forever.
 */
const REFUTED = {
  authorPubkey: bytesToHex(ALICE.publicKey),
  subjectRef: 'MV Northwind',
  attribute: 'location',
  publishedAt: PUBLISHED,               // 2026-01-15T00:00:00.000Z — colons and all
};

const refutation = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  refutes: { ...REFUTED },
  ground: 'contradicting-evidence',
  // A refutation IS an attestation: it carries its own method and is weighed by
  // the same derivation as the claim it argues with, so like is compared with
  // like rather than volume with evidence.
  method: {
    algorithm: 'location-corroboration',
    algorithmVersion: 1,
    criteria: '4 independent sources placed this subject elsewhere in the same window',
    sourceCount: 4,
    observedFrom: '2026-01-14T04:00:00.000Z',
    observedTo: '2026-01-15T00:00:00.000Z',
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    modality: 'primary_record',
    weakBacking: [],
  },
  publishedAt: PUBLISHED,
  ...over,
});

const REFUTATION_ADDRESS = [REFUTED.authorPubkey, REFUTED.subjectRef, REFUTED.attribute, REFUTED.publishedAt]
  .map(encodeURIComponent).join(':');

add('refutation',
  'A well-formed refutation. Weighable by the same derivation as the claim it contests, and addressed by WHICH claim — author, subject, attribute and the exact publishedAt, every component percent-encoded.',
  refutation(), MALLORY.secretKey, {
    signatureValid: true,
    evaluatedAt: EVALUATED,
    refutationAddress: REFUTATION_ADDRESS,
    note: 'Signed by a DIFFERENT key than the claim it refutes, which is the ordinary case: anyone may contest anyone. Nothing about the refuter grants or denies standing — only the method they disclose.',
  });

add('refutation-unencoded-timestamp',
  'The address of the same refutation, stated in full. An implementation that leaves the ISO timestamp raw splits a four-part identifier into six on its own colons, files the contest where nobody looks, and the claim stays uncontested with no error anywhere.',
  refutation(), MALLORY.secretKey, {
    signatureValid: true,
    evaluatedAt: EVALUATED,
    refutationAddress: REFUTATION_ADDRESS,
    mustContain: '%3A',
    note: 'The expected address contains %3A because the timestamp\'s colons are encoded. If your derivation produces four raw colons plus the timestamp\'s two, you have six components and no way back to the claim.',
  });

add('refutation-without-method',
  'A refutation carrying no method. MUST be rejected: without one the cheapest possible message — "wrong" — outweighs expensive evidence, and refutation becomes a denial-of-service on truth.',
  omit(refutation(), 'method'), MALLORY.secretKey, {
    signatureValid: true,
    rejectReason: 'underivable-weight',
    weight: null,
  });

add('refutation-unaddressed',
  'A refutation that will not say WHICH version it contests. MUST be rejected: without publishedAt it applies to every later revision of the slot, including one that fixed the very problem being refuted.',
  refutation({ refutes: { ...REFUTED, publishedAt: '' } }), MALLORY.secretKey, {
    signatureValid: true,
    rejectReason: 'missing-required-fields',
    weight: null,
  });

for (const v of vectors) {
  fs.writeFileSync(path.join(OUT, `${v.name}.json`), JSON.stringify(v, null, 2) + '\n');
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  format: 'NIP-XX Attested Claims',
  schemaVersion: 2,
  generatedBy: 'scripts/make-vectors.ts',
  deterministic: true,
  vectors: vectors.map((v) => ({ name: v.name, description: v.description, file: `${v.name}.json` })),
}, null, 2) + '\n');

console.log(`Wrote ${vectors.length} conformance vectors to docs/spec/vectors/`);
for (const v of vectors) console.log(`  ${v.name}`);
