#!/usr/bin/env node
/**
 * Check a published Starcom claim. One command, and none of your keys.
 *
 * It does need this repository and its dependencies — it imports nostr-tools
 * for the relay client and @noble/post-quantum through peer.mjs. An earlier
 * version of this line said "no install", which was not true and was the same
 * overclaim this file exists to make checkable. Clone, npm install, run.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * `/.well-known/security-policy.md` tells a journalist, a relay operator, or
 * someone who believes a claim about them is wrong that they can check what
 * this node published without taking our word. That was true and inert:
 * nothing in the repository accepted a relay coordinate. verify-finding.mjs
 * takes a local file, conformance.mjs takes a vectors directory, and
 * `claim.mjs read` demands the operator's own SECRET KEY merely to build an
 * author filter — so reading someone else's public claim required a private
 * one. Checking cost an afternoon, so nobody checked.
 *
 * ─── HOW IT DISCOVERS US, WHICH IS THE POINT ───────────────────────────────
 *
 * It starts from the published descriptor and follows it: relays to query, and
 * the claim keys to compare against. Nothing here is hardcoded about Starcom
 * beyond one URL, and that URL is the one the specification advertises. Point
 * `--descriptor` at another node and this checks that node instead.
 *
 * ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * It does not tell you a claim is TRUE. It tells you who signed it, whether
 * the signature holds, whether the key is one the node admits to, and what
 * weight the disclosed method derives. A valid signature proves authorship and
 * nothing else — the specification says so, and so does this output.
 *
 * Usage:
 *   node scripts/verify-claim.mjs --subject <ref> --attribute <attr>
 *   node scripts/verify-claim.mjs --event <event-id>
 *   node scripts/verify-claim.mjs --subject X --attribute Y --descriptor <url>
 *
 * Exit: 0 checked and sound · 1 checked and a problem · 2 could not observe
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SimplePool, verifyEvent } = require('nostr-tools');
import * as peer from './peer/peer.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DESCRIPTOR = flag('descriptor', 'https://starcom.app/.well-known/starcom-node.json');
const subject = flag('subject');
const attribute = flag('attribute');
const eventId = flag('event');

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const meh = (m) => console.log(`  \x1b[33m?\x1b[0m ${m}`);
const info = (m) => console.log(`    ${m}`);

const cannotObserve = (m) => {
  console.error(`\n  CANNOT OBSERVE: ${m}`);
  console.error('  This says nothing about the claim.\n');
  process.exit(2);
};

if (!eventId && !(subject && attribute)) {
  console.error('\n  Give either --event <id>, or --subject <ref> --attribute <attr>.\n');
  process.exit(2);
}

console.log('\n  STARCOM CLAIM VERIFIER\n');

// ── 1. The node's own description of itself ────────────────────────────────
let descriptor;
try {
  const res = await fetch(DESCRIPTOR, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) cannotObserve(`${DESCRIPTOR} returned HTTP ${res.status}`);
  descriptor = await res.json();
} catch (error) {
  cannotObserve(`could not read ${DESCRIPTOR} — ${error.message}`);
}

const relays = descriptor?.identity?.relays ?? [];
const declaredClaimKeys = new Set(descriptor?.identity?.claimKeys ?? []);
const nodePubkey = descriptor?.identity?.pubkey ?? null;
if (!relays.length) cannotObserve('the descriptor names no relays to query');

info(`node       ${descriptor.node} · ${nodePubkey?.slice(0, 16)}…`);
info(`relays     ${relays.length} from the descriptor`);
info(`claim keys ${declaredClaimKeys.size} declared${declaredClaimKeys.size ? '' : ' — the inner signature cannot be attributed'}`);
console.log('');

// ── 2. Fetch the event ─────────────────────────────────────────────────────
const pool = new SimplePool();
let event;
try {
  const filter = eventId
    ? { ids: [eventId] }
    : { kinds: [peer.KIND_ATTESTED_CLAIM], '#d': [peer.identifierFor(subject, attribute)] };
  [event] = await pool.querySync(relays, { ...filter, limit: 1 }, { maxWait: 15000 });
} catch (error) {
  pool.close(relays);
  cannotObserve(`relay query failed — ${error.message}`);
}
if (!event) {
  pool.close(relays);
  cannotObserve('no event found at that coordinate. It may never have existed, or may have been replaced and dropped.');
}
pool.close(relays);

let problems = 0;
const fail = (m) => { bad(m); problems++; };

// ── 3. The outer signature: which node relayed this ────────────────────────
const outerOk = verifyEvent(JSON.parse(JSON.stringify(event)));
if (outerOk) ok(`outer Nostr signature verifies — relayed by ${event.pubkey.slice(0, 16)}…`);
else fail('outer Nostr signature does NOT verify');

if (nodePubkey && event.pubkey === nodePubkey) ok('the relaying key is the one this node publishes as its identity');
else meh(`the relaying key is not the descriptor's identity key — this is somebody else's claim in the same format`);

// ── 4. The inner signature: which key attested the content ─────────────────
let payload;
try { payload = JSON.parse(event.content); }
catch { fail('content is not JSON, so nothing inside it can be checked'); }

if (payload) {
  const sig = peer.verifySignature(payload);
  if (sig.state === 'valid') ok(`inner ${sig.alg} signature verifies over the canonical digest`);
  else if (sig.state === 'unverified') meh(`inner signature UNVERIFIED — ${sig.detail}`);
  else fail(`inner signature invalid — ${sig.detail}`);

  const claimKey = payload?.signature?.pubkey;
  if (!declaredClaimKeys.size) {
    meh('cannot attribute the inner signature: the descriptor declares no claim keys');
  } else if (claimKey && declaredClaimKeys.has(claimKey)) {
    ok('the attesting key is one the node declares as its own');
  } else {
    fail('the attesting key is NOT declared by the node — signed by someone else, or by a key it has not admitted to');
  }

  // ── 5. What the claim says, and what it is worth ─────────────────────────
  console.log('');
  if (peer.isRetraction(payload.content)) {
    const slot = peer.retractionSlot(payload.content);
    ok(`this slot holds a RETRACTION, not a claim — withdrawn${payload.content.reason ? ` (${payload.content.reason})` : ''}`);
    info(`slot ${slot}`);
    info('The claim that was here is gone. A reader who cached it earlier will not know that.');
  } else {
    const reason = peer.rejectionReason(payload.content);
    if (reason) fail(`a conforming consumer REFUSES this claim: ${reason}`);
    else {
      const c = payload.content.claim ?? {};
      ok(`claim: ${c.subjectRef} · ${c.attribute} = ${JSON.stringify(c.value)}`);
      const w = peer.deriveWeight(payload.content);
      info(`weight ${w.weight.toFixed(3)}  = corroboration ${w.corroboration.toFixed(3)} × precision ${w.precision.toFixed(3)} × recency ${w.recency.toFixed(3)}`);
      info(`sources ${payload.content.method?.sourceCount} · modality ${payload.content.method?.modality} · ${Math.round(w.ageDays)} days old`);
      for (const w2 of payload.content.method?.weakBacking ?? []) info(`weak backing: ${w2}`);
    }
  }
}

console.log('');
console.log('  A valid signature proves who published this. It does not make the claim true.');
console.log(`\n  ${problems ? `${problems} problem(s).` : 'No problems found.'}\n`);
process.exit(problems ? 1 : 0);
