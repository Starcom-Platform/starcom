#!/usr/bin/env node
/**
 * @asserts Starcom ships no server-side code in production.
 *
 * Asserts that Starcom operates no server-side code in production.
 *
 * ─── WHY THIS IS A LIABILITY TEST, NOT A PERFORMANCE ONE ───────────────────
 *
 * Where responsibility for published content lands is decided by architecture,
 * not by paperwork. A terms-of-service saying "the user is liable" is a contract
 * between two parties and does nothing for a third party who believes they were
 * harmed — they sue whoever they can reach. What actually determines who is
 * reachable is a set of technical facts:
 *
 *   who holds the signing key        the signer is the publisher
 *   whose machines the content       a host is a host, whatever it calls itself
 *     passes through
 *   what the operator knows          knowledge creates duties
 *
 * Starcom is currently in an unusually strong position on all three: the browser
 * signs, the browser talks to relays directly, and the guardrails run entirely
 * client-side and report nothing back. There is no server in between.
 *
 * api/ and server/ are now DELETED rather than merely dark, which is a stronger
 * position than this guard was originally written for.
 *
 * api/ previously held ten files — Shodan, Censys and VirusTotal proxies, a pin
 * endpoint, and listings/purchases commerce handlers — kept out of production
 * only by vercel.json declaring an explicit `builds` array, since Vercel deploys
 * an api/ directory as serverless functions BY DEFAULT. Deleting four lines of
 * config would have made Starcom an operator of OSINT proxies and a commerce
 * endpoint, silently, with nobody having decided it.
 *
 * The guard is KEPT because the config check still matters: nothing stops
 * someone adding api/ back, and the failure mode would be identical. It now
 * guards an absence rather than a suppression.
 *
 * So the fact gets asserted rather than assumed, against the live deployment,
 * because the only version of this claim that matters is the one about what is
 * actually running.
 *
 * Usage: node scripts/guard-no-server-surface.mjs [--url https://starcom.app]
 * Exit:  0 no server surface · 1 something is live that should not be
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : d; };
const ORIGIN = flag('--url', 'https://starcom.app');

let failures = 0;
const bad = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

console.log(`\n  SERVER-SURFACE GUARD — ${ORIGIN}\n`);

// ── 1. The static-build declaration, still the thing that would matter ────
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')); } catch { /* handled below */ }

if (!cfg) {
  bad('vercel.json unreadable — cannot confirm api/ is suppressed');
} else if (!Array.isArray(cfg.builds) || !cfg.builds.length) {
  bad('vercel.json has no explicit `builds` array. Vercel will deploy api/ as '
    + 'serverless functions by default, making this project an operator of every '
    + 'endpoint in that directory.');
} else if (!cfg.builds.some((b) => String(b.use ?? '').includes('static'))) {
  bad(`vercel.json builds do not declare a static build: ${JSON.stringify(cfg.builds)}`);
} else {
  ok('vercel.json declares an explicit static build');
}

if (cfg && cfg.functions) {
  bad('vercel.json declares a `functions` block. That is server-side code.');
}

// ── 2. Has api/ come back? It should not exist at all. ────────────────────
const endpoints = [];
if (fs.existsSync('api')) {
  for (const f of fs.readdirSync('api')) {
    if (/\.(ts|js|mjs)$/.test(f)) endpoints.push('/api/' + f.replace(/\.(ts|js|mjs)$/, ''));
  }
}
if (endpoints.length) {
  console.log(`  note  ${endpoints.length} endpoint file(s) have appeared in api/. They were all deleted;`);
  console.log('        anything here now is new, and deploys as a serverless function the');
  console.log('        moment vercel.json stops declaring a static build:');
  for (const e of endpoints) console.log(`          ${e}`);
}

// ── 3. The only check that counts: what the deployment actually serves ─────
console.log('');
const probe = async (p) => {
  try {
    const res = await fetch(ORIGIN + p, { signal: AbortSignal.timeout(15000) });
    const ct = (res.headers.get('content-type') ?? '').split(';')[0];
    return { status: res.status, ct };
  } catch (e) {
    return { error: e.message };
  }
};

for (const p of endpoints.length ? endpoints : ['/api/health']) {
  const r = await probe(p);
  if (r.error) { console.log(`  note  ${p} — ${r.error}`); continue; }
  // A live function answers. A missing route 404s. An SPA fallback returns
  // text/html with a 200, which is neither and must not be read as "live".
  if (r.status === 200 && r.ct !== 'text/html') {
    bad(`${p} is LIVE (${r.status} ${r.ct}) — user requests transit infrastructure we operate`);
  } else if (r.status === 200) {
    ok(`${p} — SPA fallback, not a function`);
  } else {
    ok(`${p} — ${r.status}, not deployed`);
  }
}

// ── 4. No server directory sneaking in through the build ───────────────────
if (fs.existsSync('server')) {
  const listed = fs.readdirSync('server').filter((f) => /\.(ts|js|mjs)$/.test(f));
  if (listed.length) {
    failures++;
    console.log(`\n  FAIL  server/ has reappeared with ${listed.length} file(s).`);
    console.log('          It was deleted. Server-side code changes who answers for what');
    console.log('          users publish, and that is not a decision to make by adding a file.');
  }
}

console.log('');
if (failures) {
  console.log(`  ${failures} failure(s). Starcom operating server-side code changes who is`);
  console.log('  answerable for what users publish, and that is not a change anyone should');
  console.log('  make by editing a build config.\n');
  process.exit(1);
}
console.log('  No server surface. The browser signs, the browser transmits, and no');
console.log('  user content passes through infrastructure this project operates.\n');
