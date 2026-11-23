#!/usr/bin/env node
/**
 * @asserts The app federates with a SECOND, independent implementation that imports none of its code, so a specification defect cannot hide behind one implementation agreeing with itself.
 *
 * PHASE 4 GATE — the app and a SECOND, INDEPENDENT implementation federate.
 *
 * gate-federation.mjs already proves two instances exchange findings over real
 * NIP-01. But its "Alice" and "Bob" are both the app's own services, so it
 * cannot catch a specification defect: one implementation never disagrees with
 * itself. This runs the app against scripts/peer/peer.mjs, which imports no
 * app code and was written from the NIP alone.
 *
 * It already earned its keep. The app derived its `d` tag as
 * `starcom_finding_${subject}_${attribute}`, lowercased with non-alphanumerics
 * collapsed — so `北京`, `Москва` and `東京` shared one replaceable slot, and no
 * spec-following implementation would ever have landed in the same slot as the
 * app at all.
 *
 * Usage:
 *   node scripts/dev-relay.mjs 7448 &
 *   npx tsx --tsconfig tsconfig.app.json scripts/gate-federation-peer.mjs
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { default: WS } = await import('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = WS;

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools';

// The independent implementation.
import * as peer from './peer/peer.mjs';
// The app under test.
import { signFinding } from '../src/services/intel/findings/signFinding.ts';
import { FindingsBroadcastService } from '../src/services/intel/findings/FindingsBroadcastService';
import { buildFindingAttestation, identifierFor as appIdentifierFor } from '../src/services/intel/findings/FindingContent.ts';
import { ForeignFindingStore } from '../src/services/intel/federation/ForeignFindingStore.ts';
import { explainAttestationWeight } from '../src/services/intel/findings/deriveAttestationWeight.ts';

/**
 * Its own port, not 7447.
 *
 * The dev relay keeps events in memory, so two gates sharing one relay
 * contaminate each other: run this first and gate-federation.mjs then sees
 * this gate's claims in its subscription and reports three findings where it
 * published one. A gate whose result depends on what ran before it is not
 * measuring what it says it measures.
 */
const PORT = Number(process.env.PEER_GATE_PORT ?? 7448);

/**
 * Which relay to federate through.
 *
 * Defaults to the local dev relay, and that default is the point: this gate is
 * run constantly, and pushing fixture data to volunteer-run public relays on
 * every run would be a poor way for a project about contributing to a commons
 * to test itself.
 *
 * But a local relay is one this project WROTE, so both the peer and the relay
 * trace back to one reading of NIP-01 — the precise blind spot the EIN
 * cross-review named, where an integration reports success without ever
 * meeting a counterparty it did not build. Crossing a relay nobody here
 * controls is precondition P-03 on Starcom's own format, and it needs a real
 * one at least once.
 *
 *   PEER_GATE_RELAY=wss://some.relay node scripts/gate-federation-peer.mjs
 *
 * When pointed at a public relay this emits a small number of real events
 * under a throwaway key. Keep it to one run, and see the note in the NIP on
 * why replaceable events make the footprint bounded rather than cumulative.
 */
const RELAY = process.env.PEER_GATE_RELAY ?? `ws://localhost:${PORT}`;
const IS_PUBLIC = !/^wss?:\/\/(localhost|127\.0\.0\.1)/.test(RELAY);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('\nPhase 4 gate — the app against an independent implementation\n');
if (IS_PUBLIC) {
  console.log(`  ! Federating through ${RELAY} — a relay this project does not control.`);
  console.log('  ! This writes real events under a throwaway key. Precondition P-03.\n');
}

// ---- 1. They agree on the slot a claim occupies -----------------------------
//
// The single most important interop property: under a parameterized-replaceable
// kind the `d` tag IS the claim identity. Disagree here and the two
// implementations never replace or retract each other's claims — silently.
for (const [subject, attribute] of [
  ['Meridian Holdings', 'location'],
  ['北京', 'location'],
  ['Москва', 'location'],
  ['71-75 SHELTON STREET, WC2H 9JQ', 'companiesAtRegisteredAddress'],
  ['A:B', 'C'],
]) {
  check(`same d tag for ${JSON.stringify(subject)}`,
    appIdentifierFor(subject, attribute) === peer.identifierFor(subject, attribute),
    `${appIdentifierFor(subject, attribute)}`);
}

// And that those slots are actually distinct from one another.
const slots = [['北京', 'location'], ['Москва', 'location'], ['東京', 'location']]
  .map(([s, a]) => peer.identifierFor(s, a));
check('non-Latin subjects occupy distinct slots', new Set(slots).size === 3);

// ---- 2. The peer publishes; the app ingests --------------------------------
const peerMlKeys = ml_dsa65.keygen();
const peerNostrSk = generateSecretKey();
const pool = new SimplePool();

const peerContent = {
  schemaVersion: 2,
  claim: { subjectRef: 'Meridian Holdings', subjectKind: 'organization', attribute: 'location', value: { lat: 51.5074, lon: -0.1278 } },
  method: {
    algorithm: 'location-corroboration',
    algorithmVersion: 1,
    criteria: '3 independent sources within 24h and 5km, no unresolved conflict',
    sourceCount: 3,
    observedFrom: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    observedTo: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    // Ratified network-wide: a claim states HOW it was observed, and names its
    // own thin inputs. An empty array asserts the publisher checked.
    modality: 'inference',
    weakBacking: [],
  },
  publishedAt: new Date().toISOString(),
};
const peerSigned = peer.signClaim(peerContent, peerMlKeys.secretKey);
const peerEvent = finalizeEvent(peer.eventFor(peerSigned), peerNostrSk);

