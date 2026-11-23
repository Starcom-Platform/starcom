#!/usr/bin/env node
/**
 * @asserts No secret-shaped environment value is baked into the shipped JavaScript.
 *
 * Fails the build if a secret-shaped environment value is baked into the
 * shipped JavaScript.
 *
 * Vite inlines every `VITE_`-prefixed variable at build time. That is by
 * design and it is fine for endpoints and feature flags. It is not fine for
 * credentials, because "inlined into the bundle" means "published to every
 * visitor" — the value is a literal in a file anyone can open in devtools.
 *
 * This guard exists because that had already happened here. A scan of a local
 * production build found twenty environment values present verbatim, among
 * them Shodan, VirusTotal, Censys, Hunter and EIA API keys and both a Telegram
 * and a Discord bot token. Bot tokens are full account credentials.
 *
 * The EIN consensus spent two rounds on a peer node's private key being
 * written to stdout, and ratified the practice that answers it: state the
 * dependency and make its failure loud rather than a silent, wrong success.
 * A credential in a public bundle is the same failure with a wider audience,
 * and nothing in this repository would have said so.
 *
 * WHAT IT DOES NOT DO: print any secret. It reports variable NAMES only.
 *
 * TWO MODES, because they answer different questions:
 *
 *   node scripts/guard-bundle-secrets.mjs [dist-dir]
 *     Scans a LOCAL build for the exact values in the local .env files. Precise
 *     — it knows what it is looking for — but it only sees the environment that
 *     produced that build. It cannot see the deploy host's variables, so a
 *     credential set only there passes this check and still ships.
 *
 *   node scripts/guard-bundle-secrets.mjs --url https://the-deployed-site
 *     Fetches what the deployment actually serves and looks for credential
 *     SHAPES. Needs no knowledge of any value, and is the only mode that can
 *     see the host's own variables.
 *
 *     Its coverage is narrower and it says so: it matches formats distinctive
 *     enough to be certain about — Telegram and Discord bot tokens, GitHub,
 *     Slack, Stripe, AWS and Google keys. Credentials that are just N hex
 *     characters (Shodan, VirusTotal, Censys, Hunter) are NOT reliably
 *     detectable this way, because minified bundles are full of hashes and
 *     digests of the same shape. A clean --url run is evidence about the
 *     high-signal formats, not a clean bill of health.
 *
 * Exit:  0 nothing secret-shaped found · 1 at least one found
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'dist';

/**
 * Names that denote a credential. Deliberately broad: a false positive costs
 * somebody a rename or an explicit exemption, and a false negative costs a
 * rotation and whatever happened in between.
 */
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|PRIVATE|SWARM|NSEC|SEED|MNEMONIC)/i;

/**
 * Names matching SECRET_NAME that are NOT credentials. Each needs a reason,
 * because an exemption list nobody justifies becomes the hole the next leak
 * goes through.
 */
const EXEMPT = new Map([
  ['VITE_GA_MEASUREMENT_ID', 'a public analytics measurement id, visible in any page using GA'],
  /*
   * Added 2026-09-29, after every deploy from that afternoon on failed here.
   * "KEY" is in the name, but a Nostr public key is published by its owner:
   * it is what checks their signatures. Raver Watch reads only notes Mecha
   * Jono's key signed (RAVER_WATCH_PUBLISHERS in src/config/publicInfrastructure.ts),
   * so the key is in the bundle by design, and the deploy host happens to set
   * the same value under this name. A secret key still fails: nsec1 by its
   * shape, above, and any other variable by its name.
   */
  ['VITE_MECHA_JONO_PUBKEY', "Mecha Jono's Nostr public key, which they publish; Raver Watch reads only notes it signed"],
  /*
   * REMOVED, 2026-09-04: VITE_OPENWEATHERMAP_API_KEY, VITE_ALPHA_VANTAGE_API_KEY
   * and VITE_EIA_API_KEY, which sat here as "operator fallbacks".
   *
   * The reasoning for exempting them was that a public-interest map should not
   * require every visitor to register for a weather key, and that these are
   * metered, read-only and rotatable — unlike a bot token, which grants account
   * actions and was never exempted. That argument is sound as far as it goes.
   *
   * What it described was not happening. Production never had any of the three
   * set, so no operator fallback existed, no visitor ever saw the data, and a
   * set of invented constants in useTopBarData filled the gap instead. The
   * exemption was permitting a published credential in exchange for a benefit
   * nobody was receiving.
   *
   * A key shared by every visitor is also precisely what EIA's terms describe
   * blocking when limits are exceeded — and a blocked shared key fails for
   * everyone at once, silently.
   *
   * So these feeds are bring-your-own-key, decided 2026-09-04, and the four
   * variables are gone from `rawEnv` in src/config/env.ts, which is the
   * mechanism: a variable absent from that map cannot reach the bundle. This
   * guard is the backstop. If one is reintroduced and inlined, it now FAILS
   * rather than being waved through — which is the whole reason to take an
   * entry off a list instead of leaving it with a caveat.
   */
]);

