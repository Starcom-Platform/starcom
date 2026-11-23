#!/usr/bin/env node
/**
 * Prove that a test actually catches the bug it names.
 *
 *   npm run prove -- <test file> [--against <git ref>]
 *
 * Runs the test against the CURRENT code (expects pass), then puts the source
 * files back the way they were at <ref> and runs it again (expects FAIL), then
 * restores. A test that passes both ways proves nothing: it is green because it
 * is green, not because the fix works.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * This repository keeps producing tests that assert their own fixture. A test
 * titled "reports uncontested when there is nothing to weigh" returned before
 * the code it named ever ran. A test for a self-echo guard supplied the very
 * key production got wrong, so it validated the fixture and not the wiring. A
 * replacement for a flaky confidence check used a no-op JSON replacer and was
 * strictly weaker than what it replaced. Every one of them was green.
 *
 * The difference between a test that catches a bug and one that does not is a
 * single command, and it was skipped every time because it was tedious: copy
 * the file aside, revert it, run, restore. Ninety seconds by hand, three
 * seconds here. That gap is the whole reason the discipline did not hold.
 *
 * Nothing is lost if this is interrupted: every touched file is copied to a
 * temp directory first and restored in a `finally`, including files that did
 * not exist at <ref> and have to be deleted for the run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const testFile = argv.find((a) => !a.startsWith('--'));
const againstIdx = argv.indexOf('--against');
const ref = againstIdx >= 0 ? argv[againstIdx + 1] : 'HEAD~1';

if (!testFile) {
  console.error('Usage: npm run prove -- <test file> [--against <git ref>]');
  console.error('Example: npm run prove -- src/services/foo/__tests__/bar.test.ts --against HEAD~1');
  process.exit(2);
}
if (!fs.existsSync(testFile)) {
  console.error(`No such test file: ${testFile}`);
  process.exit(2);
}

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
/**
 * Run the test once.
 *
 * The timeout is not a nicety. A defect whose symptom is an infinite render
 * loop does not make vitest FAIL — it makes vitest never return, because the
 * loop blocks the event loop that vitest's own per-test timeout runs on. This
 * tool then hung forever with the tree still reverted, which is the worst
 * state it can be in: uncommitted work sitting only in a temp directory.
 *
 * Found by using it, on exactly that bug — TimeScrubber publishing a clock-
 * derived range on every render.
 *
 * A hang is reported separately from a failure because they mean different
 * things to a reader, but both count as "does not pass".
 */
const TIMEOUT_MS = Number(process.env.PROVE_TIMEOUT_MS ?? 180000);
const runTest = () => {
  const r = spawnSync('npx', ['vitest', 'run', testFile], {
    encoding: 'utf8', stdio: 'pipe', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal !== null);
  return { passed: !timedOut && r.status === 0, timedOut };
};

/**
 * The source files to put back — everything that changed since <ref> except
 * tests. Reverting the test too would just run the OLD test against the OLD
 * code, which is a tautology, not a proof.
 */
const isTest = (f) => /(__tests__|\.test\.|\.spec\.|setupVitest)/.test(f);
let changed;
try {
  /**
   * Tracked changes AND untracked files.
   *
   * `git diff --name-only` lists neither untracked files nor their absence at
   * <ref>, so a test whose SUBJECT is a brand-new module was never reverted —
   * the module stayed on disk, the test passed both ways, and this tool
   * reported NOT PROVEN for a change it had simply failed to undo. A
   * verification instrument that quietly checks nothing is worse than none,
   * which is the same defect this repo just fixed in guard-bundle-secrets.
   *
   * Found by using it: a new selector module came back NOT PROVEN, and the
   * reason was here rather than in the test.
   */
  const tracked = sh(`git diff --name-only ${ref} -- src scripts public`).split('\n');
  const untracked = sh('git ls-files --others --exclude-standard -- src scripts public').split('\n');
  changed = [...new Set([...tracked, ...untracked])]
    .filter(Boolean)
    .filter((f) => !isTest(f))
    // Files only. `desktop` is a submodule and shows up as a single path — a
    // gitlink, not a blob — and reverting it here would mean checking out
    // another repository, which is not this tool's job. Found by running it:
    // fs.rmSync refused to remove a directory, and the finally restored the
    // tree cleanly on the way out, which is what that block is for.
    .filter((f) => !fs.existsSync(f) || fs.statSync(f).isFile());
} catch {
  console.error(`Cannot diff against "${ref}". Is it a valid git ref?`);
  process.exit(2);
}

if (changed.length === 0) {
  console.error(`Nothing but tests changed since ${ref}, so there is no fix to prove.`);
  process.exit(2);
}

console.log(`\nProving ${testFile}`);
console.log(`  against ${ref} — ${changed.length} source file(s) will be temporarily reverted:`);
for (const f of changed.slice(0, 12)) console.log(`    ${f}`);
if (changed.length > 12) console.log(`    …and ${changed.length - 12} more`);

console.log('\n1. Current code…');
const now = runTest();
console.log(`   ${now.passed ? 'PASS — as it should'
  : now.timedOut ? `HANG — no result in ${TIMEOUT_MS / 1000}s`
  : 'FAIL — the test does not pass against the fix'}`);
if (!now.passed) {
  console.error('\nThe test does not pass against the current code, so there is nothing to prove yet.\n');
  process.exit(1);
}

const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'prove-'));
const existedAtRef = new Map();
let failsBefore = false;

/**
 * Put the working tree back, exactly once.
 *
 * Also wired to the signals, because a `finally` does not run when the process
 * is killed — and this tool spends part of its life with the user's uncommitted
 * work replaced by an old revision. Being interrupted then used to LOSE that
 * work; the only copy was the temp directory this deletes on the way out.
 */
let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  for (const f of changed) {
    const src = path.join(backup, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.copyFileSync(src, f);
    } else if (!existedAtRef.get(f)) {
      fs.rmSync(f, { force: true });
    }
  }
  fs.rmSync(backup, { recursive: true, force: true });
  console.log('3. Restored.');
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.log(`\n${sig} — restoring the tree before exit.`);
    restore();
    process.exit(130);
  });
}
process.on('uncaughtException', (err) => { restore(); throw err; });

try {
  for (const f of changed) {
    const dest = path.join(backup, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(f)) fs.copyFileSync(f, dest);
    let old = null;
    // stderr silenced: a file that did not exist at <ref> makes `git show`
    // print a fatal, which is the ANSWER here, not a problem to report.
    try {
      old = execSync(`git show ${ref}:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* did not exist at ref — delete it for the run, restore after */ }
    existedAtRef.set(f, old !== null);
    if (old === null) fs.rmSync(f, { force: true });
    else fs.writeFileSync(f, old);
  }

  console.log(`2. Code as of ${ref}…`);
  const before = runTest();
  failsBefore = !before.passed;
  console.log(`   ${before.timedOut ? `HANG — the old code never finishes; it does not pass, which is the point`
    : failsBefore ? 'FAIL — good: the test catches it'
    : 'PASS — the test does NOT catch this'}`);
} finally {
  restore();
}

if (failsBefore) {
  console.log('\nPROVEN — the test does not pass without the fix, and passes with it.\n');
  process.exit(0);
}
console.error(
  '\nNOT PROVEN — this test passes with OR without the change, so it is not evidence.'
  + '\nIt may be asserting its own fixture, returning before the code it names, or'
  + '\ntesting a seam the change does not touch.\n',
);
process.exit(1);
