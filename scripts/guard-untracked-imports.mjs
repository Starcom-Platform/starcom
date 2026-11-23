#!/usr/bin/env node
/**
 * @asserts Every import in src/ resolves to a file git actually has.
 *
 * Fails if any import in src/ resolves to a file git does not have.
 *
 * A local build reads the working tree. A deploy build reads a clone. When a
 * file exists on disk but was never committed, those two disagree and only the
 * deploy notices — with a message about a module that plainly does exist.
 *
 * That is not hypothetical here. Twelve source files, including an entire
 * src/cache/ directory imported by 146 others, were on disk and absent from
 * git. The deploy failed on the first one it reached:
 *
 *     Could not resolve "../components/Intel/IntelWorkspaceConsole"
 *
 * Fixing them one failed build at a time would have taken four more rounds,
 * which is the argument for a guard rather than a fix.
 *
 * It compares against git's INDEX plus HEAD rather than the filesystem, because
 * the filesystem is exactly the thing that lies in this failure mode.
 *
 * Usage: node scripts/guard-untracked-imports.mjs
 * Exit:  0 every import resolves to a tracked file · 1 at least one does not
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json',
  '/index.ts', '/index.tsx', '/index.js'];
const alias = {
  '@utils': 'src/utils', '@services': 'src/services', '@components': 'src/components',
  '@hooks': 'src/hooks', '@': 'src',
};

/**
 * No git, no question to answer — and that is not the same as skipping a check.
 *
 * This guard asks whether every resolved import is TRACKED, because a file that
 * exists on the author's disk and was never committed builds locally and breaks
 * for everyone else. That failure is only possible where a working tree and a
 * repository can disagree.
 *
 * Vercel builds from an export with no .git at all. `git ls-files` there exits
 * 128 and, unguarded, took the whole build down with it — this exact line is
 * why main has not deployed since this morning, including the commit whose
 * message said it had unbroken the deploy. The build passed locally every time,
 * because locally there is a repository.
 *
 * Where there is no repository the checkout IS the shipped set: an untracked
 * file cannot be present, so the property this guard defends cannot be
 * violated. Returning early is the correct answer to the question, not an
 * excuse for failing to ask it — which is why this reads differently from
 * guard-bundle-secrets, where a missing input hides a real risk and must fail.
 */
const hasGit = (() => {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

if (!hasGit) {
  console.log(
    '  Untracked-import guard: no git repository (a deploy build export).\n'
    + '  The checkout is the shipped set, so an untracked import cannot exist here.',
  );
  process.exit(0);
}

const known = new Set(
  execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean),
);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SPEC = /\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g;

/** Resolve a specifier to a repo-relative path, or null if it is a bare package. */
function resolve(spec, fromFile) {
  let base = null;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else {
    for (const [a, target] of Object.entries(alias)) {
      if (spec === a || spec.startsWith(a + '/')) { base = path.join(ROOT, target, spec.slice(a.length)); break; }
    }
  }
  if (!base) return null;
  for (const e of exts) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return path.relative(ROOT, p);
  }
  return null;
}

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(p);
  }
};
walk(path.join(ROOT, 'src'));

const missing = new Map();
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    // A query (`?url`, `?raw`) asks Vite for the file in another form; the file is still the one imported.
    const target = resolve(spec.replace(/\?.*$/, ''), f);
    if (!target || known.has(target)) continue;
    if (!missing.has(target)) missing.set(target, new Set());
    missing.get(target).add(rel);
  }
}

if (!missing.size) {
  console.log(`\n  Untracked-import guard passed: ${files.length} files scanned, every resolved import is in git.\n`);
  process.exit(0);
}

console.log(`\n  ${missing.size} imported file(s) exist on disk but are NOT in git:\n`);
for (const [target, importers] of [...missing].sort()) {
  const list = [...importers].slice(0, 3).join(', ');
  console.log(`  ${target}`);
  console.log(`      imported by ${importers.size} file(s): ${list}${importers.size > 3 ? ', …' : ''}`);
}
console.log(`
  A local build reads the working tree and succeeds. A deploy build reads a
  clone and fails on the first one it reaches. Commit them.
`);
process.exit(1);
