#!/usr/bin/env node
/**
 * Conformance runner for the Dispatch Capability format (kind 30081).
 *
 * A minimal reference consumer that is NOT Starcom. Like conformance.mjs, it
 * IMPORTS NO APPLICATION CODE — every rule below is reimplemented from
 * docs/spec/starcom-navcom-interchange.spec.md using libraries a stranger
 * would already have.
 *
 * That constraint is the whole point. If this file imported
 * missionCapability.ts it would prove only that the code agrees with itself,
 * which is what a second implementer cannot rely on. Reimplementing from the
 * prose is how a spec gets tested as a SPEC — and if the prose is ambiguous,
 * writing this is where that surfaces.
 *
 * A second node implementing dispatch should be able to point their own
 * verifier at docs/spec/mission-vectors and get the same verdicts.
 *
 * Usage: node scripts/conformance-mission.mjs [vectorDir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyEvent } from 'nostr-tools';
import { sha256 } from '@noble/hashes/sha2';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const DIR = process.argv[2] ?? 'docs/spec/mission-vectors';

/**
 * Rebuild the event from its canonical fields before verifying.
 *
 * The spec calls this out as REQUIRED, and the `capability-tampered-refused`
 * vector exists specifically to catch an implementation that skips it:
 * nostr-tools caches a verification result on a symbol property that survives
 * object spread, so a tampered copy verifies without rehashing.
 */
const canonical = (e) => ({
  id: e.id, pubkey: e.pubkey, created_at: e.created_at,
  kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
});

const tag = (event, name) => (event.tags.find((t) => t[0] === name) ?? [])[1];

/** Reimplemented from the spec's "Verification" list, in its stated order. */
function verifyChain(chain, { resource, action, holder, rootIssuer }) {
  if (!Array.isArray(chain) || chain.length === 0) return 'empty-chain';

  let prevHolder = null;
  let prevId = null;

  for (const [i, event] of chain.entries()) {
    if (event.kind !== 30081) return 'wrong-kind';
    if (!verifyEvent(canonical(event))) return 'bad-signature';
    /*
     * Immediately after the signature and BEFORE any grant field is read.
     *
     * A withdrawal carries the same resource/action/holder tags as the grant it
     * replaces — it must, or a verifier could not tell which grant it withdraws
     * — so reading those first parses it as a perfectly good grant. This
     * verifier did precisely that, and returned valid for a revoked ROOT grant,
     * until capability-revoked-root-refused was written.
     */
    if (event.tags.some((t) => t[0] === 'revoked')) return 'revoked';
    if (tag(event, 'resource') !== resource) return 'resource-mismatch';
    if (tag(event, 'action') !== action) return 'action-mismatch';

    if (i === 0) {
      if (event.pubkey !== rootIssuer) return 'root-issuer-mismatch';
      if (tag(event, 'parent')) return 'root-has-parent';
    } else {
      if (event.pubkey !== prevHolder) return 'issuer-not-holder';
      if (tag(event, 'parent') !== prevId) return 'broken-attenuation';
    }

    prevHolder = tag(event, 'holder');
    prevId = event.id;
  }

  return prevHolder === holder ? null : 'holder-mismatch';
}

/** Canonical JSON, reimplemented from the spec: keys by UTF-16 code unit. */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** A country's code, or a state's as ISO 3166-2 writes it, lower case: never finer (rev 11). */
const REGION = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;

/** The package profile (rev 11), checked from the spec's words: what each field may say. */
function profileProblem(p) {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return 'profile-malformed';
  if (!['open', 'closed', 'claimed'].includes(p.missionState)) return 'profile-malformed';
  if (p.claims !== undefined && !['one', 'many'].includes(p.claims)) return 'profile-malformed';
  if (p.missionState === 'claimed' && p.claims !== 'one') return 'profile-claimed-needs-one';
  if (p.fieldWork !== undefined) {
    const f = p.fieldWork;
    if (f === null || typeof f !== 'object') return 'profile-malformed';
    if (typeof f.jurisdiction !== 'string' || !REGION.test(f.jurisdiction)) return 'profile-region-not-a-country-or-state';
    if (!Number.isInteger(f.validUntil) || f.validUntil <= 0) return 'profile-malformed';
  }
  if (p.agent !== undefined && (typeof p.agent !== 'string' || p.agent.trim() === '')) return 'profile-malformed';
  return null;
}

