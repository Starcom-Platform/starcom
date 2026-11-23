import { describe, it, expect } from 'vitest';
import { explainAttestationWeight } from '../deriveAttestationWeight';
import { buildFindingAttestation } from '../FindingContent';
import { deriveAttestationWeight, explainAttestationWeight, ATTESTATION_HALF_LIFE_DAYS } from '../deriveAttestationWeight';
import { FINDING_SCHEMA_VERSION_V2 } from '../attestation';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

/**
 * Weight is derived from method and age, never declared by the author.
 *
 * v1 published `confidence: 0.72` — a number this instance asserted about its
 * own output. Inside one instance that is harmless. Across a federation it is
 * fatal: every instance can claim 1.0, and one operator running five instances
 * manufactures consensus for free.
 */

const NOW = () => new Date('2026-08-20T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const finding: CorroboratedFinding = {
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 10, lon: 20 },
  confidence: 0.82, sourceCount: 3,
  observedFrom: '2026-08-19T22:00:00.000Z', observedTo: '2026-08-19T23:00:00.000Z',
  algorithmVersion: 1,
};

describe('Finding v2 is an attestation', () => {
  it('carries claim, method and publication time', () => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);
    expect(a.schemaVersion).toBe(FINDING_SCHEMA_VERSION_V2);
    expect(a.claim.subjectRef).toBe('Acme Corp');
    expect(a.method.algorithm).toBe('location-corroboration');
    expect(a.publishedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('publishes NO confidence, weight, or score', () => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);
    // The input HAS a confidence. It must not survive onto the wire.
    expect(finding.confidence).toBe(0.82);
    expect(a).not.toHaveProperty('confidence');
    expect(a).not.toHaveProperty('weight');
    expect(a).not.toHaveProperty('score');
    expect(JSON.stringify(a)).not.toContain('0.82');
  });

  it('ships the parameters ACTUALLY used, not just an algorithm version', () => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);
    // Version alone cannot re-derive anything: two instances on version 1 with
    // different windows produce different findings, indistinguishably.
    expect(a.method.parameters.windowHours).toBeGreaterThan(0);
    expect(a.method.parameters.distanceThresholdKm).toBeGreaterThan(0);
  });

  it('carries the observation window and time precision', () => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [], timePrecisionMs: DAY }, NOW);
    expect(a.method.observedFrom).toBe('2026-08-19T22:00:00.000Z');
    expect(a.method.observedTo).toBe('2026-08-19T23:00:00.000Z');
    expect(a.method.timePrecisionMs).toBe(DAY);
  });

  it('never guesses what kind of thing the subject is', () => {
    // What a claim is ABOUT changes what it means; inventing it corrupts the
    // claim itself.
    expect(buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW).claim.subjectKind).toBe('unknown');
    expect(buildFindingAttestation(finding, { modality: 'inference', weakBacking: [], subjectKind: 'organization' }, NOW).claim.subjectKind).toBe('organization');
  });

  it('still carries no source identities — only a count', () => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, NOW);
    expect(a.method.sourceCount).toBe(3);
    expect(JSON.stringify(a)).not.toMatch(/sourceId|pubkey|analyst/i);
  });
});

