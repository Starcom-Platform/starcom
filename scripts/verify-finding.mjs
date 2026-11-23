#!/usr/bin/env node
/**
 * Independent Finding verifier.
 *
 * This is the Phase 2 gate made executable: "a third party can verify a
 * finding's signature, re-derive its weight, and attempt to falsify it,
 * without trusting this instance and without asking us for anything."
 *
 * IT IMPORTS NO APPLICATION CODE. Everything below is reimplemented from
 * docs/spec/starcom-navcom-interchange.spec.md using standard libraries a
 * stranger would already have. That constraint is the entire point: if this
 * needed to import from src/, the spec would be decoration and the real
 * contract would be our source tree. A verifier written from the document is
 * the only thing that proves the document is sufficient.
 *
 * Usage:
 *   node scripts/verify-finding.mjs <signed-finding.json> [own-observations.json]
 *
 * Exit codes:
 *   0  signature valid
 *   1  signature invalid, or the payload does not match the spec
 *   2  could not read input (says nothing about the finding)
 */
import fs from 'node:fs';
// Standard libraries only — the same ones any third party would install.
const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
const { sha256 } = await import('@noble/hashes/sha256');
const { bytesToHex, hexToBytes, utf8ToBytes } = await import('@noble/hashes/utils');

const usage = (msg) => { console.error(`${msg}\n\nUsage: node scripts/verify-finding.mjs <signed-finding.json> [own-observations.json]`); process.exit(2); };

const path = process.argv[2];
if (!path) usage('No finding supplied.');
let signed;
try { signed = JSON.parse(fs.readFileSync(path, 'utf8')); }
catch (e) { usage(`Could not read ${path}: ${e.message}`); }

// ---- Per the spec: stable-stringify, SHA-256, ML-DSA-65 over the digest ----
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

const { content, signature } = signed ?? {};
if (!content || !signature) usage('Payload has no { content, signature }.');

console.log(`Finding: ${content.claim?.subjectRef ?? '(no subject)'} / ${content.claim?.attribute ?? '?'}`);
console.log(`  schemaVersion: ${content.schemaVersion}`);

// ---- 1. Signature -----------------------------------------------------------
let signatureValid = false;
try {
  const digest = sha256(utf8ToBytes(stableStringify(content)));
  signatureValid = ml_dsa65.verify(hexToBytes(signature.sig), digest, hexToBytes(signature.pubkey));
} catch (e) {
  console.error(`  signature: ERROR (${e.message})`);
  process.exit(1);
}
console.log(`  signature: ${signatureValid ? 'VALID' : 'INVALID'} (${signature.alg}, author ${signature.pubkey.slice(0, 16)}…)`);
if (!signatureValid) process.exit(1);

/**
 * A payload at a claim's slot is not guaranteed to be a claim.
 *
 * A retraction is published to the SAME `d` tag under the same kind, so
 * anything that validates claim fields first reports a perfectly valid
 * withdrawal as a malformed claim — which is what this verifier did.
 *
 * A retracted slot is ABSENT, not a negative finding: a withdrawn claim about
 * X is not evidence against X, and there is nothing left to weigh.
 */
if (content.retracted === true) {
  const r = content.retracts ?? {};
  if (typeof r.subjectRef !== 'string' || !r.subjectRef
    || typeof r.attribute !== 'string' || !r.attribute
    || typeof content.retractedAt !== 'string' || Number.isNaN(Date.parse(content.retractedAt))) {
    console.error('  SPEC VIOLATION: retraction is missing retracts.subjectRef, retracts.attribute or retractedAt.');
    process.exit(1);
  }
  const REASONS = ['superseded', 'error', 'source-withdrawn', 'subject-request', 'policy', 'decayed'];
  const known = REASONS.includes(content.reason);
  // An unrecognised reason does NOT block the withdrawal. Refusing to stop
  // because the justification was unfamiliar keeps publishing something the
  // author disowned, which is the failure the affected person cannot undo.
  console.log(`  RETRACTED: ${content.reason}${known ? '' : ' (UNRECOGNISED reason — the withdrawal still stands)'}${content.note ? ` — ${content.note}` : ''}`);
  console.log(`    withdraws the slot ${encodeURIComponent(r.subjectRef)}:${encodeURIComponent(r.attribute)}`);
  console.log('    treat that slot as ABSENT, not as evidence against the claim it held');
  console.log('\nVerified independently. No Starcom code was imported.');
  process.exit(0);
}

/**
 * A refutation, likewise — the SAME defect the retraction branch above records
 * fixing, one shape over.
 *
 * A refutation carries `refutes`, never `claim`, so validating claim fields
 * first reports a well-formed contest as a malformed claim. The published
 * conformance vectors say a conforming consumer ACTS on these; this verifier
 * refused both of them, so an operator checking a refutation by hand was told
 * the disagreement was junk.
 *
 * It is still WEIGHED, not merely acknowledged: a refutation is weighed by its
 * disclosed method exactly as a claim is, which is what keeps "anyone may
 * contest anyone" from meaning "any contest counts equally".
 */
