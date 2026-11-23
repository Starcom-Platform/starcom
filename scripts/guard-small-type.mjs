#!/usr/bin/env node
/**
 * @asserts Text smaller than 11 px does not grow in number.
 *
 * SMALL TYPE RATCHET (plan item 8.2, decision D6)
 *
 * "Nothing under 11 px" is a rule of the type (interface-upgrade.md). Many
 * sizes were smaller, in stylesheets and in components, so a ban would fail
 * on the day it was written. This is a ratchet like guard-z-index-ratchet.mjs:
 * adding one fails; removing some and lowering CEILING is always allowed. The
 * restyle (plan item 8.5) turns it down section by section.
 *
 * Counted: font-size in px or rem (at 16 px) in .css, and fontSize as a number,
 * px or rem in .ts and .tsx, outside tests and the token file. What counts is
 * in scripts/lib/typeLiterals.mjs. An empty scan fails.
 *
 * Usage: node scripts/guard-small-type.mjs [--update]
 * Exit:  0 the count did not rise · 1 it rose, or nothing was read
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { smallSizes, MIN_PX } from './lib/typeLiterals.mjs';

/** The high-water mark. Lower it whenever the count drops; that is the ratchet turning. */
const CEILING = 248;

const found = smallSizes(process.cwd());
if (found.files === 0) {
  console.error('\n  SMALL TYPE RATCHET: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}
console.log(`\n  SMALL TYPE RATCHET — ${found.length} sizes under ${MIN_PX} px in ${found.files} files`);
console.log(`  ceiling: ${CEILING}\n`);

if (found.length > CEILING) {
  const byFile = new Map();
  for (const f of found) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  console.log('  FAILED — the count went up.\n');
  for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${String(n).padStart(4)}  ${file}`);
  console.log(`\n  Text is ${MIN_PX} px or larger (interface-upgrade.md, "Type").\n`);
  process.exit(1);
}
if (found.length < CEILING) {
  console.log(`  ${CEILING - found.length} fewer than the ceiling. Lower CEILING to ${found.length} to lock it in.\n`);
  if (process.argv.includes('--update')) {
    const self = fileURLToPath(import.meta.url);
    fs.writeFileSync(self, fs.readFileSync(self, 'utf8').replace(`const CEILING = ${CEILING};`, `const CEILING = ${found.length};`));
    console.log(`  --update given: CEILING lowered to ${found.length}.\n`);
  }
  process.exit(0);
}
console.log('  Held. No new size under 11 px.\n');
