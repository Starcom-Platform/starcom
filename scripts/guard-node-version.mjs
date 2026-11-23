#!/usr/bin/env node
/**
 * @asserts The Node runtime executing the toolchain matches the version package.json and .nvmrc require.
 *
 * NODE VERSION GUARD
 *
 * package.json declares an engines range and .nvmrc pins a version, and npm
 * enforces neither for `npm run` — engine-strict only gates `npm install`. So
 * a developer shell pointed at a different Node runs the whole toolchain
 * silently, which is exactly what happened: an entire session executed against
 * the system Node 18.16.0 while the project requires >=22.12.0.
 *
 * It did not fail loudly. It failed as noise. Vitest passed with intermittent
 * "parallel load" flakes that were really an unsupported runtime, and every
 * Playwright spec died with an .esm.preflight module error, because Playwright
 * 1.58 needs module.register() — added in Node 18.19 — which made a working
 * e2e suite look like a broken one.
 *
 * Reads the range from package.json rather than restating it, so there is one
 * source of truth and this cannot drift from it.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const range = pkg.engines?.node;

if (!range) {
  console.error('\n  NODE VERSION GUARD — FAILED\n\n  package.json declares no engines.node range for this guard to enforce.\n');
  process.exit(1);
}

/** Only the `>=X.Y.Z` form this project uses; anything else is a loud no. */
const m = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
if (!m) {
  console.error(
    `\n  NODE VERSION GUARD — FAILED\n\n` +
    `  engines.node is "${range}", which this guard cannot parse.\n` +
    `  It deliberately understands only ">=X.Y.Z". Widen it here rather than\n` +
    `  loosening the check, so the guard never silently stops guarding.\n`
  );
  process.exit(1);
}

const want = [Number(m[1]), Number(m[2]), Number(m[3])];
const have = process.versions.node.split('.').map(Number);
const ok = have[0] !== want[0] ? have[0] > want[0]
  : have[1] !== want[1] ? have[1] > want[1]
  : have[2] >= want[2];

if (!ok) {
  console.error(
    `\n  NODE VERSION GUARD — FAILED\n\n` +
    `  This project requires Node ${range}; this shell is running ${process.version}.\n\n` +
    `  Nothing here will fail cleanly on the wrong version — it fails as flaky\n` +
    `  tests and a dead Playwright runner, which reads as broken code.\n\n` +
    `      nvm use            # .nvmrc pins the version CI also uses\n`
  );
  process.exit(1);
}

console.log(`\n  NODE VERSION GUARD\n\n  Node ${process.version} satisfies engines.node "${range}".\n`);
