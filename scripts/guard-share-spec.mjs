#!/usr/bin/env node
/**
 * @asserts The share handle's spec page describes this build: every method the contract lists has its doc comment, and the history names the version in force.
 *
 * SHARE SPEC GUARD
 *
 * The page Mecha Jono reads is built from the handle's type and the contract,
 * but its prose is written by hand, and the reference is only as good as the
 * doc comments it is read from. A method added without a comment, or a version
 * bumped without a line in the history, would put a page on the site that
 * says less than the build does. This fails before that is pushed, and the
 * build's publish step refuses the same way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { shareSpecProblems } from './lib/shareSpec.mjs';

const ROOT = process.cwd();
const prose = fs.readFileSync(path.join(ROOT, 'docs/spec/starcom-share-handle.spec.md'), 'utf8');
const source = fs.readFileSync(path.join(ROOT, 'src/components/Globe/Hooks/useGlobeShareCard.ts'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/.well-known/starcom-share-contract.json'), 'utf8'));

const problems = shareSpecProblems(prose, source, contract);
if (problems.length) {
  console.error('\nShare spec guard FAILED:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix the doc comment on ShareHandle (useGlobeShareCard.ts) or the history in docs/spec/starcom-share-handle.spec.md.\n');
  process.exit(1);
}
console.log(`Share spec guard: v${contract.version}, every one of ${Object.keys(contract.methods).length} methods described.`);
