/**
 * Two derivations inside one node must not be able to disagree.
 *
 * deriveClaimWeight was added to this directory while deriveAttestationWeight
 * already existed one directory over with twelve consumers, including
 * foreignFinding.ts in this very folder. The justification written into its
 * docstring — that independent implementations keep the network honest — is an
 * argument about SEPARATE NODES. It says nothing in favour of two copies inside
 * a single application, where the only thing a second copy can add is a way for
 * the same claim to be judged two ways.
 *
 * They were compared before the duplicate was removed and agreed on every case
 * below, so no claim was ever judged inconsistently. The test now pins the
 * thing that replaced it: the ingest guard must accept exactly the claims the
 * canonical derivation can rank, and reject exactly the ones it cannot.
 */
import { describe, it, expect } from 'vitest';
import { yieldsUsableWeight } from '../deriveClaimWeight';
import { explainAttestationWeight } from '../../findings/deriveAttestationWeight';

const at = new Date('2026-06-01T00:00:00.000Z');

const claim = (over: Record<string, unknown> = {}) => ({
  method: {
    algorithm: 'x', algorithmVersion: 1,
    parameters: { matchedBy: 'equality', windowHours: 0, distanceThresholdKm: 0 },
    sourceCount: 1,
    observedFrom: '2026-05-01T00:00:00.000Z',
    observedTo: '2026-05-01T00:00:00.000Z',
    timePrecisionMs: 86_400_000,
    modality: 'primary_record',
    weakBacking: [],
    criteria: 'c',
    ...over,
  },
  publishedAt: '2026-05-01T00:00:00.000Z',
});

describe('the ingest guard tracks the canonical derivation', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['single source, equality',      {}],
    ['three sources',                { sourceCount: 3 }],
    ['saturating at four',           { sourceCount: 9 }],
    ['relayed sources',              { sourceCount: 3, relayedVia: ['wikidata'] }],
    ['proximity match',              { parameters: { matchedBy: 'proximity', windowHours: 24, distanceThresholdKm: 5 }, timePrecisionMs: 3_600_000 }],
    ['enumeration with boundary',    { parameters: { matchedBy: 'enumeration', windowHours: 0, distanceThresholdKm: 0 }, enumeratedBoundary: 'all UK companies' }],
  ];

  for (const [name, over] of cases) {
    it(`admits the rankable case: ${name}`, () => {
      const c = claim(over);
      const { weight } = explainAttestationWeight(c as never, { now: at });
      expect(Number.isFinite(weight)).toBe(true);
      expect(yieldsUsableWeight(c)).toBe(true);
    });
  }

  it('rejects a claim the derivation cannot rank', () => {
    // Every required field present and well-formed; parameters.windowHours
    // absent, so the derivation multiplies by NaN. This is the 191-claim case.
    const broken = claim({ parameters: { matchedBy: 'proximity', distanceThresholdKm: 5 } });
    expect(yieldsUsableWeight(broken)).toBe(false);
  });
});
