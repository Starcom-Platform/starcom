#!/usr/bin/env node
/**
 * Writes the app's copy of three.js's Basis transcoder, patched to compile no code
 * from strings (scripts/lib/basisTranscoderPatch.mjs says why). Run it after a
 * three.js upgrade; the test of the patch fails until it is.
 *
 * Usage:
 *   node scripts/patch-basis-transcoder.mjs           write src/assets/basis/basis_transcoder.js
 *   node scripts/patch-basis-transcoder.mjs --check   exit 1 if the committed copy is not the patch of the installed three.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { PATCHED_TRANSCODER, THREE_TRANSCODER, patchBasisTranscoder } from './lib/basisTranscoderPatch.mjs';

const threeVersion = JSON.parse(fs.readFileSync('node_modules/three/package.json', 'utf8')).version;
const patched = patchBasisTranscoder(fs.readFileSync(THREE_TRANSCODER, 'utf8'), threeVersion);

if (process.argv.includes('--check')) {
  const committed = fs.existsSync(PATCHED_TRANSCODER) ? fs.readFileSync(PATCHED_TRANSCODER, 'utf8') : null;
  if (committed !== patched) {
    console.error(`\n  ${PATCHED_TRANSCODER} is not the patch of three.js ${threeVersion}'s transcoder.`);
    console.error('  Run node scripts/patch-basis-transcoder.mjs and commit the result.\n');
    process.exit(1);
  }
  console.log(`\n  ${PATCHED_TRANSCODER} is the patch of three.js ${threeVersion}'s transcoder.\n`);
} else {
  fs.mkdirSync(path.dirname(PATCHED_TRANSCODER), { recursive: true });
  fs.writeFileSync(PATCHED_TRANSCODER, patched);
  console.log(`\n  Wrote ${PATCHED_TRANSCODER} from three.js ${threeVersion}'s transcoder.\n`);
}
