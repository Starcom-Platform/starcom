#!/usr/bin/env node
/**
 * Check every external source the app fetches: certificate, status, and
 * whether a browser is allowed to read it.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The layer audit found the Satellites layer had drawn nothing since April.
 * CelesTrak's .com certificate expired on 2026-04-12, every browser refused
 * the connection, and the layer rendered an empty sky — which looks exactly
 * like there being nothing up there. Five months, and nothing said so.
 *
 * It was not alone. Of the eight problems that audit found, four were a source
 * dying quietly: an expired certificate, a feed NOAA deleted (404, which the
 * browser reports as a CORS error), a GDELT endpoint no browser may read, and
 * EIA answering 403 to a request made with an empty key. None of the four
 * needed a browser, a globe or a screenshot to catch. They needed someone to
 * ask each source the question directly.
 *
 * So this asks. No browser, seconds to run, and it warns about a certificate
 * BEFORE it expires rather than five months after.
 *
 * ─── WHAT IT DISCOVERS, AND WHY IT IS NOT A LIST ───────────────────────────
 *
 * The URLs are read from the source: every string literal in every non-test
 * source file. A hand-kept registry of sources is the thing that goes stale —
 * the day someone adds a feed without adding it to the list, the list starts
 * lying by omission. Every hit is reported with the file and line it came
 * from, so each finding points at its fix.
 *
 * The first version only read files containing a literal `fetch(` or `axios`,
 * on the reasoning that those were the files making network calls. It missed
 * NOAA's deleted plasma feed — one of the four breaks this exists to catch —
 * because SpaceWeatherLive.ts fetches through a wrapper, fetchWithTimeout(),
 * and was never scanned. Checked against that known break, it would have
 * reported the source fine by never looking at it. Widening the pattern would
 * leave the next wrapper, and every URL kept in a config file, just as
 * invisible; scanning everything and judging each URL by its SHAPE does not.
 *
 * ─── WHAT COUNTS AS BROKEN, CAREFULLY ──────────────────────────────────────
 *
 * A check that cries wolf gets ignored, so the classifications are narrow:
 *
 *   certificate   per HOST. Expired, or expiring within 21 days, is a problem.
 *   mixed content a plain http:// source. On an https page the browser blocks
 *                 it before any request is made — whatever the server does.
 *   not found     404 on a URL that names a RESOURCE (a file extension or a
 *                 query). A 404 on a bare base URL like api.eia.gov/v2 proves
 *                 nothing — that is a prefix the app appends to — and is
 *                 reported as such, not as a break.
 *   credential    401/403: the source wants a key. Not broken in itself; the
 *                 question is whether the app calls it without one, which is
 *                 exactly what EIA was doing.
 *   no CORS       no Access-Control-Allow-Origin: a browser cannot read the
 *                 response directly.
 *   proxied       the app routes requests through a public CORS proxy — data
 *                 passing through a third party nobody here controls.
 *   placeholder   example.com and friends, in shipped code.
 *
 * Templated URLs (containing ${…}) cannot be requested as written; their host
 * is still certificate-checked. localhost is skipped.
 *
 * Exit 0 always. Third parties go down; a build that failed whenever NOAA
 * hiccupped would teach everyone to ignore it. This reports, and its findings
 * are what the week works through.
 *
 * Usage:
 *   node scripts/check-data-sources.mjs            human report
 *   node scripts/check-data-sources.mjs --json     machine-readable
 */
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://starcom.app';
const CERT_WARN_DAYS = 21;
const TIMEOUT_MS = 15000;
const CONCURRENCY = 6;
const JSON_OUT = process.argv.includes('--json');

/** Public CORS proxies. Anything fetched through these passes through a third party. */
const PROXY_HOSTS = new Set(['api.allorigins.win', 'api.codetabs.com', 'corsproxy.io', 'cors-anywhere.herokuapp.com', 'thingproxy.freeboard.io']);
const PLACEHOLDER = /(^|\.)example\.(com|org|net)$|your-domain|yourdomain|(^|\.)mock(-[a-z]+)?\.(com|org|net)$/i;

/*
 * Things the app LINKS to or EMBEDS rather than reads: invite links, channel
 * pages, widget iframes, OAuth redirect targets. A CORS header means nothing
 * for them — a browser follows a link or loads an iframe regardless — so
 * flagging one as "no CORS" is a false alarm, and the first run raised six.
 * Decided by the host where that settles it, otherwise by the name of the
 * field the URL is assigned to.
 */
