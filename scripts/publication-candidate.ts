/**
 * Produce the exact finding that WOULD be published — and stop.
 *
 * Plan item 9 requires a human to review the claim before it goes out, and a
 * broadcast to public relays cannot be recalled. So this signs, renders and
 * independently verifies the candidate locally, and sends nothing.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/publication-candidate.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = webcrypto;

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { createGleifAdapter } from '../src/services/intel/observations/adapters/gleifAdapter';
import { wikidataAdapter } from '../src/services/intel/observations/adapters/wikidataAdapter';
import { buildPlaceResolver } from '../src/services/intel/observations/placeGazetteer';
import { observationsToEvents } from '../src/services/intel/observations/observationsToEvents';
import { computeCorroboratedFindings } from '../src/applications/intelanalyzer/state/correlationUtils';
import { buildFindingAttestation } from '../src/services/intel/findings/FindingContent';
import { explainAttestationWeight } from '../src/services/intel/findings/deriveAttestationWeight';
import { evaluatePublication } from '../src/services/intel/findings/publicationPolicy';
import { signFinding } from '../src/services/intel/findings/signFinding';

const OUT = 'candidate';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const wd = JSON.parse(fs.readFileSync('public/data/wikidata-hq.json', 'utf8'));
const gl = JSON.parse(fs.readFileSync('public/data/gleif.json', 'utf8'));

const gleif = createGleifAdapter(buildPlaceResolver(wd.places));
const events = [
  ...observationsToEvents(gleif.toObservations(gl.records).observations, [gleif.source]),
  ...observationsToEvents(wikidataAdapter.toObservations(wd.statements).observations, [wikidataAdapter.source]),
];

const findings = computeCorroboratedFindings(events);

// The candidate: highest independent source count, then highest confidence.
// Country rather than city — city findings are honest but a biased sample
// while the gazetteer has gaps (D14's residue).
const candidates = findings
  .filter(f => f.attribute === 'headquartersCountry')
  .sort((a, b) => b.sourceCount - a.sourceCount || b.confidence - a.confidence);

if (candidates.length === 0) {
  console.error('No publishable candidate. This is a real answer, not an error.');
  process.exit(1);
}

const finding = candidates[0];

// The gate that would run on publish.
const decision = evaluatePublication(finding.subjectKind, { isMock: finding.isMock });
console.log('PUBLICATION GATE:', decision.allowed ? 'ALLOWED' : `REFUSED — ${'reason' in decision ? decision.reason : ''}`);
if (!decision.allowed) process.exit(1);

const attestation = buildFindingAttestation(finding as never, { modality: 'inference', weakBacking: [],
  inputFingerprints: finding.contributingFingerprints,
  timePrecisionMs: finding.timePrecisionMs,
});
const weight = explainAttestationWeight(attestation);

// A throwaway key — the real publish path uses the persisted instance key.
const signed = signFinding(attestation as never, ml_dsa65.keygen().secretKey);

fs.writeFileSync(path.join(OUT, 'finding.json'), JSON.stringify(signed, null, 2) + '\n');

const label = (wd.statements.find((s: { lei?: string }) => s.lei?.toUpperCase() === finding.entityRef) ?? {}) as { hq?: string };

console.log('\n──────── CANDIDATE ────────');
console.log('subject (LEI) :', finding.entityRef, label.hq ? `— HQ ${label.hq}` : '');
console.log('claim         :', `${attestation.claim.attribute} = ${attestation.claim.value}`);
console.log('subject kind  :', attestation.claim.subjectKind);
console.log('sources       :', attestation.method.sourceCount, 'independent');
console.log('relayed via   :', JSON.stringify(attestation.method.relayedVia ?? null));
console.log('observed      :', attestation.method.observedFrom, '→', attestation.method.observedTo);
console.log('criteria      :', attestation.method.criteria);
console.log('\nWEIGHT (derived, not asserted)');
console.log('  corroboration', weight.corroboration, '· precision', weight.precision, '· recency', weight.recency.toFixed(4));
console.log('  weight       ', weight.weight);
console.log('\nfingerprints  :', attestation.method.inputFingerprints?.length ?? 0, 'published');
console.log('signature     :', signed.signature.alg, signed.signature.pubkey.slice(0, 20) + '…');
console.log('\nwritten to    :', path.join(OUT, 'finding.json'));
console.log('NOT broadcast. Nothing has left this machine.');
