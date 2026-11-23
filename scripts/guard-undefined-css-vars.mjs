#!/usr/bin/env node
/**
 * @asserts Every `var(--name)` without a fallback names a custom property something defines.
 *
 * UNDEFINED CSS VARIABLE GUARD (critique audit of 2026-10-01; plan block F, item 7)
 *
 * A `var()` that resolves to nothing makes its whole declaration invalid at
 * computed-value time: the property falls back to its initial value, and no
 * tool says so. The bottom bar's `padding: var(--space-sm) 16px` was dropped
 * whole, sides and all, because the scale is --space-1 to --space-24; IntelWeb's
 * --intel-* colours were never defined, so its header had no background.
 *
 * Defined means: declared in a stylesheet or a style block (`--name: …`), set
 * from code (`'--name': …` in a style object, or `setProperty('--name', …)`), or
 * one of the --sc-* tokens src/styles/tokens.ts generates. A `var()` with a
 * fallback says what to use when the name is missing, and passes. A name built
 * at run time (`var(--z-${n})`) cannot be read here, and is skipped.
 *
 * A guard that reads nothing must not pass, so an empty scan fails.
 *
 * Usage: node scripts/guard-undefined-css-vars.mjs
 * Exit:  0 every name is defined · 1 one is not, or nothing was read
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'src');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : walk(p);
    return /\.(css|scss|tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name) ? [p] : [];
  });
}

const files = walk(SRC);
if (files.length === 0) {
  console.error('\n  UNDEFINED CSS VARIABLE GUARD: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}

const defined = new Set();
const uses = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
  // A quoted name followed by `:` `,` or `]`: a style object's key, or setProperty's first argument.
  for (const m of text.matchAll(/['"`](--[a-zA-Z0-9_-]+)['"`]\s*(?:as\s+\w+\s*)?[\],:]/g)) defined.add(m[1]);
  // Comments are not code: blanked, keeping line numbers, before uses are read.
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (c, lead) => lead + ' '.repeat(c.length - lead.length));
  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)(\$\{)?\s*(,)?/g)) {
      if (m[2] || m[3]) continue; // built at run time, or has a fallback
      uses.push({ file: path.relative(root, file), line: i + 1, name: m[1] });
    }
  });
}

const missing = uses.filter((u) => !defined.has(u.name) && !u.name.startsWith('--sc-'));
console.log(`\n  UNDEFINED CSS VARIABLE GUARD — ${files.length} files read, ${uses.length} var() without a fallback\n`);
if (missing.length === 0) {
  console.log('  Every name is defined.\n');
  process.exit(0);
}
for (const u of missing) console.log(`  ${u.file}:${u.line}  ${u.name}`);
console.log(`
  ${missing.length === 1 ? 'One var() names' : `${missing.length} var() name`} a custom property nothing defines. Its whole
  declaration is dropped. Use a token (src/styles/tokens.ts, the --space-* scale), define the
  name, or give the var() a fallback.
`);
process.exit(1);
