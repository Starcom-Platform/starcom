#!/usr/bin/env node
/**
 * What this project has left on other people's relays, and which of it is litter.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * publishTargets.ts says it plainly: "littering someone else's infrastructure
 * with fixture data would be a poor way for a project about contributing to a
 * commons to test itself". That module exists because a real test package went
 * to five public relays and could not be recalled. The override it added stops
 * NEW litter. It does nothing about what is already out there.
 *
 * A 2026-09-23 read of the live pipeline found that most of what this node has
 * published to the public surface is verification material: scratch events with
 * placeholder IPFS CIDs, and two Mission Packages that are both ours and both
 * test artifacts with no objectives. A peer reading our published volume as a
 * signal of activity would be reading fixtures.
 *
 * ─── WHAT IT DOES AND DOES NOT DO ──────────────────────────────────────────
 *
 * Read-only, on purpose. It enumerates and classifies; it signs nothing and
 * publishes nothing. Retraction needs the node's secret key, which is a
 * separate decision and a separate script — you cannot unpublish by accident
 * from here.
 *
 * It does NOT take the pubkey from .starcom-identity.json. Everything this node
 * has published is already public and carries its author in the clear, so the
 * key is read off the relays by a tag only our own runs write, and the secret
 * file is never opened. That is also why this runs for anyone, not only on the
 * machine holding the key.
 *
 * ─── IDENTIFYING "OURS" IS THE WHOLE PROBLEM ───────────────────────────────
 *
 * The first version of this script filtered on the interchange vocabulary
 * (`starcom_intel`, `starcom_mission_package`) and on `kinds:[30079]` with no
 * tag. Both are wrong, for the same reason in two directions: that vocabulary
 * is SHARED — the peer publishes it too, by design, because it is a spec — and
 * kind 30079 sits in a global namespace this project does not own. The run
 * returned 405 events from 262 authors, which is not an audit of our litter but
 * a census of five relays. Retracting from that list would have meant issuing
 * deletions against strangers' events.
 *
 * So ownership is established once, positively, from a tag nothing in the spec
 * asks anyone else to write, and every later query is filtered by the author it
 * finds. Events under the shared vocabulary from OTHER authors are reported
 * separately and never classified as ours.
 *
 * ─── HOW LITTER IS TOLD FROM INTEL ─────────────────────────────────────────
 *
 * Never by guessing. An event is litter only on a POSITIVE mark — a scratch
 * tag, a placeholder digest, a fixture's own words. Anything else is listed as
 * "keep", including things that look unpromising, because the cost of wrongly
 * retracting a real report is much higher than the cost of leaving a fixture up
 * one more day. The report prints its reason for every classification so the
 * judgement can be argued with before anything acts on it.
 *
 * Usage:  node scripts/audit-published-litter.mjs [--json]
 */
import { NAVCOM_SURFACE_RELAYS, THE_RECORD_RELAY } from './lib/relayRegistry.mjs';
import { SCRATCH_MARKER_TAG } from './lib/scratchMarker.mjs';

if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}

const TIMEOUT_MS = 12000;
const RELAYS = [...new Set([...NAVCOM_SURFACE_RELAYS, THE_RECORD_RELAY])];
const JSON_OUT = process.argv.includes('--json');

/**
 * The tag that identifies THIS NODE rather than this project's vocabulary.
 * Our verification runs write it. Used ONLY to learn which pubkey is ours —
 * see the header — and read from the same module the ingest refuses on, so the
 * thing that FINDS our litter and the thing that REFUSES it cannot drift apart.
 */
const OUR_MARKER_TAG = SCRATCH_MARKER_TAG;

/** The interchange vocabulary — shared with the peer, so never an ownership test. */
const SHARED_TAGS = [
  'starcom_intel', 'starcom-intel', 'starcomintel',
  'starcom_mission_package', 'navcom_handoff',
];

/**
 * Positive marks of a fixture. Each is something only test material carries.
 *
 * The placeholder-CID rule looks for a run of one repeated character inside an
 * IPFS-shaped string: a real CID is the digest of real bytes and does not
 * contain `aaaaaa`. That is what our own scratch publishing used for a CID it
 * never actually pinned.
 */
