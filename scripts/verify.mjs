#!/usr/bin/env node
/**
 * The local gate, because there is no other one.
 *
 * There is no CI, by the owner's choice: Actions are off on this repository and
 * on the public ones, and since 23 Nov 2026 there are no workflow files either.
 * The app is built with AI, and this command is how its work is checked.
 *
 * That makes a push not a verification of anything. Whatever is going to be
 * checked has to be checked here, by someone typing a command, which means the
 * command has to be worth typing: complete, fast to read, and honest about what
 * it did not do.
 *
 * ─── WHY NOT JUST `npm run build` ──────────────────────────────────────────
 *
 * The build runs ten guards and then a full Vite production build, which takes
 * minutes and is the wrong shape for the check you want before a commit. It
 * also does NOT run the tests or a real typecheck. This runs the checks that
 * catch mistakes, in the order that fails fastest.
 *
 * ─── THE TYPECHECK TRAP ────────────────────────────────────────────────────
 *
 * `tsc --noEmit -p tsconfig.json` compiles an EMPTY PROGRAM here and exits 0.
 * The root config is solution-style — `"files": []` with four project
 * references — so that invocation checks nothing at all while looking exactly
 * like success. It was reported as "typecheck clean" for most of a working day.
 * `tsc -b` is the only form that checks anything, and it is what runs below.
 */
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');

/** Ordered so the cheapest thing that can fail, fails first. */
const STEPS = [
  { name: 'guards', cmd: 'npm', args: ['run', 'guards'] },
  { name: 'typecheck (tsc -b, NOT -p)', cmd: 'npm', args: ['run', 'typecheck'] },
  /**
   * The conformance gate, which was not in this list.
   *
   * It feeds the PUBLISHED vectors — the artifact other implementations build
   * against — to every consumer in this repo and checks they agree. It is the
   * only check that can catch a change to the protocol surface that is locally
   * consistent and wrong on the wire, which is the class of defect that cannot
   * be recalled once other nodes have it.
   *
   * Absent from the gate, it broke silently: an edit turned a clean rejection
   * into an uncaught TypeError and the gate died mid-run for a full session,
   * while `npm run verify` stayed green because it never ran it.
   */
  { name: 'conformance vectors (the wire, not just the build)', cmd: 'npm', args: ['run', 'gate:conformance'] },
  /**
   * The DISPATCH side's vectors, which were in the same position: written,
   * published, and run by nobody.
   *
   * `conformance:mission` existed as a script and appeared in no chain, so the
   * twenty Mission Package and Dispatch Capability vectors a second node was
   * told to build against were checked only when somebody typed the command.
   * That became load-bearing when the manifest-signature vectors were added:
   * they are the only executable statement of the encoding rule that blocked a
   * peer for three spec revisions, and their whole value is that a reference
   * consumer written from the prose — importing no Starcom code — reaches the
   * same verdicts. A check nobody runs cannot report drift.
   */
  { name: 'mission + signature vectors (reference consumer, no app code)', cmd: 'npm', args: ['run', 'conformance:mission'] },
  /**
   * The other thirteen, which existed and ran nowhere.
   *
   * When guard-gate-coverage was written, 18 of 30 guard and gate scripts were
   * unreachable from here — among them the guard that exists to stop secrets
   * reaching the client bundle. Writing a check and forgetting to wire it in is
   * evidently the normal outcome, so a guard now enforces the wiring instead of
   * anyone remembering it.
   */
  { name: 'gates (every guard that runs nowhere else)', cmd: 'npm', args: ['run', 'gates'] },
  /*
   * The STABLE config, explicitly — not a bare `vitest run`.
   *
   * ─── WHAT THIS COMMENT USED TO SAY, AND WHY IT WAS WRONG ─────────────────
   *
   * It blamed the include globs: "a bare invocation picks up vitest.config.ts,
   * whose include globs sweep in a large body of legacy tests", and put a
   * figure on it — 275 files and 1117 tests failing, measured 2026-09-04.
   *
   * The two configs have IDENTICAL include globs. Both list the same seven
   * patterns, so no file reaches one and not the other by inclusion. Whatever
   * produced 275 failing files, it was not that, and the number has been
   * repeated since as though its cause were known.
   *
   * What actually differs is the RUNTIME. vitest.config.ts sets
   * `poolOptions.forks.singleFork: true` — the whole suite in one process,
   * which scripts/run-sharded-tests.sh exists precisely because it cannot
   * survive: its own header records the suite exceeding an 8GB heap. It also
   * inherits vitest's 5s testTimeout where the stable config sets 15s, and
   * maxConcurrency 5 where stable sets 2. A heap death partway through reports
   * every file it never reached as failed, which is the shape that produces a
   * number like 275.
   *
   * That is a reading, not a measurement. Running the default config to confirm
   * it risks taking the machine down, so it has not been run, and this comment
   * says so rather than inventing a second confident figure to replace the
   * first.
   *
   * The reason to point at the stable config stands on its own: it is the suite
   * this project maintains, its exclusions are now measured one file at a time,
   * and green here means something.
   */
  {
    name: 'tests (the stable suite, the one that is maintained)',
    cmd: 'npx',
    args: ['vitest', 'run', '--config', 'vitest.stable.config.ts'],
    skipInQuick: true,
  },
];

const results = [];
let failed = false;

for (const step of STEPS) {
  if (quick && step.skipInQuick) {
    results.push({ name: step.name, status: 'skipped (--quick)' });
    continue;
  }

  process.stdout.write(`\n──── ${step.name} ────\n`);
  const started = Date.now();
  const run = spawnSync(step.cmd, step.args, { stdio: 'inherit', shell: false });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (run.status !== 0) {
    results.push({ name: step.name, status: `FAILED (${seconds}s)` });
    failed = true;
    // Stop here. Running the rest against a broken state produces noise, and
    // the first failure is the one worth reading.
    break;
  }
  results.push({ name: step.name, status: `ok (${seconds}s)` });
}

console.log('\n════ VERIFY ════');
for (const r of results) console.log(`  ${r.status.startsWith('ok') ? '✓' : r.status.startsWith('skipped') ? '·' : '✗'} ${r.name} — ${r.status}`);

/**
 * What this did NOT check, said out loud.
 *
 * A gate that lists only its passes reads as complete. These are the things
 * that have actually shipped broken here while everything above was green, so
 * they are named every run rather than remembered.
 */
console.log('\n  NOT CHECKED BY THIS COMMAND:');
console.log('    · the app in a browser — three real defects hid from every check above');
console.log('    · the desktop host (cd desktop && npm run smoke)');
console.log('    · a production Vite build (npm run build)');

if (failed) {
  console.log('\n  There is no CI. This was the check.\n');
  process.exit(1);
}
console.log('\n  Green here is the only green there is.\n');
