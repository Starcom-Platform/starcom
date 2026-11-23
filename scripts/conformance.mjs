#!/usr/bin/env node
/**
 * Conformance runner for the Attested Claims format.
 *
 * This is I.C.5's "minimal reference consumer that is not Starcom", and it is
 * also how the vectors are checked. IT IMPORTS NO APPLICATION CODE — every
 * rule below is reimplemented from docs/spec/nip-draft-attested-claims.md
 * using libraries a stranger would already have.
 *
 * That constraint is what makes the run meaningful. The vectors were generated
 * using the APPLICATION's canonicalizer; this runner reimplements
 * canonicalization from the prose. If the two produce identical digests across
 * all vectors, then the document and the implementation agree — which is the
 * only evidence that the spec is sufficient to build against. If they diverge,
 * the document is wrong, no matter how well the app works.
 *
 * A fork should be able to replace this file with their own and pass.
 *
 * Usage: node scripts/conformance.mjs [vectors-dir]
 * Exit:  0 all vectors pass · 1 one or more failed · 2 could not read vectors
 */
import fs from 'node:fs';
import path from 'node:path';

const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
const { sha256 } = await import('@noble/hashes/sha256');
const { bytesToHex, hexToBytes, utf8ToBytes } = await import('@noble/hashes/utils');

const DIR = process.argv[2] ?? 'docs/spec/vectors';
let index;
try {
  index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
} catch (e) {
  console.error(`Cannot read vectors from ${DIR}: ${e.message}`);
  process.exit(2);
}

// ---- Canonicalization, per the spec: keys sorted, no incidental whitespace,
// ---- strings as produced by JSON.stringify (non-ASCII stays literal UTF-8).
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
}

const REQUIRED = [
  'claim.subjectRef', 'claim.subjectKind', 'claim.attribute', 'claim.value',
  'method.algorithm', 'method.algorithmVersion', 'method.criteria',
  'method.sourceCount', 'method.observedFrom', 'method.observedTo',
  'method.timePrecisionMs', 'method.parameters', 'method.modality',
  'method.weakBacking', 'publishedAt',
];
// Per the NIP's Modality section: a vocabulary, explicitly NOT a ranking.
const MODALITIES = new Set([
  'in_person', 'field_attested', 'direct_contact', 'primary_record',
  'secondary_record', 'inference', 'self_attested', 'unknown',
]);
const get = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);

// Reference derivation parameters. The spec fixes the CONSTRAINT (no
// author-asserted input), not these numbers.
const SATURATION_N = 4;
const HALF_LIFE_DAYS = 180;

function derive(content, evaluatedAt) {
  const m = content.method;
  // Relay discount: sources sharing one delivery path are distinct observers
  // with a single point of failure between them and us. Extra sources through
  // the same relay count half; the first counts fully.
  // An ENUMERATION claim is a census, not an agreement. Completeness of the
  // // stated boundary replaces corroboration. An unstated boundary is REJECTED
  // upstream; the zero here is a backstop for consumers that skip validation,
  // never a second legitimate state.
  if (m.parameters.matchedBy === 'enumeration') {
    const completeness = m.enumeratedBoundary && String(m.enumeratedBoundary).trim() ? 1 : 0;
    // Age runs from the SNAPSHOT (`observedTo`), not from publication: the
    // publisher chooses when to publish, so a stale register republished today
    // would otherwise score as fresh.
    const basis = Number.isFinite(Date.parse(m.observedTo)) ? Date.parse(m.observedTo) : Date.parse(content.publishedAt);
    const ageD = Math.max(0, (Date.parse(evaluatedAt ?? new Date().toISOString()) - basis) / 86_400_000);
    const rec = Math.pow(0.5, ageD / HALF_LIFE_DAYS);
    return { corroboration: completeness, precision: 1, recency: rec, weight: completeness * rec };
  }

  const relayed = Array.isArray(m.relayedVia) && m.relayedVia.length > 0;
  // Capped below saturation: a relay's failure mode does not weaken as
  // sources accumulate, so a wholly relayed claim can never be as strong as
  // one received independently.
  const effectiveSources = relayed
    ? Math.min(1 + (m.sourceCount - 1) * 0.5, SATURATION_N - 1)
    : m.sourceCount;
  const corroboration = Math.min(effectiveSources, SATURATION_N) / SATURATION_N;
  // Timing precision is inapplicable to an equality-matched claim: those carry
  // windowHours 0 because no window was used, and applying the ratio would
  // yield precision 0 and zero the weight of every such finding.
  const windowMs = m.parameters.windowHours * 3_600_000;
  const precision = m.parameters.matchedBy === 'equality'
    ? 1
    : m.timePrecisionMs > 0 ? Math.min(windowMs / m.timePrecisionMs, 1) : 1;
  // The census branch above already defaults this; here it did not, so
  // derive(content) with no evaluation time returned NaN down this path and
  // agreed with the other path only when a caller happened to supply one.
  const ageDays = (Date.parse(evaluatedAt ?? new Date().toISOString())
    - Date.parse(content.publishedAt)) / 86_400_000;
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  return { corroboration, precision, recency, weight: corroboration * precision * recency };
}

