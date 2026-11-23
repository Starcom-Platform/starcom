#!/usr/bin/env node
/**
 * @asserts The z-index escalation does not grow.
 *
 * Stops the z-index escalation war from growing.
 *
 * ─── WHY A RATCHET AND NOT A BAN ───────────────────────────────────────────
 *
 * There are 151 raw z-index declarations at or above the threshold, and they
 * are the reason components do not respect each other's placement:
 *
 *     1000   ×57     everyone picked the same "safely high" number
 *     9999   ×15     written to beat 1000
 *    10000   ×11     written to beat 9999
 *     3200   ×11     a whole subsystem picking its own private number
 *
 * The first count of this was 149 from a CSS-only grep. It missed `zIndex:` in
 * TSX inline styles, which is where a meaningful share of them live — worth
 * noting because a measurement that only looks at stylesheets will always
 * understate this problem.
 *
 * Fifty-seven components at one number means DOM order decides what covers
 * what, and those fifty-seven are not interchangeable — four tooltips, several
 * widgets, a modal, a sidebar, and the global header all sit there.
 *
 * A guard that simply banned raw z-index would fail on all 151 from the day it
 * was written. This repository already has two guards in that state, red since
 * commit day because they encode a refactor that never happened, and a guard
 * that cannot pass is one people learn to route around.
 *
 * So this is a ratchet. The current count is recorded below. Adding a raw
 * z-index fails; removing one and lowering the number is always allowed. The
 * war stops growing today and shrinks whenever someone is already in a file.
 *
 * ─── WHAT TO DO INSTEAD ────────────────────────────────────────────────────
 *
 *     z-index: var(--z-tooltip);     see src/styles/z-index.css
 *
 * Pick the layer by what the component IS. If two things in one layer overlap
 * and the order matters, that is a design question — answer it with DOM order
 * or a new tier, not by adding one to a number.
 *
 * SMALL LOCAL VALUES ARE NOT COUNTED. A z-index of 1 or 2 inside a card, to lift
 * a label over its own background, is not part of the global war — it lives in
 * its own stacking context and affects nobody. Only values at or above
 * GLOBAL_THRESHOLD compete for the screen.
 *
 * Usage: node scripts/guard-z-index-ratchet.mjs [--update]
 * Exit:  0 count did not increase · 1 it did
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Below this, a z-index is almost certainly scoped to its own component and
 * competing with nothing. Above it, the component is reaching for the screen.
 */
const GLOBAL_THRESHOLD = 100;

/**
 * The high-water mark. Lower it whenever the real count drops — that is the
 * ratchet turning, and it is the only edit to this number anyone should make
 * without a reason written in the commit message.
 */
const CEILING = 58;

const SCAN_EXT = new Set(['.css', '.tsx', '.ts']);
const RAW_Z = /z-?index\s*:\s*(-?\d+)/gi;

/**
 * No raw number reaches the preloader tier, however low the count (K16). Eleven
 * layers sat at 9999 and 10000, each written to beat the last; those tiers are
 * `--z-preloader` and `--z-critical` now, and a raw number there starts the climb
 * again. Read with comments blanked, since a comment saying what a value WAS is
 * the record of the fix, not a new value.
 */
const TOKEN_ONLY_FROM = 9000;
const blankComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
const tooHigh = [];

const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!SCAN_EXT.has(path.extname(e.name))) continue;

    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(RAW_Z)) {
      const value = Number(m[1]);
      if (Math.abs(value) < GLOBAL_THRESHOLD) continue;
      const line = text.slice(0, m.index).split('\n').length;
      found.push({ file: p, line, value });
    }
    for (const m of blankComments(text).matchAll(RAW_Z)) {
      const value = Number(m[1]);
      if (value < TOKEN_ONLY_FROM) continue;
      tooHigh.push({ file: p, line: text.slice(0, m.index).split('\n').length, value });
    }
  }
};
walk('src');

/*
 * Two exclusions, for different reasons.
 *
 * styles/z-index.css defines the tokens. It is the thing to use, not abuse.
 *
 * Tests do not ship. A `zIndex: 1000` in a fixture is describing a component's
 * props, not competing for space on anyone's screen, and counting it means a
 * test that covers stacking makes the stacking guard fail — which teaches people
 * to delete the test. This exclusion was added when exactly that happened: a new
 * test for floating-panel placement pushed the count from 143 to 144 without a
 * single new declaration reaching the bundle.
 */
const offenders = found.filter((f) =>
  !f.file.endsWith('styles/z-index.css') &&
  !f.file.includes('__tests__') &&
  !/\.(test|spec)\.[jt]sx?$/.test(f.file));

console.log('');
console.log(`  Z-INDEX RATCHET — ${offenders.length} raw declaration(s) at or above ${GLOBAL_THRESHOLD}`);
console.log(`  ceiling: ${CEILING}`);
console.log('');

const shipped = (f) => !f.file.endsWith('styles/z-index.css') && !f.file.includes('__tests__') && !/\.(test|spec)\.[jt]sx?$/.test(f.file);
const overTiers = tooHigh.filter(shipped);
if (overTiers.length) {
  console.log(`  FAILED — ${overTiers.length} raw z-index at ${TOKEN_ONLY_FROM} or above, where only tokens go:\n`);
  for (const o of overTiers) console.log(`    ${o.file}:${o.line}  ${o.value}`);
  console.log('');
  console.log('  Use z-index: var(--z-preloader) for a loading screen, var(--z-critical) for what must');
  console.log('  cover everything, or a lower tier: the climb to 9999 and 10000 was retired (K16).');
  console.log('');
  process.exit(1);
}

if (offenders.length > CEILING) {
  const byValue = new Map();
  for (const o of offenders) byValue.set(o.value, (byValue.get(o.value) ?? 0) + 1);
  console.log('  FAILED — the count went up.\n');
  console.log('  Current distribution:');
  for (const [v, n] of [...byValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(v).padStart(6)}  ×${n}`);
  }
  console.log('');
  console.log('  Use a token from src/styles/z-index.css instead:');
  console.log('    z-index: var(--z-tooltip);');
  console.log('');
  console.log('  Pick the layer by what the component IS. If two things in one layer');
  console.log('  overlap and the order matters, that is a design question — answer it');
  console.log('  with DOM order or a new tier, not by adding one to a number.');
  console.log('');
  process.exit(1);
}

if (offenders.length < CEILING) {
  console.log(`  ${CEILING - offenders.length} fewer than the ceiling. Lower CEILING to ${offenders.length}`);
  console.log('  in this file to lock the improvement in — the ratchet only holds if it turns.');
  console.log('');
  if (process.argv.includes('--update')) {
    const self = fs.readFileSync('scripts/guard-z-index-ratchet.mjs', 'utf8');
    fs.writeFileSync('scripts/guard-z-index-ratchet.mjs',
      self.replace(`const CEILING = ${CEILING};`, `const CEILING = ${offenders.length};`));
    console.log(`  --update given: CEILING lowered to ${offenders.length}.\n`);
  }
  process.exit(0);
}

console.log('  Held. No new raw z-index.\n');
