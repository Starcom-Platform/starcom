#!/usr/bin/env node
/**
 * @asserts No file is a copy of another file.
 *
 * Fails when a file is a copy of another file.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * This repo carried 138 committed `.pre-standardization` files — 37,417 lines
 * of CSS, none imported, none in the build, 41% of all the CSS here. Eighty-one
 * were byte-identical to the live file beside them. Twenty-nine were orphans
 * whose component had already been deleted, so a previous cleanup had walked
 * past them: it looked for `.css` and these end in `.pre-standardization`.
 *
 * They cost the shipped application nothing and cost every reader a great deal.
 * That is the mechanism behind the loop this project keeps hitting: someone —
 * a person or a model — greps for a selector, finds it in two files, cannot
 * tell which one is live, and writes a third.
 *
 * Deleting them without this guard buys about a month.
 *
 * ─── THE TWO SHAPES IT CATCHES ─────────────────────────────────────────────
 *
 * A SUFFIXED COPY is a file whose name is another file's name plus a marker:
 * `.pre-standardization`, `.bak`, `.old`, `.orig`, `.copy`, ` 2`. These are
 * unambiguous — nothing imports them, because the extension is not one the
 * bundler resolves. They fail the build.
 *
 * A PREFIXED SIBLING is two files whose names differ only by an adjective:
 * Globe and EnhancedGlobe, Panel and AdvancedPanel. These are NOT automatically
 * wrong. Sometimes an EnhancedX genuinely is a distinct component. So they are
 * reported, with both mount counts, and fail only when one of the pair is
 * mounted nowhere — which is the actual failure mode: a replacement written
 * beside the original, with the original left behind.
 *
 * Usage: node scripts/guard-rogue-files.mjs
 * Exit:  1 if a suffixed copy exists, or an unmounted prefixed sibling does.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Name markers that mean "this is a copy of the file next to it". */
const COPY_SUFFIX = /\.(pre-[a-z-]+|bak|old|orig|copy|backup|save|tmp)$|[ _-]cop(y|ie)|[ _-]\d+\.(css|tsx?|jsx?)$/i;

/** Adjectives people stack on a filename instead of editing the file. */
const PREFIXES = [
  'Enhanced', 'Advanced', 'Unified', 'Improved', 'Ultra', 'Legacy', 'New',
  'Modern', 'Simple', 'Basic', 'Refactored', 'Optimized', 'Optimised',
  'Smart', 'Dynamic', 'Better', 'Final', 'Real', 'Actual', 'Fixed',
];

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    files.push(p);
  }
};
walk('src');

const sources = files.filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.includes('__tests__'));
const sourceTexts = sources.map((f) => fs.readFileSync(f, 'utf8'));

/**
 * How many other files reference this module.
 *
 * Counting `<Name>` alone was wrong: it reports zero for every context, service
 * and utility, because nothing renders those as JSX. It said five live pairs
 * were "both mounted 0 times", which is a sentence that should have stopped me.
 *
 * Counting the bare identifier catches imports, JSX and plain calls alike. It
 * over-counts a name that is also a common word, which is the safe direction —
 * this guard fails builds, and a false "this is dead" is much more expensive
 * than a missed one.
 */
const referenceCount = (name, ownFile) => {
  const re = new RegExp(`\\b${name}\\b`, 'g');
  let n = 0;
  for (let i = 0; i < sources.length; i++) {
    if (sources[i] === ownFile) continue;
    n += (sourceTexts[i].match(re) || []).length;
  }
  return n;
};

console.log('');
console.log(`  ROGUE FILE GUARD — ${files.length} file(s) under src/`);
console.log('');

// ── suffixed copies ────────────────────────────────────────────────────────
const copies = files.filter((f) => COPY_SUFFIX.test(path.basename(f)));

