#!/usr/bin/env node
/**
 * @asserts Colours written straight into src/ do not grow in number.
 *
 * HARD-CODED COLOUR RATCHET (plan item 8.1, decision D6)
 *
 * The app had 746 distinct colours, "critical" drawn in ten of them, and two
 * token files nobody read. The colours now come from one place,
 * src/styles/tokens.ts: the MUI theme is made from it, and its values are CSS
 * custom properties (`var(--sc-surface-panel)`, `var(--sc-danger)`).
 *
 * About 4,600 literals are left in the source, so a ban would fail on the day
 * it was written, and a guard that cannot pass is one people learn to route
 * around. This is a ratchet, like guard-z-index-ratchet.mjs: adding a literal
 * fails, removing some and lowering CEILING is always allowed. The restyle
 * (plan items 8.4 and 8.5) turns it down section by section.
 *
 * What counts and what does not is in scripts/lib/colourLiterals.mjs. A guard
 * that reads nothing must not pass, so an empty scan fails.
 *
 * Usage: node scripts/guard-hardcoded-colors.mjs [--update]
 * Exit:  0 the count did not rise · 1 it rose, or nothing was read
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countColourLiterals } from './lib/colourLiterals.mjs';

/**
 * The high-water mark. Lower it whenever the real count drops: that is the
 * ratchet turning, and it is the only edit to this number anyone should make
 * without a reason written in the commit message.
 */
const CEILING = 4115;

const { files, total, byFile } = countColourLiterals(process.cwd());

if (files === 0) {
  console.error('\n  HARD-CODED COLOUR RATCHET: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}

console.log('');
console.log(`  HARD-CODED COLOUR RATCHET — ${total} colour literals in ${files} files`);
console.log(`  ceiling: ${CEILING}`);
console.log('');

if (total > CEILING) {
  console.log('  FAILED — the count went up.\n');
  console.log('  Most literals, by file:');
  for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(5)}  ${file}`);
  }
  console.log('');
  console.log('  Use a token from src/styles/tokens.ts instead, by what the colour MEANS:');
  console.log('    color: var(--sc-text-body);   background: var(--sc-surface-panel);');
  console.log('    border-color: var(--sc-danger);   (or the MUI theme: theme.palette.error.main)');
  console.log('');
  process.exit(1);
}

if (total < CEILING) {
  console.log(`  ${CEILING - total} fewer than the ceiling. Lower CEILING to ${total}`);
  console.log('  in this file to lock the improvement in; the ratchet only holds if it turns.');
  console.log('');
  if (process.argv.includes('--update')) {
    const self = fileURLToPath(import.meta.url);
    fs.writeFileSync(self, fs.readFileSync(self, 'utf8').replace(`const CEILING = ${CEILING};`, `const CEILING = ${total};`));
    console.log(`  --update given: CEILING lowered to ${total}.\n`);
  }
  process.exit(0);
}

console.log('  Held. No new colour literal.\n');
