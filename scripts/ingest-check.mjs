#!/usr/bin/env node
/**
 * Reads attested claims from a relay and runs them through the APPLICATION's
 * consumer, reporting what it makes of each.
 *
 * The counterpart to claim.mjs. Publishing has been proven end to end; consuming
 * has only ever been proven against a relay this project wrote, using this
 * project's own peer implementation. Neither of those is the production path.
 *
 * What is exercised here is ForeignFindingStore — the class the running app
 * actually feeds from FederationIngestService. If it and peer.mjs ever disagree
 * about a real claim, that disagreement is the finding, and it would otherwise
 * surface as claims silently not appearing in the app.
 *
 * Two things are NOT disagreements, and saying so is the difference between a
 * useful check and a crying-wolf one. A claim signed by one of this node's own
 * keys, arriving back off a relay we broadcast to, must be refused by the store
 * and can only ever be accepted by peer.mjs, which does not know whose node it
 * is. And an event of this kind whose content is not a claim at all was never
 * adjudicated by either. Both are reported, neither is scored.
 *
 * Read-only. Nothing is published, nothing is signed.
 *
 * Usage: npm run ingest-check -- [--relay wss://…] [--seconds 20]
 *
 * THE TSCONFIG FLAG IS NOT OPTIONAL, which is why this has an npm script. It
 * imports application TypeScript, and ForeignFindingStore imports '@utils/logger'
 * — a path alias declared in tsconfig.app.json and in the Vite config, but not
 * in the root tsconfig. Run without it and the script dies on module resolution
 * before it opens a single connection.
 *
 * It did exactly that from the day it was written. This is the script whose
 * whole purpose is to prove the application's consumer agrees with the
 * independent implementation on real relay traffic, and it had never once
 * executed — the same report-success-without-running failure it was built to
 * catch, in the tool built to catch it.
 * Exit:  0 no foreign claim was adjudicated differently by the two
 *        implementations · 1 at least one was
 */
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}
import { SimplePool } from 'nostr-tools';
import * as peer from './peer/peer.mjs';
import { THE_RECORD_RELAY } from './lib/relayRegistry.mjs';
import { ForeignFindingStore } from '../src/services/intel/federation/ForeignFindingStore.ts';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
const RELAYS = argv.filter((a, i) => argv[i - 1] === '--relay');
const relays = RELAYS.length ? RELAYS : [THE_RECORD_RELAY];
const seconds = Number(flag('--seconds') ?? 20);

const pool = new SimplePool();
const store = new ForeignFindingStore();

console.log(`\n  Reading kind ${peer.KIND_ATTESTED_CLAIM} from ${relays.length} relay(s) for ${seconds}s\n`);

const events = [];
const sub = pool.subscribeMany(relays, [{ kinds: [peer.KIND_ATTESTED_CLAIM] }], {
  onevent: (e) => events.push(e),
  oneose: () => {},
});
await new Promise((r) => setTimeout(r, seconds * 1000));
sub.close();
pool.close(relays);

if (!events.length) {
  console.log('  No attested claims on this relay.\n');
  console.log('  That is a fact about the network, not a failure of this check: the');
  console.log('  consumer path stays unproven against real peer data until somebody');
  console.log('  publishes. Re-run when they do.\n');
  process.exit(0);
}

let agreed = 0;
let disagreed = 0;
let ours = 0;
let notClaims = 0;
for (const ev of events) {
  const author = ev.pubkey.slice(0, 12) + '…';
  const slot = (ev.tags.find((t) => t[0] === 'd') ?? [])[1] ?? '(no d tag)';

  let payload;
  try { payload = JSON.parse(ev.content); }
  catch {
    // Not a disagreement: nothing was compared. Another publisher is using this
    // kind for something that is not an attested claim at all — the one seen in
    // the wild carries a bare sha256 digest as its whole content. That is a fact
    // about the kind being shared, which guard-kind-collision exists to police;
    // counting it as a consumer defect would bury a real observation under a
    // false one.
    notClaims++;
    console.log(`  NOT-A-CLAIM   ${author}  ${slot.slice(0, 56)}`);
    console.log('        Content is not a JSON payload. Kind collision, not a consumer fault.');
    continue;
  }

  const content = payload.content ?? payload;

  // The independent implementation, written from the spec.
  const peerVerdict = peer.isRetraction(content) ? 'retraction' : (peer.rejectionReason(content) ?? 'accept');
  const sigOk = payload.signature ? peer.verifyClaim(payload) : null;

  // The application's own consumer — the one that decides what the app sees.
  const appResult = store.accept(payload);
  const appVerdict = appResult.accepted ? 'accept' : (appResult.reason ?? 'reject');

  /*
   * Two verdicts are not comparable, for the same underlying reason: peer.mjs
   * is asked a question the store is not, or the other way round.
   *
   * A retraction is a payload a conforming consumer ACTS ON; the store's job is
   * claims, so the two answering differently there is expected.
   *
   * `own-publication` is the store recognising OUR OWN key coming back off a
   * relay we broadcast to, which it must refuse or this instance corroborates
   * itself. peer.mjs is a spec implementation with no notion of whose node is
   * running it, so it can only ever say accept. Scoring that as a disagreement
   * made the check exit 1 on a correct result, and — worse — it read as "the
   * consumer is broken" when what it actually showed was that the only claims
   * on the relay were ours.
   */
  const notComparable = peerVerdict === 'retraction' || appVerdict === 'own-publication';
  const agree = notComparable || peerVerdict === appVerdict;
  if (appVerdict === 'own-publication') ours++;
  else if (agree) agreed++;
  else disagreed++;

  const weight = peerVerdict === 'accept' ? peer.deriveWeight(content).weight.toFixed(3) : '—';
  const mark = appVerdict === 'own-publication' ? 'ours' : (agree ? 'ok  ' : 'DIFF');
  console.log(`  ${mark}  ${author}  ${slot.slice(0, 56).padEnd(56)}`);
  console.log(`        peer: ${peerVerdict.padEnd(24)} app: ${appVerdict.padEnd(24)} weight ${weight}`);
  if (sigOk === false) console.log('        SIGNATURE DOES NOT VERIFY — the bytes are not from the key they name');
  if (appVerdict === 'own-publication') console.log('        Published by this node. Correctly refused as foreign corroboration.');
  if (!agree) console.log('        The two implementations disagree. That disagreement IS the finding.');
}

const foreign = agreed + disagreed;
console.log(`\n  ${events.length} event(s): ${foreign} foreign claim(s) — ${agreed} where both implementations agree, ${disagreed} where they do not.`);
if (ours) console.log(`  ${ours} published by this node, not counted as corroboration.`);
if (notClaims) console.log(`  ${notClaims} not attested claims at all.`);
console.log(`  Held by the application's store: ${store.all().length}`);
if (foreign === 0) {
  console.log('\n  No FOREIGN claim reached the consumer, so the path this script exists to');
  console.log('  prove is still unproven. That is a fact about the network, not a pass.');
}
console.log('');
process.exit(disagreed ? 1 : 0);
