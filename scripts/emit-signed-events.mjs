#!/usr/bin/env node
/**
 * Signs approved claims into finished Nostr events and writes them to disk,
 * WITHOUT contacting any relay.
 *
 * ─── WHY THIS SEPARATES SIGNING FROM SENDING ───────────────────────────────
 *
 * A signed Nostr event is a self-authenticating blob. Its id is a hash of its
 * own contents and its signature covers that id, so anyone holding the bytes
 * can prove who authored them, and nobody holding the bytes can alter them or
 * mint new ones in the same name. Verified here before this file was written:
 *
 *     verifies from bytes alone, no key   true
 *     author known without any secret     true
 *     tampered content verifies           false
 *     reattributed to another author      false
 *
 * That has a consequence this project got wrong for weeks. Starcom's publishing
 * needed a human because publishing needs a key — so autonomy appeared to
 * require handing Starcom's signing key to whichever machine stays awake. That
 * was conceded to the network as an unsolved constraint. It is not one.
 *
 * REBROADCASTING NEEDS NO KEY. A peer with an always-on machine can push these
 * events to relays forever and never hold anything of Starcom's. The worst a
 * hostile rebroadcaster can do is replay claims Starcom really did sign, or
 * decline to replay them. It cannot forge one, alter one, or withdraw one — a
 * retraction is itself a signed event, so withdrawal stays solely with whoever
 * holds the key, which is nobody but the operator.
 *
 * ─── WHY created_at IS NOT REFRESHED ───────────────────────────────────────
 *
 * These events are signed once and replayed unchanged. That is not a
 * limitation being worked around, it is the correct behaviour: weight decays
 * from method.observedTo, never from when an event was last transmitted. A
 * republisher that moved the clock forward would make old claims look newly
 * observed — a lie told by a cron job, on a schedule, forever.
 *
 * Replay still does real work. Relays churn and drop old events, and a relay
 * newly ADDED to the set never received anything published before it joined.
 *
 * Usage: node scripts/emit-signed-events.mjs [--out public/claims]
 * Exit:  0 wrote a bundle · 1 nothing approved, or an identity problem
 */
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import * as peer from './peer/peer.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : d; };
const OUT = flag('--out', 'public/claims');
const IDENTITY = '.starcom-identity.json';

/** Identity from the environment, else the gitignored local file. Half an
 *  identity in the environment is refused rather than silently completed from
 *  disk, because that would sign with a key the operator did not intend. */
function loadIdentity() {
  const envNostr = process.env.STARCOM_NOSTR_SECRET_HEX;
  const envClaim = process.env.STARCOM_CLAIM_KEY_SEED_HEX;
  if (envNostr || envClaim) {
    if (!envNostr || !envClaim) {
      console.error('\n  Half an identity is set in the environment.');
      console.error('  Set both STARCOM_NOSTR_SECRET_HEX and STARCOM_CLAIM_KEY_SEED_HEX, or neither.\n');
      process.exit(1);
    }
    return { nostrSecret: hexToBytes(envNostr), claimSeed: hexToBytes(envClaim) };
  }
  if (!fs.existsSync(IDENTITY)) {
    console.error(`\n  No identity. Expected ${IDENTITY} or both identity variables in the environment.`);
    console.error('  Create one with: node scripts/generate-node-identity.mjs --add-claim-key\n');
    process.exit(1);
  }
  const id = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'));
  if (!id.claimKeySeedHex) {
    console.error(`\n  ${IDENTITY} has no claim key. Add one with:`);
    console.error('    node scripts/generate-node-identity.mjs --add-claim-key\n');
    process.exit(1);
  }
  return { nostrSecret: hexToBytes(id.secretKeyHex), claimSeed: hexToBytes(id.claimKeySeedHex) };
}

