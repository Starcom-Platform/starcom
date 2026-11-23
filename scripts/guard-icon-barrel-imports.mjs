#!/usr/bin/env node
/**
 * @asserts No import pulls the whole @mui/icons-material barrel instead of a subpath.
 *
 * Fails on `from '@mui/icons-material'` with no subpath.
 *
 * That package ships 10,774 individual icon modules. A barrel import forces
 * Vite's dependency pre-bundler to touch the whole tree rather than the one
 * icon actually used, and under concurrent test forks that was enough to
 * exhaust this machine's per-process file descriptor limit — macOS's
 * launchd-spawned processes inherit a soft cap of 256, not the interactive
 * shell's 1,048,576, and 10,774 simultaneous opens clears that easily.
 *
 * Found via one test file that failed consistently, alone, with:
 *
 *     Error: EMFILE: too many open files, open '.../VideogameAssetSharp.js'
 *
 * — a file that import didn't even mention. Eight files across the repo had
 * the same shape; the other ~14 icon imports already used the correct one:
 *
 *     import ContentCopyIcon from '@mui/icons-material/ContentCopy';   // fine
 *     import { ContentCopy } from '@mui/icons-material';               // fails this
 *
 * Usage: node scripts/guard-icon-barrel-imports.mjs
 * Exit:  1 if any barrel import of @mui/icons-material remains.
 */
import fs from 'node:fs';
import path from 'node:path';

const BARREL = /from\s+['"]@mui\/icons-material['"]/;

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
walk('src');

const offenders = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  // Only real import statements — a comment EXPLAINING this rule (this file's
  // own conversions carry one) would otherwise match its own prose. Caught by
  // running this guard against the files it had just fixed.
  const hasRealImport = text.split('\n').some(
    (line) => /^\s*import\b/.test(line) && BARREL.test(line),
  );
  if (hasRealImport) offenders.push(f.replace(/^src\//, ''));
}

console.log('');
console.log(`  ICON BARREL IMPORT GUARD — ${offenders.length} file(s) importing @mui/icons-material without a subpath`);
console.log('');

if (offenders.length) {
  for (const f of offenders) console.log(`      ${f}`);
  console.log('');
  console.log("  Change `from '@mui/icons-material'` to `from '@mui/icons-material/IconName'`");
  console.log('  for each icon, keeping any `as Alias`.');
  console.log('');
  process.exit(1);
}

console.log('  Held. Every icon import names its subpath.');
console.log('');
