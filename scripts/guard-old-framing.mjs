#!/usr/bin/env node
/**
 * @asserts No code, script, test, style or served file uses the project's retired "Earth Alliance" framing.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 *
 * On 2026-11-24 the owner took "Earth Alliance" out of Starcom's narrative.
 * guard-public-claims had already kept it off the front door since 2026-11-20,
 * but it reads only the front door and the markdown a release publishes. The
 * app's own screens still showed the name: under the wordmark, in the support
 * appeal and its button, as the chat contacts' heading, and as a colour scheme
 * in Globe settings. It was also in type names, comments, test fixtures and four
 * stale scripts, about 240 lines in the public repository.
 *
 * All of it went at once. A rename that misses one label is how such a name
 * comes back, so this reads everything the app and its tools are built from.
 *
 * ─── WHAT IT READS ──────────────────────────────────────────────────────────
 *
 *   node scripts/guard-old-framing.mjs
 *     src/, scripts/, extension/ (not its build output), index.html,
 *     package.json, and the text files served from public/. Run by
 *     `npm run guards`.
 *
 * Docs are not read: dated records under docs/ may say what was removed, and
 * the published ones are read by guard-public-claims on release.
 *
 * ─── WHAT IT ALLOWS ─────────────────────────────────────────────────────────
 *
 * The files that must name it to keep it out (EXEMPT below), and the name of
 * Earth Alliance News, a peer publication: its own name, not Starcom's framing.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

const OLD = /earth[ _.-]?alliance(?![ _-]?news)/i;

/** Each must name the framing in order to forbid it. */
const EXEMPT = new Map([
  ['scripts/guard-old-framing.mjs', 'this guard'],
  ['scripts/__tests__/guardOldFraming.test.ts', "this guard's own test"],
  ['scripts/guard-public-claims.mjs', 'keeps it off the front door'],
  ['scripts/__tests__/guardPublicClaims.test.ts', "that guard's own test"],
  ['src/services/eia/__tests__/seriesConfig.verified.test.ts', 'checks that the removed earthAllianceContext lines stay removed'],
]);

const READ = [
  'src/**/*.{ts,tsx,js,jsx,mjs,cjs,css,html,md,json}',
  'scripts/**/*.{ts,tsx,js,mjs,cjs,sh,py,md,json}',
  'extension/**/*.{ts,tsx,js,mjs,css,html,md,json}',
  'index.html',
  'package.json',
  'public/*.{html,md,txt,json,webmanifest,xml,js}',
  'public/.well-known/*',
  'public/**/*.{html,md,txt}',
];
const IGNORE = ['**/node_modules/**', 'extension/.output/**', 'extension/.wxt/**', '**/*.geojson'];

const root = process.cwd();
const files = [...new Set(READ.flatMap((p) => globSync(p, { cwd: root, dot: true, nodir: true, ignore: IGNORE })))]
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !EXEMPT.has(f))
  .sort();

const found = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (!OLD.test(text)) continue;
  text.split('\n').forEach((line, i) => {
    const m = line.match(OLD);
    if (m) found.push(`${file}:${i + 1}: "${m[0]}"`);
  });
}

if (found.length) {
  console.error(`\nOld-framing guard failed: ${found.length} line(s) use the retired "Earth Alliance" framing.\n`);
  for (const f of found) console.error(`  ${f}`);
  console.error('\nThe owner retired it from Starcom on 2026-11-24. Say what the thing is: a contact, a theme, a channel.\n');
  process.exit(1);
}

console.log(`Old-framing guard: clean. ${files.length} file(s) read; none uses the retired framing.`);