/** The tags the spec's profile table writes for a profile. */
function profileTagsOf(p) {
  if (!p) return [];
  const tags = [['mission_state', p.missionState]];
  if (p.claims) tags.push(['claims', p.claims]);
  if (p.fieldWork) {
    tags.push(['t', 'navcom_mission'], ['valid_until', String(p.fieldWork.validUntil)], ['jurisdiction', p.fieldWork.jurisdiction]);
  }
  if (p.agent) tags.push(['agent', p.agent]);
  return tags;
}

/**
 * Manifest vectors check the OTHER half of the contract: what a conforming
 * implementation must emit, byte for byte, and what digest it must sign.
 */
function checkManifest(v) {
  const produced = canonicalJson(v.expect.manifest);
  if (produced !== v.expect.canonical) return 'canonical-mismatch';
  const digest = bytesToHex(sha256(utf8ToBytes(produced)));
  if (digest !== v.expect.digest) return 'digest-mismatch';

  const m = v.expect.manifest;
  // Since interchange rev 11 (D-MX, MX7) the author is the package's signer: a
  // callsign, or their key. A key author can be held to its signer only where
  // the event is known (the verifier refuses one naming another key); here,
  // with the manifest alone, an author must be present. Before rev 11 a key was
  // refused outright, the author being the publishing node.
  if (typeof m.author !== 'string' || m.author.trim() === '') return 'author-missing';
  for (const entry of m.reports ?? []) {
    if ('content' in entry) return 'report-body-crossed';
  }
  const meta = m.metadata ?? {};
  for (const k of ['missionNumber', 'status', 'relatedReportCount', 'relatedCaseCount', 'objectiveCount']) {
    if (!(k in meta)) return `metadata-missing-${k}`;
  }
  for (const k of Object.keys(meta)) {
    if (!['missionNumber', 'status', 'relatedReportCount', 'relatedCaseCount', 'objectiveCount', 'signature'].includes(k)) {
      return 'metadata-not-allowlisted';
    }
  }
  if (m.profile !== undefined) {
    const problem = profileProblem(m.profile);
    if (problem) return problem;
  }
  // The event's tags say what the signed profile says, in any order.
  if (v.expect.tags !== undefined) {
    const said = (tags) => tags.map((t) => JSON.stringify(t)).sort().join('\n');
    if (said(profileTagsOf(m.profile)) !== said(v.expect.tags)) return 'profile-tags-mismatch';
  }
  return null;
}

/*
 * ─── THE MANIFEST SIGNATURE, REIMPLEMENTED FROM REV 9's PROSE ──────────────
 *
 * Written from the spec section "How `pubkey` and `sig` are encoded" and
 * nothing else — no Starcom import, same constraint as the rest of this file.
 * That is what makes it a test OF THE SPEC: if the prose were ambiguous, this
 * function could not have been written from it, and the ambiguity would show
 * up here rather than in a peer's silent failure six weeks later.
 *
 * It is also the check that would have caught the original bug. A verifier
 * that decodes only hex passes manifest-signature-hex-holds and fails its
 * base64 twin, and the two vectors exist as a pair for exactly that reason.
 */
const ML_DSA_65_PUBKEY_BYTES = 1952;
const ML_DSA_65_SIG_BYTES = 3309;

/**
 * Decode key material by DECODED SIZE, never by alphabet.
 *
 * The spec is explicit about why: the base64 alphabet contains every hex
 * digit, so a base64 string can be valid hex — but it cannot decode to the
 * right number of bytes under both readings. Checking the size is also what
 * refuses the truncated vector.
 */