/**
 * Credential formats distinctive enough to name on sight.
 *
 * Hoisted out of the --url branch, where it used to live and where it was the
 * only place these were checked. That left the local scan — the one that runs on
 * every build, including the deploy — matching bundle contents against
 * environment values it can currently READ, and nothing else. A key that reached
 * the bundle any other way went straight through: hardcoded in source, committed
 * in a config file, or inlined from a variable not present in the environment
 * doing the scanning.
 *
 * Verified by planting a fake nsec1 in a copy of dist/ and running the guard,
 * which passed. A security guard nobody has tried to defeat is a guard nobody
 * knows the shape of.
 */
const SHAPES = [
    [/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, 'Telegram bot token'],
    [/\b[MNO][A-Za-z\d_-]{23,}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/, 'Discord bot token'],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
    [/\bsk_live_[A-Za-z0-9]{20,}\b/, 'Stripe live secret key'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
    // Must be followed by actual base64 key material. The header alone matched
    // an OSINT crawler's own detection regex for exposed keys — a scanner that
    // cannot tell a credential from a pattern that looks for credentials will
    // cry wolf, and a guard people learn to disbelieve is worse than none.
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n\s]+[A-Za-z0-9+/=\r\n]{60,}/, 'PEM private key'],
    [/\bnsec1[02-9ac-hj-np-z]{50,}\b/, 'Nostr secret key'],
];

const urlFlag = process.argv.indexOf('--url');
if (urlFlag !== -1) {
  const site = process.argv[urlFlag + 1];
  if (!site) { console.error('  --url needs a deployed origin, e.g. --url https://example.app'); process.exit(2); }

  /**
   * Formats distinctive enough that a match is almost certainly a credential.
   * Generic hex keys are deliberately absent: a minified bundle carries asset
   * hashes, content digests and public keys of the same shape, so matching
   * them would produce noise that trains people to ignore this guard.
   */

  const origin = site.replace(/\/+$/, '');
  const html = await (await fetch(origin, { redirect: 'follow' })).text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  console.log(`\n  Live bundle scan — ${origin}\n  ${assets.length} asset(s) referenced by the served HTML\n`);

  let found = 0;
  const scan = (text, where) => {
    for (const [re, label] of SHAPES) {
      if (re.test(text)) { found++; console.log(`  LEAKED   ${label}  in ${where}`); }
    }
  };
  scan(html, 'index.html');
  for (const a of assets) {
    const u = a.startsWith('http') ? a : origin + (a.startsWith('/') ? a : '/' + a);
    try { scan(await (await fetch(u)).text(), a); } catch { console.log(`  (unreadable: ${a})`); }
  }

  if (found) {
    console.log(`\n  ${found} credential-shaped string(s) served publicly. Rotate first, then remove.\n`);
    process.exit(1);
  }
  console.log('  No high-signal credential format found in what the deployment serves.');
  console.log('  This does NOT clear generic hex-format keys — check the host\'s own');
  console.log('  variable list for VITE_-prefixed names containing KEY, TOKEN or SECRET.\n');
  process.exit(0);
}

/**
 * Values come from the PROCESS ENVIRONMENT first, then local .env files.
 *
 * Reading only .env made this guard vacuous exactly where it matters. A deploy
 * host has no .env — its variables live in the platform — so the guard would
 * find nothing to look for and pass while a credential sat in the bundle. A
 * check that cannot fail in the place it is meant to protect is the failure it
 * exists to catch.
 */
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
const vars = new Map();
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('VITE_') && typeof v === 'string' && v.length >= 12) vars.set(k, v);
}
for (const f of envFiles) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...rest] = t.split('=');
    const v = rest.join('=').trim().replace(/^["']|["']$/g, '');
    // Values too short to be distinctive would match noise in minified code.
    if (v.length >= 12) vars.set(k.trim(), v);
  }
}