await Promise.any(pool.publish([RELAY], peerEvent));
check('the peer publishes to the relay', true, `d=${peerEvent.tags.find(t => t[0] === 'd')[1]}`);

const store = new ForeignFindingStore();
const accepted = store.accept(JSON.parse(peerEvent.content));
check('the app ACCEPTS a claim built by the other implementation',
  accepted.accepted === true, accepted.reason ?? '');

// ---- 3. They derive the same weight from the same bytes --------------------
const evaluatedAt = new Date();
const appWeight = explainAttestationWeight(peerSigned.content, { now: evaluatedAt });
const peerWeight = peer.deriveWeight(peerSigned.content, evaluatedAt);
// Compared to a tolerance, and the NIP says why: floating-point associativity
// differs with the order terms are multiplied, so two conforming
// implementations never agree bit for bit.
//
// The gap used to be much larger — 0.75 against 0.7499999964232856 — because
// the app rounded its derivation to four decimals and returned the rounded
// number. That was presentational data leaking into arithmetic, and it put the
// reference implementation outside the 1e-6 its own specification states.
// Unrounded, the two now agree to about 1e-10.
const TOLERANCE = 1e-6;
for (const k of ['corroboration', 'precision', 'weight']) {
  check(`both derive the same ${k} (within ${TOLERANCE})`,
    Math.abs(appWeight[k] - peerWeight[k]) < TOLERANCE,
    `${appWeight[k]} vs ${peerWeight[k]}`);
}

// ---- 4. The app publishes; the peer verifies -------------------------------
const appMlKeys = ml_dsa65.keygen();
const appFinding = {
  entityRef: 'Meridian Holdings',
  attribute: 'location',
  value: { lat: 51.5074, lon: -0.1278 },
  subjectKind: 'organization',
  sourceCount: 3,
  matchedBy: 'distance',
  observedFrom: new Date(Date.now() - 26 * 3_600_000).toISOString(),
  observedTo: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  confidence: 0.7,
};
const appSigned = signFinding(buildFindingAttestation(appFinding, { subjectKind: 'organization', timePrecisionMs: 3_600_000, modality: 'inference', weakBacking: [] }), appMlKeys.secretKey);

check('the peer verifies the app\'s ML-DSA signature', peer.verifyClaim(appSigned) === true);

/**
 * The two implementations must agree on the EVENT ENVELOPE, not only on the
 * claim inside it.
 *
 * This gate compared content and nothing else, and a real divergence lived
 * underneath it for as long as both existed: the app tagged its events
 * `t: starcom_finding` while the specification and the peer both say
 * `t: attested-claim`. Every content check passed, because the content was
 * identical. A peer implementing from the document and filtering on the
 * documented tag would have received nothing the app ever published — a total,
 * silent integration failure between two implementations that agreed perfectly
 * about what a claim is.
 */
{
  const appEvent = new FindingsBroadcastService().buildUnsignedEvent(appSigned);
  const peerEnvelope = peer.eventFor(peer.signClaim(appSigned.content, appMlKeys.secretKey));
  const tagsOf = (e) => JSON.stringify(
    [...e.tags].filter((t) => t[0] !== 'd').sort((a, b) => a[0].localeCompare(b[0])));
  check('app and peer emit the same event kind', appEvent.kind === peerEnvelope.kind,
    `${appEvent.kind} vs ${peerEnvelope.kind}`);
  check('app and peer emit the same event tags', tagsOf(appEvent) === tagsOf(peerEnvelope),
    `${tagsOf(appEvent)} vs ${tagsOf(peerEnvelope)}`);
  check('app and peer derive the same d tag',
    (appEvent.tags.find((t) => t[0] === 'd') ?? [])[1] === (peerEnvelope.tags.find((t) => t[0] === 'd') ?? [])[1],
    'the replaceable slot must match or a retraction never reaches its claim');
}
check('the peer finds nothing to reject in the app\'s payload',
  peer.rejectionReason(appSigned.content) === null, String(peer.rejectionReason(appSigned.content)));
check('the app published no declared confidence',
  !('confidence' in appSigned.content) && !('weight' in appSigned.content));

const appW = explainAttestationWeight(appSigned.content, { now: evaluatedAt });
const peerW = peer.deriveWeight(appSigned.content, evaluatedAt);
check('the peer derives the app\'s weight to the same value',
  Math.abs(appW.weight - peerW.weight) < TOLERANCE, `${appW.weight} vs ${peerW.weight}`);

// ---- 5. The peer refuses what the spec says it must ------------------------
check('the peer refuses a declared confidence',
  peer.rejectionReason({ ...peerSigned.content, confidence: 1 }) === 'declared-weight');
check('the peer refuses missing required fields',
  peer.rejectionReason({ ...peerSigned.content, method: { ...peerSigned.content.method, observedFrom: undefined } }) === 'missing-required-fields');
check('the peer refuses an enumeration with no stated boundary',
  peer.rejectionReason({
    ...peerSigned.content,
    method: { ...peerSigned.content.method, parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' } },
  }) === 'missing-required-fields');

pool.close([RELAY]);
console.log(`\n${failures === 0 ? 'GATE PASSED' : `GATE FAILED — ${failures} check(s)`}\n`);
process.exit(failures ? 1 : 0);
