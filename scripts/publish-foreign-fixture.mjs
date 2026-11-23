#!/usr/bin/env node
/**
 * Publishes one conformant claim under a THROWAWAY foreign identity, to a local
 * relay, so the application's consumer can be tested against an author that is
 * not Starcom.
 *
 * Why this exists: every proof of the consumer path so far has been circular.
 * The federation gate feeds the app a claim built by this project's own peer
 * implementation; the peer vectors check this project's own fixtures. Neither
 * exercises the case that actually matters — a claim signed by a key we have
 * never seen, arriving over a relay, reaching ForeignFindingStore.
 *
 * REFUSES ANY NON-LOCAL RELAY. A fixture is a lie told for a good reason, and
 * lies belong on infrastructure nobody else reads. Publishing invented claims
 * to public relays or to a peer's archive would put fiction into a record whose
 * entire value is that it contains none.
 *
 * Usage: node scripts/publish-foreign-fixture.mjs ws://localhost:PORT
 * Exit:  0 published · 1 refused or failed
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}
import { finalizeEvent, generateSecretKey, SimplePool } from 'nostr-tools';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import * as peer from './peer/peer.mjs';

const RELAY = process.argv[2];
if (!RELAY) {
  console.error('\n  usage: publish-foreign-fixture.mjs ws://localhost:PORT\n');
  process.exit(1);
}
if (!/^wss?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(RELAY)) {
  console.error(`
  Refusing to publish a fixture to ${RELAY}.

  This tool signs an invented claim. It is only ever pointed at a local relay,
  because a record whose value is that it contains no fiction is exactly the
  place fiction must not go.
`);
  process.exit(1);
}

const foreignNostr = generateSecretKey();
const seed = new Uint8Array(32);
globalThis.crypto.getRandomValues(seed);
const foreignClaim = ml_dsa65.keygen(seed).secretKey;

const content = {
  schemaVersion: 2,
  claim: {
    subjectRef: 'Foreign Peer Test Ltd',
    subjectKind: 'organization',
    attribute: 'location',
    value: { lat: 51.5, lon: -0.12 },
  },
  method: {
    algorithm: 'location-corroboration',
    algorithmVersion: 1,
    criteria: '3 independent sources placed this subject within 24h and 5km',
    sourceCount: 3,
    observedFrom: new Date(Date.now() - 26 * 3600e3).toISOString(),
    observedTo: new Date(Date.now() - 2 * 3600e3).toISOString(),
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    modality: 'inference',
    weakBacking: [],
  },
  publishedAt: new Date().toISOString(),
};

// A fixture that the spec would refuse proves nothing about a consumer that
// accepts it, so check before signing rather than after.
const reject = peer.rejectionReason(content);
if (reject) {
  console.error(`\n  This fixture is not conformant: ${reject}\n`);
  process.exit(1);
}

const signed = peer.signClaim(content, foreignClaim);
const event = finalizeEvent(
  { ...peer.eventFor(signed), created_at: Math.floor(Date.now() / 1000) },
  foreignNostr,
);

const pool = new SimplePool();
const [res] = await Promise.allSettled(pool.publish([RELAY], event));
pool.close([RELAY]);

console.log(`
  foreign author  ${event.pubkey}
  slot            ${event.tags.find((t) => t[0] === 'd')[1]}
  relay           ${RELAY} — ${res.status}
`);
process.exit(res.status === 'fulfilled' ? 0 : 1);
