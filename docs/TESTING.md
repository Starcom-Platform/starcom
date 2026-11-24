# Testing

Starcom has no CI. GitHub Actions are off and there are no workflow files, so every check runs on your machine, by a
command you type (`scripts/verify.mjs`). Say in your pull request what you ran
([`../CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Which command, when

| When | Command | What it runs |
|---|---|---|
| Before each commit | `npm run verify -- --quick` | Guards, typecheck, conformance vectors and gates; no unit tests |
| Before a pull request | `npm run verify` | The same, then the unit tests; it stops at the first failure |
| After changing types | `npm run typecheck` | `tsc -b --noEmit` across the TypeScript projects |
| After touching a rule a guard checks | `npm run guards` | The guard scripts listed under `guards` in `package.json` |
| While working on one area | `npx vitest run <file or folder>` | Those tests, under the stable config |
| To test only what a change reaches | `npm run test:affected` | `vitest related` on what changed since `HEAD` |
| The whole unit suite, in parts | `npm test` | `scripts/run-sharded-tests.sh`: six runs, one after another |
| After changing what a person sees or does | the walk | `scripts/audit-intern.mjs` against a build, in real browsers |
| Before a release | `npm run build` | The production build, with its guards, published files and data snapshots |
| After editing the claim pages' words | `npm run check:i18n` | Spanish against English, for the static claim pages only |

`npm run verify:quick` is the same as `npm run verify -- --quick`.

## Node version

Use Node 22. `.nvmrc` names 22.23.2, and `package.json` requires 22.13.0 or later; `nvm use` picks up `.nvmrc`.

Under Node 18 some tests hang ([`../CONTRIBUTING.md`](../CONTRIBUTING.md)). The first guard,
`scripts/guard-node-version.mjs`, stops `npm run guards`, `npm run verify` and `npm run build` on an older Node, with
a message. Commands that skip the guards, such as `npx vitest`, do not check the version.

## What `npm run verify` runs

In this order, stopping at the first failure (`scripts/verify.mjs`):

1. `npm run guards`.
2. `npm run typecheck`.
3. `npm run gate:conformance`: the published protocol vectors, fed to every consumer in the repository.
4. `npm run conformance:mission`: the Mission Package and Dispatch Capability vectors, checked by a reference
   consumer that imports no app code.
5. `npm run gates`: the guards that run nowhere else, then `gate:commons` and `gate:registers` (the tests in
   `src/legal`).
6. The unit tests: `npx vitest run --config vitest.stable.config.ts`. `--quick` skips this step.

At the end it prints what it did not check: the app in a browser, the desktop host and a production build. The
desktop app is not in the public repository. `npm run build`, in turn, runs neither the unit tests nor the typecheck.

## The typecheck, and the command that checks nothing

Run `npm run typecheck`. It is `tsc -b --noEmit`, with an 8 GB heap.

Do not use `npx tsc -p tsconfig.json`, or a plain `npx tsc --noEmit`, which reads the same file. The root
`tsconfig.json` lists no files (`"files": []`) and only references four projects: `tsconfig.app.json`,
`tsconfig.node.json`, `tsconfig.starcom.json` and `tsconfig.netrunner.json`. So `-p` compiles an empty program and
exits 0 on any code. Only `-b` builds the referenced projects. The warning is in the header of `scripts/verify.mjs`.

Test files are not typechecked: `tsconfig.app.json` and `tsconfig.starcom.json` exclude `*.test.ts` and `*.test.tsx`.
Vitest runs them without checking their types.

## Guards and gates

A guard is a script in `scripts/guard-*.mjs` that fails when the code breaks a rule the project holds. There were 47
on 24 Nov 2026.
Each starts with an `@asserts` line saying what it checks, and its header says why it exists.

- `npm run guards` runs the ones listed under `guards` in `package.json`.
- `npm run gates` runs most of the rest. `scripts/guard-gate-coverage.mjs` fails when a guard or gate script is not
  reachable from `npm run verify` and not listed there with a reason.
- `npm run build` runs most guards again, before the Vite build.
- Self-tests for many guards are in `scripts/__tests__/`. They run with the unit tests.

To run one guard, copy its line from `package.json`, for example `node scripts/guard-copy-length.mjs`. A few run
under `tsx`, such as `tsx --tsconfig tsconfig.app.json scripts/guard-zsp.mjs`.

## Unit tests

The unit tests use Vitest, in a jsdom environment.

### The configs

| File | Used by | What it is |
|---|---|---|
| `vitest.stable.config.ts` | `npm test`, `npm run verify`, `test:watch`, `test:unsharded`, `test:affected` | The maintained suite: setup in `src/setupVitest.ts`, forked workers (two at most), 15-second timeouts |
| `vitest.config.ts` | a bare `npx vitest`, `npm run test:full`, `gate:registers` | Re-exports the stable config, so both behave the same |
| `vitest.quarantine.ts` | both configs | Tests that call live third-party services, left out of every default run |
| `vitest.geometry.config.mjs` | `npm run test:geo` | The tests in `src/geopolitical/geometry/__tests__/`, in a Node environment |

The stable config collects `src/**/*.test.ts`, `src/**/*.test.tsx`, `src/**/*.vitest.ts` and `scripts/**/*.test.ts`.
Besides the quarantine, it leaves out two files, each with its measured reason beside it.

### What `npm test` runs, and what it skips

`npm test` runs `scripts/run-sharded-tests.sh`. It splits the stable suite into six Vitest runs over named folders:

1. `src/services`;
2. `src/components`, `src/hooks` and `src/context`;
3. `src/applications`, `src/geopolitical` and `src/core`;
4. `src/solar-system` and `src/globe-engine`;
5. the smaller folders, among them `src/utils`, `src/features`, `src/i18n`, `src/legal` and `src/extension`;
6. `scripts` and the remaining small folders.

Each run gets a 3 GB heap ceiling and 300 seconds. All six run even if one fails; the script then exits non-zero if
any failed, crashed or timed out.

A folder the script does not name is never run by `npm test`. On 23 Nov 2026 every folder with tests is named. If
you add a folder of tests under `src/`, add it to a shard in the script too: `npm run verify` would still run it, but
`npm test` would not.

### Memory

Each test file loads jsdom, React and its imports afresh, in an isolated worker. The header of
`scripts/run-sharded-tests.sh` records one run over every file passing an 8 GB heap; the shards exist to reset that.
The header of `scripts/test-affected.mjs` records a full run exhausting an 8 GB machine on 6 Oct 2026.

`npm run verify` runs its test step as one Vitest run. On a machine with 8 GB of memory, run
`npm run verify -- --quick`, then `npm test`.

### One file, or one test

```bash
npx vitest run src/i18n/app/__tests__/i18n.test.ts
npx vitest run src/i18n/app/__tests__/i18n.test.ts -t "every language"
npm run test:watch
```

A bare `npx vitest` uses `vitest.config.ts`, which is the stable config. If a heavy folder runs out of memory, give it
the shards' ceiling: `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run src/applications`.

`npm run test:affected` runs the tests a change reaches: those that import a changed file, those whose text names it,
and changed test files. `--list` says what it would run, and `--base HEAD~2` compares with an earlier commit. It exits
3 when the change reaches every test, as a change to a config or to the test setup does; then run the whole suite.

### Live-network tests

Tests that call live services, such as NOAA and OTX, are listed in `vitest.quarantine.ts`. They are left out of every
default run, because they report on someone else's uptime. That file says to run them with `npm run test:live`. On
23 Nov 2026, `npx vitest list` with that script's arguments collected none of them, so the script currently runs
nothing and passes.

## The browser walk

`scripts/audit-intern.mjs` checks the people's stories against a running build, the way each person would use the
app. It covers stories S1 to S36 in [`missions/03-pipeline/user-stories.md`](missions/03-pipeline/user-stories.md),
and the chat stories C1 to C9 in [`missions/00-current-state/chat.md`](missions/00-current-state/chat.md).
`npm run verify` does not run it.

Once, install the browser. The harness, `scripts/lib/twoBrowserHarness.mjs`, launches Chromium from the `playwright`
package:

```bash
npx playwright install chromium
```

Then build, serve and walk, in two terminals:

```bash
npx vite build
npx vite preview --port 5210 --strictPort
```

```bash
node scripts/audit-intern.mjs http://localhost:5210 --only=S35
```

- Leave out `--only` to walk every story, or name several: `--only=S2,S14`. `npm run audit:intern` runs the same
  script.
- Use `localhost`: the browsers can reach no other host. A stand-in relay inside the script answers every relay
  connection, so nothing reaches a real relay.
- `AUDIT_DEBUG=1` also prints what crossed the stand-in relay, and the end of Priya's and Aisha's screens.
- `npx vite build` is a plain build, without the guards. `npm run build` gives Vite an 8 GB heap; if
  `npx vite build` runs out of memory, `npm run build:local` is the same build with that heap.

Each story prints WORKS, PARTIAL, MISSING, BROKEN, DECIDED or NOT CHECKED, with a reason, then a count of each. The
exit code is 0 whenever the walk ran, BROKEN stories included, so read the output. It is 2 only when, on a full walk,
the stand-in relay heard nothing from the app.

The browsers are headless Chromium at 1366 × 768, each a fresh profile. Priya, Aisha, Marcus and Dana each have one,
and a few more stand for a first visit or a second device ([`GLOSSARY.md`](GLOSSARY.md#personas)). A change to what a
person sees or does should keep the walk working, or add a story for it.

## No CI

There is no CI, by the owner's choice: no check runs on a push or a pull request. `npm run build`, which the
deployment runs (`vercel.json`), repeats most guards but not the tests. When `scripts/verify.mjs` fails, it closes
with "There is no CI. This was the check."
