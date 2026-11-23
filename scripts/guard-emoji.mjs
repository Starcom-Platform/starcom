#!/usr/bin/env node
/**
 * @asserts The emoji in shipped source do not grow in number.
 *
 * EMOJI RATCHET (K3, plan block D, step 4)
 *
 * Emoji render differently on every platform, cannot take a colour, and carry
 * no meaning a registry can address: the rail drew one emoji for a layer and
 * quick access another. The glyph registry (src/symbols) replaces them screen
 * by screen. 881 were in shipped source when this began, so a ban would fail
 * on the day it was written; this is a ratchet like guard-small-type.mjs.
 * Adding one fails; removing some and lowering CEILING is always allowed.
 *
 * Counted: characters with Unicode's Extended_Pictographic property in .ts,
 * .tsx, .js, .jsx and .css under src/, outside tests. A variation selector is
 * part of the emoji before it, not a second one. An empty scan fails.
 *
 * Usage: node scripts/guard-emoji.mjs [--update]
 * Exit:  0 the count did not rise · 1 it rose, or nothing was read
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The high-water mark. Lower it whenever the count drops; that is the ratchet turning. */
const CEILING = 739;

const EMOJI = /\p{Extended_Pictographic}/gu;
const SCAN = /\.(ts|tsx|js|jsx|css)$/;
const TEST = /\.(test|spec)\.[jt]sx?$/;

const byFile = new Map();
let files = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p);
      continue;
    }
    if (!SCAN.test(e.name) || TEST.test(e.name)) continue;
    files += 1;
    const n = (fs.readFileSync(p, 'utf8').match(EMOJI) ?? []).length;
    if (n) byFile.set(path.relative(process.cwd(), p), n);
  }
};
if (fs.existsSync('src')) walk('src');

if (files === 0) {
  console.error('\n  EMOJI RATCHET: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}
const total = [...byFile.values()].reduce((a, b) => a + b, 0);
console.log(`\n  EMOJI RATCHET — ${total} emoji in ${byFile.size} of ${files} files`);
console.log(`  ceiling: ${CEILING}\n`);

if (total > CEILING) {
  console.log('  FAILED — the count went up.\n');
  for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(4)}  ${file}`);
  }
  console.log('\n  Draw a glyph from the registry instead: <Glyph name="app:cases" /> (src/symbols).\n');
  process.exit(1);
}

if (total < CEILING) {
  if (process.argv.includes('--update')) {
    const self = fileURLToPath(import.meta.url);
    fs.writeFileSync(self, fs.readFileSync(self, 'utf8').replace(`const CEILING = ${CEILING};`, `const CEILING = ${total};`));
    console.log(`  --update given: CEILING lowered to ${total}.\n`);
  } else {
    console.log(`  ${CEILING - total} fewer than the ceiling. Lower CEILING to ${total} to lock it in.\n`);
  }
} else {
  console.log('  Held. No new emoji.\n');
}
