#!/usr/bin/env node
/**
 * The tests a change affects, and only those, in one process (decided by the
 * owner 2026-10-07).
 *
 * ─── WHY NOT THE WHOLE SUITE ───────────────────────────────────────────────
 *
 * The suite is 1,284 files, nearly all in jsdom, each file importing its world
 * afresh, two processes each allowed a 4 GB heap. On this 8 GB machine it was
 * running on 2026-10-06 when macOS ran out of memory and had to be reset with
 * the power button. A change to the service worker re-tested the solar system.
 * So a change is checked by the tests it can reach, and the whole suite runs
 * only when the owner asks for it: before wide changes and milestones.
 *
 * ─── WHAT A CHANGE REACHES ─────────────────────────────────────────────────
 *
 * - Tests that import a changed module, however indirectly: `vitest related`.
 * - Tests that READ a changed file instead of importing it: public/sw.js, the
 *   spec, kept fixtures, a guard run by name. The import graph cannot see
 *   these, so any test whose text names the changed file is run too.
 * - A changed test file itself.
 *
 * A change to what every test stands on (the test setup and what it imports,
 * the vitest configs, a tsconfig, the dependencies) reaches every test. That is
 * said, and the exit code is 3: ask for a full run rather than start one.
 *
 * Usage:
 *   node scripts/test-affected.mjs                 the working tree against HEAD, untracked files included
 *   node scripts/test-affected.mjs --base HEAD~2   what changed since a commit
 *   node scripts/test-affected.mjs --exclude src/symbols/uiSymbols.ts   leave a file out (a held change)
 *   node scripts/test-affected.mjs --list          say what would run, and run nothing
 *
 * Exit: 0 passed (or nothing to run), 1 a test failed, 3 passed but the change
 * reaches every test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Code a test can import: what the import graph sees. A script served as it is (public/sw.js) is read, not imported. */
const MODULE = /^(src|scripts|test)\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/;
const EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /^(src|test)\/.*\.(test\.tsx?|vitest\.ts)$|^scripts\/.*\.test\.ts$/;
/** Too common to say which file a test means. */
const GENERIC = new Set(['index.ts', 'index.tsx', 'index.js', 'types.ts', 'constants.ts', 'utils.ts', 'config.ts',
  'README.md', 'package.json', 'main.tsx', 'App.tsx', 'styles.css', 'index.css', 'sw.js']);
const SETUP = /^(src\/setupVitest\.ts|vitest[^/]*\.(ts|mjs|js)|tsconfig[^/]*\.json|package-lock\.json)$/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides'];

/** Whether package.json changed what is installed, not only its scripts. */
export function dependenciesChanged(before, after) {
  return DEPENDENCY_FIELDS.some((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null));
}

/** The files the test setup imports by a relative path, as repo paths: a change to one reaches every test. */
export function setupImports(setupSource, setupPath = 'src/setupVitest.ts') {
  const dir = path.posix.dirname(setupPath);
  return [...setupSource.matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)]
    .map((m) => path.posix.normalize(path.posix.join(dir, m[1])));
}

/** Tests whose text names a changed file: by its repo path, or by its name where the name says which file. */
export function testsNaming(changed, testTexts) {
  const named = new Set();
  for (const file of changed) {
    const base = path.posix.basename(file);
    const marks = [file, ...(GENERIC.has(base) || base.length < 8 ? [] : [base])];
    for (const [test, text] of testTexts) {
      if (test !== file && marks.some((mark) => text.includes(mark))) named.add(test);
    }
  }
  return [...named].sort();
}

/**
 * What a change reaches. `changed` are repo paths that exist now; `deleted`
 * those removed; `setup` the setup's imports (setupImports, no extension);
 * `packages` package.json before and after, when it changed.
 */
export function selectTests({ changed, deleted = [], testTexts, setup = [], packages = null }) {
  const reachesAll = [
    ...changed.filter((f) => SETUP.test(f) || setup.some((s) => f === s || f.startsWith(`${s}.`))),
    ...(packages && dependenciesChanged(packages.before, packages.after) ? ['package.json (dependencies)'] : []),
  ];
  const tests = changed.filter((f) => TEST_FILE.test(f));
  const modules = changed.filter((f) => MODULE.test(f) && !TEST_FILE.test(f));
  // A deleted module is named by its stem in the imports that would now fail.
  const named = testsNaming([...changed, ...deleted.map((f) => f.replace(EXTENSION, ''))], testTexts)
    .filter((t) => !tests.includes(t));
  return { modules, tests, named, reachesAll };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.posix.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
  return [p];
}) : []);

function main(argv) {
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'HEAD';
  const excluded = argv.flatMap((a, i) => (argv[i - 1] === '--exclude' ? [a] : []));
  const paths = [...new Set([...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])]
    .filter((f) => !excluded.includes(f));
  const changed = paths.filter((f) => fs.existsSync(f));
  const deleted = paths.filter((f) => !fs.existsSync(f));
  const testTexts = new Map(['src', 'test', 'scripts'].flatMap(walk).filter((f) => TEST_FILE.test(f))
    .map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const packages = paths.includes('package.json')
    ? { before: JSON.parse(execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' })), after: JSON.parse(fs.readFileSync('package.json', 'utf8')) }
    : null;
  const { modules, tests, named, reachesAll } = selectTests({
    changed, deleted, testTexts, setup: setupImports(fs.readFileSync('src/setupVitest.ts', 'utf8')), packages,
  });

  console.log(`  ${paths.length} changed since ${base}${excluded.length ? ` (left out: ${excluded.join(', ')})` : ''}:`
    + ` ${modules.length} modules, ${tests.length} tests, ${named.length} tests naming a changed file, of ${testTexts.size} test files.`);
  if (reachesAll.length) {
    console.log(`  These reach every test: ${reachesAll.join(', ')}. Run what they reach here, and ask for a full run.`);
  }
  if (argv.includes('--list')) {
    for (const t of [...tests, ...named]) console.log(`    ${t}`);
    if (modules.length) console.log(`    and the tests importing: ${modules.join(', ')}`);
    return 0;
  }
  if (!modules.length && !tests.length && !named.length) {
    console.log('  Nothing a test reaches changed.');
    return reachesAll.length ? 3 : 0;
  }
  const run = spawnSync('npx', ['vitest', 'related', ...modules, ...tests, ...named, '--run',
    '--config', 'vitest.stable.config.ts', '--maxWorkers=1', '--passWithNoTests'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=3072' },
  });
  if (run.status !== 0) return 1;
  return reachesAll.length ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
