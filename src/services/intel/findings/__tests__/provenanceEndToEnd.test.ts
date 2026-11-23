import { describe, it, expect } from 'vitest';
import { adaptReportsToEvents } from '../../../../applications/intelanalyzer/adapters/eventsAdapter';
import { observationsToEvents } from '../../observations/observationsToEvents';
import { bucketByEntity, findingForBucket } from '../../../../applications/intelanalyzer/state/correlationUtils';
import { evaluatePublication } from '../publicationPolicy';
import type { Observation, Source } from '../../../../types/intel/SourceObservation';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

/**
 * D7, end to end: provenance has to survive the whole way from the record
 * that produced it to the gate that decides whether it may be broadcast.
 *
 * Each hop was verified separately when it was written, and the flag still
 * failed to arrive — because the hops were built at different times and
 * nobody ran the chain. This test runs the chain.
 */

/**
 * `author` is the report's FEED, not a label: corroboration counts distinct
 * feeds, so two reports by the same analyst deliberately do NOT corroborate
 * (one person is one thing that can be wrong). This fixture therefore takes
 * an author per report — it previously hardcoded 'analyst' for both, which
 * made the primary path assert corroboration between one analyst and
 * themselves.
 */
const report = (id: string, lat: number, lon: number, when: string, author = `analyst-${id}`): IntelReportUI => ({
  id, title: `Sighting ${id}`, content: '', author,
  category: 'SIGHTING', tags: [], latitude: lat, longitude: lon,
  createdAt: new Date(when), updatedAt: new Date(when),
      // SUBMITTED: this chain starts from a report acting as evidence, and a
    // DRAFT no longer does. The provenance property under test is unaffected.
    status: 'SUBMITTED', confidence: 0.8, entityRefs: ['MV Northwind'],
  summary: '', conclusions: [], recommendations: [], methodology: [],
  targetAudience: [], sourceIntelIds: [], history: [],
} as unknown as IntelReportUI);

const source = (id: string, isMock: boolean): Source => ({
  id, kind: 'open-data', label: id, trustBaseline: 'B', ingestMethod: 'poll', isMock,
});

const observation = (id: string, sourceId: string, lat: number, when: string): Observation => ({
  id, sourceId, subjectEntityRef: 'MV Northwind',
  claim: { attribute: 'location', value: { lat, lon: 0 } },
  timestamp: when, method: 'reported', geo: { lat, lon: 0 },
  label: 'sighting', tags: [], subjectKind: 'object',
  isMock: false, schemaVersion: 1,
});

const findingFrom = (events: ReturnType<typeof observationsToEvents>) => {
  const buckets = bucketByEntity(events);
  const bucket = [...buckets.values()][0];
  return bucket ? findingForBucket(bucket.displayName, bucket.events) : null;
};

describe('provenance survives the whole chain', () => {
  it('a human-authored report yields a publishable finding', () => {
    // This is the primary path. If it does not publish, the feature is off.
    const events = adaptReportsToEvents([
      report('r1', 51.5, -0.12, '2026-01-01T00:00:00Z'),
      report('r2', 51.5, -0.13, '2026-01-01T02:00:00Z'),
    ]);
    const finding = findingFrom(events as never);
    expect(finding).not.toBeNull();
    expect(finding!.isMock).toBe(false);
    expect(evaluatePublication(finding!.subjectKind, { isMock: finding!.isMock }).allowed).toBe(true);
  });

  it('a finding with one fabricated contributor is refused', () => {
    // ANY mock contributor taints it. A finding built partly from demo data is
    // not partly real — it is unsafe to publish.
    const events = observationsToEvents(
      [observation('o1', 'real-src', 51.5, '2026-01-01T00:00:00Z'),
       { ...observation('o2', 'fake-src', 51.5, '2026-01-01T02:00:00Z'), isMock: true }],
      [source('real-src', false), source('fake-src', true)],
    );
    const finding = findingFrom(events);
    expect(finding).not.toBeNull();
    expect(finding!.isMock).toBe(true);
    expect(evaluatePublication(finding!.subjectKind, { isMock: finding!.isMock }).allowed).toBe(false);
  });

  it('a finding whose contributors never stated provenance is refused', () => {
    // Unmeasured is not permission. Events with no flag at all must not
    // inherit "real" by omission.
    const events = adaptReportsToEvents([
      report('r1', 51.5, -0.12, '2026-01-01T00:00:00Z'),
      report('r2', 51.5, -0.13, '2026-01-01T02:00:00Z'),
    ]).map((e) => ({ ...e, isMock: undefined }));
    const finding = findingFrom(events as never);
    expect(finding!.isMock).toBeUndefined();
    expect(evaluatePublication(finding!.subjectKind, { isMock: finding!.isMock }).allowed).toBe(false);
  });

  it('cannot launder a mock source by claiming the observation is real', () => {
    // The Observation says isMock:false; its Source says true. Reading only
    // the observation — which is what this hop used to do — would mark
    // fabricated data as genuine, and every downstream check would agree.
    const events = observationsToEvents(
      [observation('o1', 'fake-src', 51.5, '2026-01-01T00:00:00Z')],
      [source('fake-src', true)],
    );
    expect(events[0].isMock).toBe(true);
  });

  it('treats an unregistered source as unmeasured, not as real', () => {
    // Unknown provenance is a reason to refuse, never a claim of authenticity.
    const events = observationsToEvents(
      [observation('o1', 'nobody-knows', 51.5, '2026-01-01T00:00:00Z')],
      [],
    );
    expect(events[0].isMock).toBeUndefined();
    expect(evaluatePublication('object', { isMock: events[0].isMock }).allowed).toBe(false);
  });
});