/** Everything a conforming consumer must decide about one event. */
function consume(event, evaluatedAt) {
  const { content, signature } = event;
  const digest = sha256(utf8ToBytes(canonical(content)));

  let signatureValid = false;
  try {
    signatureValid = ml_dsa65.verify(hexToBytes(signature.sig), digest, hexToBytes(signature.pubkey));
  } catch { signatureValid = false; }

  const out = { digest: bytesToHex(digest), canonical: canonical(content), signatureValid, rejectReason: null, weight: null };
  if (!signatureValid) { out.rejectReason = 'signature-invalid'; return out; }

  // A VALID signature over a payload the format forbids is still a rejection.
  // Checking signatures alone is not conformance.
  if ('confidence' in content || 'weight' in content) { out.rejectReason = 'declared-weight-forbidden'; return out; }

  /**
   * RETRACTED FIRST. A payload at a claim's slot is not guaranteed to be a claim.
   *
   * A retraction is published to the same `d` tag under the same kind, so a
   * consumer that validates claim fields before checking `retracted` reports a
   * perfectly valid withdrawal as missing-required-fields — which is what this
   * reference consumer did, along with verify-finding.mjs. The specification
   * defines a payload its own reference implementation refused.
   *
   * A retracted slot is treated as ABSENT, not as a negative finding: a
   * withdrawn claim about X is not evidence against X, and no weight is
   * derived because there is nothing left to weigh.
   */
  if (content.retracted === true) {
    const r = content.retracts;
    const bad = !r || typeof r.subjectRef !== 'string' || !r.subjectRef
      || typeof r.attribute !== 'string' || !r.attribute
      || typeof content.retractedAt !== 'string' || Number.isNaN(Date.parse(content.retractedAt));
    if (bad) { out.rejectReason = 'missing-required-fields'; return out; }
    /**
     * An unrecognised reason does NOT refuse the withdrawal.
     *
     * Wrongly honouring a retraction costs a claim the author can republish.
     * Wrongly ignoring one means continuing to publish something its author
     * disowned, and `subject-request` exists for a person asking to be
     * removed — so refusing to stop because the justification was unfamiliar
     * chooses the failure that the affected person cannot undo.
     *
     * The reason is reported as unrecognised rather than guessed at: a third
     * state, not a coin flip between `superseded` and `decayed`.
     */
    out.retraction = {
      slot: identifierFor(r.subjectRef, r.attribute),
      reason: content.reason,
      reasonRecognised: RETRACTION_REASONS.has(content.reason),
    };
    return out;
  }
  /**
   * REFUTATIONS. Checked before claim fields, for the same reason retractions
   * are: a payload carrying `refutes` is not a claim and validating it as one
   * reports an entirely valid contest as missing-required-fields.
   *
   * Reimplemented from the prose, like everything else here. The address below
   * is the part most likely to be got wrong by a second implementer, and
   * getting it wrong is silent: a refutation lands at a slot nobody queries,
   * so the claim it contests goes on looking uncontested forever.
   */
  if (content.refutes && typeof content.refutes === 'object') {
    const r = content.refutes;
    const missing = ['authorPubkey', 'subjectRef', 'attribute', 'publishedAt']
      .filter((k) => typeof r[k] !== 'string' || !r[k]);
    if (missing.length) { out.rejectReason = 'missing-required-fields'; return out; }

    /**
     * Every component percent-encoded, INCLUDING the timestamp.
     *
     * ISO-8601 contains colons. Left raw, a four-part identifier splits into
     * six on its own separator and stops being decomposable — so a consumer
     * cannot recover which claim is being contested from the address it is
     * filed under.
     */
    out.refutationAddress = [r.authorPubkey, r.subjectRef, r.attribute, r.publishedAt]
      .map(encodeURIComponent).join(':');

    // A refutation MUST carry its own method: without it the cheapest possible
    // message outweighs expensive evidence, and refutation becomes a
    // denial-of-service on truth.
    if (!content.method || typeof content.method !== 'object') {
      out.rejectReason = 'underivable-weight';
      return out;
    }
    out.weight = derive(content, evaluatedAt);
    if (!Number.isFinite(out.weight?.weight)) { out.rejectReason = 'underivable-weight'; out.weight = null; }
    return out;
  }

  // Conditionally required: an enumeration without a stated boundary is a
  // count nobody can re-run. Rejected, not merely weighed at zero.
  if (content.method?.parameters?.matchedBy === 'enumeration'
    && !(typeof content.method.enumeratedBoundary === 'string' && content.method.enumeratedBoundary.trim())) {
    out.rejectReason = 'missing-required-fields'; return out;
  }

  const missing = REQUIRED.filter((f) => get(content, f) === undefined);
  if (missing.length) { out.rejectReason = 'missing-required-fields'; out.missing = missing; return out; }

  if (!MODALITIES.has(content.method.modality)) { out.rejectReason = 'unknown-modality'; return out; }

  const df = content.method.derivesFrom;
  if (df !== undefined) {
    const complete = df && typeof df === 'object'
      && ['node', 'method', 'specification'].every((k) => typeof df[k] === 'string' && df[k].trim());
    if (!complete) { out.rejectReason = 'malformed'; return out; }
  }

  const weak = content.method.weakBacking;
  if (!Array.isArray(weak) || weak.some((w) => typeof w !== 'string')) { out.rejectReason = 'malformed'; return out; }

  /**
   * Last: the published facts must actually produce a usable weight.
   *
   * Everything above checks that a field is present and shaped right. Nothing
   * checks that the fields work together, and a claim can satisfy all of them
   * and still be unrankable — omit parameters.windowHours and the derivation
   * multiplies by NaN, so the claim is accepted and then sorts below everything
   * for every consumer that receives it. 191 real claims were generated in
   * exactly that state and passed conformance.
   *
   * Run the derivation rather than restating its preconditions: a restatement
   * is a second copy of that knowledge, free to drift, and the drift reopens
   * the hole.
   */
  const derived = derive(content, evaluatedAt);
  if (!Number.isFinite(derived.weight) || derived.weight < 0 || derived.weight > 1) {
    out.rejectReason = 'underivable-weight'; return out;
  }

  out.weight = derived;
  return out;
}