const LINK_HOSTS = new Set(['discord.gg', 't.me', 'accounts.google.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'www.youtube.com']);
const LINK_FIELD = /\b(serverUrl|embed\w*|channelUrl|instant_invite|invite\w*|auth_uri|token_uri|href|homepage|website|profileUrl|shareUrl)\s*[:=]/i;
/*
 * Loopback and private-network addresses. A hard-coded 192.168.x.x in shipped
 * code is a development target, not a public source that has gone down, so it
 * is skipped rather than reported as an outage — the first wide run counted
 * four of them among 42 "unreachable" and they buried the real ones.
 */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/*
 * Sources that ration downloads per network. Probing one is not free: the
 * probe IS the download. CelesTrak serves each GP group once per two-hour
 * update per network and answers a repeat with 403 — so a check that GETs all
 * five groups spends this network's downloads, and the app loaded after it is
 * refused for up to two hours, with no copy of its own to fall back on. And a
 * service that rations this way will, in time, block a network that keeps
 * asking. So these get the certificate check only — the thing that actually
 * broke in April — and the report says why they got no more.
 */
const METERED = [
  {
    matches: (u) => u.hostname === 'celestrak.org' && u.pathname.endsWith('/gp.php') && u.searchParams.has('GROUP'),
    why: 'CelesTrak serves each GP group once per two-hour update per network; a probe would spend the download the app needs',
  },
];
const meteredWhy = (url) => {
  try { const u = new URL(url); return METERED.find((m) => m.matches(u))?.why ?? null; } catch { return null; }
};

// ── discovery ──────────────────────────────────────────────────────────────
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
  return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
});
const isTestish = (f) => /__tests__|\.test\.|\.spec\.|[\\/]testing[\\/]|\.fixtures\./.test(f);
const CALLS = /\bfetch\w*\s*\(|\baxios\b|XMLHttpRequest|new WebSocket\(|EventSource\(/;

/**
 * A URL that names DATA: a data file, a query, or an API-shaped path. These
 * get the full check. Anything else — a homepage, a docs link, a bare prefix —
 * gets certificate and reachability only, because a web page lacking a CORS
 * header is not a finding and 114 of them would bury the ones that are.
 */
const DATA_SHAPED = (url) => {
  try {
    const u = new URL(url);
    return /\.(json|geojson|csv|tsv|txt|xml|zip|rules|data|netset|ipset|php)$/i.test(u.pathname)
      || u.search.length > 1
      || /\/(api|rest|v\d+|json|data|downloads)(\/|$)/i.test(u.pathname);
  } catch { return false; }
};
const URL_LITERAL = /['"`]((?:https?|wss?):\/\/[^'"`\s]+)['"`]/g;

const found = new Map(); // url -> [{ file, line, link }]
for (const file of walk(path.join(ROOT, 'src')).filter((f) => !isTestish(f))) {
  const src = fs.readFileSync(file, 'utf8');
  const callsNetwork = CALLS.test(src);
  src.split('\n').forEach((text, i) => {
    // Skip comment lines: a URL in prose is documentation, not a source.
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    for (const m of text.matchAll(URL_LITERAL)) {
      const url = m[1].replace(/[),.;]+$/, '');
      if (!found.has(url)) found.set(url, []);
      found.get(url).push({ file: path.relative(ROOT, file), line: i + 1, link: LINK_FIELD.test(text), callsNetwork });
    }
  });
}

/*
 * The host, or null when it cannot be known. A URL whose host is itself
 * templated — `https://${host}/api` — used to come back as "x", the stand-in
 * substituted to make it parseable, and was then reported as an unreachable
 * host called x. That is a finding about this script, not about the app.
 */
const hostOf = (url) => {
  const authority = url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0];
  if (authority.includes('${')) return null;
  try { return new URL(url.replace(/\$\{[^}]*\}/g, 'x')).hostname; } catch { return null; }
};

// ── checks ─────────────────────────────────────────────────────────────────
function certificateOf(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      const reason = socket.authorizationError ? String(socket.authorizationError) : null;
      socket.end();
      if (!cert || !cert.valid_to) return resolve({ error: 'no certificate presented' });
      const expires = new Date(cert.valid_to);
      resolve({ expires: expires.toISOString(), daysLeft: Math.floor((expires - Date.now()) / 86400000), authorized, reason });
    });
    socket.on('error', (e) => resolve({ error: e.code || e.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
  });
}

/**
 * The preflight a browser sends before a POST with a JSON body. An API that
 * answers GET without Access-Control-Allow-Origin can still allow the POST —
 * Solana's JSON-RPC does exactly that, and the first run flagged it.
 */
async function preflightAllows(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      signal: controller.signal,
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    res.body?.cancel().catch(() => {});
    return Boolean(res.headers.get('access-control-allow-origin'));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Origin: ORIGIN, 'User-Agent': 'starcom-source-check (+https://starcom.app)' },
    });
    // Headers are the question; the body is not wanted.
    res.body?.cancel().catch(() => {});
    return {
      status: res.status,
      acao: res.headers.get('access-control-allow-origin'),
      finalUrl: res.url !== url ? res.url : undefined,
    };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const urls = [...found.keys()].sort();
