#!/usr/bin/env node
/**
 * What a deployment is built from, and whether a push changed it: Vercel's
 * Ignored Build Step (vercel.json `ignoreCommand`).
 *
 * The owner chose on 2026-10-12 to skip a deployment when a push changes only
 * documents, to cut deployment storage. Comparing commits cannot work here:
 * .vercelignore removes `.git/` before the step runs. So the step reads what
 * Vercel received, a fingerprint for each entry at the top of the tree, and
 * compares it with what the live site says its own build received
 * (/.well-known/starcom-build-input.json, which `publish` writes in the build).
 * A push of documents, tests or notes that .vercelignore keeps out of the
 * upload leaves every entry as it was, and is skipped.
 *
 * Whatever cannot be told builds: a build too many costs minutes, a deployment
 * skipped serves old code. A redeploy of the live commit always builds, since
 * nothing changed and someone asked for it.
 *
 *   node scripts/vercel-build-input.mjs step      the ignoreCommand: exit 0 skips, 1 builds
 *   node scripts/vercel-build-input.mjs publish   in the build chain, before vite copies public/
 *
 * Tested in scripts/__tests__/vercelBuildInput.test.ts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The step's note of what it read, for `publish`: at the top, outside every entry it reads. */
export const STATE_FILE = '.vercel-build-input.json';
/** Where the live build says what it was built from. */
export const SERVED = 'public/.well-known/starcom-build-input.json';
const LIVE_URL = 'https://starcom.app/.well-known/starcom-build-input.json';
/** Not input: installed packages, the build's output, caches Vercel restores, the repository, the step's note. */
const NOT_INPUT = new Set(['node_modules', 'dist', '.vercel', '.cache', '.git', STATE_FILE]);

/** One entry's fingerprint: every file's path and bytes, in order, so a rename changes it too. */
function fingerprint(root, name) {
  const hash = crypto.createHash('sha256');
  const visit = (rel) => {
    const full = path.join(root, rel);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      hash.update(`link ${rel}\0${fs.readlinkSync(full)}\0`);
    } else if (stat.isDirectory()) {
      for (const child of fs.readdirSync(full).sort()) visit(path.join(rel, child));
    } else {
      hash.update(`file ${rel}\0`);
      hash.update(fs.readFileSync(full));
      hash.update('\0');
    }
  };
  visit(name);
  return hash.digest('hex');
}

/** What the tree at `root` gives a build: a fingerprint for each entry at its top. */
export function inputOf(root) {
  const entries = {};
  for (const name of fs.readdirSync(root).sort()) {
    if (!NOT_INPUT.has(name)) entries[name] = fingerprint(root, name);
  }
  return { version: 1, entries };
}

/** The entries that differ between two statements, either side's, by name. */
function changedEntries(now, live) {
  const names = new Set([...Object.keys(now.entries), ...Object.keys(live.entries)]);
  return [...names].filter((name) => now.entries[name] !== live.entries[name]).sort();
}

/**
 * Whether to skip this deployment, and what to say in the build log. Notes what
 * it read in STATE_FILE either way, so a build can publish it.
 */
export async function step({ root, commit, fetchLive }) {
  const now = inputOf(root);
  fs.writeFileSync(path.join(root, STATE_FILE), `${JSON.stringify(now)}\n`);
  let live;
  try {
    live = await fetchLive();
  } catch (error) {
    return { skip: false, said: `Building: could not read the live build's input (${error instanceof Error ? error.message : String(error)}).` };
  }
  if (!live || live.version !== 1 || !live.entries || typeof live.entries !== 'object') {
    return { skip: false, said: 'Building: the live site states no build input it can be compared with.' };
  }
  const built = typeof live.commit === 'string' ? live.commit.slice(0, 12) : 'unknown commit';
  if (commit && live.commit === commit) {
    return { skip: false, said: `Building: ${built} is the live commit, so this is a redeploy someone asked for.` };
  }
  const changed = changedEntries(now, live);
  if (changed.length) return { skip: false, said: `Building: changed since the live build (${built}): ${changed.join(', ')}` };
  return { skip: true, said: `Skipping: nothing Vercel builds from changed since the live build (${built}).` };
}

/** Serves the step's note with the commit built; where no step ran, serves none, so no old one lies. */
export function publish({ root, commit }) {
  const note = path.join(root, STATE_FILE);
  const served = path.join(root, SERVED);
  if (!fs.existsSync(note)) {
    fs.rmSync(served, { force: true });
    return 'vercel-build-input: no step ran here, so no build input is served.';
  }
  const input = JSON.parse(fs.readFileSync(note, 'utf8'));
  fs.mkdirSync(path.dirname(served), { recursive: true });
  fs.writeFileSync(served, `${JSON.stringify({ ...input, commit: commit ?? null })}\n`);
  return `vercel-build-input: served what this build was built from (${Object.keys(input.entries).length} entries).`;
}

async function fetchLiveInput() {
  const response = await fetch(LIVE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.cwd();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const mode = process.argv[2];
  if (mode === 'step') {
    // Anything thrown here exits 1, which builds.
    const { skip, said } = await step({ root, commit, fetchLive: fetchLiveInput });
    console.log(said);
    process.exit(skip ? 0 : 1);
  } else if (mode === 'publish') {
    console.log(publish({ root, commit }));
  } else {
    console.error('usage: node scripts/vercel-build-input.mjs step|publish');
    process.exit(2);
  }
}