function decodeKeyMaterial(value, expectedBytes) {
  if (typeof value !== 'string' || value.length === 0) return null;

  if (value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)) {
    const bytes = Uint8Array.from(Buffer.from(value, 'hex'));
    if (bytes.length === expectedBytes) return bytes;
  }
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    const bytes = Uint8Array.from(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    if (bytes.length === expectedBytes) return bytes;
  }
  return null;
}

function verifyManifestSignature(manifest) {
  const block = manifest?.metadata?.signature;
  if (!block || !block.pubkey || !block.sig) return 'signature-missing';
  if (block.alg !== 'ml-dsa-65') return 'unsupported-alg';

  const pubkey = decodeKeyMaterial(block.pubkey, ML_DSA_65_PUBKEY_BYTES);
  const sig = decodeKeyMaterial(block.sig, ML_DSA_65_SIG_BYTES);
  if (!pubkey || !sig) return 'bad-length';

  // The signature block is removed from metadata BEFORE the digest is taken.
  const { signature: _drop, ...metaForDigest } = manifest.metadata;
  const digest = sha256(utf8ToBytes(canonicalJson({ ...manifest, metadata: metaForDigest })));

  return ml_dsa65.verify(sig, digest, pubkey) ? null : 'bad-signature';
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`\n  MISSION CONFORMANCE — FAILED\n\n  No vectors found in ${DIR}.\n`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const v = JSON.parse(readFileSync(join(DIR, file), 'utf8'));

  if (v.manifest) {
    const reason = verifyManifestSignature(v.manifest);
    const valid = reason === null;
    if (valid !== v.expect.valid) {
      failed++;
      console.error(`  \u2717 ${v.name}\n      expected valid=${v.expect.valid}, got valid=${valid} (${reason ?? 'ok'})`);
    } else if (!valid && v.expect.reason && reason !== v.expect.reason) {
      failed++;
      console.error(`  \u2717 ${v.name}\n      refused for "${reason}", spec says "${v.expect.reason}"`);
    } else {
      console.log(`  \u2713 ${v.name}`);
    }
    continue;
  }

  if (v.expect && v.expect.manifest) {
    // A refused vector must be refused, and for the cause it names.
    const reason = checkManifest(v);
    const expected = v.expect.refused ?? null;
    if (reason !== expected) {
      failed++;
      console.error(`  \u2717 ${v.name}\n      ${expected ? `spec says "${expected}", got "${reason ?? 'accepted'}"` : reason}`);
    } else console.log(`  \u2713 ${v.name}`);
    continue;
  }

  const reason = verifyChain(v.chain, {
    resource: v.resource, action: v.action, holder: v.expect.holder, rootIssuer: v.rootIssuer,
  });
  const valid = reason === null;

  if (valid !== v.expect.valid) {
    failed++;
    console.error(`  ✗ ${v.name}\n      expected valid=${v.expect.valid}, got valid=${valid} (${reason ?? 'ok'})`);
  } else if (!valid && v.expect.reason && reason !== v.expect.reason) {
    // A different refusal reason is not a pass: it means the chain was rejected
    // for the wrong cause, and the rule under test may not be implemented.
    failed++;
    console.error(`  ✗ ${v.name}\n      refused for "${reason}", spec says "${v.expect.reason}"`);
  } else {
    console.log(`  ✓ ${v.name}`);
  }
}

if (failed) {
  console.error(
    `\n  MISSION CONFORMANCE — FAILED\n\n  ${failed} of ${files.length} vector(s) disagree with the spec.\n`
    + `  Either the implementation drifted or the spec did. Fix the disagreement,\n`
    + `  do not regenerate the vectors to match the code.\n`,
  );
  process.exit(1);
}

console.log(
  `\n  MISSION CONFORMANCE\n\n  ${files.length} vector(s) verified against\n`
  + `  docs/spec/starcom-navcom-interchange.spec.md, reimplemented from the prose\n`
  + `  with no Starcom code imported.\n`,
);
