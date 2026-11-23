/**
 * @asserts Every consumer this repository ships agrees with the published attested-claim vectors, so the vectors are not decoration.
 *
 * Conformance gate — every consumer we ship must agree with the vectors.
 *
 * The vectors in docs/spec/vectors/ are published for other people. This gate
 * points them back at ourselves, which is what stops them becoming decoration.
 *
 * It exists because generating the vectors immediately found the same hole in
 * THREE separate consumers, including the production one: each verified the
 * ML-DSA signature, concluded the payload was trustworthy, and went on to use
 * it. A valid signature proves the bytes are authentic. It says nothing about
 * whether they are COMPLETE, or whether the format PERMITS them. Every
 * consumer had quietly conflated the three.
 *
 * The worst case was ForeignFindingStore, the live federation path, which
 * accepted a foreign instance's self-declared `confidence` — the single
 * assertion the entire derived-weight design exists to refuse.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/gate-conformance.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RefutationStore } from '../src/services/intel/federation/RefutationStore';
import { isRefutation } from '../src/services/intel/findings/refutation';
import { ForeignFindingStore } from '../src/services/intel/federation/ForeignFindingStore';

const DIR = 'docs/spec/vectors';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

/**
 * Which vectors a conforming consumer must ACCEPT — DERIVED from the vectors
 * themselves: a vector that publishes no `rejectReason` is one a conforming
 * consumer acts on. (A retraction is such a payload, including when its reason
 * is unrecognised — it is acted on, not refused.)
 *
 * This was a hardcoded list, and the list was the bug. Adding two new accept
 * vectors left them absent from it, so the gate demanded they be REJECTED and
 * failed a correct implementation. A gate whose expectations are maintained by
 * hand drifts from the vectors it is supposed to enforce, which is the one
 * thing it must never do.
 */
const MUST_ACCEPT = new Set(
  (index.vectors as { name: string; file: string }[])
    .filter((e) => JSON.parse(fs.readFileSync(path.join(DIR, e.file), 'utf8')).expect?.rejectReason == null)
    .map((e) => e.name),
);

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

console.log('Conformance gate\n');

// ---- 1. The spec-derived reference consumer, which imports no app code. ----
// If this disagrees, the DOCUMENT is wrong, however well the app behaves.
let refOk = true;
try { execFileSync('node', ['scripts/conformance.mjs', DIR], { stdio: 'pipe' }); }
catch { refOk = false; }
check('reference consumer (spec-derived, no app imports) passes all vectors', refOk);

// ---- 2. The standalone verifier a third party would run. ----
const tmp = fs.mkdtempSync('/tmp/conf-');
for (const { name, file } of index.vectors) {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const p = path.join(tmp, 'e.json');
  fs.writeFileSync(p, JSON.stringify(v.event));
  let accepted = true;
  try { execFileSync('node', ['scripts/verify-finding.mjs', p], { stdio: 'pipe' }); }
  catch { accepted = false; }
  check(`verify-finding.mjs ${MUST_ACCEPT.has(name) ? 'accepts' : 'rejects'} ${name}`,
    accepted === MUST_ACCEPT.has(name), `got ${accepted ? 'accept' : 'reject'}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---- 3. The PRODUCTION federation ingest. The one that actually matters. ----
/**
 * Routed the way FederationIngestService routes, to the store that OWNS each
 * shape — because "the production ingest" is the router plus two stores, not
 * one store.
 *
 * This sent every vector to ForeignFindingStore and called that production.
 * It is not: a refutation goes to RefutationStore, addressed by what it
 * contests. So the gate demanded the CLAIM store accept refutations, which is
 * a shape it has no address to file. Answering that demand by widening the
 * claim store is what turned a clean rejection into a TypeError that killed
 * this gate mid-run — a gate asserting the wrong architecture will eventually
 * be satisfied, and satisfying it was the bug.
 */
const store = new ForeignFindingStore();
const refutations = new RefutationStore();
for (const { name, file } of index.vectors) {
  const v = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const content = v.event?.content;
  const owner = isRefutation(content) ? 'RefutationStore' : 'ForeignFindingStore';
  const r = isRefutation(content) ? refutations.accept(v.event) : store.accept(v.event);
  check(`${owner} ${MUST_ACCEPT.has(name) ? 'accepts' : 'rejects'} ${name}`,
    r.accepted === MUST_ACCEPT.has(name), `got ${r.accepted ? 'accept' : `reject(${'reason' in r ? r.reason : '?'})`}`);
}

console.log(`\n${failures.length ? `GATE FAILED: ${failures.length} check(s)` : 'Gate passed — all consumers agree with the published vectors.'}`);
process.exit(failures.length ? 1 : 0);
