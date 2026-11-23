#!/usr/bin/env node
/**
 * Finds code that exists, works, and cannot be reached.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Six times in one session, work turned up something built, correct, and
 * unreachable — and every time it was found by accident, while looking for
 * something else:
 *
 *   · 138 CSS files nothing could import (the extension was not resolvable)
 *   · three chrome components no file mounted
 *   · seven HUD features behind `!isEmbedded`, a condition every caller makes
 *     false — including a whole floating-panel subsystem wired to live buttons
 *   · a national-territories settings panel, styled by classes that do not exist
 *   · four guard scripts absent from package.json, one of them a privacy check
 *   · a test file outside vitest's include glob, asserting replaced behaviour
 *
 * Accident is not a search strategy. This looks for all of it at once.
 *
 * ─── THE FIVE WAYS CODE BECOMES UNREACHABLE ────────────────────────────────
 *
 * They are genuinely different and only the first is what people usually mean:
 *
 *   ORPHAN        Nothing imports the file.
 *   TEST-ONLY     Only tests import it. It exists in the suite and nowhere else.
 *   UNRENDERED    A component is imported, but never appears as JSX. Being
 *                 imported is not being used, and an import satisfies every
 *                 dead-code check there is.
 *   FROZEN PROP   Every call site passes the same literal, so one branch of
 *                 every condition on it is dead. This is the subtle one, and
 *                 the one that hid the most.
 *   UNWIRED       The file is fine and nothing runs it — a script missing from
 *                 package.json, a test outside the include glob.
 *
 * ─── HOW MUCH TO TRUST "ORPHAN" ────────────────────────────────────────────
 *
 * The graph is built from static imports and literal dynamic ones —
 * ts.preProcessFile resolves `import('./Thing')`, so lazy-loaded applications
 * ARE followed. What it cannot follow is a computed path: `import(path)` where
 * path is a variable, or a component looked up by string at runtime. Anything
 * reachable only that way would be reported as an orphan, and acting on that
 * would delete live code.
 *
 * Both shapes exist in this repo and neither hides anything. Checked, because
 * the whole point of the report is that people act on it:
 *
 *   · UnifiedChatAdapter does `await import(path)` from a protocol registry.
 *     Only two protocols are registered, neither sets adapterPath, so path
 *     always resolves to a literal the adapter also imports as a fallback —
 *     already in the graph.
 *
 *   · SpaceWeatherControlSurface maps string keys to components, but every one
 *     is a static import at the top of the file. A lookup table over things the
 *     graph already has, not a loader.
 *
 * If either changes — a real adapterPath, a registry built from a manifest —
 * this assumption breaks silently and the orphan list starts naming live code.
 * Re-check before trusting a delete recommendation after that.
 *
 * ─── WHAT IT DELIBERATELY IS NOT ───────────────────────────────────────────
 *
 * Not a guard. It reports and exits 0. Every category here needs a human to
 * say whether the answer is delete it, wire it, or leave it — and three of the
 * six discoveries above turned out to be features worth restoring rather than
 * dead weight. A script that failed a build over these would teach people to
 * delete working features to make it quiet.
 *
 * Usage: node scripts/survey-reachability.mjs [--category orphan|test-only|
 *                                              unrendered|frozen|unwired|all]
 *                                             [--json] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const CATEGORY = flag('--category', 'all');
const LIMIT = Number(flag('--limit', '25'));
const AS_JSON = argv.includes('--json');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/* ── vite aliases, read from the config rather than restated ─────────────── */
const ALIASES = (() => {
  const text = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  const out = {};
  for (const m of text.matchAll(/'(@[\w-]*)':\s*path\.resolve\(__dirname,\s*'([^']+)'\)/g)) {
    out[m[1]] = path.resolve(ROOT, m[2]);
  }
  return out;
})();

const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
const isTest = (f) => /\.(test|spec)\.[jt]sx?$/.test(f) || f.includes(`${path.sep}__tests__${path.sep}`);

