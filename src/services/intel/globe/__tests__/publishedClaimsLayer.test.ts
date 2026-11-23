import { describe, it, expect } from 'vitest';
import { buildPublishedClaimsLayer, PUBLISHED_CLAIMS_OVERLAY } from '../publishedClaimsLayer';
import { GLOBE_INTEL_LAYER_VERSION } from '../globeIntelLayer';
import type { PublishedFinding } from '../../findings/PublishedFindingsLedger';

/**
 * I.A.5's contract test: a second, unrelated source layer built through the
 * contract alone. Its subject is the published-findings ledger, which shares
 * nothing with the correlation engine — no Events, no conflicts, no context.
 */
const published = (subject: string, over: Partial<PublishedFinding> = {}, value: unknown = { lat: 51.5, lon: -0.12 }): PublishedFinding => ({
  slot: `starcom_finding_${subject.toLowerCase()}_location`,
  publishedAt: '2026-06-01T00:00:00Z',
  confirmedAt: '2026-06-01T00:00:00Z',
  content: {
    schemaVersion: 2,
    claim: { subjectRef: subject, subjectKind: 'object', attribute: 'location', value },
    publishedAt: '2026-06-01T00:00:00Z',
    method: {
      algorithm: 'location-corroboration', algorithmVersion: 1, criteria: 'c', sourceCount: 4,
      observedFrom: '2026-05-31T00:00:00Z', observedTo: '2026-06-01T00:00:00Z',
      timePrecisionMs: 3_600_000, parameters: { windowHours: 24, distanceThresholdKm: 5 },
    },
  } as never,
  ...over,
});

const NOW = new Date('2026-08-21T00:00:00Z');

describe('published claims as a globe layer', () => {
  it('satisfies the layer contract', () => {
    const l = buildPublishedClaimsLayer([published('Northwind')], { now: NOW });
    expect(l.id).toBe(PUBLISHED_CLAIMS_OVERLAY);
    expect(l.version).toBe(GLOBE_INTEL_LAYER_VERSION);
    expect(l).toHaveProperty('unplaceable');
    expect(l).toHaveProperty('coincidentMarkIds');
    expect(l).toHaveProperty('truncated');
    expect(l).toHaveProperty('emptyReason');
    expect(l).toHaveProperty('integrity');
  });

  it('names its OWN provenance rather than the correlation engine', () => {
    // The first thing this exercise found: derivedFrom was typed to the single
    // literal 'correlation-engine', so a second layer could not say where it
    // came from without lying.
    expect(buildPublishedClaimsLayer([published('Northwind')], { now: NOW })
      .provenance.derivedFrom).toBe('published-findings-ledger');
  });

  it('shows the weight a stranger derives TODAY, not the one at publication', () => {
    // A pin holding its original weight would show the claim as we remember
    // it rather than as anyone else now sees it.
    const fresh = buildPublishedClaimsLayer([published('A')], { now: new Date('2026-06-01T00:00:00Z') });
    const aged = buildPublishedClaimsLayer([published('A')], { now: new Date('2028-06-01T00:00:00Z') });
    expect(aged.marks[0].weight).toBeLessThan(fresh.marks[0].weight);
  });

  it('omits retracted claims — they are no longer asserted', () => {
    const l = buildPublishedClaimsLayer(
      [published('A', { retractedAt: '2026-07-01T00:00:00Z' })], { now: NOW });
    expect(l.marks).toEqual([]);
  });

  it('counts a claim whose value is not a coordinate rather than dropping it silently', () => {
    // A published claim can be unplaceable in a way a finding cannot: `value`
    // is opaque `unknown` on the wire and the format does not promise a point.
    const l = buildPublishedClaimsLayer([published('A', {}, { note: 'somewhere' })], { now: NOW });
    expect(l.marks).toEqual([]);
    expect(l.unplaceable.count).toBe(1);
    expect(l.unplaceable.reasons).toHaveProperty('claim value is not a coordinate');
    expect(l.emptyReason).toBe('all-unplaceable');
  });

  it('distinguishes an empty ledger from one nothing could be placed from', () => {
    expect(buildPublishedClaimsLayer([], { now: NOW }).emptyReason).toBe('no-observations');
  });

  it('respects the mark budget and reports the truncation', () => {
    const many = Array.from({ length: 60 }, (_, i) => published(`S${i}`));
    const l = buildPublishedClaimsLayer(many, { now: NOW, maxMarks: 10 });
    expect(l.marks).toHaveLength(10);
    expect(l.truncated).toEqual({ shown: 10, total: 60, budgetOverrun: false });
  });

  it('publishes no links, because the contract can only express contradictions', () => {
    // Recorded, not worked around: GlobeConflictLink carries `strength` and
    // `distanceKm`, so a layer with a different kind of relationship has no
    // way to state one. A known limit of the contract.
    expect(buildPublishedClaimsLayer([published('A')], { now: NOW }).links).toEqual([]);
  });
});
