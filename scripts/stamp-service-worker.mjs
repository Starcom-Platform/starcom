#!/usr/bin/env node
/**
 * Stamps the built service worker with this build, so the data it keeps is
 * checked once per build (decided 2026-10-07).
 *
 * public/sw.js says `const BUILD = '__STARCOM_BUILD__';`, and Vite copies it
 * into dist/ as it is. Unstamped, every build would ship the same worker: the
 * browser would never install a new one, and the borders, territories and
 * datasets it keeps would never be asked for again. This writes the build's
 * sha and the moment it was built in its place, so each build's worker
 * differs, a deploy installs it on the next visit, and its first use of each
 * kept file asks the server whether it changed.
 *
 * It also refuses a public/assets/ that puts a file at the top of /assets/:
 * the worker takes every file there for Vite's content-hashed output, and
 * never asks for it again.
 *
 * Usage: node scripts/stamp-service-worker.mjs [dist-dir] [public-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLACEHOLDER = "'__STARCOM_BUILD__'";

/** Writes the build into dist/sw.js and returns the stamp; throws, saying why, when it must not. */
export function stampServiceWorker({ dist, publicDir }) {
  const assets = path.join(publicDir, 'assets');
  const stray = fs.existsSync(assets)
    ? fs.readdirSync(assets, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name)
    : [];
  if (stray.length) {
    throw new Error(`public/assets/ puts ${stray.join(', ')} at the top of /assets/, where the service worker takes every `
      + 'file for Vite\'s content-hashed output and never asks for it again. Put it in a folder.');
  }

  const health = JSON.parse(fs.readFileSync(path.join(dist, '.well-known/starcom-health.json'), 'utf8'));
  if (typeof health.buildSha !== 'string' || typeof health.builtAt !== 'string') {
    throw new Error('the build\'s health record names no sha and moment to stamp the worker with.');
  }

  const file = path.join(dist, 'sw.js');
  const source = fs.readFileSync(file, 'utf8');
  const found = source.split(PLACEHOLDER).length - 1;
  if (found !== 1) {
    throw new Error(`${file} holds the build's placeholder ${found} times, not once: a worker left unstamped is the same `
      + 'worker every build, and its data is never checked again.');
  }
  // The moment as well as the sha: two builds of one commit are still two builds to check against.
  const stamp = `${health.buildSha.slice(0, 12)}@${health.builtAt}`;
  fs.writeFileSync(file, source.replace(PLACEHOLDER, `'${stamp}'`));
  return stamp;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const stamp = stampServiceWorker({ dist: process.argv[2] ?? 'dist', publicDir: process.argv[3] ?? 'public' });
    console.log(`  Service worker stamped: ${stamp}. The data it keeps is checked once under this build.`);
  } catch (error) {
    console.error(`\n  SERVICE WORKER NOT STAMPED: ${error.message}\n`);
    process.exit(1);
  }
}