/*
 * Modules whose whole purpose is to be imported by tests. Reporting these as
 * "exists in the suite and nowhere else" is true and useless — it is what
 * src/testing/ and *.fixtures.ts are FOR, and burying real findings under them
 * is how a report stops being read.
 */
/*
 * Files that are unimported by design, not by neglect.
 *
 * A .d.ts is loaded by TypeScript ambiently and never appears in an import
 * graph — reporting twelve of them as orphans says nothing except that the
 * tool does not know what a declaration file is. Same for generated wasm
 * bindings and the loose test-*.ts scripts at the src root.
 */
const isUnimportedByDesign = (f) =>
  /\.d\.ts$/.test(f) ||
  f.includes(`${path.sep}wasm${path.sep}`) ||
  /\.config\.[jt]s$/.test(f) ||
  /^src[\\/](tests?)[\\/]/.test(path.relative(ROOT, f)) ||
  /^src[\\/]test-/.test(path.relative(ROOT, f));

const isTestSupport = (f) =>
  f.includes(`${path.sep}testing${path.sep}`) ||
  /\.fixtures?\.[jt]sx?$/.test(f) ||
  /[Mm]ock[s]?\.[jt]sx?$/.test(f);

/* ── every source file ───────────────────────────────────────────────────── */
const allFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (CODE_EXT.includes(path.extname(e.name))) allFiles.push(p);
  }
};
walk(SRC);

const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f);

/** Resolve a specifier the way vite would, or null if it leaves the project. */
const resolve = (spec, fromFile) => {
  let base;
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    const alias = Object.keys(ALIASES).find((a) => spec === a || spec.startsWith(a + '/'));
    if (!alias) return null;                       // a package, not our code
    base = path.join(ALIASES[alias], spec.slice(alias.length));
  }
  for (const ext of ['', ...CODE_EXT]) {
    const c = base + ext;
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  for (const ext of CODE_EXT) {
    const c = path.join(base, 'index' + ext);
    if (fs.existsSync(c)) return c;
  }
  return null;
};

/*
 * ─── FILES THE TOOLING NAMES DIRECTLY ──────────────────────────────────────
 *
 * A build or test config can reference a file by path without any module ever
 * importing it. setupVitest.ts is named by vitest.config.ts's setupFiles and
 * runs before every test — it is as wired as anything in the repo, and it was
 * reported as an orphan whose exports nothing uses, which is exactly the kind of
 * confident wrong answer that makes people stop reading a report.
 *
 * Read from the configs rather than listed here, so adding an entry point to a
 * config does not silently create a phantom orphan months later.
 */
