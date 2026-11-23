#!/usr/bin/env node
/**
 * @asserts Every file the build chain runs, and every module src imports,
 *          survives .vercelignore.
 *
 * Every file the build chain runs must survive .vercelignore.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * .vercelignore excludes `/scripts/*` to stay under Vercel's file limit, and
 * re-includes what the build needs. That re-inclusion was a hand-maintained
 * list, and a comment above it instructing "if you add a step to the build
 * chain, add its file here in the same commit".
 *
 * The instruction was followed zero times out of eleven. Eight names were
 * listed while the chain needed nineteen, so the deploy died on
 * guard-node-version.mjs — the FIRST step — with MODULE_NOT_FOUND, before
 * reaching vite.
 *
 * That same file records the last time this happened: production served a build
 * from 6 March while main moved 156 commits ahead, for five months, because
 * nothing reported it. The site kept serving. It just served an ever-staler
 * version of itself.
 *
 * A note asking humans to remember something is not a mechanism. This is.
 *
 * ─── WHY IT RUNS LOCALLY ───────────────────────────────────────────────────
 *
 * It cannot run in the deploy container: if it were excluded it would not be
 * there to complain, and if it is present the thing it checks already worked.
 * So it belongs to `npm run guards` — the local gate — which is where a broken
 * deploy is still cheap.
 *
 * ─── AND WHY IT GREW A SECOND HALF ─────────────────────────────────────────
 *
 * It checked the build CHAIN and nothing else, and .vercelignore says so twice
 * in its own comments — once for `tools/`, which was unanchored and excluded
 * src/applications/netrunner/tools, and again when `coverage/` did the identical
 * thing to src/services/intel/coverage. Three production builds died on
 * "Could not resolve ../../../services/intel/coverage/coverage" while the last
 * good deploy stayed live and the site served an ever-staler version of itself.
 *
 * Twice is a pattern and the note above already knows what a pattern means: a
 * rule nobody can forget beats a comment asking them to remember. So the guard
 * now resolves what src imports and checks those files too. Relative specifiers
 * only — an alias like `@utils/logger` resolves through vite's config and is a
 * different mechanism — which is enough, because every instance of this bug so
 * far has been a relative import into a directory an unanchored pattern ate.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';

const IGNORE_FILE = '.vercelignore';

/**
 * Does this path survive .vercelignore?
 *
 * gitignore-shaped: patterns apply in order and the LAST match wins, so a
 * negation late in the file re-includes something an earlier rule excluded.
 * Only the pattern forms this file actually uses are handled — a general
 * implementation would be more code and less obviously correct.
 */
function survives(path, patterns) {
  let excluded = false;
  for (const { negate, rule } of patterns) {
    if (matches(path, rule)) excluded = !negate;
  }
  return !excluded;
}

/**
 * gitignore depth semantics, which this did not implement.
 *
 * A pattern whose only slash is a trailing one matches a name at ANY depth;
 * one with a leading or internal slash is anchored to the root. This treated
 * every pattern as anchored, so `coverage/` was tested only against paths
 * beginning "coverage/" and never against src/services/intel/coverage — and
 * the guard reported a clean pass while three production deploys failed on
 * exactly that exclusion. The guard was blind to the one mistake .vercelignore
 * has now made three times.
 */
function matches(path, rule) {
  const body = rule.replace(/\/$/, '');
  const anchored = rule.startsWith('/') || body.includes('/');
  if (anchored) return matchesAnchored(path, rule);

  const segments = path.split('/');
  for (let i = 0; i < segments.length; i++) {
    if (matchesAnchored(segments.slice(i).join('/'), rule)) return true;
  }
  return false;
}

