#!/usr/bin/env node
/**
 * Writes the share handle's spec page to /spec/starcom-share-handle.spec.md.
 *
 * Mecha Jono makes every picture it posts through `window.__starcomShareCard`,
 * and read how from a note of 11 September (contract v1) and the thread notes
 * after it, while the handle reached v30. One page now, served beside the
 * interchange spec (decided 2026-10-05): the prose in
 * docs/spec/starcom-share-handle.spec.md, and a reference built here from the
 * handle's own type and the contract publish-share-contract.mjs has just
 * written. Built with the deployment, so it describes the build that serves it.
 *
 * Refuses to write a page that has parted from the code (shareSpecProblems):
 * a page that describes another build is worse than none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderShareSpec, shareSpecProblems } from './lib/shareSpec.mjs';

const ROOT = process.cwd();
const prose = fs.readFileSync(path.join(ROOT, 'docs/spec/starcom-share-handle.spec.md'), 'utf8');
const source = fs.readFileSync(path.join(ROOT, 'src/components/Globe/Hooks/useGlobeShareCard.ts'), 'utf8');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/.well-known/starcom-share-contract.json'), 'utf8'));

const problems = shareSpecProblems(prose, source, contract);
if (problems.length) {
  console.error('\n  SHARE SPEC NOT PUBLISHED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  The page would describe another build. See docs/spec/starcom-share-handle.spec.md.\n');
  process.exit(1);
}

const OUT = path.join(ROOT, 'public/spec/starcom-share-handle.spec.md');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, renderShareSpec(prose, source, contract));
console.log(`publish-share-spec: v${contract.version}, ${Object.keys(contract.methods).length} methods, at /spec/starcom-share-handle.spec.md`);
