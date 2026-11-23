#!/usr/bin/env node
/**
 * Generates Starcom's node publishing identity.
 *
 * WHY A NODE IDENTITY EXISTS AT ALL
 *
 * Two peers committed to consume Starcom's attested claims and cite them by
 * identifier, and neither could, because Starcom's signing key was generated
 * per browser in localStorage. There was no author called "Starcom" — every
 * install was a separate stranger. A consumer watching a public relay cannot
 * filter for claims from a node that has no stable key.
 *
 * WHAT THIS PRINTS AND WHAT IT DOES NOT
 *
 * Prints ONLY the public half: the hex pubkey and its npub encoding. Those are
 * meant to be published — that is their entire purpose.
 *
 * The secret half is written to a gitignored file with owner-only permissions
 * and is never printed, never logged, and never returned. This repository
 * served a live bot token from production because a credential reached a
 * namespace that publishes; a secret that is never displayed cannot be pasted
 * somewhere it shouldn't be.
 *
 * It refuses to overwrite an existing identity. Regenerating silently would
 * orphan every claim already published under the old key — consumers filtering
 * the old pubkey would simply stop seeing Starcom, with nothing to indicate
 * why.
 *
 * HANDLING, in the order that keeps the risk lowest:
 *
 *   1. Publish the PUBLIC half now, as STARCOM_NOSTR_PUBKEY, so peers can build
 *      against a real identity immediately.
 *   2. Keep the secret offline. Sign the first claims manually.
 *   3. Only place the secret in CI once the publish loop is proven. The
 *      verify-half heartbeat does not need it and must not have it.
 *
 * Never give the secret a VITE_ prefix. That namespace is compiled into the
 * browser bundle.
 *
 * Usage: node scripts/generate-node-identity.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

const OUT = '.starcom-identity.json';
const ADD_CLAIM_KEY = process.argv.includes('--add-claim-key');

/**
 * Adds the INNER claim-signing key to an existing identity.
 *
 * A claim carries two signatures and they use different keys. The outer relay
 * event is secp256k1, because that is what relays accept — that is the identity
 * peers subscribe to. The inner claim signature is algorithm-tagged and here is
 * ML-DSA-65, post-quantum, and its pubkey travels inside the claim so it is
 * self-verifying.
 *
 * Both need to be STABLE. A per-run claim key would make every claim look like
 * it came from a different author at the inner layer, which defeats the point
 * of the layer.
 */
if (ADD_CLAIM_KEY) {
  const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
  if (!fs.existsSync(OUT)) {
    console.error(`  ${OUT} does not exist. Generate the node identity first.`);
    process.exit(1);
  }
  const id = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  if (id.claimPubkeyHex) {
    console.log(`  Claim key already present: ${id.claimPubkeyHex.slice(0, 16)}…  (refusing to replace)`);
    process.exit(0);
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const kp = ml_dsa65.keygen(seed);
  id.claimKeySeedHex = bytesToHex(seed);
  id.claimPubkeyHex = bytesToHex(kp.publicKey);
  id.claimKeyAlg = 'ml-dsa-65';
  fs.writeFileSync(OUT, JSON.stringify(id, null, 2) + '\n', { mode: 0o600 });
  console.log(`
  Inner claim-signing key added (ml-dsa-65).

    claim pubkey  ${id.claimPubkeyHex.slice(0, 32)}…  (${id.claimPubkeyHex.length / 2} bytes)

  The seed is stored in ${OUT} beside the nostr secret. Not printed.
`);
  process.exit(0);
}

if (fs.existsSync(OUT)) {
  console.error(`
  ${OUT} already exists. Refusing to overwrite.

  Regenerating would orphan every claim published under the existing key:
  consumers filtering the old pubkey would stop seeing Starcom with no
  indication why. If you genuinely intend to rotate, move the file aside
  deliberately and publish a claim under the old key announcing the new one.
`);
  process.exit(1);
}

const secret = generateSecretKey();
const pubkeyHex = getPublicKey(secret);

fs.writeFileSync(OUT, JSON.stringify({
  warning: 'SECRET KEY. Never commit, never paste, never give this a VITE_ prefix.',
  purpose: 'Starcom node publishing identity — signs attested claims (kind 30082) and refutations (30083).',
  created: new Date().toISOString(),
  nsec: nip19.nsecEncode(secret),
  secretKeyHex: bytesToHex(secret),
  pubkeyHex,
  npub: nip19.npubEncode(pubkeyHex),
}, null, 2) + '\n', { mode: 0o600 });

console.log(`
  Starcom node identity generated.

  PUBLIC — publish these:

    hex   ${pubkeyHex}
    npub  ${nip19.npubEncode(pubkeyHex)}

  SECRET — written to ${OUT}, owner-read-only, gitignored.
  Not printed here on purpose. Move it somewhere you keep secrets.

  Next:
    1. Set STARCOM_NOSTR_PUBKEY to the hex value above (deploy host + local).
    2. Rebuild — /.well-known/nostr.json and starcom-node.json will carry it,
       so peers can subscribe to the right author.
    3. Keep the secret offline until the publish loop is proven.
`);