if (content.refutes !== undefined) {
  const r = content.refutes ?? {};
  const addressing = ['authorPubkey', 'subjectRef', 'attribute', 'publishedAt'];
  // Blank is as absent as missing: a refutation naming no version of the claim
  // it contests applies to every later revision of that slot, including one
  // that fixed the very problem being refuted.
  const unaddressed = addressing.filter((k) => typeof r[k] !== 'string' || r[k].trim() === '');
  if (unaddressed.length) {
    console.error(`  SPEC VIOLATION: refutation does not say what it contests (refutes.${unaddressed.join(', refutes.')}).`);
    process.exit(1);
  }
  if (!content.method || typeof content.ground !== 'string' || !content.ground) {
    console.error('  SPEC VIOLATION: refutation is missing ground or method — a contest is weighed by its disclosed method, like any other claim.');
    process.exit(1);
  }
  console.log(`  REFUTES: ${r.subjectRef} / ${r.attribute} published ${r.publishedAt}`);
  console.log(`    on the ground of: ${content.ground}`);
  console.log(`    by author ${String(r.authorPubkey).slice(0, 24)}…`);
  console.log('    weigh this against the claim it contests — it does not by itself withdraw anything');
}

// ---- 2. Weight, derived from the wire alone --------------------------------
if (content.schemaVersion >= 2) {
  if ('confidence' in content || 'weight' in content) {
    console.error('  SPEC VIOLATION: v2 must not publish a declared confidence or weight.');
    process.exit(1);
  }
  // Structural conformance BEFORE deriving anything from the payload.
  // Added after the conformance vectors caught this verifier accepting
  // missing-required-fields: it verified the signature, found no declared
  // confidence, and happily derived a weight from a `method` block with holes
  // in it. A valid signature says the bytes are authentic, not that they are
  // complete — and every consumer written so far has conflated the two.
  const REQUIRED = [
    // A refutation is addressed by what it contests, not by a claim of its own.
    ...(content.refutes === undefined
      ? ['claim.subjectRef', 'claim.subjectKind', 'claim.attribute', 'claim.value']
      : ['ground', 'refutes.authorPubkey', 'refutes.subjectRef', 'refutes.attribute', 'refutes.publishedAt']),
    'method.algorithm', 'method.algorithmVersion', 'method.criteria',
    'method.sourceCount', 'method.observedFrom', 'method.observedTo',
    'method.timePrecisionMs', 'method.parameters', 'method.modality',
    'method.weakBacking', 'publishedAt',
  ];
  const missing = REQUIRED.filter((f) => f.split('.').reduce((o, k) => o?.[k], content) === undefined);
  if (missing.length) {
    console.error(`  SPEC VIOLATION: missing required field(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  const m = content.method;

  // How the observation was made. A vocabulary, deliberately not a ranking —
  // this verifier must not quietly prefer one over another.
  const MODALITIES = new Set([
    'in_person', 'field_attested', 'direct_contact', 'primary_record',
    'secondary_record', 'inference', 'self_attested', 'unknown',
  ]);
  if (!MODALITIES.has(m.modality)) {
    console.error(`  SPEC VIOLATION: unregistered method.modality: ${String(m.modality)}`);
    process.exit(1);
  }

  // An empty array asserts the publisher checked and found no thin inputs.
  // Anything that is not an array of strings is not that assertion.
  if (!Array.isArray(m.weakBacking) || m.weakBacking.some((w) => typeof w !== 'string')) {
    console.error('  SPEC VIOLATION: method.weakBacking must be an array of strings.');
    process.exit(1);
  }

  // A citation of someone else's method must be complete or absent.
  if (m.derivesFrom !== undefined) {
    const d = m.derivesFrom;
    const complete = d && typeof d === 'object'
      && ['node', 'method', 'specification'].every((k) => typeof d[k] === 'string' && d[k].trim());
    if (!complete) {
      console.error('  SPEC VIOLATION: method.derivesFrom is present but incomplete.');
      process.exit(1);
    }
  }

  const isCensus = m.parameters.matchedBy === 'enumeration';

  // Conditionally required: an enumeration states WHAT it counted. Without the
  // boundary the count cannot be re-run by anyone, which makes it
  // indistinguishable from an invented number — so it is rejected here rather
  // than merely weighed at zero.
  if (isCensus && !(typeof m.enumeratedBoundary === 'string' && m.enumeratedBoundary.trim())) {
    console.error("  SPEC VIOLATION: matchedBy 'enumeration' requires method.enumeratedBoundary.");
    process.exit(1);
  }

  /**
   * The set commitment, if the publisher chose to make one.
   *
   * Optional, and unverifiable without the underlying members — which are
   * never published, by design. What IS checkable is the form: a malformed
   * digest is worse than none, because a reader would compare their own
   * against a value that could never match anything and conclude their data
   * differs.
   */
  if (m.enumeratedSetDigest !== undefined) {
    if (!/^[0-9a-f]{64}$/.test(String(m.enumeratedSetDigest))) {
      console.error(`  SPEC VIOLATION: enumeratedSetDigest is not a lowercase hex SHA-256: ${m.enumeratedSetDigest}`);
      process.exit(1);
    }
    console.log(`  set commitment: ${m.enumeratedSetDigest}`);
    console.log('    recompute it as sha256(sorted members joined by \\n) if you hold the same boundary');
  }

  /**
   * An ENUMERATION claim is a census, not an agreement.
   *
   * Completeness of the STATED boundary replaces corroboration: a count whose
   * boundary is unstated cannot be re-run by anyone, so it earns no support at
   * all. A census has no independent observers to count, and scoring it
   * through a term built to reward agreement would understate a complete
   * national register badly.
   *
   * Otherwise: relay discount. Sources sharing one delivery path are distinct
   * observers with a single point of failure between them and us, so extra
   * sources through the same relay count half — capped below saturation,
   * because that failure mode does not weaken as sources accumulate.
   */
  const corroboration = isCensus
    ? (m.enumeratedBoundary && String(m.enumeratedBoundary).trim() ? 1 : 0)
    : (() => {
        const relayed = Array.isArray(m.relayedVia) && m.relayedVia.length > 0;
        const effective = relayed
          ? Math.min(1 + (m.sourceCount - 1) * 0.5, 4 - 1)
          : m.sourceCount;
        return Math.min(effective, 4) / 4;
      })();

  // Timing precision is inapplicable to an identifier match and to a census
  // alike — neither used a time window, and applying the ratio to a published
  // windowHours of 0 would zero every such claim.
  const windowMs = m.parameters.windowHours * 3_600_000;
  const precision = (isCensus || m.parameters.matchedBy === 'equality')
    ? 1
    : m.timePrecisionMs > 0 ? Math.min(windowMs / m.timePrecisionMs, 1) : 1;

  // For an enumeration, age runs from the SNAPSHOT (`observedTo`) rather than
  // from publication: the publisher chooses when to publish, so a stale
  // register republished today would otherwise score as fresh.
  const ageBasis = isCensus && Number.isFinite(Date.parse(m.observedTo))
    ? Date.parse(m.observedTo)
    : Date.parse(content.publishedAt);
  const ageDays = Math.max(0, (Date.now() - ageBasis) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / 180);
  const weight = corroboration * precision * recency;

  // Every field check above asks whether something is present and shaped right.
  // None asks whether the fields work TOGETHER, and a claim can pass all of them
  // and still be unrankable — omit parameters.windowHours and this multiplication
  // yields NaN. NaN compares false against every threshold, so such a claim
  // publishes clean and then sorts below everything for every consumer that
  // receives it, permanently, without an error anywhere.
  //
  // Checked against THIS script's own derivation rather than an imported one.
  // The protocol's premise is that consumers derive independently; a verifier
  // that borrowed someone else's arithmetic would not be verifying it.
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    console.error('  SPEC VIOLATION: the published facts yield no usable weight.');
    console.error(`  corroboration ${corroboration} · precision ${precision} · recency ${recency}`);
    console.error('  Every required field is present, but they do not combine into a number a');
    console.error('  consumer can rank. Check method.parameters against the derivation.');
    process.exit(1);
  }

  console.log(`  weight: ${weight.toFixed(4)}  (derived, not read)`);
  console.log(`    corroboration ${corroboration.toFixed(3)} · precision ${precision.toFixed(3)} · recency ${recency.toFixed(3)} · age ${ageDays.toFixed(1)}d`);
  console.log(`    method: ${m.algorithm} v${m.algorithmVersion}, ${m.parameters.windowHours}h / ${m.parameters.distanceThresholdKm}km`);
  console.log(`    criteria: ${m.criteria}`);
} else {
  console.log(`  weight: v1 publishes confidence=${content.confidence} as its OWN assertion — not comparable across instances.`);
}

// ---- 3. Falsification attempt ----------------------------------------------
const ownPath = process.argv[3];
const published = content.method?.inputFingerprints;
if (!ownPath) {
  console.log(`  reproduction: not attempted (no observation file given)${published ? `; ${published.length} fingerprint(s) published` : ''}`);
} else if (!published?.length) {
  console.log('  reproduction: IMPOSSIBLE — this finding published no input fingerprints.');
} else {
  const own = JSON.parse(fs.readFileSync(ownPath, 'utf8'));
  const mine = new Set((own.observations ?? own).map((o) =>
    bytesToHex(sha256(utf8ToBytes(JSON.stringify([
      o.subjectEntityRef, o.claim.attribute, o.claim.value, o.timestamp,
    ]))).slice(0, 16))
  ));
  const matched = published.filter((f) => mine.has(f)).length;
  const coverage = matched / published.length;
  const verdict = coverage === 1 ? 'REPRODUCED' : coverage > 0 ? 'PARTIAL' : 'UNREPRODUCIBLE';
  console.log(`  reproduction: ${verdict} — ${matched}/${published.length} inputs held (${(coverage * 100).toFixed(0)}%)`);
  if (verdict === 'UNREPRODUCIBLE') {
    console.log('    Note: holding none of the evidence is a fact about YOU, not about the claim.');
  }
}

console.log('\nVerified independently. No Starcom code was imported.');