/**
 * The enumerated-set commitment: sorted, joined with '\n', SHA-256, hex.
 *
 * Recomputed from the members a vector publishes as TEST DATA, because the
 * event carries only the digest — a commitment, not a disclosure. Without
 * this, nothing pins sort order, separator or encoding, and two
 * implementations can diverge on all three without either noticing.
 */
const enumeratedSetDigest = (members) =>
  bytesToHex(sha256(utf8ToBytes([...members].sort().join('\n'))));

const RETRACTION_REASONS = new Set([
  'superseded', 'error', 'source-withdrawn', 'subject-request', 'policy', 'decayed',
]);

/** The `d` tag, per the NIP: percent-encoded components joined by a colon. */
const identifierFor = (subjectRef, attribute) =>
  `${encodeURIComponent(subjectRef)}:${encodeURIComponent(attribute)}`;

const close = (a, b) => Math.abs(a - b) < 1e-12;
let failed = 0;
console.log(`Conformance: ${index.format}, ${index.vectors.length} vectors\n`);

for (const { name, file } of index.vectors) {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const e = v.expect;
  const got = consume(v.event, e.evaluatedAt);
  const problems = [];

  // Canonicalization first: a digest mismatch explains every later failure.
  if (got.canonical !== e.canonical) problems.push(`canonical string differs at byte ${[...e.canonical].findIndex((c, i) => c !== got.canonical[i])}`);
  if (got.digest !== e.digest) problems.push(`digest ${got.digest} != ${e.digest}`);
  if (got.signatureValid !== e.signatureValid) problems.push(`signatureValid ${got.signatureValid} != ${e.signatureValid}`);
  if ((e.rejectReason ?? null) !== got.rejectReason) problems.push(`rejectReason ${got.rejectReason} != ${e.rejectReason ?? null}`);
  if (e.missing && JSON.stringify(e.missing) !== JSON.stringify(got.missing)) problems.push(`missing ${JSON.stringify(got.missing)} != ${JSON.stringify(e.missing)}`);

  // The set commitment, computed rather than copied. The members are given
  // unsorted on purpose, so an implementation that forgets to sort fails here
  // instead of passing by luck.
  if (e.retraction) {
    if (!got.retraction) problems.push('did not recognise a retraction');
    else {
      // The slot is the interop property that matters: a retraction landing on
      // a different `d` tag withdraws nothing, and nothing about it looks wrong.
      if (got.retraction.slot !== e.retraction.slot) problems.push(`retraction slot ${got.retraction.slot} != ${e.retraction.slot}`);
      if (got.retraction.reason !== e.retraction.reason) problems.push(`retraction reason ${got.retraction.reason} != ${e.retraction.reason}`);
      if (e.retraction.reasonRecognised !== undefined && got.retraction.reasonRecognised !== e.retraction.reasonRecognised) {
        problems.push(`reasonRecognised ${got.retraction.reasonRecognised} != ${e.retraction.reasonRecognised}`);
      }
    }
    if (got.weight !== null) problems.push('derived a weight for a retracted slot');
  }

  /**
   * The refutation address, computed rather than copied.
   *
   * This is the interop property that matters for a contest, and it is the
   * exact analogue of the retraction slot above: a refutation filed at the
   * wrong address contests nothing, and nothing about it looks wrong. The
   * timestamps in these vectors contain colons on purpose, so an implementation
   * that forgets to percent-encode them fails here rather than passing by luck.
   */
  if (e.refutationAddress) {
    if (!got.refutationAddress) problems.push('did not recognise a refutation');
    else if (got.refutationAddress !== e.refutationAddress) {
      problems.push(`refutationAddress ${got.refutationAddress} != ${e.refutationAddress}`);
    }
  }

  if (e.enumeratedSet) {
    const recomputed = enumeratedSetDigest(e.enumeratedSet.members);
    if (recomputed !== e.enumeratedSet.digest) {
      problems.push(`enumeratedSetDigest recomputed ${recomputed} != ${e.enumeratedSet.digest}`);
    }
    const onWire = v.event.content.method.enumeratedSetDigest;
    if (onWire !== e.enumeratedSet.digest) {
      problems.push(`enumeratedSetDigest on the wire ${onWire} != ${e.enumeratedSet.digest}`);
    }
  }

  if (e.weight === null && got.weight !== null) problems.push('derived a weight for a payload that must be rejected');
  if (e.weight && typeof e.weight === 'object') {
    if (!got.weight) problems.push('no weight derived');
    else for (const k of ['corroboration', 'precision', 'recency', 'weight']) {
      if (e.weight[k] !== undefined && !close(got.weight[k], e.weight[k])) problems.push(`${k} ${got.weight[k]} != ${e.weight[k]}`);
    }
  }

  if (problems.length) { failed++; console.log(`  FAIL  ${name}`); for (const p of problems) console.log(`          ${p}`); }
  else console.log(`  PASS  ${name}`);
}

console.log(failed
  ? `\n${failed} of ${index.vectors.length} vectors FAILED.`
  : `\nAll ${index.vectors.length} vectors pass. The document and the implementation agree.`);
process.exit(failed ? 1 : 0);