const hosts = [...new Set(urls.map(hostOf).filter(Boolean))].filter((h) => !LOCAL.test(h) && !PLACEHOLDER.test(h)).sort();

if (!JSON_OUT) console.log(`\n  DATA SOURCE CHECK — ${urls.length} URL literals on ${hosts.length} hosts, from ${new Set([...found.values()].flat().map((r) => r.file)).size} files that make network calls\n`);

const certs = Object.fromEntries((await pool(hosts, certificateOf)).map((c, i) => [hosts[i], c]));

const looksLikeResource = (url) => /\.[a-z0-9]{2,6}(\?|$)/i.test(new URL(url).pathname) || url.includes('?');

const results = await pool(urls, async (url) => {
  const host = hostOf(url);
  const where = found.get(url);
  const r = { url, host, where, findings: [] };
  if (!host) { r.skipped = 'host is templated — cannot be checked as written'; return r; }
  if (LOCAL.test(host)) { r.skipped = 'loopback or private network'; return r; }
  // A single-label name — service-registry, storage-service — is an internal
  // service name, never a public host; like a private address, not an outage.
  if (!host.includes('.') && !host.startsWith('[')) { r.skipped = 'internal service name'; return r; }
  if (PLACEHOLDER.test(host)) { r.findings.push({ kind: 'placeholder', severity: 'problem', detail: 'a placeholder host in shipped code' }); return r; }
  if (PROXY_HOSTS.has(host)) r.findings.push({ kind: 'proxied', severity: 'problem', detail: 'requests pass through a public CORS proxy' });
  if (url.startsWith('http://')) r.findings.push({ kind: 'mixed content', severity: 'problem', detail: 'plain http:// — blocked on an https page before any request' });

  const cert = certs[host];
  if (cert?.error) r.findings.push({ kind: 'unreachable', severity: 'problem', detail: `TLS: ${cert.error}` });
  else if (cert && cert.daysLeft < 0) r.findings.push({ kind: 'certificate expired', severity: 'problem', detail: `expired ${cert.expires.slice(0, 10)}, ${-cert.daysLeft} days ago` });
  else if (cert && cert.daysLeft < CERT_WARN_DAYS) r.findings.push({ kind: 'certificate expiring', severity: 'warning', detail: `expires ${cert.expires.slice(0, 10)}, in ${cert.daysLeft} days` });
  else if (cert && cert.authorized === false) r.findings.push({ kind: 'certificate untrusted', severity: 'problem', detail: cert.reason });

  // A link or embed: its certificate matters, a CORS header does not.
  const isLink = LINK_HOSTS.has(host) || r.where.every((w) => w.link);
  if (isLink) { r.checked = 'host only (a link or embed, not fetched)'; return r; }

  if (url.includes('${') || /^wss?:/.test(url)) {
    r.checked = url.includes('${') ? 'host only (templated)' : 'host only (websocket)';
    return r;
  }
  if (PROXY_HOSTS.has(host) && /[=?]$/.test(url)) { r.checked = 'host only (proxy prefix)'; return r; }
  const metered = meteredWhy(url);
  if (metered) { r.metered = metered; r.checked = `certificate only (metered: ${metered})`; return r; }

  // A page or a prefix: reachability matters, a CORS header does not.
  if (!DATA_SHAPED(url)) {
    const p = await probe(url);
    r.http = p;
    r.checked = 'reachability (not data-shaped)';
    if (p.error) r.findings.push({ kind: 'unreachable', severity: 'problem', detail: p.error });
    else if (p.status >= 500) r.findings.push({ kind: 'server error', severity: 'problem', detail: `${p.status}` });
    return r;
  }

  const p = await probe(url);
  r.http = p;
  if (p.error) r.findings.push({ kind: 'unreachable', severity: 'problem', detail: p.error });
  else if (p.status === 404) {
    r.findings.push(looksLikeResource(url)
      ? { kind: 'not found', severity: 'problem', detail: '404 on a named resource' }
      : { kind: 'base URL', severity: 'info', detail: '404 on a prefix the app appends to — not evidence of a break' });
  } else if (p.status === 401 || p.status === 403) {
    r.findings.push({ kind: 'credential', severity: 'warning', detail: `${p.status} — wants a key; check the app never calls it without one` });
  } else if (p.status >= 500) r.findings.push({ kind: 'server error', severity: 'problem', detail: `${p.status}` });
  else if (p.status >= 200 && p.status < 400 && !p.acao) {
    if (await preflightAllows(url)) {
      r.corsVia = 'preflight';
    } else {
      r.findings.push({ kind: 'no CORS', severity: 'warning', detail: 'no Access-Control-Allow-Origin on GET or on a POST preflight — a browser cannot read this directly' });
    }
  }
  return r;
});