describe('a consumer derives the weight from the wire alone', () => {
  const at = (iso: string, overrides: Partial<{ sourceCount: number; timePrecisionMs: number }> = {}) => {
    const a = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [], timePrecisionMs: overrides.timePrecisionMs ?? DAY }, () => new Date(iso));
    if (overrides.sourceCount !== undefined) a.method.sourceCount = overrides.sourceCount;
    return a;
  };

  it('is deterministic — the same attestation and instant give the same answer', () => {
    const a = at('2026-08-20T00:00:00Z');
    expect(deriveAttestationWeight(a, { now: NOW() })).toBe(deriveAttestationWeight(a, { now: NOW() }));
  });

  it('rewards more independent sources, with diminishing returns', () => {
    const two = deriveAttestationWeight(at('2026-08-20T00:00:00Z', { sourceCount: 2 }), { now: NOW() });
    const four = deriveAttestationWeight(at('2026-08-20T00:00:00Z', { sourceCount: 4 }), { now: NOW() });
    const forty = deriveAttestationWeight(at('2026-08-20T00:00:00Z', { sourceCount: 40 }), { now: NOW() });

    expect(four).toBeGreaterThan(two);
    // Saturating: linear growth would let a source-spamming instance
    // manufacture weight by splitting one source into forty.
    expect(forty).toBe(four);
  });

  it('penalises a finding whose timing is coarser than the window it claims', () => {
    const precise = deriveAttestationWeight(at('2026-08-20T00:00:00Z', { timePrecisionMs: 60_000 }), { now: NOW() });
    const vague = deriveAttestationWeight(at('2026-08-20T00:00:00Z', { timePrecisionMs: 30 * DAY }), { now: NOW() });
    expect(vague).toBeLessThan(precise);
  });

  it('decays with age, halving at one half-life', () => {
    const fresh = deriveAttestationWeight(at('2026-08-20T00:00:00Z'), { now: NOW() });
    const old = deriveAttestationWeight(
      at(new Date(NOW().getTime() - ATTESTATION_HALF_LIFE_DAYS * DAY).toISOString()),
      { now: NOW() },
    );
    expect(old).toBeCloseTo(fresh / 2, 3);
  });

  it('decomposes into parts that reconstruct the whole', () => {
    // A weight a consumer cannot decompose is indistinguishable from one that
    // was asserted.
    const d = explainAttestationWeight(at('2026-08-20T00:00:00Z'), { now: NOW() });
    expect(d.basis).toBe('derived');
    expect(d.corroboration * d.precision * d.recency).toBeCloseTo(d.weight, 3);
  });

  it('always lands in 0..1', () => {
    for (const sc of [2, 3, 10]) {
      for (const iso of ['2026-08-20T00:00:00Z', '2020-01-01T00:00:00Z']) {
        const w = deriveAttestationWeight(at(iso, { sourceCount: sc }), { now: NOW() });
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('relay discount (D16)', () => {
  const method = (over: Record<string, unknown> = {}) => ({
    algorithm: 'location-corroboration' as const,
    algorithmVersion: 1,
    criteria: 'c',
    sourceCount: 5,
    observedFrom: '2026-08-01T00:00:00Z',
    observedTo: '2026-08-01T00:00:00Z',
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
    ...over,
  });
  const at = (m: ReturnType<typeof method>) => ({ method: m, publishedAt: '2026-08-01T00:00:00Z' });
  const NOW = { now: new Date('2026-08-01T00:00:00Z') };

  it('weighs directly observed sources undiscounted', () => {
    expect(explainAttestationWeight(at(method()) as never, NOW).corroboration).toBe(1);
  });

  it('discounts additional sources that share one delivery path', () => {
    // Five sources through one aggregator: 1 + (5-1)*0.5 = 3 effective, of a
    // saturation of 4. One editor citing five registries is indistinguishable
    // downstream from five registries agreeing.
    const w = explainAttestationWeight(at(method({ relayedVia: ['wikidata'] })) as never, NOW);
    expect(w.corroboration).toBe(0.75);
  });

  it('still counts the first relayed source in full', () => {
    // Discounting to nothing would discard every claim any aggregator carries,
    // which is most open data. The evidence is real, it is just not
    // independent delivery.
    const w = explainAttestationWeight(at(method({ sourceCount: 1, relayedVia: ['wikidata'] })) as never, NOW);
    const direct = explainAttestationWeight(at(method({ sourceCount: 1 })) as never, NOW);
    expect(w.corroboration).toBe(direct.corroboration);
  });

  it('treats an absent relayedVia as direct observation', () => {
    expect(explainAttestationWeight(at(method({ sourceCount: 3 })) as never, NOW).corroboration)
      .toBeGreaterThan(explainAttestationWeight(at(method({ sourceCount: 3, relayedVia: ['x'] })) as never, NOW).corroboration);
  });

  it('never lets a relayed claim outweigh the same claim observed directly', () => {
    for (const n of [2, 3, 4, 8, 20]) {
      const relayed = explainAttestationWeight(at(method({ sourceCount: n, relayedVia: ['a'] })) as never, NOW).weight;
      const direct = explainAttestationWeight(at(method({ sourceCount: n })) as never, NOW).weight;
      expect(relayed).toBeLessThanOrEqual(direct);
    }
  });
});

describe('a wholly relayed claim can never reach independent strength', () => {
  const m = (n: number, relayed: boolean) => ({
    method: {
      algorithm: 'location-corroboration' as const, algorithmVersion: 1, criteria: 'c',
      sourceCount: n, observedFrom: '2026-08-01T00:00:00Z', observedTo: '2026-08-01T00:00:00Z',
      timePrecisionMs: 3_600_000, parameters: { windowHours: 24, distanceThresholdKm: 5 },
      ...(relayed ? { relayedVia: ['wikidata'] } : {}),
    },
    publishedAt: '2026-08-01T00:00:00Z',
  });
  const NOW = { now: new Date('2026-08-01T00:00:00Z') };

  it('never saturates, however many sources arrive through the relay', () => {
    // The discount alone was not enough: 3 of 187 real findings still reached
    // 1.0. The relay's failure mode does not weaken as sources accumulate —
    // one editor can cite eleven registries as easily as five.
    for (const n of [4, 8, 20, 100]) {
      expect(explainAttestationWeight(m(n, true) as never, NOW).corroboration).toBeLessThan(1);
    }
  });

  it('still saturates when the sources were observed directly', () => {
    expect(explainAttestationWeight(m(8, false) as never, NOW).corroboration).toBe(1);
  });

  it('is monotonic — more relayed sources never weigh less', () => {
    const w = [2, 3, 5, 9].map(n => explainAttestationWeight(m(n, true) as never, NOW).corroboration);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]);
  });
});

describe('enumeration claims are weighed on completeness, not independence', () => {
  const census = (boundary?: string) => ({
    method: {
      algorithm: 'address-enumeration' as const, algorithmVersion: 1,
      criteria: 'c', sourceCount: 1,
      observedFrom: '2026-08-01T00:00:00Z', observedTo: '2026-08-01T00:00:00Z',
      timePrecisionMs: 86_400_000,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' as const },
      ...(boundary ? { enumeratedBoundary: boundary } : {}),
    },
    publishedAt: '2026-08-01T00:00:00Z',
  });
  const NOW = { now: new Date('2026-08-01T00:00:00Z') };
  const BOUNDARY = 'Every company in postcode districts EC1V, WC2H — Companies House 2026-08-01';

  it('does not punish a census for having one source', () => {
    // sourceCount 1 through the corroboration term would score a complete
    // national register at a quarter. A census has no observers to agree.
    const w = explainAttestationWeight(census(BOUNDARY) as never, NOW);
    expect(w.corroboration).toBe(1);
    expect(w.weight).toBe(1);
  });

  it('refuses to support a count whose boundary is unstated', () => {
    // A count IS the entire claim. "40 companies" from data that happened to
    // hold 40 of 400 is not partial, it is false — and nobody can tell without
    // the boundary.
    const w = explainAttestationWeight(census() as never, NOW);
    expect(w.corroboration).toBe(0);
    expect(w.weight).toBe(0);
  });

  it('treats timing precision as inapplicable rather than as zero', () => {
    expect(explainAttestationWeight(census(BOUNDARY) as never, NOW).precision).toBe(1);
  });

  it('still decays with age, because a register snapshot goes stale', () => {
    const later = { now: new Date('2027-02-01T00:00:00Z') };
    const w = explainAttestationWeight(census(BOUNDARY) as never, later);
    expect(w.recency).toBeLessThan(1);
    expect(w.weight).toBeLessThan(1);
  });

  it('never applies the relay discount, which measures something else entirely', () => {
    const relayed = { ...census(BOUNDARY), method: { ...census(BOUNDARY).method, relayedVia: ['x'] } };
    expect(explainAttestationWeight(relayed as never, NOW).corroboration).toBe(1);
  });
});
describe('the derived weight is not rounded', () => {
  /**
   * Rounding here is presentational data leaking into arithmetic, and callers
   * ORDER by this number and compare it against a revisit threshold. Two true
   * weights of 0.99584 and 0.99581 both became 0.9958 — a tie resolved by
   * array position, which is not a property of the evidence.
   */
  const claim = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 2,
    claim: { subjectRef: 'X', subjectKind: 'place' as const, attribute: 'companiesAtRegisteredAddress', value: 12 },
    method: {
      algorithm: 'address-enumeration',
      algorithmVersion: 1,
      parameters: { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'enumeration' as const },
      sourceCount: 1,
      enumeratedBoundary: 'every company in X, snapshot 2026-08-01',
      observedFrom: '2026-08-01T00:00:00.000Z',
      observedTo: '2026-08-01T00:00:00.000Z',
      timePrecisionMs: 86_400_000,
      criteria: 'counted from a complete enumeration',
      ...over,
    },
    publishedAt: '2026-08-01T00:00:00.000Z',
  });

  it('returns more precision than four decimals', () => {
    // An age chosen so recency is a long decimal rather than a round number.
    const w = explainAttestationWeight(claim(), { now: new Date('2026-08-24T07:13:29.000Z') });

    expect(w.weight).not.toBe(Number(w.weight.toFixed(4)));
    expect(String(w.weight).split('.')[1].length).toBeGreaterThan(4);
  });

  it('keeps two nearly-equal weights distinguishable, so ordering is not a coin flip', () => {
    const a = explainAttestationWeight(claim(), { now: new Date('2026-08-24T07:13:29.000Z') });
    const b = explainAttestationWeight(claim(), { now: new Date('2026-08-24T07:14:29.000Z') });

    // One minute apart: identical to four decimals, and genuinely ordered.
    expect(Number(a.weight.toFixed(4))).toBe(Number(b.weight.toFixed(4)));
    expect(a.weight).toBeGreaterThan(b.weight);
  });

  it('agrees with an independent derivation far inside the NIP tolerance', () => {
    // The NIP states 1e-6 as ample. Rounding to four decimals put the
    // reference implementation 4.5e-5 away from an independent one — outside
    // its own specification.
    const c = claim();
    const now = new Date('2026-08-24T07:13:29.000Z');
    const mine = explainAttestationWeight(c, { now });

    const ageDays = (now.getTime() - Date.parse(c.method.observedTo)) / 86_400_000;
    const independent = 1 * 1 * Math.pow(0.5, ageDays / 180);

    expect(Math.abs(mine.weight - independent)).toBeLessThan(1e-6);
  });
});
