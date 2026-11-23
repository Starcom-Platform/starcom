#!/usr/bin/env node
/**
 * @asserts Every relay address is written in the registry and nowhere else, and the published spec names the relays the app actually uses.
 *
 * HARD-CODED-RELAY GUARD
 *
 * src/config/publicInfrastructure.ts names each relay set the app dials — the
 * NAVCOM surface globe intel is read from and published to, the federation read
 * set that puts The Record first, the chat providers' set — and every file that
 * dials imports its set from there.
 *
 * Until 2026-09-19 that was not so. Fourteen files outside the registry wrote
 * relay addresses out for themselves, in seven different sets (counted with
 * `git grep` on the commit before this guard). The retired-relay guard catches a DEAD relay
 * being re-added, but not two live lists quietly disagreeing, and the node
 * descriptor, the claim CLI and the app were each free to name a different set
 * with nothing failing. The Record joining the globe's read set (D-F 4.5) was
 * blocked on exactly this, because "add it to the read set" meant finding every
 * copy of the read set.
 *
 * So: a quoted `wss://` address anywhere in src/, scripts/ or public/ outside
 * the registry fails the build. Quoted, because that is what code dials — a
 * usage line in a comment (`--relay wss://…`) names no relay. Tests are exempt:
 * they pin addresses on purpose, including this guard's own.
 *
 * And the interchange spec, which is what Navcom and Mecha Jono read to learn
 * where to listen, must list exactly the NAVCOM surface set. It is prose, so it
 * cannot import anything; this is how it stays true.
 *
 * Walks the filesystem rather than asking git, because the Vercel build has no
 * repository — a guard that read `git ls-files` took the deploy down once.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const REGISTRY = 'src/config/publicInfrastructure.ts';
const SPEC = 'docs/spec/starcom-navcom-interchange.spec.md';

/**
 * Written by the build, from the registry, and gitignored: publish-node-descriptor
 * reads FEDERATION_READ_RELAYS and puts it in both. Scanning them would fail the
 * second build on the output of the first.
 */
const GENERATED = new Set([
  'public/.well-known/nostr.json',
  'public/.well-known/starcom-node.json',
]);

const isTest = (rel) =>
  rel.split('/').includes('__tests__') || /\.(test|vitest)\.[cm]?[jt]sx?$/.test(rel);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    // Dot-directories are skipped, except public/.well-known: it is served, so
    // an address hand-written there reaches everyone who reads it.
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.([cm]?[jt]sx?|json)$/.test(entry.name)) yield full;
  }
}

const QUOTED_RELAY = /(['"`])(wss:\/\/[a-z0-9][^'"`\s]*)/gi;

/**
 * Harnesses that run the app against stand-in relays they answer themselves.
 * The addresses they type into the app are the stand-ins', which no build
 * dials; each is named here with why, as the publish guard names who may
 * publish.
 */
const STAND_IN_HARNESSES = {
  'scripts/lib/twoBrowserHarness.mjs': 'types stand-in team relay addresses into the app for check-chat and audit-intern, and answers every socket inside the script',
};

const violations = [];
for (const root of ['src', 'scripts', 'public'].filter((r) => existsSync(join(ROOT, r)))) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (rel === REGISTRY || GENERATED.has(rel) || isTest(rel) || rel in STAND_IN_HARNESSES) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(QUOTED_RELAY)) violations.push(`${rel}:${i + 1}  ${m[2]}`);
    });
  }
}

/*
 * Loaded, not pattern-matched: the sets are built from one another, and a
 * regex that read nothing would see no sets and pass.
 */
const require = createRequire(import.meta.url);
let loadedRegistry;
function registry() {
  if (loadedRegistry === undefined) {
    const { require: tsRequire } = require('tsx/cjs/api');
    loadedRegistry = tsRequire(join(ROOT, REGISTRY), import.meta.url);
  }
  return loadedRegistry;
}

/*
 * Every relay SET is read through publishTargets.ts (plan item 0.3). The
 * build's relay configuration (VITE_NOSTR_<CHANNEL>_RELAYS) is applied there,
 * so a service that imports its set from the registry directly is out of its
 * reach. Chat, federation and chat's emergency relays were, until this check.
 *
 * A set is an export that is a relay address or a list of them, read off the
 * loaded registry. The retired-relay record is a list of objects, not a set
 * anything dials.
 */
