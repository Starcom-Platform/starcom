#!/usr/bin/env node
/**
 * @asserts Every guard and gate script in scripts/ is reachable from `npm run verify`, or is listed with a reason for not being.
 *
 * Guard script: gate coverage.
 *
 * Rule: every guard and gate script in this directory is either reachable from
 * `npm run verify`, or listed below with a reason.
 *
 * This exists because `gate-conformance.ts` was not in verify, and nothing
 * noticed for a full session. It is the only check that runs the PUBLISHED
 * vectors — the artifact other implementations build against — past every
 * consumer in this repo, so it is the one check that can catch a change which
 * is locally consistent and wrong on the wire. An edit turned a clean rejection
 * into an uncaught TypeError; the gate died mid-run instead of reporting; and
 * `npm run verify` stayed green the whole time, because it never ran it.
 *
 * A gate nothing runs is not a gate. It is a file that once had an opinion.
 *
 * When this first ran, 18 of 30 scripts were unreachable — including three more
 * gates and the guard that exists to stop secrets reaching the client bundle.
 * Writing a guard and forgetting to wire it in is evidently the normal outcome,
 * which is exactly the case for enforcing it mechanically rather than by
 * remembering.
 *
 * ─── WHY THE ALLOWLIST CANNOT GO STALE ─────────────────────────────────────
 *
 * An entry excluded because it CURRENTLY FAILS is a claim about the present,
 * and claims about the present rot. So this runs those scripts, and fails if
 * one of them now PASSES — at which point the excuse is spent and the script
 * belongs in the gate. The register cannot quietly become a list of things
 * nobody ever intends to fix.
 *
 * Entries excluded for infrastructure are not run: "needs a relay on
 * localhost:7447" is a statement about the machine, not about the code, and
 * running it here would just fail for the stated reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SCRIPTS = path.join(process.cwd(), 'scripts');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

/**
 * Scripts deliberately outside the gate, each with a reason.
 *
 * mode 'infrastructure' — needs something this machine may not have. Not run.
 * mode 'failing'        — excluded because it fails today. RUN, and if it
 *                         passes, this guard fails and tells you to wire it in.
 */
const ALLOWLIST = {
  'gate-federation.mjs': {
    mode: 'infrastructure',
    why: 'needs a relay on ws://localhost:7447; an integration gate, not a static check',
  },
  'gate-federation-peer.mjs': {
    mode: 'infrastructure',
    why: 'same local relay, plus a peer process to talk to',
  },
};

/** Every npm script command, with `npm run <alias>` expanded, recursively. */
function expand(cmd, depth = 0) {
  if (depth > 4 || !cmd) return cmd ?? '';
  return cmd.replace(/npm run (?:--silent )?([\w:-]+)/g, (m, alias) =>
    pkg.scripts[alias] ? expand(pkg.scripts[alias], depth + 1) : m);
}

/** Everything `npm run verify` ends up executing. */
function reachableFromVerify() {
  const verifySrc = fs.readFileSync(path.join(SCRIPTS, 'verify.mjs'), 'utf8');
  const aliases = [...verifySrc.matchAll(/'run',\s*'([\w:-]+)'/g)].map((m) => m[1]);
  return aliases.map((a) => expand(pkg.scripts[a] ?? '')).join('\n');
}

const files = fs.readdirSync(SCRIPTS).filter((f) => /^(guard|gate)-.*\.(mjs|ts)$/.test(f));
const reached = reachableFromVerify();
const problems = [];

const unreached = files.filter((f) => !reached.includes(f) && !ALLOWLIST[f]);
for (const f of unreached) {
  problems.push(`  scripts/${f} — not reachable from \`npm run verify\`, and not allowlisted.`);
}

// A stale excuse is worse than none: verify that "it fails" is still true.
for (const [file, entry] of Object.entries(ALLOWLIST)) {
  if (!fs.existsSync(path.join(SCRIPTS, file))) {
    problems.push(`  scripts/${file} — allowlisted here but no longer exists. Remove the entry.`);
    continue;
  }
  if (reached.includes(file)) {
    problems.push(`  scripts/${file} — allowlisted AND in verify. Remove the entry; it is covered.`);
    continue;
  }
  if (entry.mode !== 'failing') continue;
  const alias = Object.keys(pkg.scripts).find((k) => pkg.scripts[k]?.includes(file));
  if (!alias) continue;
  try {
    execSync(`npm run --silent ${alias}`, { stdio: 'ignore', timeout: 180_000 });
    problems.push(
      `  scripts/${file} — allowlisted as FAILING, but it passes now. `
      + 'The excuse is spent: wire it into verify and delete the entry.',
    );
  } catch {
    // Still failing, so the stated reason still holds.
  }
}

if (problems.length) {
  console.error(`\nGate-coverage guard FAILED — ${problems.length} problem(s).\n`);
  for (const p of problems) console.error(p);
  console.error(
    '\nA gate nothing runs is not a gate. Wire it into scripts/verify.mjs, or add it to'
    + '\nALLOWLIST in this file WITH a reason. An entry excluded for failing is re-run here,'
    + '\nso it cannot quietly become permanent.\n',
  );
  process.exit(1);
}

const allow = Object.keys(ALLOWLIST).length;
console.log(
  `Gate-coverage guard passed: ${files.length - allow} of ${files.length} guard/gate scripts `
  + `run in \`npm run verify\`; ${allow} allowlisted with a reason.`,
);
