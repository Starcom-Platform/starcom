#!/usr/bin/env node
/**
 * Operator CLI for publishing and WITHDRAWING attested claims.
 *
 * Retraction exists here before publishing does, deliberately. The data model
 * permits claims about real subjects, published to relays nobody here runs, by
 * an instance that can be wrong. Without a withdrawal path the first mistaken
 * claim is permanent and unanswerable, so a publish button without a retract
 * button is an irreversible action dressed as a reversible one.
 *
 * Built on scripts/peer/peer.mjs — the independent implementation written from
 * the specification alone, importing no application code. If this CLI and the
 * app ever disagree about what a conformant claim looks like, the CLI is
 * following the published document, which is the one strangers read.
 *
 * TWO SIGNATURES, TWO KEYS. The inner claim signature is ML-DSA-65 and its
 * pubkey travels inside the claim, so the claim is self-verifying. The outer
 * relay event is secp256k1, because that is what relays accept, and it is the
 * identity peers subscribe to. Both are stable and both live in
 * .starcom-identity.json, which is gitignored and owner-read-only.
 *
 * NOTHING IS SENT WITHOUT --confirm. A broadcast to public relays cannot be
 * recalled; replacement propagates, but a consumer that already cached the
 * original learns nothing until it re-queries. That limit is the transport's,
 * not something a flag can fix — which is why the flag exists.
 *
 *   node scripts/claim.mjs publish <candidate.json> [--confirm]
 *   node scripts/claim.mjs retract <subjectRef> <attribute> <reason> [--note "..."] [--confirm]
 *   node scripts/claim.mjs read <subjectRef> <attribute>
 *   node scripts/claim.mjs peers [--seconds 20]     watch every author's claims
 *   node scripts/claim.mjs publish-set [--confirm]  republish every reviewed claim
 *
 * Reasons: superseded · error · source-withdrawn · subject-request · policy · decayed
 * Relays:  --relay wss://…  (repeatable; defaults to the published relay set)
 */
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Node gained a global WebSocket in 22; this repo's .nvmrc predates that and
// nostr-tools reaches for the global. Without this every relay fails with
// "WebSocket is not defined" — which reads like a network problem and is not.
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}

import { finalizeEvent, getPublicKey, SimplePool } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import * as peer from './peer/peer.mjs';
import { FEDERATION_READ_RELAYS } from './lib/relayRegistry.mjs';

const IDENTITY = '.starcom-identity.json';
/**
 * Where the operator publishes.
 *
 * The Record first: a peer-operated, kind-scoped, allowlist-write archive whose
 * whole purpose is that claims are public and permanent. Public relays after
 * it, and that is not redundancy theatre — standard 10 requires a node degrade
 * to fully-functional-alone within one release cycle of losing any single peer,
 * and a Starcom that published only to The Record would fail that the moment
 * someone else's tunnel did.
 *
 * NOTE this list is the OPERATOR's, not the app's. Only the operator identity
 * is allowlisted on The Record; a browser signing with a visitor's own key is
 * not, and would be rejected. The in-app broadcaster keeps the public set.
 */
const DEFAULT_RELAYS = FEDERATION_READ_RELAYS;
const REASONS = ['superseded', 'error', 'source-withdrawn', 'subject-request', 'policy', 'decayed'];