// ── prefixed siblings ──────────────────────────────────────────────────────
//
// A prefix-stacked duplicate is a SIBLING: two files in the same directory whose
// names differ only by an adjective. Comparing across directories produced 25
// false pairs on the first run — every `index.ts` in the repo matched every
// other, and services matched because nothing renders a service as JSX.
//
// So: same directory, names must actually differ, and at least one of them must
// really carry a stripped prefix.
const byStem = new Map();
for (const f of sources) {
  const base = path.basename(f).replace(/\.(tsx?|jsx?)$/, '');
  const stripped = PREFIXES.reduce(
    (n, p) => (n.startsWith(p) && n.length > p.length ? n.slice(p.length) : n),
    base,
  );
  const key = `${path.dirname(f)}::${stripped}`;
  if (!byStem.has(key)) byStem.set(key, { stem: stripped, group: [] });
  byStem.get(key).group.push({ file: f, name: base });
}

const siblings = [...byStem.values()]
  .filter(({ group }) => {
    if (group.length < 2) return false;
    const names = new Set(group.map((g) => g.name));
    if (names.size < 2) {
      // Same stem, different extension — Foo.js beside Foo.ts. This used to be
      // skipped as uninteresting, and it is not: in a TypeScript project the
      // .js is almost always a leftover the .ts replaced.
      //
      // geometryFactory.basic.test.js sat beside its .ts for ten months
      // asserting behaviour the .ts had since replaced. It never ran — vitest's
      // include list is .test.ts and .test.tsx only — which is precisely why it
      // survived: a stale test that executes eventually fails and gets noticed,
      // and one that does not execute is read by people and models as though it
      // described the current behaviour.
      const exts = new Set(group.map((g) => path.extname(g.file)));
      return exts.has('.js') && (exts.has('.ts') || exts.has('.tsx'));
    }
    return group.some((g) => g.name !== group[0].name.replace(/^$/, g.name)) &&
           group.some((g) => PREFIXES.some((p) => g.name.startsWith(p)));
  })
  .map(({ stem, group }) => ({
    stem,
    members: group.map((g) => ({ ...g, mounts: referenceCount(g.name, g.file) })),
  }));

// A file nothing renders is only a finding if its SIBLING is rendered — that is
// the replacement-left-beside-the-original shape. Two unmounted files with
// similar names are a different problem and not this guard's business.
const orphaned = siblings.filter(
  (s) => s.members.some((m) => m.mounts === 0) && s.members.some((m) => m.mounts > 0),
);

let failed = false;

if (copies.length) {
  failed = true;
  console.log(`  ${copies.length} suffixed copy file(s) — nothing can import these:`);
  for (const c of copies.slice(0, 12)) console.log(`      ${c.replace(/^src\//, '')}`);
  if (copies.length > 12) console.log(`      …and ${copies.length - 12} more`);
  console.log('');
  console.log('  Delete them. Git already remembers the previous version, which is');
  console.log('  what these are trying to be, and does it without leaving a second');
  console.log('  copy of every selector for the next reader to disambiguate.');
  console.log('');
}

if (orphaned.length) {
  failed = true;
  console.log(`  ${orphaned.length} prefix-stacked pair(s) with an unmounted member:`);
  for (const s of orphaned) {
    console.log(`      ${s.stem}`);
    for (const m of s.members) {
      console.log(`          ${m.mounts === 0 ? '✗' : '·'} ${m.name}  (referenced ${m.mounts}×)`);
    }
  }
  console.log('');
  console.log('  A replacement written beside the original, with the original left');
  console.log('  behind. Delete whichever is mounted nowhere, or mount it.');
  console.log('');
}

const informational = siblings.filter((s) => !orphaned.includes(s));
if (informational.length) {
  console.log(`  ${informational.length} prefix-stacked pair(s) where every member is referenced —`);
  console.log('  reported, not failed. Two live components may legitimately differ by');
  console.log('  an adjective, and a guard that guessed would be worse than one that lists.');
  for (const s of informational) {
    console.log(`      ${s.members.map((m) => `${m.name} (${m.mounts}×)`).join('  vs  ')}`);
  }
  console.log('');
}

if (!failed) console.log('  Held. No copy files, no orphaned prefix pairs.\n');

process.exit(failed ? 1 : 0);