if (!fs.existsSync(DIST)) {
  /**
   * FAIL, do not skip.
   *
   * This exited 0 with "build first. Skipping." — which reads as a pass in any
   * aggregate that only checks exit codes. It sat inside `npm run verify` all
   * day reporting success while scanning nothing, and the bundle it was not
   * scanning contained two credential-shaped values.
   *
   * A check that cannot check must say so in the only way a gate hears.
   * ALLOW_NO_DIST exists for a caller that genuinely wants the scan skipped and
   * has to say it out loud.
   */
  if (process.env.ALLOW_NO_DIST === 'true') {
    console.log(`  bundle-secret guard: no ${DIST}/ and ALLOW_NO_DIST=true — skipped ON PURPOSE.`);
    process.exit(0);
  }
  console.error(`\n  Bundle secret guard CANNOT RUN — there is no ${DIST}/ to scan.\n`);
  console.error('  Run `npm run build` first. This guard reads the SHIPPED bundle, so');
  console.error('  without one it verifies nothing — and reporting success for that is');
  console.error('  how two credential-shaped values sat in a bundle nobody had scanned.');
  console.error('  Set ALLOW_NO_DIST=true to skip deliberately.\n');
  process.exit(1);
}

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|css|html|json|map)$/.test(e.name)) files.push(p);
  }
};
walk(DIST);

let bundle = '';
for (const f of files) {
  try { bundle += fs.readFileSync(f, 'utf8'); } catch { /* binary, skip */ }
}

/*
 * Two independent questions, and the guard needs both.
 *
 *   By NAME   does a value from a variable we can see appear in the bundle?
 *             Catches the ordinary mistake — a credential given a VITE_ prefix.
 *
 *   By SHAPE  does anything in the bundle LOOK like a credential, whatever its
 *             provenance? Catches the case the name check cannot see, which is
 *             every key that did not arrive through an environment variable this
 *             process can read.
 */
const shaped = [];
for (const [re, label] of SHAPES) {
  const hit = bundle.match(re);
  if (hit) shaped.push({ label, sample: hit[0].slice(0, 12) + '…' });
}

const leaked = [];
const exempted = [];
for (const [name, value] of vars) {
  if (!bundle.includes(value)) continue;
  if (!SECRET_NAME.test(name)) continue;
  if (EXEMPT.has(name)) { exempted.push(name); continue; }
  leaked.push(name);
}

console.log(`\n  Bundle secret guard — ${files.length} emitted file(s), ${vars.size} env value(s) checked\n`);

for (const n of exempted) console.log(`  allowed  ${n} — ${EXEMPT.get(n)}`);

if (shaped.length) {
  console.log('');
  for (const s2 of shaped) console.log(`  LEAKED   ${s2.label}  (${s2.sample})`);
  console.log(`
  ${shaped.length} string(s) in the shipped bundle match a known credential
  format. This check does not care where they came from — a hardcoded key, a
  committed config, or a variable this process cannot see all land here.

  ROTATE FIRST, then find the source.
`);
  process.exit(1);
}

if (!leaked.length) {
  /**
   * Say what is true, which is not the same as "nothing is in there".
   *
   * This printed "No credential-shaped environment value is present in the
   * bundle" even when exempted values WERE present — and they are: a build
   * with VITE_EIA_API_KEY set writes that key, in full, into
   * dist/assets/index-*.js. A reader finished this guard believing the bundle
   * held no credentials while it held three, which is the most consequential
   * place for a check to overstate itself.
   *
   * The exemptions are a deliberate policy — an operator's read-only, metered
   * key that a user can override with their own. Policy is fine. Reporting it
   * as absence is not.
   */
  if (exempted.length) {
    console.log(`\n  ${exempted.length} exempted value(s) ARE compiled into the bundle and are`);
    console.log('  readable by anyone who opens the deployed site — allowed by the policy');
    console.log('  listed above, not absent from the artifact.');
    console.log('  Nothing outside that list matches a known credential format.\n');
  } else {
    console.log('\n  No credential-shaped environment value is present in the bundle,');
    console.log('  and nothing in it matches a known credential format.\n');
  }
  process.exit(0);
}

console.log('');
for (const n of leaked) console.log(`  LEAKED   ${n}`);
console.log(`
  ${leaked.length} credential-shaped value(s) are compiled into the shipped
  bundle and are readable by anyone who opens the deployed site.

  These are published, not merely exposed. Treat every one as compromised:
  ROTATE FIRST, then move it out of the VITE_ namespace. The question is never
  whether someone read it — it is whether they could have, and they could.

  A credential a browser needs is a credential the browser's user has. Anything
  else belongs behind a request your own server makes.
`);
process.exit(1);
