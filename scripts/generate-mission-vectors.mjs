#!/usr/bin/env node
/**
 * Generates the Mission Package + Dispatch Capability conformance vectors.
 *
 * The attested-claims format has vectors and a reference consumer that imports
 * no application code; the dispatch side had a written spec and nothing
 * executable. A spec nobody can test against is a spec every implementer reads
 * slightly differently — which is precisely the position a second node
 * (Mecha Jono) is in right now.
 *
 * Vectors are generated from FIXED keys and a FIXED timestamp so the output is
 * byte-stable and a diff means a real format change, not a re-run.
 *
 * Usage: node scripts/generate-mission-vectors.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

const OUT = 'docs/spec/mission-vectors';
mkdirSync(OUT, { recursive: true });

// Fixed keys — these are TEST keys, published deliberately. Never operational.
const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
const CREATOR_SK = hex('01'.repeat(32));
const COLLEAGUE_SK = hex('02'.repeat(32));
const STRANGER_SK = hex('03'.repeat(32));
const CREATOR = getPublicKey(CREATOR_SK);
const COLLEAGUE = getPublicKey(COLLEAGUE_SK);
const STRANGER = getPublicKey(STRANGER_SK);

const AT = Math.floor(Date.parse('2026-01-15T00:00:00.000Z') / 1000);
const MISSION_ID = 'mission-vector-1';
const RESOURCE = `mission:${MISSION_ID}`;

const grant = ({ sk, holder, parentId, resource = RESOURCE, action = 'dispatch', at = AT }) => {
  const tags = [
    ['d', `cap:${resource}:${holder}`],
    ['resource', resource],
    ['action', action],
    ['holder', holder],
  ];
  if (parentId) tags.push(['parent', parentId]);
  return finalizeEvent({ kind: 30081, created_at: at, tags, content: '' }, sk);
};

/**
 * A withdrawal, which occupies the SAME slot as the grant it replaces.
 *
 * It carries resource/action/holder exactly as a grant does — it has to, or a
 * verifier could not tell which grant it withdraws — so an implementation that
 * reads the grant fields before checking for the withdrawal marker parses it as
 * a perfectly good grant and honours authority its issuer took back. That is
 * the failure this vector exists to catch.
 */
const revocation = ({ sk, holder, resource = RESOURCE, action = 'dispatch', reason = 'left the operation', at = AT }) =>
  finalizeEvent({
    kind: 30081,
    created_at: at,
    tags: [
      ['d', `cap:${resource}:${holder}`],
      ['resource', resource],
      ['action', action],
      ['holder', holder],
      ['revoked', reason],
    ],
    content: '',
  }, sk);

const write = (name, description, vector) => {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ name, description, ...vector }, null, 2) + '\n');
  console.log(`  ${name}`);
};

const root = grant({ sk: CREATOR_SK, holder: CREATOR });
const delegated = grant({ sk: CREATOR_SK, holder: COLLEAGUE, parentId: root.id });
const secondHop = grant({ sk: COLLEAGUE_SK, holder: STRANGER, parentId: delegated.id });

console.log('Writing mission-package conformance vectors:');

write('capability-root-holds', 'The mission creator holds dispatch on their own mission.', {
  expect: { valid: true, holder: CREATOR },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [root],
});

write('capability-delegation-holds', 'A holder delegates to a colleague; the two-link chain verifies.', {
  expect: { valid: true, holder: COLLEAGUE },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [root, delegated],
});