const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
const flagValues = (name) => argv.reduce((acc, a, i) => (a === name && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const flag = (name) => flagValues(name)[0];
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--relay' && argv[i - 1] !== '--note');
const RELAYS = flagValues('--relay').length ? flagValues('--relay') : DEFAULT_RELAYS;

const die = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };

/**
 * The signing identity, from CI secrets if present, otherwise the local file.
 *
 * Environment first so a scheduled workflow can publish without a human at a
 * keyboard — the cold-start requirement — while a developer keeps using the
 * gitignored file with no configuration.
 *
 * These are deliberately NOT VITE_-prefixed. That namespace is compiled into
 * the browser bundle; it is how this project served a live bot token from
 * production. A signing key there would publish Starcom's identity to every
 * visitor.
 */
function identity() {
  const envNostr = process.env.STARCOM_NOSTR_SECRET_HEX;
  const envClaim = process.env.STARCOM_CLAIM_KEY_SEED_HEX;
  if (envNostr && envClaim) {
    if (!/^[0-9a-f]{64}$/i.test(envNostr) || !/^[0-9a-f]{64}$/i.test(envClaim)) {
      die('STARCOM_NOSTR_SECRET_HEX and STARCOM_CLAIM_KEY_SEED_HEX must each be 64 hex characters.');
    }
    const sk = hexToBytes(envNostr.toLowerCase());
    return {
      nostrSk: sk,
      nostrPub: getPublicKey(sk),
      claimSk: ml_dsa65.keygen(hexToBytes(envClaim.toLowerCase())).secretKey,
      source: 'environment',
    };
  }
  if (envNostr || envClaim) {
    die('Half an identity in the environment. Set BOTH STARCOM_NOSTR_SECRET_HEX and STARCOM_CLAIM_KEY_SEED_HEX, or neither.');
  }
  if (!fs.existsSync(IDENTITY)) die(`No ${IDENTITY} and no identity in the environment. Run: node scripts/generate-node-identity.mjs`);
  const id = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'));
  if (!id.secretKeyHex) die('Identity has no nostr secret key.');
  if (!id.claimKeySeedHex) die('Identity has no claim-signing key. Run: node scripts/generate-node-identity.mjs --add-claim-key');
  return {
    nostrSk: hexToBytes(id.secretKeyHex),
    nostrPub: id.pubkeyHex,
    claimSk: ml_dsa65.keygen(hexToBytes(id.claimKeySeedHex)).secretKey,
    source: IDENTITY,
  };
}

/** Sign the content, wrap it in a relay event, and report exactly what would go out. */
function prepare(content, id) {
  const signed = peer.signClaim(content, id.claimSk);
  const reject = peer.rejectionReason(content);
  const unsigned = { ...peer.eventFor(signed), created_at: Math.floor(Date.now() / 1000) };
  const event = finalizeEvent(unsigned, id.nostrSk);
  return { signed, event, reject };
}

/**
 * Signs the NIP-42 challenge a relay issues.
 *
 * Without this, nostr-tools returns the SAME rejection for an allowlisted
 * pubkey that never authenticated as for a pubkey that is not allowlisted at
 * all — reported by Earth Alliance News, who hit it first. Two very different
 * causes, one indistinguishable message: you would conclude you had been
 * refused entry when in fact you never knocked.
 *
 * The relay builds the kind-22242 template with its own challenge and service
 * URL; all this does is sign it with the same identity that signs claims.
 */
const authWith = (secretKey) => ({
  onauth: async (authTemplate) => finalizeEvent(authTemplate, secretKey),
});

async function send(event, secretKey) {
  const pool = new SimplePool();
  const results = await Promise.allSettled(pool.publish(RELAYS, event, authWith(secretKey)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  results.forEach((r, i) => {
    console.log(`    ${r.status === 'fulfilled' ? 'ok  ' : 'FAIL'}  ${RELAYS[i]}${r.status === 'rejected' ? ` — ${String(r.reason).slice(0, 60)}` : ''}`);
  });
  // A publish nobody can read back is a claim about having published.
  let readBack = null;
  try {
    readBack = await pool.get(RELAYS, { kinds: [peer.KIND_ATTESTED_CLAIM], authors: [event.pubkey], '#d': [event.tags.find((t) => t[0] === 'd')[1]] });
  } catch { /* reported below as not-confirmed */ }
  pool.close(RELAYS);
  return { ok, total: RELAYS.length, readBack };
}

const [cmd, ...rest] = positional;

if (cmd === 'publish-set') {
  /**
   * Publish every reviewed claim in claims/ and confirm each reads back.
   *
   * This is what makes Starcom's identity autonomous. Publishing was gated on a
   * human running a command, which contradicted the requirement that the system
   * keep running on its own — an error Starcom conceded to the network in
   * writing before fixing it.
   *
   * WHAT IT DOES NOT DO: invent claims. It republishes statements a person
   * already approved by committing them to claims/. A machine keeping approved
   * assertions reachable is a different act from a machine deciding what is
   * true, and only the first belongs on a timer.
   *
   * Why republishing matters even when nothing changed: relays churn, drop old
   * events, and — the case that prompted this — a relay ADDED to the set never
   * receives anything published before it joined. The Record holds none of
   * Starcom's history for exactly that reason.
   *
   * Weight is unaffected. Recency decays from method.observedTo, not from when
   * the event was last sent, so republishing keeps a claim RETRIEVABLE without
   * making it look fresher than it is. A republish that reset the clock would
   * be a lie told by a cron job.
   */
  const dir = 'claims';
  if (!fs.existsSync(dir)) die(`No ${dir}/ directory.`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) {
    console.log(`\n  ${dir}/ holds no reviewed claims. Nothing to publish.\n`);
    process.exit(0);
  }
  const id = identity();
  console.log(`\n  ${files.length} reviewed claim(s), ${RELAYS.length} relays, identity from ${id.source}\n`);

  let failed = 0;
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    const content = raw.content ?? raw;
    const { signed, event, reject } = prepare(content, id);
    if (reject) { console.log(`  REFUSED  ${f} — ${reject}`); failed++; continue; }
    if (!peer.verifyClaim(signed)) { console.log(`  REFUSED  ${f} — signature does not verify`); failed++; continue; }
    if (!CONFIRM) { console.log(`  would publish  ${f} -> ${event.tags.find((t) => t[0] === 'd')[1]}`); continue; }
    const r = await send(event, id.nostrSk);
    const okRead = Boolean(r.readBack);
    if (!r.ok || !okRead) failed++;
    console.log(`  ${r.ok && okRead ? 'ok      ' : 'FAILED  '} ${f} — ${r.ok}/${r.total} relays, read-back ${okRead ? 'confirmed' : 'FAILED'}`);
  }

  if (!CONFIRM) { console.log('\n  DRY RUN. Nothing sent. Re-run with --confirm.\n'); process.exit(0); }
  console.log(`\n  ${files.length - failed}/${files.length} published and confirmed.\n`);
  process.exit(failed ? 1 : 0);
}

if (cmd === 'peers') {
  /**
   * Watch kind 30082 from EVERY author on the public relays.
   *
   * Starcom's ingest filters by kind and NOT by author — claims are weighed on
   * disclosed method, never on who signed them — so this is what the app itself
   * sees. It exists because the consumer half had never been exercised against
   * infrastructure nobody here runs. Publishing was proven end to end; reading
   * was proven only against a relay this project wrote.
   *
   * Read-only. It subscribes, reports, and sends nothing.
   */
  const seconds = Number(flag('--seconds') ?? 20);
  const pool = new SimplePool();
  const seen = new Map();
  console.log(`\n  Watching kind ${peer.KIND_ATTESTED_CLAIM} on ${RELAYS.length} relays for ${seconds}s…\n`);

  const sub = pool.subscribeMany(RELAYS, [{ kinds: [peer.KIND_ATTESTED_CLAIM] }], {
    onevent: (ev) => {
      if (seen.has(ev.id)) return;
      let verdict = 'unparseable';
      let slot = (ev.tags.find((t) => t[0] === 'd') ?? [])[1] ?? '(no d tag)';
      try {
        const payload = JSON.parse(ev.content);
        const content = payload.content ?? payload;
        if (peer.isRetraction(content)) verdict = 'retraction';
        else {
          const why = peer.rejectionReason(content);
          verdict = why ? `REJECTED: ${why}` : `accepted, weight ${peer.deriveWeight(content).weight.toFixed(3)}`;
        }
        if (payload.signature && !peer.verifyClaim(payload)) verdict += ' · SIGNATURE INVALID';
      } catch { /* verdict stays unparseable */ }
      seen.set(ev.id, { author: ev.pubkey, slot, verdict });
      console.log(`  ${ev.pubkey.slice(0, 12)}…  ${slot.slice(0, 44).padEnd(44)}  ${verdict}`);
    },
    oneose: () => {},
  });

  await new Promise((r) => setTimeout(r, seconds * 1000));
  sub.close();
  pool.close(RELAYS);

  const authors = new Set([...seen.values()].map((v) => v.author));
  console.log(`\n  ${seen.size} claim(s) from ${authors.size} author(s).`);
  if (!seen.size) {
    console.log('  Nothing is publishing this kind yet — expected until peers ship.');
    console.log('  A clean run proves the subscription works, not that the network is empty.\n');
  } else {
    console.log('  Authors:');
    for (const a of authors) console.log(`    ${a}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'read') {
  const [subjectRef, attribute] = rest;
  if (!subjectRef || !attribute) die('usage: claim.mjs read <subjectRef> <attribute>');
  const id = identity();
  const pool = new SimplePool();
  const ev = await pool.get(RELAYS, {
    kinds: [peer.KIND_ATTESTED_CLAIM], authors: [id.nostrPub],
    '#d': [peer.identifierFor(subjectRef, attribute)],
  });
  pool.close(RELAYS);
  if (!ev) { console.log('\n  Nothing published at that slot.\n'); process.exit(0); }
  const payload = JSON.parse(ev.content);
  const retracted = peer.isRetraction(payload.content ?? payload);
  console.log(`\n  slot      ${peer.identifierFor(subjectRef, attribute)}`);
  console.log(`  published ${new Date(ev.created_at * 1000).toISOString()}`);
  console.log(`  state     ${retracted ? 'RETRACTED' : 'live claim'}`);
  console.log(`  signature ${peer.verifyClaim(payload) ? 'verifies' : 'DOES NOT VERIFY'}\n`);
  process.exit(0);
}

if (cmd === 'retract') {
  const [subjectRef, attribute, reason] = rest;
  if (!subjectRef || !attribute || !reason) die('usage: claim.mjs retract <subjectRef> <attribute> <reason> [--note "..."]');
  if (!REASONS.includes(reason)) die(`Unknown reason "${reason}". One of: ${REASONS.join(', ')}`);
  const id = identity();
  const note = flag('--note');

  const content = {
    schemaVersion: peer.SCHEMA_VERSION,
    retracted: true,
    retracts: { subjectRef, attribute },
    retractedAt: new Date().toISOString(),
    reason,
    ...(note ? { note } : {}),
  };
  const problem = peer.retractionRejectionReason(content);
  if (problem) die(`The independent implementation would reject this retraction: ${problem}`);

  const signed = peer.signClaim(content, id.claimSk);
  const unsigned = {
    kind: peer.KIND_ATTESTED_CLAIM,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', peer.retractionSlot(content)], ['t', 'attested-claim'], ['schema_version', String(peer.SCHEMA_VERSION)]],
    content: JSON.stringify(signed),
  };
  const event = finalizeEvent(unsigned, id.nostrSk);

  console.log(`\n  RETRACTION`);
  console.log(`    slot    ${peer.retractionSlot(content)}`);
  console.log(`    reason  ${reason}${note ? `\n    note    ${note}` : ''}`);
  console.log(`    author  ${event.pubkey.slice(0, 16)}…`);
  console.log(`    relays  ${RELAYS.length}`);
  if (!CONFIRM) {
    console.log(`\n  DRY RUN. Nothing sent. Re-run with --confirm to withdraw the claim.\n`);
    process.exit(0);
  }
  const r = await send(event, id.nostrSk);
  console.log(`\n  ${r.ok}/${r.total} relays accepted. Read-back: ${r.readBack ? 'the slot now serves the retraction' : 'NOT CONFIRMED'}\n`);
  process.exit(r.ok ? 0 : 1);
}

if (cmd === 'publish') {
  const file = rest[0];
  if (!file || !fs.existsSync(file)) die('usage: claim.mjs publish <candidate.json>');
  const id = identity();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const content = raw.content ?? raw;

  const { signed, event, reject } = prepare(content, id);
  if (reject) die(`The independent implementation would reject this claim: ${reject}`);
  if (!peer.verifyClaim(signed)) die('Signed claim does not verify against its own signature.');

  const w = peer.deriveWeight(content);
  console.log(`\n  CLAIM`);
  console.log(`    subject   ${content.claim.subjectRef}  (${content.claim.subjectKind})`);
  console.log(`    attribute ${content.claim.attribute} = ${JSON.stringify(content.claim.value)}`);
  console.log(`    modality  ${content.method.modality}`);
  console.log(`    weakBacking ${content.method.weakBacking.length ? content.method.weakBacking.join('; ') : '(none stated)'}`);
  console.log(`    weight    ${w.weight.toFixed(4)}  (derived, not asserted)`);
  console.log(`    slot      ${event.tags.find((t) => t[0] === 'd')[1]}`);
  console.log(`    author    ${event.pubkey.slice(0, 16)}…`);
  console.log(`    relays    ${RELAYS.length}`);
  if (!CONFIRM) {
    console.log(`\n  DRY RUN. Nothing sent. Re-run with --confirm to publish.`);
    console.log(`  To withdraw afterwards:`);
    console.log(`    node scripts/claim.mjs retract ${JSON.stringify(content.claim.subjectRef)} ${content.claim.attribute} error --confirm\n`);
    process.exit(0);
  }
  const r = await send(event, id.nostrSk);
  console.log(`\n  ${r.ok}/${r.total} relays accepted. Read-back: ${r.readBack ? 'confirmed' : 'NOT CONFIRMED'}\n`);
  process.exit(r.ok ? 0 : 1);
}

die('usage: claim.mjs <publish|retract|read> …   (see the header of this file)');