const LITTER_MARKS = [
  { id: 'scratch-tag', test: (e) => tagValues(e, 't').includes(OUR_MARKER_TAG),
    why: `tagged t=${OUR_MARKER_TAG} by our own verification runs` },
  { id: 'placeholder-cid', test: (e) => /\b(?:bafy|Qm)[A-Za-z0-9]*?([A-Za-z0-9])\1{5,}/.test(e.content ?? ''),
    why: 'content carries a placeholder IPFS CID (a run of one repeated character)' },
  { id: 'fixture-words', test: (e) => /\b(test artifact|fixture|scratch verification|do not ingest|lorem ipsum|placeholder)\b/i.test(e.content ?? ''),
    why: 'content says in its own words that it is test material' },
  { id: 'example-name', test: (e) => /"name"\s*:\s*"(Test|Example|Sample|Demo)\b/i.test(e.content ?? ''),
    why: 'names itself Test/Example/Sample/Demo' },
];

const tagValues = (event, name) =>
  (event.tags ?? []).filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean);

const dTag = (event) => tagValues(event, 'd')[0] ?? '';

const addressOf = (event) =>
  event.kind >= 30000 && event.kind < 40000
    ? `${event.kind}:${event.pubkey}:${dTag(event)}`
    : null;

/**
 * Ask one relay for the events matching a set of filters.
 *
 * Resolves with whatever arrived before every subscription reported EOSE, or
 * before the timeout, rather than rejecting: a relay that answers half is more
 * useful than one counted as silent, and the caller is told which relays
 * answered at all.
 */
function collect(url, filters) {
  return new Promise((resolve) => {
    const events = new Map();
    let socket;
    let settled = false;
    // One EOSE per subscription. Stopping at the first would cut the other
    // queries off mid-answer and under-report — which, on an audit whose whole
    // job is completeness, is the one failure that looks like success.
    let eose = 0;
    const done = (status) => {
      if (settled) return;
      settled = true;
      try { socket?.close(); } catch { /* already gone */ }
      resolve({ url, status, events: [...events.values()] });
    };
    const timer = setTimeout(() => done(events.size ? 'partial (timed out)' : 'timed out'), TIMEOUT_MS);

    try { socket = new WebSocket(url); } catch (err) { clearTimeout(timer); return done(`refused: ${err.message}`); }

    socket.onerror = () => { clearTimeout(timer); done('unreachable'); };
    socket.onopen = () => filters.forEach((f, i) => socket.send(JSON.stringify(['REQ', `q${i}`, f])));
    socket.onmessage = (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw.data)); } catch { return; }
      if (msg[0] === 'EVENT' && msg[2]?.id) events.set(msg[2].id, msg[2]);
      if (msg[0] === 'EOSE' && ++eose >= filters.length) { clearTimeout(timer); done('ok'); }
      if (msg[0] === 'CLOSED') { clearTimeout(timer); done(`closed: ${msg[2] ?? 'no reason given'}`); }
    };
  });
}

/** Ask every relay the same filters, and merge to distinct events, newest first. */
async function sweep(filters) {
  const results = await Promise.all(RELAYS.map((url) => collect(url, filters)));
  const byId = new Map();
  const seenOn = new Map();
  for (const { url, events } of results) {
    for (const event of events) {
      byId.set(event.id, event);
      seenOn.set(event.id, [...(seenOn.get(event.id) ?? []), url.replace('wss://', '')]);
    }
  }
  return { results, events: [...byId.values()].sort((a, b) => b.created_at - a.created_at), seenOn };
}

function classify(event) {
  const hits = LITTER_MARKS.filter((m) => { try { return m.test(event); } catch { return false; } });
  return hits.length
    ? { verdict: 'litter', reasons: hits.map((h) => h.why) }
    : { verdict: 'keep', reasons: ['no positive mark of a fixture'] };
}

// ── phase 1: whose key is ours? ─────────────────────────────────────────────

