#!/usr/bin/env node
/**
 * Publishes what this project checks about itself, derived rather than written.
 *
 * ─── WHY THIS IS PUBLISHED AT ALL ──────────────────────────────────────────
 *
 * /.well-known/security-policy.md asks outsiders for one thing in particular:
 * evidence that "a claim we make about our own behaviour is false". That
 * invitation is close to useless without a list of the claims. A reader who
 * wants to test us has to first reverse-engineer what we think we enforce.
 *
 * The node descriptor also now tells peers that every guard this project rests
 * on runs locally before a commit, because Actions do not execute here. That
 * sentence is unbacked unless the guards are enumerable and their wiring is
 * checkable. This file is what makes it checkable.
 *
 * ─── WHY IT IS GENERATED, AND WHAT WOULD HAPPEN IF IT WERE NOT ─────────────
 *
 * A hand-written register of guards is precisely the artefact this repository
 * has caught lying three separate times: a document describing what connects to
 * what, drifting from the thing it describes, while continuing to read as
 * authoritative. It would be worse here than usual, because a stale list of
 * self-checks overstates our rigour to exactly the people we asked to audit it.
 *
 * So every field comes from the source:
 *
 *   the guards       scripts/guard-*.mjs, by glob
 *   what each does   its own `@asserts` line, which is why that line is
 *                    mandatory and this script fails without it
 *   what runs        the npm script graph, resolved from verify.mjs's own steps
 *                    rather than from a list of step names kept here
 *   what does not    guard-gate-coverage's allowlist, with its stated reason
 *
 * Nothing below is a claim this file makes. Every one is a claim the repository
 * already makes, read back out.
 *
 * Usage: node scripts/publish-guard-manifest.mjs
 * Exit:  0 written · 1 a guard has no @asserts, or the allowlist could not be read
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPTS = path.join(ROOT, 'scripts');
const OUT = path.join(ROOT, 'public/.well-known/starcom-guards.json');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
/*
 * Guards AND gates.
 *
 * The first version of this globbed guard-*.mjs only, while calling itself
 * "What this project checks about itself" — which excluded five gates,
 * including the one that proves published vectors match the consumers we ship.
 * A register that reads as complete and is not is the failure this file exists
 * to prevent, so the omission was not a smaller version of the document; it was
 * the same defect in it.
 */
const guards = fs.readdirSync(SCRIPTS)
  .filter((f) => /^(guard|gate)-.*\.(mjs|ts)$/.test(f))
  .sort();

if (guards.length === 0) {
  console.error('  No guard scripts found. Refusing to publish a manifest claiming there are none.');
  process.exit(1);
}

/*
 * The verify steps, read out of verify.mjs rather than named here.
 *
 * Keeping the names here would recreate the drift this whole file exists to
 * avoid: someone adds a step to verify and this manifest keeps reporting the
 * old wiring, confidently.
 */
