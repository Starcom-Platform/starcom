/**
 * Dry-run the publication path with the REAL findings, publishing nothing.
 *
 * 10,000-odd structural findings exist and none has been through the path that
 * would put one on a relay. Every genuine defect found in this codebase came
 * from running real data end to end rather than from fixtures, which agree
 * with the implementation by construction.
 *
 * Checks, in the order a claim meets them:
 *   1. the publication policy gate
 *   2. signing and the wire event's shape
 *   3. `d` tag uniqueness — a collision means one claim silently replaces
 *      another under a parameterized-replaceable kind
 *   4. what an INDEPENDENT implementation makes of the payload
 *   5. the derived weight, from both implementations
 */
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { loadStructuralFindings } from '../src/services/intel/structural/registerSource';
import { loadControlFindings } from '../src/services/intel/structural/pscSource';
import { evaluatePublication } from '../src/services/intel/findings/publicationPolicy';
import { signFinding } from '../src/services/intel/findings/signFinding';
import { identifierFor } from '../src/services/intel/findings/FindingContent';
import { explainAttestationWeight } from '../src/services/intel/findings/deriveAttestationWeight';
import { ForeignFindingStore } from '../src/services/intel/federation/ForeignFindingStore';
import * as peer from './peer/peer.mjs';

const serve = (async (url: string) => {
  const p = url.replace('/data/', 'public/data/');
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
}) as unknown as typeof fetch;

const findings = [
  ...(await loadStructuralFindings(serve)),
  ...(await loadControlFindings(serve)),
];
console.log(`\n${findings.length.toLocaleString()} findings from the committed assets\n`);

let problems = 0;
const flag = (msg: string) => { console.log(`  PROBLEM  ${msg}`); problems++; };

// ---- 1. the policy gate ----------------------------------------------------
const refused = new Map<string, number>();
for (const f of findings) {
  const d = evaluatePublication(f.claim.subjectKind, { isMock: false });
  if (d.allowed === false) refused.set(d.reason, (refused.get(d.reason) ?? 0) + 1);
}
console.log(`policy gate: ${findings.length - [...refused.values()].reduce((a, b) => a + b, 0)} allowed`);
for (const [reason, n] of refused) console.log(`   refused ${n}: ${reason}`);

// ---- 2 & 3. slots ----------------------------------------------------------
const slots = new Map<string, string[]>();
for (const f of findings) {
  const d = identifierFor(f.claim.subjectRef, f.claim.attribute);
  (slots.get(d) ?? slots.set(d, []).get(d)!).push(`${f.claim.subjectRef} :: ${f.claim.attribute}`);
}
const collisions = [...slots.entries()].filter(([, v]) => new Set(v).size > 1);
console.log(`\nd tags: ${slots.size.toLocaleString()} distinct for ${findings.length.toLocaleString()} findings`);
if (collisions.length) {
  flag(`${collisions.length} d-tag COLLISION(S) — one claim would silently replace another`);
  for (const [d, v] of collisions.slice(0, 5)) console.log(`     ${d} <- ${[...new Set(v)].join(' | ')}`);
}
const dupSlots = [...slots.entries()].filter(([, v]) => v.length > 1 && new Set(v).size === 1);
if (dupSlots.length) flag(`${dupSlots.length} slot(s) claimed twice by identical (subject, attribute) — the later replaces the earlier`);

// ---- 4 & 5. sign, verify independently, weigh ------------------------------
const keys = ml_dsa65.keygen();
const store = new ForeignFindingStore();
const sample = findings.filter((_, i) => i % Math.ceil(findings.length / 60) === 0);
let accepted = 0;
const weightGap: number[] = [];
for (const f of sample) {
  const signed = signFinding(f, keys.secretKey);
  if (!peer.verifyClaim(signed)) { flag(`peer could not verify our own signature: ${f.claim.subjectRef}`); continue; }
  const why = peer.rejectionReason(signed.content);
  if (why) { flag(`peer refuses our payload (${why}): ${f.claim.subjectRef} / ${f.claim.attribute}`); continue; }
  const r = store.accept(signed);
  if (!r.accepted) { flag(`our own store refuses it (${r.reason}): ${f.claim.subjectRef}`); continue; }
  accepted++;
  const mine = explainAttestationWeight(f).weight;
  const theirs = peer.deriveWeight(f).weight;
  weightGap.push(Math.abs(mine - theirs));
  if (!(mine > 0) || mine > 1) flag(`weight out of range (${mine}): ${f.claim.subjectRef}`);
}
console.log(`\nsampled ${sample.length}: ${accepted} signed, independently verified, and accepted`);
console.log(`largest weight disagreement with the independent implementation: ${Math.max(...weightGap).toExponential(2)}`);

// ---- what a reader would actually see --------------------------------------
console.log('\nclaim values as the commons would print them:');
for (const attr of [...new Set(findings.map(f => f.claim.attribute))]) {
  const f = findings.find(x => x.claim.attribute === attr)!;
  console.log(`   ${attr}: ${JSON.stringify(f.claim.value)}`);
}

console.log(`\n${problems === 0 ? 'No problems found.' : `${problems} PROBLEM(S) FOUND.`}\n`);
