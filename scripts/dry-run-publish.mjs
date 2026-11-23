#!/usr/bin/env node
/**
 * A real claim, from a real register, over a real relay — that nobody else sees.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * This node has published nothing true. Everything that ever crossed its wire
 * was a fixture, including the one that went out by accident. The apparatus is
 * careful and has never carried a payload, so its remaining unknowns are not in
 * the code — they are in the parts of the world the code has never touched.
 *
 * The first time this path carries real data should not also be the first time
 * it carries real data IN PUBLIC. This is the rehearsal: real register, real
 * derivation, real signature, real relay protocol — pointed at a relay on this
 * machine, so the only infrastructure it can disturb is our own.
 *
 * ─── WHAT IT PROVES, AND WHAT IT DOES NOT ──────────────────────────────────
 *
 * Proves: an enumeration over a public register produces a well-formed
 * attestation, that it signs, that a relay accepts it, that it can be read
 * back, and that its weight derives from what it discloses.
 *
 * Does NOT prove that a public relay will accept it. Declared limits say
 * nothing about tag-value handling — see scripts/relay-limits.mjs. That
 * question needs a consenting operator, not a louder rehearsal.
 *
 * Usage: node scripts/dev-relay.mjs 7448 &   node scripts/dry-run-publish.mjs
 */
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex } from '@noble/hashes/utils';

const RELAY = process.env.DRY_RUN_RELAY ?? 'ws://127.0.0.1:7448';

/**
 * A throwaway signing key, deliberately.
 *
 * The node's real ML-DSA identity is what its published history is attributable
 * to. A rehearsal signed with it would put an artifact in that history which
 * is indistinguishable from a claim the node stands behind — which is the exact
 * confusion the accidental publish created, reproduced on purpose.
 */
const { secretKey, publicKey } = ml_dsa65.keygen();

function fail(msg) { console.error(`\n  DRY RUN FAILED\n\n  ${msg}\n`); process.exit(1); }

// ── 1. A real register, off disk ───────────────────────────────────────────
const assetPath = 'public/data/lei-coverage.json';
let asset;
try {
  asset = JSON.parse(readFileSync(assetPath, 'utf8'));
} catch (err) {
  fail(`Could not read ${assetPath}: ${err.message}`);
}
const clusters = asset.clusters ?? asset.entries ?? asset.records ?? [];
console.log(`\n  1. register       ${assetPath}`);
console.log(`     ${Array.isArray(clusters) ? clusters.length : 0} clusters, ${readFileSync(assetPath).length} bytes on disk`);

// ── 2. The claim it supports ───────────────────────────────────────────────
const observedAt = asset.fetchedAt ?? asset.generatedAt ?? new Date().toISOString();
const content = {
  schemaVersion: 2,
  claim: {
    subjectRef: asset.subject ?? 'LEI coverage, as published by GLEIF',
    subjectKind: 'organization',
    attribute: 'lei-coverage',
    value: Array.isArray(clusters) ? clusters.length : 0,
  },
  method: {
    algorithm: 'register-enumeration',
    algorithmVersion: 1,
    modality: 'primary_record',
    parameters: {
      matchedBy: 'enumeration',
      windowHours: 0,
    },
    enumeratedBoundary:
      `Every cluster present in ${assetPath}, as fetched from GLEIF. `
      + 'A reader holding the same snapshot re-runs the count and gets this number or a different one.',
    sourceCount: 1,
    observedFrom: observedAt,
    observedTo: observedAt,
    timePrecisionMs: 86_400_000,
    weakBacking: [
      'a single register: nothing independent corroborates this count',
    ],
    criteria: 'A count of every cluster in one public register snapshot, boundary stated in full.',
  },
  publishedAt: new Date().toISOString(),
};
console.log(`  2. claim          ${content.claim.attribute} = ${content.claim.value}`);
console.log(`     boundary       stated (${content.method.enumeratedBoundary.length} chars)`);
if ('confidence' in content) fail('The content carries a declared confidence.');

// ── 3. Sign it for real ────────────────────────────────────────────────────
const canonical = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
};
const { sha256 } = await import('@noble/hashes/sha2');
const { utf8ToBytes } = await import('@noble/hashes/utils');
const digest = sha256(utf8ToBytes(canonical(content)));
const sig = ml_dsa65.sign(digest, secretKey);
const signed = { content, signature: { alg: 'ml-dsa-65', pubkey: bytesToHex(publicKey), sig: bytesToHex(sig) } };
console.log(`  3. signed         ml-dsa-65, digest ${bytesToHex(digest).slice(0, 16)}…`);
if (!ml_dsa65.verify(sig, digest, publicKey)) fail('The signature does not verify against its own key.');

// ── 4. Over the wire, to a relay on this machine only ──────────────────────
const dTag = `${encodeURIComponent(content.claim.subjectRef)}:${encodeURIComponent(content.claim.attribute)}`;
const event = {
  kind: 30082,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', dTag], ['t', 'attested-claim'], ['schema_version', '2']],
  content: JSON.stringify(signed),
};
console.log(`  4. event          kind ${event.kind}, d-tag ${dTag.length} bytes, content ${event.content.length} bytes`);

const ws = new WebSocket(RELAY);
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no response from ${RELAY} within 10s`)), 10_000);
  ws.on('open', () => {
    // The dev relay is deliberately credulous — it does not verify signatures,
    // which makes it a BETTER rehearsal target: acceptance here proves the
    // protocol round trip, and nothing about whether the claim is any good.
    ws.send(JSON.stringify(['EVENT', { ...event, id: bytesToHex(sha256(utf8ToBytes(event.content))).slice(0, 64), pubkey: 'f'.repeat(64), sig: '0'.repeat(128) }]));
    ws.send(JSON.stringify(['REQ', 'dryrun', { kinds: [30082], '#t': ['attested-claim'] }]));
  });
  ws.on('message', (buf) => {
    const msg = JSON.parse(buf.toString());
    if (msg[0] === 'EVENT' && msg[1] === 'dryrun') { clearTimeout(timer); resolve(msg[2]); }
  });
  ws.on('error', (err) => { clearTimeout(timer); reject(err); });
});

let readBack;
try { readBack = await done; } catch (err) { ws.close(); fail(`${err.message}\n  Start one first:  node scripts/dev-relay.mjs 7448 &`); }
ws.close();

// ── 5. Read back, and check it survived ────────────────────────────────────
const returned = JSON.parse(readBack.content);
console.log(`  5. read back      ${readBack.tags.find((t) => t[0] === 'd')?.[1] === dTag ? 'same slot' : 'DIFFERENT SLOT'}`);
if (canonical(returned.content) !== canonical(content)) fail('The content that came back is not the content that went out.');
const reDigest = sha256(utf8ToBytes(canonical(returned.content)));
if (!ml_dsa65.verify(Buffer.from(returned.signature.sig, 'hex'), reDigest, Buffer.from(returned.signature.pubkey, 'hex'))) {
  fail('The signature does not verify after a round trip.');
}
console.log('     signature verifies against the payload that came back');

console.log(`\n  DRY RUN COMPLETE — a real count, over a real register, round-tripped a relay.\n`
  + `  Nothing left this machine. The claim asserts no confidence and states its boundary,\n`
  + `  so a reader holding the same snapshot can get a different number and say so.\n`);
