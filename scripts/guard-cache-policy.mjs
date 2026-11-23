#!/usr/bin/env node
/**
 * The cache headers in vercel.json must stay true about the files they cover.
 *
 * ─── WHY THIS IS A GUARD AND NOT A COMMENT IN vercel.json ──────────────────
 *
 * vercel.json is strict JSON and cannot hold the reasoning, and a doc
 * describing a caching policy is exactly the kind of artefact that goes stale
 * and starts lying. The policy rests on one checkable fact, so it is checked.
 *
 * `immutable` tells every browser and every CDN never to revalidate for a
 * year. That is correct for a content-hashed filename, because changing the
 * bytes changes the URL and nobody is holding the old one by accident. It is
 * catastrophic for a stable filename: a bad deploy becomes unrecallable for a
 * year on every machine that fetched it.
 *
 * So the invariant is: everything an immutable rule matches must carry a
 * content hash. Today that is 102 files under /assets and zero exceptions. If
 * someone drops an unhashed script there, this fails before it ships rather
 * than a year after.
 *
 * ─── AND THE SERVICE WORKER, SEPARATELY ────────────────────────────────────
 *
 * /sw.js decides what every subsequent visit sees. An immutable service worker
 * is the single worst thing on this list: the site cannot be updated at all
 * afterwards, because the thing serving the stale files is itself stale.
 *
 * Usage:
 *   node scripts/guard-cache-policy.mjs [dist-dir]
 *   ALLOW_NO_DIST=true node scripts/guard-cache-policy.mjs   (source-only checks)
 *
 * @asserts vercel.json never marks an unhashed asset immutable, and never
 *          marks the service worker cacheable.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const CONFIG = 'vercel.json';

const problems = [];
const note = (m) => problems.push(m);

/**
 * Translate a Vercel `source` into a RegExp — but only the subset this repo
 * actually uses: literal path text plus `(.*)` wildcards.
 *
 * Returns null for anything else. A guard that guessed at path-to-regexp's
 * full grammar would quietly stop matching the rule it was meant to police,
 * and report success while checking nothing.
 */
function toRegExp(source) {
  if (typeof source !== 'string' || !source.startsWith('/')) return null;
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('(.*)', i)) { out += '.*'; i += 4; continue; }
    const ch = source[i];
    if ('()[]{}?+*|^$\\'.includes(ch)) return null;  // grammar we do not model
    out += ch === '.' ? '\\.' : ch;
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

/** Vite's content hash: `name-HASH.ext`, base64url, 8 or more characters. */
const isContentHashed = (file) => /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(path.basename(file));

const cacheControlOf = (rule) => (rule.headers ?? [])
  .filter((h) => String(h.key).toLowerCase() === 'cache-control')
  .map((h) => String(h.value))
  .join('; ');

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const rules = config.headers ?? [];

const immutableRules = rules.filter((r) => /\bimmutable\b/.test(cacheControlOf(r)));

// ── 1. Every immutable rule must be one we can actually evaluate ────────────
const matchers = [];
for (const rule of immutableRules) {
  const re = toRegExp(rule.source);
  if (!re) {
    note(`vercel.json marks "${rule.source}" immutable, and this guard cannot translate that `
      + 'pattern. Refusing rather than assuming it is safe — either simplify the pattern or '
      + 'teach toRegExp() the syntax.');
    continue;
  }
  matchers.push({ source: rule.source, re });
}

// ── 2. The service worker must never be held ────────────────────────────────
const SW = '/sw.js';
for (const { source, re } of matchers) {
  if (re.test(SW)) {
    note(`"${source}" marks ${SW} immutable. A cached service worker cannot be replaced, so the `
      + 'site would be stuck on this build permanently. This is the one file that must always '
      + 'revalidate.');
  }
}
const swRule = rules.find((r) => r.source === SW);
if (!swRule) {
  note(`vercel.json has no explicit rule for ${SW}. It currently relies on a platform default; `
    + 'state it, so a later broad rule cannot silently capture it.');
} else if (!/max-age=0|no-store|no-cache/.test(cacheControlOf(swRule))) {
  note(`${SW} is served as "${cacheControlOf(swRule)}" — it must revalidate on every load.`);
}

// And it must change with each build: the data it keeps is checked once per
// build, against the build stamped into it (stamp-service-worker.mjs).
const builtWorker = path.join(DIST, 'sw.js');
if (fs.existsSync(builtWorker) && fs.readFileSync(builtWorker, 'utf8').includes("'__STARCOM_BUILD__'")) {
  note(`${builtWorker} was never stamped with its build. Every build would ship the same worker, the browser `
    + 'would never install a new one, and the data it keeps would never be checked again.');
}

// ── 3. Everything an immutable rule matches must be content-hashed ──────────
if (!fs.existsSync(DIST)) {
  if (process.env.ALLOW_NO_DIST === 'true') {
    console.log(`  No ${DIST}/ and ALLOW_NO_DIST=true — the vercel.json checks above ran;`);
    console.log('  the hashed-filename check did not. Run after a build for the full guard.');
  } else {
    console.error(`\n  CACHE POLICY GUARD: no ${DIST}/ to check against.`);
    console.error('  immutable is only safe if the files it covers are content-hashed, and that');
    console.error('  cannot be verified without the build output. Build first, or set');
    console.error('  ALLOW_NO_DIST=true to run only the config checks.\n');
    process.exit(2);
  }
} else {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
  const files = walk(DIST).map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/'));

  let covered = 0;
  for (const { source, re } of matchers) {
    const hits = files.filter((f) => re.test(f));
    covered += hits.length;
    const unhashed = hits.filter((f) => !isContentHashed(f));
    if (unhashed.length) {
      note(`"${source}" is immutable and matches ${unhashed.length} file(s) with no content hash `
        + `in the name, so a change to them could never reach anyone who had already loaded the `
        + `old bytes:\n      ${unhashed.slice(0, 8).join('\n      ')}`
        + (unhashed.length > 8 ? `\n      …and ${unhashed.length - 8} more` : ''));
    }
  }

  if (matchers.length && covered === 0) {
    note('Every immutable rule matched zero files in the build. Either the patterns are wrong or '
      + 'the output moved — a rule that matches nothing is not protecting anything, and reads as '
      + 'though it is.');
  }

  if (!problems.length) {
    console.log('\n  CACHE POLICY GUARD\n');
    console.log(`  ${matchers.length} immutable rule(s) cover ${covered} file(s) in ${DIST}/,`);
    console.log('  every one of them content-hashed. The service worker revalidates.\n');
  }
}

if (problems.length) {
  console.error('\n  CACHE POLICY GUARD FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}