function matchesAnchored(path, rule) {
  const clean = rule.replace(/^\//, '');
  if (clean.endsWith('/**')) return path.startsWith(clean.slice(0, -2));
  if (clean.endsWith('/*')) {
    const dir = clean.slice(0, -2);
    return path.startsWith(dir + '/') && !path.slice(dir.length + 1).includes('/');
  }
  if (clean.endsWith('/')) return path.startsWith(clean);
  if (clean.startsWith('*.')) return path.endsWith(clean.slice(1));
  if (clean.includes('*')) {
    const rx = new RegExp('^' + clean.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
    return rx.test(path);
  }
  return path === clean || path.startsWith(clean + '/');
}

console.log('\n  VERCEL BUILD INPUTS GUARD\n');

if (!existsSync(IGNORE_FILE)) {
  console.log(`  No ${IGNORE_FILE}; nothing can be excluded.\n`);
  process.exit(0);
}

const patterns = readFileSync(IGNORE_FILE, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('#'))
  .map((l) => (l.startsWith('!') ? { negate: true, rule: l.slice(1) } : { negate: false, rule: l }));

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const chains = ['build', 'build:vercel'].filter((k) => typeof pkg.scripts?.[k] === 'string');

const problems = [];
let checked = 0;

for (const chain of chains) {
  // Every scripts/… path the command names, whatever runs it — node, npx tsx.
  const referenced = [...new Set([...pkg.scripts[chain].matchAll(/(?:^|\s)((?:\.\/)?scripts\/[A-Za-z0-9._\-/]+)/g)].map((m) => m[1].replace(/^\.\//, '')))];

  for (const path of referenced) {
    checked++;
    if (!existsSync(path)) {
      problems.push(`  ${path}\n    named by npm script "${chain}" and not present in the repository.`);
      continue;
    }
    if (!survives(path, patterns)) {
      problems.push(
        `  ${path}\n    runs in "${chain}" and is EXCLUDED by ${IGNORE_FILE}.\n`
        + '    The deploy will die with MODULE_NOT_FOUND before reaching vite.\n'
        + `    Add a negation for it (or a pattern covering it) to ${IGNORE_FILE}.`,
      );
    }
  }
}

/*
 * Every module src imports, resolved the way the bundler would.
 *
 * Walks src/, reads each module's relative import specifiers, resolves them
 * against the importing file's directory across the extensions the project
 * uses, and asks whether the resolved file survives .vercelignore. A file that
 * exists in the repository and not in the container is exactly the shape of
 * failure rollup reports as "Could not resolve".
 */
const SRC = 'src';
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'];
const MODULE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** The file a relative specifier names, or null when nothing on disk matches. */
function resolveRelative(fromFile, spec) {
  const base = resolvePath(dirname(fromFile), spec);
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(process.cwd(), candidate);
  }
  return null;
}

let imports = 0;
if (existsSync(SRC)) {
  const seen = new Set();
  for (const file of walk(SRC)) {
    if (!MODULE_EXT.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      const target = resolveRelative(file, m[1]);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      imports++;
      if (!survives(target, patterns)) {
        problems.push(
          `  ${target}\n    imported by ${file} and EXCLUDED by ${IGNORE_FILE}.\n`
          + '    The deploy will die with "Could not resolve" during the vite build.\n'
          + '    Usually an unanchored directory pattern matching at a depth nobody meant.',
        );
      }
    }
  }
}

/*
 * ─── AND A THIRD: FILE PATTERNS ───────────────────────────────────────────
 *
 * `import.meta.glob` names files by a pattern, not a path, and matches whatever is there when vite builds. A pattern
 * into a directory .vercelignore excludes is no error in the container: it matches nothing, and the build ships an
 * empty list. Psi Watch's build-kit fixtures did exactly that on 26 Oct, from docs/missions, while every local build
 * found them. So each pattern must match a file here, and every file it matches must reach the container.
 */
function globRegex(pattern) {
  let rx = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { rx += '.*'; i++; if (pattern[i + 1] === '/') i++; }
    else if (c === '*') rx += '[^/]*';
    else if (c === '?') rx += '[^/]';
    else rx += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + rx + '$');
}

let globs = 0;
if (existsSync(SRC)) {
  for (const file of walk(SRC)) {
    if (!MODULE_EXT.test(file) || /__tests__|\.test\./.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      const absolute = spec.startsWith('/') ? resolvePath(process.cwd(), '.' + spec) : resolvePath(dirname(file), spec);
      const pattern = relative(process.cwd(), absolute);
      const base = pattern.split('/').filter((part, i, all) => !/[*?]/.test(all.slice(0, i + 1).join('/'))).join('/');
      const rx = globRegex(pattern);
      const matched = existsSync(base) ? walk(base).map((f) => relative(process.cwd(), f)).filter((f) => rx.test(f)) : [];
      globs++;
      const excluded = matched.filter((f) => !survives(f, patterns));
      if (matched.length === 0) {
        problems.push(`  ${pattern}\n    globbed by ${file} matches no file here; the build would ship an empty list.`);
      } else if (excluded.length > 0) {
        problems.push(
          `  ${pattern}\n    globbed by ${file}: ${excluded.length} of its ${matched.length} file(s) are EXCLUDED by ${IGNORE_FILE},\n`
          + '    so the deploy builds the glob without them, silently: no error, a shorter or empty list.\n'
          + `    e.g. ${excluded[0]}`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.log(problems.join('\n\n'));
  console.log(`\n  ${problems.length} build input(s) would not reach the deploy container.\n`);
  process.exit(1);
}

console.log(`  ${checked} build-chain file(s) across ${chains.length} script(s), ${imports} module(s) imported by src/, and the files of ${globs} glob(s), all survive ${IGNORE_FILE}.\n`);