const marker = await sweep([{ '#t': [OUR_MARKER_TAG], limit: 500 }]);
const ours = [...new Set(marker.events.map((e) => e.pubkey))];

if (!JSON_OUT) {
  console.log('\n  PUBLISHED-LITTER AUDIT\n');
  console.log('  Relays asked:');
  for (const { url, status, events } of marker.results) {
    console.log(`    ${status === 'ok' ? '✓' : '·'} ${url.replace('wss://', '').padEnd(28)} ${status}  (${events.length} marker event${events.length === 1 ? '' : 's'})`);
  }
}

if (ours.length === 0) {
  console.log(`\n  No event tagged t=${OUR_MARKER_TAG} is reachable on any relay that answered.\n`);
  console.log('  That means one of two things, and this script cannot tell them apart:');
  console.log('    · the scratch material is already gone, or was never on these relays; or');
  console.log('    · the relays holding it are among those that did not answer.');
  console.log('\n  Either way there is nothing to identify our key FROM, so nothing is');
  console.log('  classified. Re-run when the unreachable relays are back rather than');
  console.log('  treating this as a clean result.\n');
  process.exit(0);
}

// ── phase 2: everything that key has published ──────────────────────────────

const mine = await sweep([{ authors: ours, limit: 500 }]);

// ── phase 3: the shared vocabulary, to report what is NOT ours ──────────────

const shared = await sweep([{ '#t': SHARED_TAGS, limit: 500 }]);
const theirs = shared.events.filter((e) => !ours.includes(e.pubkey));

const rows = mine.events.map((event) => {
  const { verdict, reasons } = classify(event);
  return {
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    d: dTag(event),
    address: addressOf(event),
    created: new Date(event.created_at * 1000).toISOString(),
    tags: tagValues(event, 't'),
    relays: mine.seenOn.get(event.id) ?? [],
    verdict,
    reasons,
    preview: (event.content ?? '').replace(/\s+/g, ' ').slice(0, 120),
  };
});

const litter = rows.filter((r) => r.verdict === 'litter');
const keep = rows.filter((r) => r.verdict === 'keep');

if (JSON_OUT) {
  console.log(JSON.stringify({
    ours,
    relays: marker.results.map(({ url, status }) => ({ url, status })),
    litter, keep,
    otherAuthorsUnderSharedTags: [...new Set(theirs.map((e) => e.pubkey))],
  }, null, 2));
} else {
  console.log(`\n  Our key, identified by t=${OUR_MARKER_TAG}:`);
  for (const pubkey of ours) console.log(`    ${pubkey}`);

  console.log(`\n  ${rows.length} event(s) published by that key and still reachable.\n`);

  console.log(`  ── LITTER (${litter.length}) ────────────────────────────────────────────\n`);
  for (const r of litter) {
    console.log(`    kind ${r.kind}  ${r.created}  on ${r.relays.length} relay(s): ${r.relays.join(', ')}`);
    console.log(`      ${r.address ? `address ${r.address}` : `id      ${r.id}`}`);
    console.log(`      tags    ${r.tags.join(', ') || '(none)'}`);
    for (const why of r.reasons) console.log(`      why     ${why}`);
    console.log(`      text    ${r.preview || '(empty)'}`);
    console.log('');
  }

  console.log(`  ── KEEP (${keep.length}) ──────────────────────────────────────────────\n`);
  for (const r of keep) {
    console.log(`    kind ${r.kind}  ${r.created}  ${r.tags.join(',') || '(no t tag)'}`);
    console.log(`      ${r.address ?? r.id}`);
    console.log(`      ${r.preview || '(empty)'}`);
    console.log('');
  }

  console.log(`  ── NOT OURS ───────────────────────────────────────────────────\n`);
  console.log(`    ${theirs.length} event(s) under the shared interchange vocabulary from`);
  console.log(`    ${new Set(theirs.map((e) => e.pubkey)).size} other author(s). Listed so it is on the record that they`);
  console.log(`    exist and are deliberately untouched — the vocabulary is a spec,`);
  console.log(`    not a claim of ownership.\n`);

  console.log('  Nothing was retracted. This script only reads.\n');
}
