#!/usr/bin/env node
/**
 * Spot-check every Nostr relay the app dials, and every retired one, and say why
 * each one that fails, fails.
 *
 * For use when someone edits src/config/publicInfrastructure.ts: a relay that is
 * retired or returned should be retired or returned on a stated reason, and a
 * refused WebSocket upgrade does not state one — Node reports every refusal as
 * "non-101 status code", so this also asks for the HTTP status (503 is a busy
 * relay, 404 a gone one), and keeps a relay's own words when it closes a
 * subscription ("blocked: …", "auth-required: …").
 *
 * Per relay: the certificate (trusted? days to expiry?), the NIP-11 document, and
 * whether the WebSocket opens AND answers a REQ with EOSE or an EVENT — proof it
 * speaks Nostr, not just that a port is open.
 *
 * Deliberately a spot check, not a monitor. A days-long record with a retirement
 * rule was built on 2026-09-11 and taken out the same day: relays serve chat,
 * collaboration and intel publishing, not the globe; a dead relay is decided on
 * one probe, as the registry was on 2026-08-23; and the intermittent ones in
 * question are large relays whose 503s are load. Two things that would matter
 * more were recorded as open instead. One is closed: fourteen files kept their
 * own relay lists, and since 2026-09-19 they import named sets from the registry
 * (guard-hardcoded-relays). The other is not: whether the app copes with a
 * failing relay at runtime has not been checked.
 *
 * Usage:  node scripts/probe-relays.mjs   (npm run probe:relays)
 */
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Node gained a global WebSocket in 22; on an older one every relay "failed"
// with "WebSocket is not defined", which reads like seventeen dead relays.
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 10000;

// ── the relays, read from the registry the app itself uses ──────────────────
//
// Every address written in the registry, not one list from it. Since
// 2026-09-19 guard-hardcoded-relays keeps any relay address from being written
// anywhere else, so "every literal in this file" is every relay the app can
// dial — including the chat provider's two, which no probe had seen before.
const registry = fs.readFileSync(path.join(ROOT, 'src/config/publicInfrastructure.ts'), 'utf8');
const retired = [...(registry.match(/export const RETIRED_NOSTR_RELAYS = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/url:\s*'(wss:\/\/[^']+)'/g)].map((m) => m[1]);
const active = [...new Set([...registry.matchAll(/'(wss:\/\/[^']+)'/g)].map((m) => m[1]))].filter((url) => !retired.includes(url));
if (active.length === 0 || retired.length === 0) {
  console.error('probe-relays: could not read the relays and the retired list from the registry — refusing to probe a guess');
  process.exit(2);
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: no answer in ${ms / 1000}s`)), ms))]);

function certificate(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      const out = cert?.valid_to
        ? { trusted: socket.authorized, reason: socket.authorizationError ? String(socket.authorizationError) : null,
            daysLeft: Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000) }
        : { trusted: false, reason: 'no certificate presented' };
      socket.end();
      resolve(out);
    });
    socket.on('error', (e) => resolve({ trusted: false, reason: e.code || e.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ trusted: false, reason: 'timeout' }); });
  });
}

async function nip11(host) {
  try {
    const res = await withTimeout(fetch(`https://${host}`, { headers: { Accept: 'application/nostr+json' } }), TIMEOUT_MS, 'NIP-11');
    const body = await res.text();
    let name = null;
    try { name = JSON.parse(body)?.name ?? null; } catch { /* not JSON */ }
    return { status: res.status, name };
  } catch (e) {
    return { status: null, error: e.message };
  }
}

/** Opens, asks for one note, and waits for the relay to answer in Nostr. */
function nostrRoundTrip(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sub = `starcom-probe-${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    let opened = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.send(JSON.stringify(['CLOSE', sub])); } catch { /* not open */ }
      try { ws.close(); } catch { /* already closed */ }
      resolve({ opened, ms: Date.now() - started, ...result });
    };
    const timer = setTimeout(() => done({ answered: false, error: opened ? 'opened but did not answer a REQ' : 'no WebSocket in time' }), TIMEOUT_MS);
    let ws;
    try { ws = new WebSocket(url); } catch (e) { resolve({ opened: false, answered: false, ms: 0, error: e.message }); return; }
    ws.addEventListener('open', () => {
      opened = true;
      ws.send(JSON.stringify(['REQ', sub, { kinds: [1], limit: 1 }]));
    });
    ws.addEventListener('message', (event) => {
      try {
        const [type, id, why] = JSON.parse(String(event.data));
        if ((type === 'EOSE' || type === 'EVENT') && id === sub) done({ answered: true });
        // CLOSED carries the relay's reason ("auth-required: …", "restricted: …") — keep it.
        else if (type === 'CLOSED' && id === sub) done({ answered: false, error: `relay closed the subscription${why ? `: ${why}` : ''}` });
      } catch { /* not a Nostr frame */ }
    });
    ws.addEventListener('error', (event) => done({ answered: false, error: event?.message || event?.error?.message || 'WebSocket error' }));
    ws.addEventListener('close', (event) => done({ answered: false, error: `closed (${event.code}${event.reason ? `: ${event.reason}` : ''})` }));
  });
}

/**
 * The HTTP status a relay answers a WebSocket upgrade with. Node's WebSocket reports
 * every refused upgrade as "non-101 status code", which hides the one thing that
 * separates a busy relay from a dead one: 503 against 404.
 */
function upgradeStatus(host) {
  return new Promise((resolve) => {
    const req = https.request({
      host, port: 443, path: '/', method: 'GET', timeout: TIMEOUT_MS,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') },
    });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function probe(url, list) {
  const host = new URL(url).host;
  const [tlsResult, info, ws] = await Promise.all([certificate(host), nip11(host), nostrRoundTrip(url)]);
  if (!ws.answered && !ws.opened) ws.upgradeStatus = await upgradeStatus(host);
  return { at: new Date().toISOString(), relay: url, list, tls: tlsResult, nip11: info, ws };
}

const targets = [...active.map((u) => [u, 'active']), ...retired.map((u) => [u, 'retired'])];
const results = await Promise.all(targets.map(([u, list]) => probe(u, list)));
for (const r of results) {
  console.log(`  ${r.ws.answered ? '✓' : '✗'} ${r.relay.padEnd(34)} ${r.list.padEnd(7)} ${r.ws.answered ? `${r.ws.ms} ms` : r.ws.error}${r.ws.upgradeStatus ? ` [upgrade: HTTP ${r.ws.upgradeStatus}]` : ''}`
    + `${r.tls.trusted ? '' : `  [cert: ${r.tls.reason}]`}`);
}
console.log(`\n  ${results.filter((r) => r.ws.answered).length} of ${results.length} answered a REQ. A spot check, not a record — see the header.`);