const verifySrc = fs.readFileSync(path.join(SCRIPTS, 'verify.mjs'), 'utf8');
const verifySteps = [...verifySrc.matchAll(/args:\s*\[\s*'run',\s*'([^']+)'/g)].map((m) => m[1]);
if (verifySteps.length === 0) {
  console.error('  Could not read any steps out of verify.mjs. Refusing to guess at what runs.');
  process.exit(1);
}

/** Every npm script reachable from the verify steps, following `npm run` chains. */
const reachableScripts = (() => {
  const seen = new Set();
  const walk = (name) => {
    if (!pkg[name] || seen.has(name)) return;
    seen.add(name);
    /*
     * Flags are skipped before the alias. The first version matched
     * `npm run ([\w:.-]+)` and captured `--silent` out of
     * `npm run --silent gate:commons`, so the chain stopped there and the
     * manifest published gate-commons.ts as running nowhere — while it runs in
     * every verify. guard-gate-coverage, which had the flag handled, disagreed;
     * it was right. A register that understates our checks is still a register
     * that is wrong about them.
     */
    for (const m of pkg[name].matchAll(/npm run\s+(?:--\S+\s+)*([\w:.-]+)/g)) walk(m[1]);
  };
  verifySteps.forEach(walk);
  return [...seen];
})();

/** The allowlist in guard-gate-coverage: scripts outside the gate, each with a reason. */
const allowlist = (() => {
  const src = fs.readFileSync(path.join(SCRIPTS, 'guard-gate-coverage.mjs'), 'utf8');
  const block = src.slice(src.indexOf('const ALLOWLIST = {'));
  const out = {};
  /*
   * `why` is written as concatenated string literals across several lines, so a
   * regex that stops at the first closing quote captures a fragment ending
   * mid-sentence — which reads as a complete reason and is not one. The whole
   * expression is captured and its literals rejoined.
   */
  const re = /'([\w.-]+\.mjs)':\s*\{\s*mode:\s*'([^']+)',\s*why:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/g;
  for (const m of block.matchAll(re)) {
    const why = [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((q) => q[1]).join('');
    out[m[1]] = { mode: m[2], why };
  }
  return out;
})();
if (Object.keys(allowlist).length === 0) {
  console.error('  Read no entries from guard-gate-coverage\'s allowlist. That register is not empty,');
  console.error('  so this is a parse failure — publishing "nothing is excluded" would be a lie.');
  process.exit(1);
}

const KIND = (f) => (f.startsWith('gate-') ? 'gate' : 'guard');

const missing = [];
const entries = guards.map((file) => {
  const src = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
  const m = src.match(/@asserts\s+(.+)/);
  if (!m) { missing.push(file); return null; }

  const reachableFrom = reachableScripts.filter((s) => pkg[s]?.includes(file));
  const excluded = allowlist[file];

  return {
    script: `scripts/${file}`,
    kind: KIND(file),
    asserts: m[1].trim(),
    runsBeforeEveryCommit: reachableFrom.length > 0,
    reachableFrom,
    ...(excluded ? { outsideTheGate: excluded } : {}),
  };
}).filter(Boolean);

if (missing.length) {
  console.error(`  ${missing.length} guard(s) carry no @asserts line:\n`);
  for (const f of missing) console.error(`    scripts/${f}`);
  console.error('\n  A guard nobody can state the purpose of cannot be audited by anyone outside');
  console.error('  this repository. Add one sentence saying what it asserts.');
  process.exit(1);
}

/*
 * An entry that runs nowhere AND has no allowlist reason is not a finding this
 * file gets to publish quietly — guard-gate-coverage enforces exactly that
 * condition and would have failed the build first. So the two disagree, and one
 * of them is wrong about what this repository runs.
 *
 * It happened on the first version: the reachability walk here captured
 * `--silent` as a script name and reported gate-commons.ts as dead, which was
 * published before the disagreement was noticed. Failing is how it gets noticed
 * next time.
 */
const unexplained = entries.filter((e) => !e.runsBeforeEveryCommit && !e.outsideTheGate);
if (unexplained.length) {
  console.error('  These run nowhere and carry no allowlist reason:\n');
  for (const e of unexplained) console.error(`    ${e.script}`);
  console.error('\n  guard-gate-coverage enforces the same rule and passed, so this script and');
  console.error('  that one disagree about what `npm run verify` executes. Fix the disagreement');
  console.error('  rather than publishing a register that contradicts the guard.');
  process.exit(1);
}

const manifest = {
  node: 'starcom',
  document: 'What this project checks about itself',
  why:
    'security-policy.md asks outsiders for evidence that a claim we make about our own behaviour is false. That invitation is close to useless without the list of claims, so here it is.',
  generated:
    'Derived at build time from scripts/guard-*.mjs, each guard\'s own @asserts line, and the npm script graph resolved from verify.mjs. Nothing here is hand-maintained; a guard added or removed changes this file without anyone editing it.',
  howToCheck:
    'Clone the repository and run `npm run verify`. Every assertion below is a script you can read and run yourself — the point of publishing it is that you do not have to take the assertion on trust.',
  continuousIntegration: {
    runs: false,
    why:
      'GitHub Actions do not execute on this repository — 79 startup failures against 2 successes. Guards run locally, before a commit. Stated because "we have 27 automated checks" would otherwise imply something automatic is running them.',
  },
  what: {
    guard: 'A static check over the repository: something that must be true of the source, the bundle, or the published documents.',
    gate: 'An end-to-end check that runs the real thing — published vectors past the consumers we ship, or two instances over a real relay.',
  },
  count: entries.length,
  guards_: entries.filter((e) => e.kind === 'guard').length,
  gates_: entries.filter((e) => e.kind === 'gate').length,
  inGate: entries.filter((e) => e.runsBeforeEveryCommit).length,
  guards: entries,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');

const out = entries.filter((e) => !e.runsBeforeEveryCommit);
console.log(`  Guard manifest: ${entries.length} guards, ${manifest.inGate} in the gate.`);
for (const e of out) {
  console.log(`    outside the gate — ${e.script}${e.outsideTheGate ? ` (${e.outsideTheGate.mode}: ${e.outsideTheGate.why})` : ' — NOT allowlisted'}`);
}