// ── report ─────────────────────────────────────────────────────────────────
const rank = { problem: 0, warning: 1, info: 2 };
const flagged = results.filter((r) => r.findings.some((f) => f.severity !== 'info'))
  .sort((a, b) => Math.min(...a.findings.map((f) => rank[f.severity])) - Math.min(...b.findings.map((f) => rank[f.severity])) || a.host.localeCompare(b.host));

if (JSON_OUT) {
  console.log(JSON.stringify({ checked: new Date().toISOString(), origin: ORIGIN, certificates: certs, results }, null, 2));
} else {
  const expiring = Object.entries(certs).filter(([, c]) => !c.error && c.daysLeft < CERT_WARN_DAYS).sort((a, b) => a[1].daysLeft - b[1].daysLeft);
  if (expiring.length) {
    console.log('  CERTIFICATES');
    for (const [h, c] of expiring) console.log(`    ${c.daysLeft < 0 ? 'EXPIRED ' : 'expiring'}  ${h.padEnd(34)} ${c.expires.slice(0, 10)} (${c.daysLeft < 0 ? `${-c.daysLeft} days ago` : `in ${c.daysLeft} days`})`);
    console.log('');
  }
  /*
   * Grouped by HOST, because that is how they get fixed: one certificate, one
   * dead domain, one missing CORS policy covers every URL on it. Listed per
   * URL, five CelesTrak groups repeated the same expired certificate five times.
   */
  const byHost = new Map();
  for (const r of flagged) {
    if (!byHost.has(r.host)) byHost.set(r.host, { kinds: new Set(), details: new Set(), urls: [], worst: 2 });
    const h = byHost.get(r.host);
    for (const f of r.findings.filter((x) => x.severity !== 'info')) {
      h.kinds.add(f.kind); h.details.add(f.detail); h.worst = Math.min(h.worst, rank[f.severity]);
    }
    h.urls.push(r);
  }
  const hostsSorted = [...byHost.entries()].sort((a, b) => a[1].worst - b[1].worst || a[0].localeCompare(b[0]));
  console.log(`  ${byHost.size} host(s) need attention, covering ${flagged.length} URL(s):\n`);
  for (const [host, h] of hostsSorted) {
    console.log(`  ${host}  —  ${[...h.kinds].join(', ').toUpperCase()}`);
    for (const d of [...h.details].slice(0, 2)) console.log(`      ${d}`);
    const locs = h.urls.flatMap((u) => u.where.map((w) => `${w.file}:${w.line}`));
    console.log(`      ${h.urls.length} URL(s); at ${[...new Set(locs)].slice(0, 3).join(', ')}${locs.length > 3 ? ` (+${locs.length - 3})` : ''}`);
    console.log('');
  }
  // A metered source was not asked, so it did not answer — cleanly or otherwise.
  const ok = results.filter((r) => !r.skipped && !r.metered && r.findings.every((f) => f.severity === 'info')).length;
  const metered = results.filter((r) => r.metered);
  const skipped = results.filter((r) => r.skipped);
  const why = [...new Set(skipped.map((r) => r.skipped))].join('; ');
  console.log(`  ${ok} source(s) answered cleanly. ${skipped.length} skipped (${why}).`);
  if (metered.length) {
    console.log(`  ${metered.length} not asked, certificate checked only — ${[...new Set(metered.map((r) => r.metered))].join('; ')}.`);
  }
  console.log('  Third parties go down: this reports, it does not fail the build. Re-run it; do not re-read it.\n');
}
