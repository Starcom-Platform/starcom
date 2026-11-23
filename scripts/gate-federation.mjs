#!/usr/bin/env node
/**
 * @asserts Two independently operated instances corroborate a claim neither could alone, over real NIP-01 against a real relay.
 *
 * PHASE 3 GATE — two independently operated instances corroborate a claim
 * neither could alone.
 *
 * Run in plain Node against a real relay speaking real NIP-01, deliberately
 * NOT under vitest: the test runner loads two copies of @noble/hashes, and the
 * Uint8Array from one is not recognised by the other. A gate proving
 * cross-instance federation should not depend on a test runner's module
 * resolution anyway.
 *
 * A LOCAL relay rather than a public one, also deliberately. Publishing
 * fixture findings to damus or nos.lol would be littering someone else's
 * infrastructure, which is a poor way for a project about contributing to a
 * commons to test itself.
 *
 * Usage:
 *   node scripts/dev-relay.mjs 7447 &
 *   npx tsx scripts/gate-federation.mjs
 */
import { webcrypto } from 'node:crypto';
// Node 18 exposes no global crypto; the PQC library needs getRandomValues.
// Browsers provide it, so this is environment scaffolding, not app behaviour.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// nostr-tools' bundled entry and its /pool submodule are separate module
// instances, each holding its own socket reference — injecting into one left
// the other saying "WebSocket is not defined". Setting the global covers both,
// and matches what a browser provides.
const { default: WS } = await import('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = WS;

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { generateSecretKey } from 'nostr-tools';

import { FindingsBroadcastService } from '../src/services/intel/findings/FindingsBroadcastService.ts';
import { FederationIngestService } from '../src/services/intel/federation/FederationIngestService.ts';
import { ForeignFindingStore } from '../src/services/intel/federation/ForeignFindingStore.ts';
import { assessForeignFinding } from '../src/services/intel/federation/foreignFinding.ts';
import { signFinding } from '../src/services/intel/findings/signFinding.ts';
import { buildFindingAttestation, identifierFor } from '../src/services/intel/findings/FindingContent.ts';
import { buildRetraction } from '../src/services/intel/findings/retraction.ts';

const RELAY = ['ws://localhost:7447'];
const SUBJECT = 'Meridian Holdings';
const SLOT = identifierFor(SUBJECT, 'location');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Alice and Bob are separate instances holding DIFFERENT evidence.
const alice = ml_dsa65.keygen();

const findingFrom = (fingerprints) => ({
  entityRef: SUBJECT, attribute: 'location', value: { lat: 51.5, lon: -0.12 },
  confidence: 0.8, sourceCount: 2,
  observedFrom: '2026-08-20T22:00:00.000Z', observedTo: '2026-08-20T23:00:00.000Z',
  subjectKind: 'organization', timePrecisionMs: 86_400_000,
  contributingFingerprints: fingerprints, algorithmVersion: 1,
});

async function publish(keys, content) {
  const signed = signFinding(content, keys.secretKey);
  const svc = new FindingsBroadcastService(RELAY);
  const result = await svc.publishFinding(signed, generateSecretKey());
  svc.dispose();
  return result;
}

console.log('\nPhase 3 gate — two instances over a real relay\n');

// Bob starts listening first.
const bobsStore = new ForeignFindingStore();
const bobsIngest = new FederationIngestService(bobsStore, RELAY);
bobsIngest.start();
await sleep(800);

// Alice publishes, from her own two sources.
const aliceEvidence = ['alice-src-1', 'alice-src-2'];
const published = await publish(alice, buildFindingAttestation(findingFrom(aliceEvidence), { modality: 'inference', weakBacking: [],
  subjectKind: 'organization', timePrecisionMs: 86_400_000, inputFingerprints: aliceEvidence,
}));
check('Alice publishes to the relay', published.success, published.error ?? `${published.relaysOk} relay(s)`);

await sleep(1500);

const received = bobsStore.forSlot(SLOT);
check('Bob receives it over the wire', received.length > 0, `${received.length} finding(s)`);

if (received.length) {
  const f = received[0];
  check('Bob verified the signature himself', f.content.schemaVersion === 2,
    'the dev relay verifies nothing, so this passed Bob\'s own check');
  check('Alice published no confidence', !('confidence' in f.content),
    'weight must be derived, not read');

  // THE GATE: Bob holds DIFFERENT evidence.
  const bobsEvidence = ['bob-src-1', 'bob-src-2'];
  const a = assessForeignFinding(f, bobsEvidence);
  check('Bob derives Alice\'s weight', a.weight > 0, `weight=${a.weight}`);
  check('Bob measures Alice as INDEPENDENT', a.independence === 'independent',
    `overlap=${a.evidenceOverlap}, value=${a.corroborationValue}`);
  check('Independent agreement carries full corroboration value',
    a.corroborationValue === a.weight);

  // Counterfactual: had Bob shared her sources, it would be worth nothing.
  const echo = assessForeignFinding(f, aliceEvidence);
  check('The same finding scores as an ECHO against shared evidence',
    echo.independence === 'echo' && echo.corroborationValue === 0,
    `value=${echo.corroborationValue}`);
}

// Alice withdraws.
await publish(alice, buildRetraction({ subjectRef: SUBJECT, attribute: 'location' }, 'error'));
await sleep(1500);
check('Alice\'s retraction withdraws it from Bob\'s store',
  bobsStore.forSlot(SLOT).length === 0 && bobsStore.wasRetracted(SLOT));

bobsIngest.stop();

console.log(`\n${failures === 0 ? 'GATE PASSED' : `GATE FAILED — ${failures} check(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
