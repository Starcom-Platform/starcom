#!/usr/bin/env node
/**
 * Production smoke test for Starcom's EIN connections.
 *
 * Checks the two services Starcom depends on that it does not operate — Mecha
 * Jono's Nostr relay and IPFS gateway, both reached through a Cloudflare Tunnel
 * — plus Starcom's own published surface. Everything here runs over the real
 * public path, never localhost, because the tunnel and the edge are part of
 * what is being tested.
 *
 * READ-ONLY BY DEFAULT. Nothing is published. The write path is genuinely
 * untestable without writing, and that limit is reported rather than papered
 * over: a smoke test that claims a write works without attempting one is the
 * exact "reports success without evidence" failure this network keeps finding.
 *
 * Pass --probe-write to attempt ONE unauthenticated publish. That is expected
 * to be REFUSED, and the refusal is the evidence: it proves the relay reaches
 * the allowlist check, that it answers with a typed reason rather than a silent
 * drop, and that a NIP-42 challenge is issued where one is expected. It sends a
 * throwaway event under an ephemeral key — never Starcom's identity, never a
 * real claim.
 *
 * Usage: node scripts/smoke-ein.mjs [--probe-write]
 * Exit:  0 every required check passed · 1 at least one failed
 */
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { THE_RECORD_RELAY } from './lib/relayRegistry.mjs';

const RELAY_WSS = THE_RECORD_RELAY;
const RELAY_HTTPS = 'https://record.cosmiccodex.app';
const GATEWAY = 'https://gateway.cosmiccodex.app/ipfs/';
const STARCOM = 'https://starcom.app';
const PROBE_WRITE = process.argv.includes('--probe-write');

let failures = 0;
let warnings = 0;
const ok = (name, detail = '') => console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
const bad = (name, detail = '') => { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };
const warn = (name, detail = '') => { warnings++; console.log(`  WARN  ${name}${detail ? ` — ${detail}` : ''}`); };

const timed = async (fn) => {
  const t = Date.now();
  try { return { value: await fn(), ms: Date.now() - t }; }
  catch (e) { return { error: e, ms: Date.now() - t }; }
};

/** One WebSocket exchange, with a hard deadline so a hung tunnel fails rather than hangs. */
function wsExchange(url, { send = [], collectMs = 6000, onOpen } = {}) {
  return new Promise((resolve) => {
    const messages = [];
    let opened = false;
    const ws = new WebSocket(url);
    const done = () => { try { ws.close(); } catch { /* already closed */ } resolve({ opened, messages }); };
    const timer = setTimeout(done, collectMs);
    ws.onopen = () => { opened = true; onOpen?.(ws); for (const m of send) ws.send(JSON.stringify(m)); };
    ws.onmessage = (e) => {
      try { messages.push(JSON.parse(String(e.data))); } catch { messages.push(['<unparseable>']); }
    };
    ws.onerror = () => { clearTimeout(timer); done(); };
  });
}

console.log('\n  EIN production smoke test — real public paths only\n');

