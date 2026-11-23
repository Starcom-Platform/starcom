#!/usr/bin/env node
/**
 * Runs the publication vectors against BOTH implementations.
 *
 * Starcom's TypeScript and scripts/peer/publication.mjs were written from the
 * same reasoning at different times, and either could drift. Checking both
 * against one set of vectors is what makes "the reference implementation" a
 * claim rather than a hope — and it is the same arrangement that keeps
 * peer.mjs and conformance.mjs honest about attested claims.
 *
 * A peer porting the policy runs this with their own implementation swapped in.
 *
 * Usage: npx tsx --tsconfig tsconfig.app.json scripts/publication-conformance.mjs
 * Exit:  0 both agree with every vector · 1 otherwise
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePublication as reference } from './peer/publication.mjs';
import { evaluatePublication as starcom } from '../src/services/intel/findings/publicationPolicy.ts';

const DIR = 'docs/spec/publication-vectors';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

let failures = 0;
console.log(`\n  PUBLICATION POLICY — ${index.vectors.length} vectors, two implementations\n`);

for (const entry of index.vectors) {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, entry.file), 'utf8'));

  const check = (label, fn) => {
    let got;
    try {
      got = fn(v.subjectKind, v.options ?? {});
    } catch (e) {
      failures++;
      console.log(`  THREW  ${v.name} [${label}] — ${e.message}`);
      return;
    }
    if (got.allowed !== v.expect.allowed) {
      failures++;
      console.log(`  FAIL   ${v.name} [${label}]`);
      console.log(`           expected allowed=${v.expect.allowed}, got ${got.allowed}`);
      if (got.reason) console.log(`           reason: ${got.reason.slice(0, 90)}`);
      return;
    }
    // A refusal that does not say why is a refusal nobody can act on, so the
    // reason is part of the contract rather than decoration.
    if (v.expect.reasonMatches && !String(got.reason ?? '').includes(v.expect.reasonMatches)) {
      failures++;
      console.log(`  FAIL   ${v.name} [${label}] — reason should mention "${v.expect.reasonMatches}"`);
      console.log(`           got: ${String(got.reason ?? '').slice(0, 90)}`);
    }
  };

  check('reference', reference);
  check('starcom', starcom);
}

console.log('');
if (failures) {
  console.log(`  ${failures} disagreement(s). Two implementations of one policy have drifted,`);
  console.log('  or a vector is wrong. Either way the network no longer agrees about what');
  console.log('  may be published, which is the thing these vectors exist to prevent.\n');
  process.exit(1);
}
console.log(`  Both implementations agree with all ${index.vectors.length} vectors.\n`);
