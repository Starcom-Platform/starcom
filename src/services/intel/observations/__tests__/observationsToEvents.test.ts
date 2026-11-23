import { describe, it, expect } from 'vitest';
import { observationsToEvents } from '../observationsToEvents';
import { weightOf, hasMixedWeightBasis, DEFAULT_WEIGHT } from '../weightOf';
import { ucdpAdapter } from '../adapters/ucdpAdapter';
import { usgsAdapter } from '../adapters/naturalEventAdapter';
import { REGISTERED_SOURCES } from '../adapters';
import { computeLocationConflicts, computeCorroboratedFindings } from '../../../../applications/intelanalyzer/state/correlationUtils';
import type { Event } from '../../../../applications/intelanalyzer/adapters/eventsAdapter';
import type { NaturalEvent } from '../../../GeoEventsService';

const NOW = new Date('2026-08-20T00:00:00Z');

const ucdpRecords = [
  { id: 1, date_start: '2026-08-18', latitude: 12.0, longitude: 43.0, side_a: 'Acme Militia', country: 'Somalia', best: 3 },
];
const usgsRecords: NaturalEvent[] = [
  { id: 'us1', lat: 38.1, lng: -122.3, type: 'earthquake', magnitude: 5.4, timestamp: '2026-08-18T00:00:00Z', source: 'USGS', description: 'M 5.4 - Northern California' },
];

function eventsFromSources(): Event[] {
  const obs = [
    ...ucdpAdapter.toObservations(ucdpRecords).observations,
    ...usgsAdapter.toObservations(usgsRecords).observations,
  ];
  return observationsToEvents(obs, REGISTERED_SOURCES, NOW);
}

describe('observationsToEvents', () => {
  it('produces events the correlation engine can actually read', () => {
    const events = eventsFromSources();

    expect(events).toHaveLength(2);
    for (const ev of events) {
      expect(ev.sourceType).toBe('OBSERVATION');
      expect(typeof ev.lat).toBe('number');
      expect(typeof ev.lon).toBe('number');
      expect(ev.entityRefs.length).toBeGreaterThan(0);
    }
    // The whole point: these run through the engine without throwing.
    expect(() => computeLocationConflicts(events)).not.toThrow();
    expect(() => computeCorroboratedFindings(events)).not.toThrow();
  });

  it('stamps every observation-derived event as derived', () => {
    for (const ev of eventsFromSources()) {
      expect(weightOf(ev).basis).toBe('derived');
    }
  });

  it('ranks a grade-A measured source above a grade-B reported one', () => {
    const events = eventsFromSources();
    const usgs = events.find(e => e.sourceId.startsWith('usgs'))!;
    const ucdp = events.find(e => e.sourceId.startsWith('ucdp'))!;

    // Same age; USGS is A/measured, UCDP is B/reported.
    expect(weightOf(usgs).value).toBeGreaterThan(weightOf(ucdp).value);
  });

  it('gives an unregistered source the lowest grade, not an average one', () => {
    const [obs] = ucdpAdapter.toObservations(ucdpRecords).observations;
    const orphan = observationsToEvents([obs], [], NOW)[0];
    const known = observationsToEvents([obs], REGISTERED_SOURCES, NOW)[0];

    // Unknown provenance is a reason for less weight, never for typical weight.
    expect(orphan.confidence!).toBeLessThan(known.confidence!);
  });

  it('uses the observation id as sourceId so events from one feed can still corroborate', () => {
    // computeLocationConflicts skips pairs sharing a sourceId. Using the FEED
    // id would make every event from a feed unable to corroborate or
    // contradict any other from that feed — silently disabling the engine for
    // exactly the sources this phase exists to add.
    const events = eventsFromSources();
    expect(new Set(events.map(e => e.sourceId)).size).toBe(events.length);
  });
});

describe('weightOf', () => {
  it('reports an author-typed confidence as declared', () => {
    expect(weightOf({ confidence: 0.9, confidenceBasis: 'declared', sourceType: 'REPORT' }).basis).toBe('declared');
  });

  it('reports a legacy event with no recorded basis as unknown, not as derived', () => {
    // Guessing 'declared' would assert something never recorded.
    expect(weightOf({ confidence: 0.7, sourceType: 'REPORT' }).basis).toBe('unknown');
  });

  it('falls back to the engine default when no confidence exists at all', () => {
    expect(weightOf({ sourceType: 'REPORT' }).value).toBe(DEFAULT_WEIGHT);
  });
});

describe('hasMixedWeightBasis', () => {
  it('detects a set that mixes a derived weight with a declared one', () => {
    expect(hasMixedWeightBasis([
      { confidence: 0.8, confidenceBasis: 'derived', sourceType: 'OBSERVATION' },
      { confidence: 0.9, confidenceBasis: 'declared', sourceType: 'REPORT' },
    ])).toBe(true);
  });

  it('does not flag a homogeneous set', () => {
    expect(hasMixedWeightBasis(eventsFromSources())).toBe(false);
  });

  it('does not treat unrecorded basis as a mix on its own', () => {
    // Otherwise every legacy workspace would show a permanent warning that
    // says nothing actionable.
    expect(hasMixedWeightBasis([
      { confidence: 0.8, sourceType: 'REPORT' },
      { confidence: 0.9, sourceType: 'INTEL_ITEM' },
    ])).toBe(false);
  });
});

describe('names ride beside the claim, never in it (plan item 3.6)', () => {
  const obs = {
    id: 'wikidata:391200XXYCPAKDL8MN50:Q3509449:headquartersCity',
    sourceId: 'wikidata',
    upstreamSourceId: 'wikidata-cites:Q3509449',
    upstreamSourceLabel: 'SIRENE',
    subjectEntityRef: '391200XXYCPAKDL8MN50',
    subjectName: 'Lohner Capital GmbH',
    claim: { attribute: 'headquartersCity', value: 'Q1726' },
    valueLabel: 'Munich',
    timestamp: '2026-08-18T00:00:00.000Z',
    method: 'reported' as const,
    label: 'Munich (391200XXYCPAKDL8MN50) via SIRENE',
    tags: [],
    subjectKind: 'organization' as const,
    isMock: false,
    schemaVersion: 1,
  };

  it('carries the subject, value and source names onto the event', () => {
    const [ev] = observationsToEvents([obs as never], REGISTERED_SOURCES, NOW);
    expect(ev.subjectName).toBe('Lohner Capital GmbH');
    expect(ev.valueLabel).toBe('Munich');
    expect(ev.feedLabel).toBe('SIRENE');
    // What the engine compares is unchanged.
    expect(ev.claim).toEqual({ attribute: 'headquartersCity', value: 'Q1726' });
    expect(ev.entityRefs).toEqual(['391200XXYCPAKDL8MN50']);
    expect(ev.feedId).toBe('wikidata-cites:Q3509449');
  });

  it('leaves them out when the observation has none', () => {
    const [ev] = observationsToEvents(ucdpAdapter.toObservations(ucdpRecords).observations, REGISTERED_SOURCES, NOW);
    expect(ev.subjectName).toBeUndefined();
    expect(ev.valueLabel).toBeUndefined();
    expect(ev.feedLabel).toBeUndefined();
  });
});
