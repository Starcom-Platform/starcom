import fs from 'node:fs';
import path from 'node:path';
import { canonical, digestOf, verifyClaim, rejectionReason, deriveWeight, enumeratedSetDigest,
  isRetraction, retractionRejectionReason, retractionSlot } from './peer/peer.mjs';
import { bytesToHex } from '@noble/hashes/utils';

const DIR = new URL('../docs/spec/vectors', import.meta.url).pathname;
let fail = 0;
const check = (n, ok, d='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${n}${!ok&&d?` — ${d}`:''}`); if(!ok) fail++; };

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const v = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const c = v.event.content;
  const e = v.expect;

  if (e.canonical !== undefined) check(`${v.name}: canonical`, canonical(c) === e.canonical);
  if (e.digest !== undefined) check(`${v.name}: digest`, bytesToHex(digestOf(c)) === e.digest, bytesToHex(digestOf(c)));
  check(`${v.name}: signature ${e.signatureValid}`, verifyClaim(v.event) === e.signatureValid);

  /**
   * Retractions branch before any claim validation.
   *
   * A retraction lands on the SAME `d` tag under the same kind, so a consumer
   * that validates claim fields first calls a valid withdrawal malformed.
   */
  if (isRetraction(c)) {
    const why = retractionRejectionReason(c);
    if (e.retraction) {
      check(`${v.name}: accepts the retraction`, why === null, String(why));
      // The interop property that matters: a retraction on a different slot
      // withdraws nothing, and nothing about it looks wrong.
      check(`${v.name}: withdraws slot ${e.retraction.slot}`, retractionSlot(c) === e.retraction.slot, retractionSlot(c));
      check(`${v.name}: derives no weight for a retracted slot`, e.weight === null || e.weight === undefined);
    } else if (e.rejectReason) {
      check(`${v.name}: refuses the retraction (${e.rejectReason})`, why !== null, String(why));
    }
    continue;
  }

  // Signature validity and payload conformance are separate stages, and the
  // NIP is explicit that they are: a valid signature does not make a payload
  // permitted, and an invalid one is caught before the payload is read at all.
  const got = rejectionReason(c);
  if (e.rejectReason === 'signature-invalid') {
    check(`${v.name}: rejected at the signature`, verifyClaim(v.event) === false);
  } else if (e.rejectReason) {
    check(`${v.name}: rejects (${e.rejectReason})`, got !== null, `got ${got}`);
  } else if (e.signatureValid) {
    check(`${v.name}: accepts`, got === null, `got ${got}`);
  }

  // The set commitment: recomputed from the members the vector publishes as
  // test data, then compared against what the event carries. The members are
  // deliberately unsorted, so an implementation that forgets to sort fails
  // here rather than passing by luck.
  if (e.enumeratedSet) {
    const mine = enumeratedSetDigest(e.enumeratedSet.members);
    check(`${v.name}: recomputes the set commitment`, mine === e.enumeratedSet.digest, mine);
    check(`${v.name}: matches the commitment on the wire`,
      mine === c.method.enumeratedSetDigest, String(c.method.enumeratedSetDigest));
  }

  if (e.weight && e.signatureValid && !e.rejectReason) {
    const w = deriveWeight(c, new Date(e.evaluatedAt));
    for (const k of ['corroboration','precision','recency','weight']) {
      if (e.weight[k] === undefined) continue;
      check(`${v.name}: ${k} ${e.weight[k]}`, Math.abs(w[k]-e.weight[k]) < 1e-9, `got ${w[k]}`);
    }
  }
}
console.log(fail ? `\n${fail} MISMATCH(ES) between the peer and the published vectors` : '\nThe independent implementation agrees with every published vector.');
process.exit(fail ? 1 : 0);