/** Approved single claims, plus every claim of every APPROVED batch. */
function collectApproved() {
  const out = [];

  for (const f of fs.existsSync('claims') ? fs.readdirSync('claims') : []) {
    if (!f.endsWith('.json')) continue;
    const p = path.join('claims', f);
    const payload = JSON.parse(fs.readFileSync(p, 'utf8'));
    out.push({ origin: p, content: payload.content ?? payload });
  }

  const batchDir = path.join('claims', 'batches');
  for (const f of fs.existsSync(batchDir) ? fs.readdirSync(batchDir) : []) {
    if (!f.endsWith('.batch.json')) continue;
    const p = path.join(batchDir, f);
    const batch = JSON.parse(fs.readFileSync(p, 'utf8'));
    // A draft is not an approval. This is the gate, and it is checked here as
    // well as in approve-batch.mjs, because this is the script that signs.
    if (!batch.review || !batch.review.reviewer || !batch.review.attests) {
      console.log(`  skipped  ${p} — review is empty, so no person has approved it`);
      continue;
    }
    out.push({ batch: p, pending: batch });
  }

  return out;
}

const { nostrSecret, claimSeed } = loadIdentity();
const nostrPub = getPublicKey(nostrSecret);
const claimKeys = ml_dsa65.keygen(claimSeed);

console.log(`\n  Signing as ${nostrPub}\n`);

const approved = collectApproved();
const contents = [];

for (const item of approved) {
  if (item.content) { contents.push(item.content); continue; }

  // Re-verify a batch at signing time rather than trusting the approval file.
  // The approval names a generator and hashed inputs; if either moved, the
  // signature would attest to output nobody reviewed.
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(process.execPath, ['scripts/approve-batch.mjs', 'verify', item.batch], { stdio: 'pipe' });
  } catch (e) {
    console.error(`\n  ${item.batch} no longer verifies. Nothing from it will be signed.`);
    console.error(String(e.stdout ?? e.message).split('\n').filter((l) => l.includes('FAIL')).join('\n'));
    process.exit(1);
  }
  const gen = (await import(path.resolve(item.pending.generator.script))).default;
  const { claims } = await gen.run();
  console.log(`  ${item.batch} — verified, ${claims.length} claims`);
  contents.push(...claims);
}

if (!contents.length) {
  console.log('  Nothing approved. No bundle written.\n');
  process.exit(1);
}

const events = [];
for (const content of contents) {
  const reject = peer.rejectionReason(content);
  if (reject) {
    console.error(`\n  Refusing to sign a non-conformant claim: ${reject}`);
    console.error(`  ${content?.claim?.subjectRef} / ${content?.claim?.attribute}\n`);
    process.exit(1);
  }
  const signed = peer.signClaim(content, claimKeys.secretKey);
  const event = finalizeEvent(
    { ...peer.eventFor(signed), created_at: Math.floor(Date.parse(content.publishedAt) / 1000) },
    nostrSecret,
  );
  // Never emit an event this machine cannot itself verify. A malformed event in
  // a bundle a peer replays forever is a defect with a very long tail.
  if (!verifyEvent(JSON.parse(JSON.stringify(event)))) {
    console.error('\n  Produced an event that does not verify. Refusing to write the bundle.\n');
    process.exit(1);
  }
  events.push(event);
}

fs.mkdirSync(OUT, { recursive: true });
const bundle = {
  format: 'starcom-signed-claim-bundle',
  version: 1,
  author: nostrPub,
  claimPubkey: Buffer.from(claimKeys.publicKey).toString('hex'),
  eventCount: events.length,
  // Deliberately no "generatedAt". It would change every build, giving the
  // bundle a new hash and therefore a new IPFS CID for identical content.
  note:
    'Signed Nostr events. Anyone may rebroadcast these to any relay; no key is '
    + 'required to do so and none is included here. Each event verifies from its '
    + 'own bytes: tampering and reattribution both fail. Rebroadcasting cannot '
    + 'forge, alter, or withdraw a claim — retraction requires the signing key, '
    + 'which only the Starcom operator holds. Do not modify created_at: weight '
    + 'decays from method.observedTo, and moving it would misrepresent age.',
  specification: 'https://starcom.app/spec/nip-draft-attested-claims.md',
  events,
};
const file = path.join(OUT, 'bundle.json');
fs.writeFileSync(file, JSON.stringify(bundle, null, 2) + '\n');

console.log(`\n  ${events.length} signed event(s) → ${file}`);
console.log(`  Rebroadcastable by anyone. Contains no secret.\n`);
