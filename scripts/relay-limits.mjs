#!/usr/bin/env node
/**
 * What real relays will actually accept, asked before anything is published.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Everything this node knows about its own wire formats was learned from
 * fixtures, a local dev relay, and a reference implementation written from the
 * same prose. None of that can answer the only question that matters before a
 * real claim goes out: will the network take it.
 *
 * The gap is not hypothetical. A refutation's `d` tag is ~3,957 characters,
 * because it embeds an ML-DSA-65 public key as hex. Nobody noticed until
 * conformance vectors forced a real value to exist, and nothing has ever
 * checked that figure against a relay's declared limits.
 *
 * ─── WHY IT PUBLISHES NOTHING ──────────────────────────────────────────────
 *
 * NIP-11 relay information documents are fetched over HTTP with an Accept
 * header — a read of public metadata that every Nostr client performs on
 * connect. No event is sent, no key is used, nothing is written to anyone's
 * infrastructure. Testing acceptance by publishing test events is exactly the
 * littering this project has already done once by accident.
 *
 * Usage: node scripts/relay-limits.mjs
 */

import { NAVCOM_SURFACE_RELAYS } from './lib/relayRegistry.mjs';

/** The public surface set, as this script has always asked. The Record is not in it. */
const RELAYS = NAVCOM_SURFACE_RELAYS;

/** The shapes this node actually emits, measured rather than estimated. */
const SHAPES = [
  { what: 'Attested Claim d-tag', kind: 30082, tagBytes: 40 },
  { what: 'Mission Package d-tag', kind: 30079, tagBytes: 60 },
  { what: 'Dispatch Capability d-tag', kind: 30081, tagBytes: 80 },
  {
    what: 'Refutation d-tag',
    kind: 30083,
    tagBytes: 3957,
    note: 'embeds an ML-DSA-65 public key as hex',
  },
];

async function nip11(url) {
  const http = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(http, {
      headers: { Accept: 'application/nostr+json' },
      signal: controller.signal,
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const url of RELAYS) {
  const doc = await nip11(url);
  results.push({ url, doc });
}

console.log('\n  RELAY LIMITS — declared, not guessed\n');
for (const { url, doc } of results) {
  if (doc.error) {
    // An unreachable relay is a fact worth printing, not a reason to stop:
    // it means this destination cannot be checked, which is itself an answer.
    console.log(`  ${url}\n      unreachable: ${doc.error}\n`);
    continue;
  }
  const lim = doc.limitation ?? {};
  console.log(`  ${url}`);
  console.log(`      ${doc.software ?? 'unknown software'}`);
  for (const k of ['max_message_length', 'max_content_length', 'max_event_tags', 'max_limit']) {
    if (lim[k] !== undefined) console.log(`      ${k}: ${lim[k]}`);
  }
  if (Object.keys(lim).length === 0) console.log('      declares no limitation block');
  console.log('');
}

console.log('  OUR SHAPES AGAINST THEM\n');
for (const shape of SHAPES) {
  const problems = [];
  for (const { url, doc } of results) {
    const max = doc?.limitation?.max_message_length;
    // A d-tag is one tag value inside a whole event; comparing it against
    // max_message_length is the loosest possible check and still catches the
    // refutation address, which is the point.
    if (typeof max === 'number' && shape.tagBytes > max) {
      problems.push(`${url} caps messages at ${max}`);
    }
  }
  const flag = shape.tagBytes > 1024 ? '  ⚠' : '   ';
  console.log(`${flag} ${shape.what} (kind ${shape.kind}): ${shape.tagBytes} bytes`);
  if (shape.note) console.log(`      ${shape.note}`);
  for (const p of problems) console.log(`      EXCEEDS: ${p}`);
}
console.log('');