write('capability-multi-hop-holds', 'Authority survives a second delegation hop.', {
  expect: { valid: true, holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [root, delegated, secondHop],
});

write('capability-self-issued-refused',
  'A stranger signs a syntactically perfect root grant naming themselves, over a mission they did not create. Self-report grants nothing.', {
  expect: { valid: false, reason: 'root-issuer-mismatch', holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [grant({ sk: STRANGER_SK, holder: STRANGER })],
});

write('capability-delegation-by-non-holder-refused',
  'A stranger delegates to themselves citing the real root as parent. Only a holder may pass on what they hold.', {
  expect: { valid: false, reason: 'issuer-not-holder', holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [root, grant({ sk: STRANGER_SK, holder: STRANGER, parentId: root.id })],
});

write('capability-missing-link-refused',
  'The middle link is dropped so the last appears delegated directly by the root.', {
  expect: { valid: false, reason: 'issuer-not-holder', holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [root, secondHop],
});

write('capability-out-of-order-refused',
  'A valid chain presented back-to-front. Note the cause: the first link IS issued by the root issuer, so it is the "root carries no parent" clause that catches it.', {
  expect: { valid: false, reason: 'root-has-parent', holder: CREATOR },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [delegated, root],
});

write('capability-wrong-resource-refused', 'A grant for a different mission.', {
  expect: { valid: false, reason: 'resource-mismatch', holder: CREATOR },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [grant({ sk: CREATOR_SK, holder: CREATOR, resource: 'mission:some-other' })],
});

write('capability-wrong-holder-refused', 'An entirely valid chain that empowers somebody else.', {
  expect: { valid: false, reason: 'holder-mismatch', holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [root, delegated],
});

write('capability-empty-refused', 'No capability presented. Absence is not permission.', {
  expect: { valid: false, reason: 'empty-chain', holder: CREATOR },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch', chain: [],
});

write('capability-tampered-refused',
  'A valid grant whose holder tag was edited after signing. Implementations that trust a cached verification flag will WRONGLY pass this.', {
  expect: { valid: false, reason: 'bad-signature', holder: STRANGER },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [{ ...root, tags: root.tags.map((t) => (t[0] === 'holder' ? ['holder', STRANGER] : t)) }],
});

console.log(`\nKeys used (TEST ONLY, never operational):`);
console.log(`  creator   ${CREATOR}`);
console.log(`  colleague ${COLLEAGUE}`);
console.log(`  stranger  ${STRANGER}`);

write('capability-revoked-refused',
  'The issuer withdrew this delegation by publishing to its slot. The withdrawal carries the same resource, action and holder tags as the grant, so an implementation that reads those before checking for the marker will honour authority that was taken back. The cause must be `revoked`, never `malformed-grant`: a withdrawal is a deliberate act, and telling a holder their capability is broken says the wrong thing about what happened.', {
  expect: { valid: false, reason: 'revoked', holder: COLLEAGUE },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [root, revocation({ sk: CREATOR_SK, holder: COLLEAGUE })],
});

write('capability-revoked-root-refused',
  'The root grant itself is withdrawn. Nothing downstream can survive it, because every chain is rooted here.', {
  expect: { valid: false, reason: 'revoked', holder: CREATOR },
  rootIssuer: CREATOR, resource: RESOURCE, action: 'dispatch',
  chain: [revocation({ sk: CREATOR_SK, holder: CREATOR })],
});

/*
 * ─── MANIFEST SIGNATURE VECTORS ────────────────────────────────────────────
 *
 * Twenty vectors covered capability delegation and manifest structure, and not
 * one of them carried a signature block — so the ONE part of the spec that
 * actually blocked a second implementer was the one part with nothing
 * executable behind it.
 *
 * The peer asked after rev 6, rev 7 and rev 8 how `pubkey` and `sig` are
 * encoded. Rev 9 answers it in prose. These vectors are how that answer
 * becomes testable, and they are deliberately a PAIR: the same manifest, the
 * same signature, written once as hex and once as base64. A conforming
 * verifier accepts both. One that accepts only the encoding it happens to emit
 * passes one and fails the other, which is exactly the bug that refused a
 * genuine package in silence.
 *
 * ─── ON REPRODUCING THESE BYTE FOR BYTE ────────────────────────────────────
 *
 * You cannot, and you are not meant to. ML-DSA-65 signing is HEDGED by default
 * — it mixes in fresh randomness, so two signatures over the same digest by the
 * same key differ and both verify. These vectors are generated with that
 * randomness disabled (`extraEntropy: false`, the FIPS 204 deterministic
 * variant) only so the committed files are byte-stable and a diff means a real
 * format change. Starcom's own signer is hedged, which is the recommended
 * default.
 *
 * So: VERIFY the signature below. Do not compare it to one your own
 * implementation produces — a correct implementation will produce a different
 * one. If you want to check your signer, sign `digestHex` with `signerSecret`
 * and verify YOUR signature against `signerPubkeyHex`.
 */
const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
const { sha256 } = await import('@noble/hashes/sha256');
const { bytesToHex: toHex, utf8ToBytes: toUtf8 } = await import('@noble/hashes/utils');

const SIGNER_SEED = new Uint8Array(32).fill(0x11);
const signerKeys = ml_dsa65.keygen(SIGNER_SEED);

const toB64 = (bytes) => Buffer.from(bytes).toString('base64');

/** The spec's canonical form: keys by UTF-16 code unit, undefined dropped. */
const stable = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stable).join(',')}]`;
  const entries = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
};

// A manifest with the shape a real one has, including rev 5's objectives, so
// the digest exercises nested arrays and optional keys rather than a flat toy.
const signedManifest = {
  id: MISSION_ID,
  name: 'Substation permit filings, Wayne County',
  version: '1.0.0',
  description: 'Permit filings clustered near a substation, for corroboration.',
  visibility: 'public',
  createdAt: '2026-01-15T00:00:00.000Z',
  author: 'Starcom',
  license: 'CC-BY',
  reports: [{ id: 'r-1', title: 'Filing cluster', checksum: '1a2b3c4d' }],
  intel: [],
  assets: [],
  objectives: [
    {
      id: 'obj-1',
      ask: 'Confirm the filings name the same parcel.',
      handsBack: 'A yes or no, with the parcel identifiers compared.',
      effortMinutes: 45,
      for: 'public',
      done: false,
    },
  ],
  metadata: { objectiveCount: 1 },
};

const digest = sha256(toUtf8(stable(signedManifest)));
const sigBytes = ml_dsa65.sign(digest, signerKeys.secretKey, { extraEntropy: false });

const signatureCommon = {
  signerPubkeyHex: toHex(signerKeys.publicKey),
  signerSecretSeedHex: toHex(SIGNER_SEED),
  canonicalJson: stable(signedManifest),
  digestHex: toHex(digest),
  note: 'Signing is hedged by default and these are generated deterministically for byte-stability. Verify this signature; do not expect to reproduce it.',
};

const withSignature = (pubkey, sig) => ({
  ...signedManifest,
  metadata: { ...signedManifest.metadata, signature: { alg: 'ml-dsa-65', pubkey, sig } },
});

write('manifest-signature-hex-holds',
  'A signed manifest whose signature block is written as lowercase hex — what Starcom emits. The digest is SHA-256 over the canonical JSON of the manifest with the signature block removed from metadata first.', {
  expect: { valid: true },
  ...signatureCommon,
  manifest: withSignature(toHex(signerKeys.publicKey), toHex(sigBytes)),
});

write('manifest-signature-base64-holds',
  'THE SAME manifest and THE SAME signature, written as base64 — what the Navcom peer emits. A verifier that accepts only the encoding it happens to emit fails this one while passing its hex twin, which is precisely the defect that silently refused a genuine package: no error on either side. Both encodings are conforming and a receiver MUST accept both.', {
  expect: { valid: true },
  ...signatureCommon,
  manifest: withSignature(toB64(signerKeys.publicKey), toB64(sigBytes)),
});

write('manifest-signature-tampered-refused',
  'A valid base64 signature over a manifest whose name was edited afterwards. Tolerating two encodings must not tolerate a bad signature — if this passes, the decoder is inventing bytes rather than reading them.', {
  expect: { valid: false, reason: 'bad-signature' },
  ...signatureCommon,
  manifest: { ...withSignature(toB64(signerKeys.publicKey), toB64(sigBytes)), name: 'Something else entirely' },
});

write('manifest-signature-truncated-refused',
  'A signature truncated to half its length, still valid hex. Encoding must be decided by DECODED BYTE COUNT, never by pattern: an ML-DSA-65 signature is 3309 bytes and a public key is 1952. An implementation that sniffs the alphabet instead of checking the size accepts this and then verifies garbage.', {
  expect: { valid: false, reason: 'bad-length' },
  ...signatureCommon,
  manifest: withSignature(toHex(signerKeys.publicKey), toHex(sigBytes).slice(0, 3308)),
});

console.log(`\n  manifest signer pubkey (TEST ONLY): ${toHex(signerKeys.publicKey).slice(0, 32)}…`);