const CONFIG_ENTRIES = (() => {
  const out = new Set();
  for (const name of ['vitest.config.ts', 'vite.config.ts', 'package.json', 'tsconfig.json']) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(/['"`]\.?\/?(src\/[^'"`*]+\.[jt]sx?)['"`]/g)) {
      const resolved = path.join(ROOT, m[1]);
      if (fs.existsSync(resolved)) out.add(resolved);
    }
  }
  return out;
})();

/* ── the import graph ────────────────────────────────────────────────────── */
const importedBy = new Map();   // file -> Set of importers
const importsOf = new Map();    // file -> Set of imports
for (const f of allFiles) { importedBy.set(f, new Set()); importsOf.set(f, new Set()); }

for (const f of allFiles) {
  const info = ts.preProcessFile(read(f), true, true);
  for (const ref of info.importedFiles) {
    const target = resolve(ref.fileName, f);
    if (!target || !importedBy.has(target)) continue;
    importedBy.get(target).add(f);
    importsOf.get(f).add(target);
  }
}

/* ── what the application actually starts from ───────────────────────────── */
const ENTRY_HINTS = ['src/main.tsx', 'src/App.tsx'];
const entries = [
  ...ENTRY_HINTS.map((e) => path.join(ROOT, e)).filter((e) => fs.existsSync(e)),
  ...CONFIG_ENTRIES,
];

const reachable = new Set();
const queue = [...entries];
while (queue.length) {
  const f = queue.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const dep of importsOf.get(f) ?? []) queue.push(dep);
}

/* ── 1. orphans and test-only modules ────────────────────────────────────── */
const orphans = [];
const testOnly = [];
for (const f of allFiles) {
  if (isTest(f) || isTestSupport(f) || isUnimportedByDesign(f)) continue;
  const importers = [...importedBy.get(f)];
  if (importers.length === 0) {
    if (!entries.includes(f)) orphans.push({ file: rel(f), lines: read(f).split('\n').length });
  } else if (importers.every(isTest)) {
    testOnly.push({ file: rel(f), lines: read(f).split('\n').length, by: importers.length });
  }
}

/* ── 2. components imported but never rendered ───────────────────────────── */
const allText = allFiles.filter((f) => !isTest(f)).map(read).join('\n');
const unrendered = [];
for (const f of allFiles) {
  if (isTest(f) || !f.endsWith('.tsx')) continue;
  if (!reachable.has(f)) continue;                       // orphans are covered above
  const src = read(f);
  // Exported component names, by convention: capitalised.
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:const|function|class)\s+([A-Z]\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+default\s+([A-Z]\w+)\s*;/g)) names.add(m[1]);
  for (const name of names) {
    const rendered = new RegExp(`<${name}[\\s/>]`).test(allText);
    if (!rendered) unrendered.push({ file: rel(f), symbol: name });
  }
}

/* ── 3. props every call site passes the same literal ────────────────────── */
/*
 * The signal is narrow and the noise is enormous, so both ends are pinned down.
 *
 * The component must be DEFINED IN src — otherwise every lucide icon rendered
 * at one size reports as a frozen prop, which is true and useless.
 *
 * The branch must be IN THE COMPONENT'S OWN FILE — the first version searched
 * every file for the prop name, so `size` matched 19 files and every icon
 * looked like a dead branch. What matters is whether the component itself
 * contains a condition on the prop that can only go one way.
 */
const frozen = [];
{
  // Where each component name is defined, if it is ours at all.
  const definedIn = new Map();
  for (const f of allFiles) {
    if (isTest(f)) continue;
    const src = read(f);
    for (const m of src.matchAll(/(?:export\s+)?(?:const|function|class)\s+([A-Z]\w+)/g)) {
      if (!definedIn.has(m[1])) definedIn.set(m[1], f);
    }
  }

  const byProp = new Map();
  for (const f of allFiles) {
    if (isTest(f) || !f.endsWith('.tsx')) continue;
    for (const m of read(f).matchAll(/<([A-Z]\w+)[^>]*?\s(\w+)=\{(true|false|"[^"]*"|'[^']*'|\d+)\}/g)) {
      const key = `${m[1]}.${m[2]}`;
      if (!byProp.has(key)) byProp.set(key, new Set());
      byProp.get(key).add(m[3]);
    }
  }

  for (const [key, values] of byProp) {
    if (values.size !== 1) continue;
    const [component, prop] = key.split('.');
    const home = definedIn.get(component);
    if (!home) continue;                                  // not ours
    const src = read(home);
    // A condition on the prop, inside the component that receives it.
    const conditions = [
      new RegExp(`!${prop}\\s*&&`),                        //  {!prop && ...}
      new RegExp(`\\b${prop}\\s*&&`),                      //  {prop && ...}
      new RegExp(`\\b${prop}\\s*\\?`),                     //  prop ? a : b
      new RegExp(`if\\s*\\(\\s*!?${prop}\\s*\\)`),          //  if (prop) / if (!prop)
    ].filter((re) => re.test(src)).length;
    if (conditions) {
      frozen.push({ component, prop, value: [...values][0], home: rel(home), conditions });
    }
  }
}

/* ── 4. files no runner runs ─────────────────────────────────────────────── */
const unwired = [];
{
  const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  /*
   * A script can be legitimately hand-run — claim.mjs and approve-batch.mjs are
   * publication tools invoked deliberately, not build steps. Documentation
   * counts as wiring: if a human is told to run it, it is reachable BY a human.
   * What is left is a script nothing references at all, anywhere.
   */
  const docs = [];
  const walkDocs = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walkDocs(p); continue; }
      if (/\.(md|mdx)$/.test(e.name)) docs.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walkDocs(path.join(ROOT, 'docs'));
  for (const n of ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
    const p = path.join(ROOT, n);
    if (fs.existsSync(p)) docs.push(fs.readFileSync(p, 'utf8'));
  }
  const docText = docs.join('\n');

  for (const e of fs.readdirSync(path.join(ROOT, 'scripts'), { withFileTypes: true })) {
    if (!e.isFile() || !/\.(mjs|js|ts)$/.test(e.name)) continue;
    if (/\.test\./.test(e.name)) continue;
    if (pkg.includes(e.name)) continue;
    if (docText.includes(e.name)) continue;               // documented for a human
    unwired.push({ file: `scripts/${e.name}`, why: 'not in package.json, not in any doc' });
  }
  const cfg = fs.readFileSync(path.join(ROOT, 'vitest.config.ts'), 'utf8');
  const includes = [...(cfg.match(/include:\s*\[([^\]]*)\]/s)?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
  const exts = new Set(includes.map((g) => path.extname(g)));
  for (const f of allFiles) {
    if (!/\.(test|spec)\./.test(path.basename(f))) continue;
    if (!exts.has(path.extname(f))) {
      unwired.push({ file: rel(f), why: `extension outside vitest include (${[...exts].join(', ')})` });
    }
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */
const result = { orphans, testOnly, unrendered, frozen, unwired };

if (AS_JSON) {
  // NOT process.exit() — on a pipe, stdout is asynchronous and exiting
  // immediately after a large write truncates it. The consumer then gets valid
  // JSON that simply stops mid-object, which reads as a parser bug rather than
  // a flush bug. Returning lets the process end when the write drains.
  console.log(JSON.stringify(result, null, 2));
} else {

const show = (name) => CATEGORY === 'all' || CATEGORY === name;
const section = (title, rows, render) => {
  console.log(`  ${title} — ${rows.length}`);
  console.log('');
  if (!rows.length) { console.log('      none\n'); return; }
  for (const r of rows.slice(0, LIMIT)) console.log('      ' + render(r));
  if (rows.length > LIMIT) console.log(`      …and ${rows.length - LIMIT} more (--limit)`);
  console.log('');
};

console.log('');
console.log(`  REACHABILITY SURVEY — ${allFiles.length} files, ${reachable.size} reachable from ${entries.map(rel).join(' + ')}`);
console.log('');

if (show('orphan')) section('ORPHAN — nothing imports it', orphans.sort((a, b) => b.lines - a.lines),
  (r) => `${String(r.lines).padStart(5)} lines  ${r.file}`);
if (show('test-only')) section('TEST-ONLY — exists in the suite and nowhere else', testOnly.sort((a, b) => b.lines - a.lines),
  (r) => `${String(r.lines).padStart(5)} lines  ${r.file}`);
if (show('unrendered')) section('UNRENDERED — imported, never used as JSX', unrendered,
  (r) => `${r.symbol.padEnd(34)} ${r.file}`);
if (show('frozen')) section('FROZEN PROP — every call site passes the same value', frozen,
  (r) => `${(r.component + '.' + r.prop).padEnd(30)} always ${String(r.value).padEnd(8)} ${r.conditions} dead branch(es) in ${r.home}`);
if (show('unwired')) section('UNWIRED — nothing runs it', unwired,
  (r) => `${r.file.padEnd(52)} ${r.why}`);

console.log('  Reported, not gated. Three of the six discoveries that motivated this');
console.log('  were features worth restoring, not dead weight — a script that failed');
console.log('  a build over these would teach people to delete working features.');
console.log('');
}
