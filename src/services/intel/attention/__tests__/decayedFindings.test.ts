import { describe, it, expect } from 'vitest';
import { produceDecayedFindingItems, RECHECK_WEIGHT_THRESHOLD } from '../decayedFindingProducer';
import type { PublishedFinding } from '../../findings/PublishedFindingsLedger';
import type { FindingAttestation } from '../../findings/attestation';

const content = (publishedAt: string, sourceCount = 4): FindingAttestation => ({
  schemaVersion: 2,
  claim: { subjectRef: 'MV Northwind', subjectKind: 'object', attribute: 'location', value: { lat: 1, lon: 2 } },
  publishedAt,
  method: {
    algorithm: 'location-corroboration', algorithmVersion: 1,
    criteria: 'x', sourceCount,
    observedFrom: publishedAt, observedTo: publishedAt,
    timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
  },
} as FindingAttestation);

const published = (publishedAt: string, over: Partial<PublishedFinding> = {}): PublishedFinding => ({
  slot: 'starcom_finding_mv_northwind_location',
  content: content(publishedAt),
  publishedAt, confirmedAt: publishedAt, ...over,
});

const NOW = () => new Date('2026-08-21T00:00:00Z');

describe('decayed published findings', () => {
  it('says nothing about a claim published yesterday', () => {
    expect(produceDecayedFindingItems({ published: [published('2026-08-20T00:00:00Z')] }, NOW)).toEqual([]);
  });

  it('asks for a recheck once the derived weight falls past the threshold', () => {
    // ~2 years at a 180-day half-life leaves recency well under 0.1.
    const items = produceDecayedFindingItems({ published: [published('2024-08-21T00:00:00Z')] }, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('published-finding-decayed');
    expect(items[0].explanation).toMatch(/still standing on every relay/);
  });

  it('ignores a claim already withdrawn', () => {
    // Retracted means the obligation is discharged. Continuing to ask would be
    // the queue nagging about something the analyst has already handled.
    const items = produceDecayedFindingItems(
      { published: [published('2024-08-21T00:00:00Z', { retractedAt: '2026-01-01T00:00:00Z' })] }, NOW);
    expect(items).toEqual([]);
  });

  it('keeps one concern per slot however far it decays', () => {
    // The id must not carry the weight or a timestamp, or the same claim
    // resurfaces as new on every pass as it decays further.
    const rec = published('2024-08-21T00:00:00Z');
    const a = produceDecayedFindingItems({ published: [rec] }, () => new Date('2026-08-21T00:00:00Z'));
    const b = produceDecayedFindingItems({ published: [rec] }, () => new Date('2027-08-21T00:00:00Z'));
    expect(a[0].id).toBe(b[0].id);
  });

  it('never lets an old claim outrank a live contradiction', () => {
    // Decay is a debt worth paying; it is not an emergency. A contradiction
    // touching an open case commonly scores 0.7+.
    const ancient = produceDecayedFindingItems({ published: [published('2010-01-01T00:00:00Z')] }, NOW);
    expect(ancient[0].severity).toBeLessThanOrEqual(0.6);
  });

  it('grows more insistent the weaker the claim gets', () => {
    const newer = produceDecayedFindingItems({ published: [published('2025-06-01T00:00:00Z')], threshold: 0.9 }, NOW);
    const older = produceDecayedFindingItems({ published: [published('2020-06-01T00:00:00Z')], threshold: 0.9 }, NOW);
    expect(older[0].severity).toBeGreaterThan(newer[0].severity);
  });

  it('uses the documented threshold by default', () => {
    expect(RECHECK_WEIGHT_THRESHOLD).toBeGreaterThan(0);
    expect(RECHECK_WEIGHT_THRESHOLD).toBeLessThan(1);
  });
});