const THE_MODULE = 'src/services/nostr/publishTargets.ts';
const setProblems = [];
const setReads = [];
let relaySets = new Set();
try {
  const isRelay = (v) => typeof v === 'string' && /^wss?:\/\//.test(v);
  const isList = (v) => Array.isArray(v) && v.length > 0 && v.every(isRelay);
  // A map of relays to their read-only mirrors (RELAY_MIRRORS, D-MX MX27) is a set too: it is dialled.
  const isMirrorMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v).length > 0 && Object.values(v).every(isList);
  relaySets = new Set(Object.entries(registry())
    .filter(([, v]) => isRelay(v) || isList(v) || isMirrorMap(v))
    .map(([name]) => name));
} catch (error) {
  setProblems.push(`could not load ${REGISTRY} to learn which exports are relay sets: ${String(error).split('\n')[0]}`);
}
const REGISTRY_IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*config\/publicInfrastructure(?:\.[cm]?[jt]s)?['"]/g;
const NAMESPACE_IMPORT = /import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*config\/publicInfrastructure(?:\.[cm]?[jt]s)?['"]/;
if (existsSync(join(ROOT, 'src'))) {
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (rel === REGISTRY || rel === THE_MODULE || isTest(rel) || rel.endsWith('.json')) continue;
    const text = readFileSync(file, 'utf8');
    if (NAMESPACE_IMPORT.test(text)) setReads.push(`${rel}  * (a namespace import reaches every set)`);
    for (const m of text.matchAll(REGISTRY_IMPORT)) {
      if (m[1]) continue; // type-only: dials nothing
      const names = m[2].split(',')
        .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      for (const name of names) if (relaySets.has(name)) setReads.push(`${rel}  ${name}`);
    }
  }
}

/*
 * The spec's relay block against the registry's surface set.
 *
 * The registry is loaded, not pattern-matched: the sets are built from one
 * another, and a regex that read nothing would compare the spec against an
 * empty list and could only ever fail for the wrong reason — or, written the
 * other way round, pass.
 */
const specProblems = [];
/*
 * The premise here used to be that .vercelignore keeps docs/spec in the deploy
 * build, so an absent spec meant a moved or deleted one. A production deploy
 * disproved it: docs/* and *.md exclude the specs, `!docs/spec/**` did not
 * bring them back in that export, and this guard failed the build over a
 * document that is not a build input.
 *
 * Absent WITH a git repository is still a failure — locally the file must
 * exist, and passing on it would check nothing. Absent WITHOUT one is a deploy
 * export that was never given the file, which is a fact about the tree rather
 * than about the spec. The distinction is guard-untracked-imports'.
 */
const inDeployExport = !existsSync(join(ROOT, '.git'));
if (!existsSync(join(ROOT, SPEC)) && inDeployExport) {
  console.log('  Hard-coded-relay guard: no interchange spec in this tree (a deploy build export).');
  console.log('  The relay registry is still checked; the spec is checked by the local gate.\n');
} else if (!existsSync(join(ROOT, SPEC))) {
  specProblems.push(`${SPEC} is missing — the spec that tells outsiders where to listen`);
} else {
  let surface = [];
  // What the app reads beside what it publishes to: since interchange rev 11 the spec says what each relay is,
  // The Record among them, which the app reads and does not publish to. A relay the app dials neither way is
  // still refused, and every relay it publishes to must still be named.
  let read = [];
  try {
    surface = [...(registry().NAVCOM_SURFACE_RELAYS ?? [])];
    // A read-only mirror is read too, in its relay's place when that relay does not answer (D-MX, MX27).
    read = [...(registry().FEDERATION_READ_RELAYS ?? []), ...Object.values(registry().RELAY_MIRRORS ?? {}).flat()];
  } catch {
    // Reported below as a surface that cannot be read.
  }
  if (surface.length === 0) {
    specProblems.push(`could not read NAVCOM_SURFACE_RELAYS from ${REGISTRY} — refusing to compare the spec against nothing`);
  } else {
    const named = [...new Set([...readFileSync(join(ROOT, SPEC), 'utf8').matchAll(/wss:\/\/[a-z0-9][^\s'"`)<>]*/gi)].map((m) => m[0]))];
    for (const url of named.filter((u) => !surface.includes(u) && !read.includes(u))) specProblems.push(`${SPEC} names ${url}, which the app neither publishes to (NAVCOM_SURFACE_RELAYS) nor reads (FEDERATION_READ_RELAYS, RELAY_MIRRORS)`);
    for (const url of surface.filter((u) => !named.includes(u))) specProblems.push(`${SPEC} omits ${url}, which NAVCOM_SURFACE_RELAYS dials`);
  }
}

if (violations.length === 0 && specProblems.length === 0 && setProblems.length === 0 && setReads.length === 0) {
  console.log('  Hard-coded-relay guard: every relay address is read from the registry, every relay set through publishTargets, and the spec agrees with it.');
  process.exit(0);
}

if (violations.length > 0) {
  console.error(`\n  ${violations.length} relay address(es) written outside ${REGISTRY}:\n`);
  for (const v of violations) console.error(`    ${v}`);
  console.error(`\n  Import the set from ${REGISTRY} instead — NAVCOM_SURFACE_RELAYS, FEDERATION_READ_RELAYS,`);
  console.error('  THE_RECORD_RELAY, EXTRA_PUBLIC_RELAYS or CHAT_PROVIDER_RELAYS, or a new named set there.');
  console.error('  Scripts under plain node read them through scripts/lib/relayRegistry.mjs.\n');
}
if (setReads.length > 0 || setProblems.length > 0) {
  if (setReads.length > 0) {
    console.error(`\n  ${setReads.length} relay set(s) read from the registry outside ${THE_MODULE}:\n`);
    for (const r of setReads) console.error(`    ${r}`);
    console.error(`\n  Read it through ${THE_MODULE}: publishRelays(channel), readRelays(channel),`);
    console.error('  or a named function there, so the build\'s relay configuration reaches it.\n');
  }
  for (const p of setProblems) console.error(`\n  ${p}\n`);
}
if (specProblems.length > 0) {
  console.error('\n  The interchange spec disagrees with the relays the app dials:\n');
  for (const p of specProblems) console.error(`    ${p}`);
  console.error('\n  Outsiders listen where the spec says. Change the spec and the registry together.\n');
}
process.exit(1);