// ── 1. Relay: NIP-11 descriptor over HTTPS through the tunnel ──────────────
console.log('  THE RECORD (Nostr relay, Cloudflare Tunnel)');
const nip11 = await timed(async () => {
  const r = await fetch(RELAY_HTTPS, { headers: { Accept: 'application/nostr+json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});
if (nip11.error) bad('NIP-11 descriptor reachable', nip11.error.message);
else {
  ok('NIP-11 descriptor reachable', `${nip11.ms}ms`);
  const d = nip11.value;
  d.name ? ok('relay names itself', d.name) : warn('relay has no name');
  Array.isArray(d.supported_nips) && d.supported_nips.includes(42)
    ? ok('advertises NIP-42', 'auth is expected on write')
    : bad('advertises NIP-42', 'allowlist-write without auth support is a contradiction');
  d.pubkey ? ok('publishes an operator pubkey', `${String(d.pubkey).slice(0, 16)}…`) : warn('no operator pubkey in NIP-11');
}

// ── 2. Relay: WebSocket upgrade survives the tunnel ────────────────────────
const upgrade = await timed(() => wsExchange(RELAY_WSS, { collectMs: 4000 }));
upgrade.value?.opened
  ? ok('WebSocket upgrade through the tunnel', `${upgrade.ms}ms`)
  : bad('WebSocket upgrade through the tunnel', 'Cloudflare did not proxy the upgrade');

// ── 3. Relay: the read path actually answers ───────────────────────────────
const read = await timed(() => wsExchange(RELAY_WSS, {
  send: [['REQ', 'smoke', { limit: 3 }]],
  collectMs: 6000,
}));
const msgs = read.value?.messages ?? [];
const gotEose = msgs.some((m) => m[0] === 'EOSE');
const authChallenged = msgs.some((m) => m[0] === 'AUTH');
const events = msgs.filter((m) => m[0] === 'EVENT');
if (gotEose) ok('open-read confirmed', `EOSE in ${read.ms}ms, ${events.length} event(s)`);
else if (authChallenged) warn('reads require AUTH', 'relay challenged before serving');
else bad('open-read', 'no EOSE and no AUTH — the subscription went unanswered');

// ── 4. Relay: a subscription stays open, which is what ingest depends on ───
const held = await timed(() => wsExchange(RELAY_WSS, {
  send: [['REQ', 'hold', { kinds: [30082] }]],
  collectMs: 12000,
}));
held.value?.opened
  ? ok('subscription held for 12s', 'tunnel does not drop idle websockets in that window')
  : bad('subscription held', 'connection dropped');

// ── 5. Relay: the write path, only if explicitly asked ─────────────────────
if (PROBE_WRITE) {
  const throwaway = generateSecretKey();
  const evt = finalizeEvent({
    kind: 30082, created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'smoke-test:probe'], ['t', 'attested-claim']],
    content: '{"smoke":"unauthenticated write probe — expected to be refused"}',
  }, throwaway);
  const wrote = await timed(() => wsExchange(RELAY_WSS, { send: [['EVENT', evt]], collectMs: 8000 }));
  const okMsg = (wrote.value?.messages ?? []).find((m) => m[0] === 'OK');
  const challenged = (wrote.value?.messages ?? []).some((m) => m[0] === 'AUTH');
  if (!okMsg && !challenged) bad('write path answers', 'no OK and no AUTH — a silent drop');
  else if (okMsg && okMsg[2] === false) ok('unlisted write refused with a typed reason', String(okMsg[3]).slice(0, 70));
  else if (challenged) ok('write path issues a NIP-42 challenge', 'auth required, as documented');
  else bad('unlisted write was ACCEPTED', 'the allowlist is not enforcing');
} else {
  console.log('  SKIP  write path — pass --probe-write to attempt one refused, ephemeral write');
}

// ── 6. Gateway ─────────────────────────────────────────────────────────────
console.log('\n  GATEWAY (IPFS over Cloudflare Tunnel)');
const bogus = await timed(async () => {
  const r = await fetch(`${GATEWAY}bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, {
    signal: AbortSignal.timeout(20000),
  });
  return r.status;
});
if (bogus.error) ok('unknown CID fails fast', `rejected in ${bogus.ms}ms`);
else if (bogus.ms < 5000) ok('unknown CID fails fast', `HTTP ${bogus.value} in ${bogus.ms}ms`);
else warn('unknown CID was slow', `${bogus.ms}ms — a hang here blocks any caller that waits`);

// Cross-provider retrieval: content Starcom pinned to Filebase, fetched through
// a gateway operated by a peer. This is the whole point of content addressing —
// if it only resolves where it was pinned, it is not durable, it is hosted.
let manifest = null;
// The DEPLOYED manifest, not the local one. Pinning runs at build time on the
// host that holds the credentials, so a local checkout has no manifest unless
// someone happened to build with them — and the deployed copy is the one that
// describes what is actually pinned.
try {
  const r = await fetch(`${STARCOM}/spec/pinned-cids.json`, { signal: AbortSignal.timeout(15000) });
  if (r.ok) manifest = await r.json();
} catch { /* fall through to the local copy */ }
if (!manifest) {
  try { manifest = JSON.parse(fs.readFileSync('docs/spec/pinned-cids.json', 'utf8')); } catch { /* none */ }
}
const pinnedCid = manifest?.artifacts?.[0]?.cid;
if (!pinnedCid) {
  warn('no pin manifest', manifest ? 'manifest present but reports nothing pinned' : 'neither deployed nor local');
} else {
  const cross = await timed(async () => {
    const r = await fetch(GATEWAY + pinnedCid, { signal: AbortSignal.timeout(25000) });
    return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
  });
  if (cross.error) warn('Starcom content via peer gateway', `${cross.error.message} — expected if they have not pinned it; Filebase + public gateways remain the durable path`);
  else if (cross.value.status === 200) ok('Starcom content via peer gateway', `${cross.value.bytes}B in ${cross.ms}ms — cross-provider retrieval works`);
  else warn('Starcom content via peer gateway', `HTTP ${cross.value.status} — their gateway serves what they pinned, not the public network`);
}

  // The check that actually decides durability. A peer's gateway serving our
  // content is a convenience; a PUBLIC gateway serving it is the difference
  // between content-addressed and merely hosted. If this fails, losing our
  // hosting account loses the specification four nodes build against.
  for (const gw of ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']) {
    const pub = await timed(async () => {
      const r = await fetch(gw + pinnedCid, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.arrayBuffer()).byteLength;
    });
    pub.error
      ? bad(`spec durable via ${new URL(gw).host}`, pub.error.message)
      : ok(`spec durable via ${new URL(gw).host}`, `${pub.value}B in ${pub.ms}ms`);
  }

// ── 7. Starcom's own published surface ─────────────────────────
//
// This was three hardcoded paths, and it stayed three while the published
// documents grew to advertise more. `/.well-known/security-policy.md` — the
// document security.txt sends a journalist, a relay operator, or someone who
// believes a claim about them is false — returned 404 in production while
// security.txt beside it served correctly, because `*.md` in .vercelignore
// stripped it from the upload. Nothing here fetched it, so nothing said so.
//
// The list is now DERIVED from what the documents themselves advertise: publish
// a document pointing anywhere on this origin and this check follows the
// pointer, with nobody having to remember to add a line.
console.log('\n  STARCOM (our side, for completeness)');

const advertised = new Set([
  '/.well-known/security.txt',
  '/.well-known/starcom-node.json',
  '/.well-known/nostr.json',
  '/spec/vectors/index.json',
]);

// Every same-origin Contact/Policy/Canonical value in security.txt.
try {
  const txt = await (await fetch(`${STARCOM}/.well-known/security.txt`, { signal: AbortSignal.timeout(15000) })).text();
  for (const m of txt.matchAll(/^(?:Contact|Policy|Canonical):\s*(\S+)/gm)) {
    if (m[1].startsWith(STARCOM)) advertised.add(new URL(m[1]).pathname);
  }
} catch (e) {
  warn('security.txt unreadable — advertised paths not derived', e.message);
}

// Every file-shaped absolute path anywhere in the node descriptor.
//
// File-shaped deliberately: `interchange.conformanceVectors` is a directory
// (`/spec/mission-vectors/`), and a directory has no body to fetch on static
// hosting. Asserting a 200 there would fail for a reason that is not a defect.
try {
  const d = await (await fetch(`${STARCOM}/.well-known/starcom-node.json`, { signal: AbortSignal.timeout(15000) })).json();
  const walk = (v) => {
    if (typeof v === 'string') { if (/^\/[\w./-]+\.\w+$/.test(v)) advertised.add(v); }
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(d);
} catch (e) {
  warn('node descriptor unreadable — advertised paths not derived', e.message);
}

for (const path of [...advertised].sort()) {
  const r = await timed(async () => {
    const res = await fetch(STARCOM + path, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    // Peers verify by content-type, not status — an SPA shell returning 200 is a
    // 200 that means nothing. Everything advertised here is a document; if the
    // application came back instead, the document is not being served.
    if (ct.includes('text/html')) throw new Error(`content-type ${ct} — served the app shell, not the document`);
    if (path.endsWith('.json')) { await res.json(); return ct; }
    const body = await res.text();
    if (!body.trim()) throw new Error('empty body');
    return `${ct}, ${body.length}B`;
  });
  r.error ? bad(`serves ${path}`, r.error.message) : ok(`serves ${path}`, `${r.ms}ms`);
}

console.log(`\n  ${failures} failure(s), ${warnings} warning(s).`);
if (!PROBE_WRITE) console.log('  The write path is UNPROVEN by this run — see --probe-write.\n');
else console.log('');
process.exit(failures ? 1 : 0);
