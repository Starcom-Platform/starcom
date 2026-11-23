/**
 * computeCorroboratedFindings — Findings Publisher's corroboration gate.
 * Only entities with 2+ independent sources agreeing on a location, AND
 * zero unresolved location conflicts, qualify.
 */
import { describe, it, expect } from 'vitest';
import { createGleifAdapter, NATIONAL_REGISTER_SOURCE_IDS } from '../../../../services/intel/observations/adapters/gleifAdapter';
import { computeCorroboratedFindings } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    title: 'Event',
    timestamp: '2026-06-01T12:00:00.000Z',
    category: 'general',
    tags: [],
    sourceType: 'REPORT',
    sourceId: `report-${Math.random().toString(36).slice(2)}`,
    entityRefs: [],
    ...overrides
  };
}

describe('computeCorroboratedFindings', () => {
  it('finds a corroborated location when 2 independent sources agree', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z' }) // a few km away, same city
    ];

    const findings = computeCorroboratedFindings(events);

    expect(findings).toHaveLength(1);
    expect(findings[0].entityRef).toBe('John Smith');
    expect(findings[0].attribute).toBe('location');
    expect(findings[0].sourceCount).toBe(2);
  });

  it('does NOT count the same source twice as corroboration', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060 }),
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7130, lon: -74.0062 }) // same sourceId, near-identical location
    ];

    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });

  it('a single, uncorroborated report produces no finding', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060 })
    ];

    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });

  it('an entity with an unresolved location conflict is excluded, even if some events also agree', () => {
    const events = [
      // Two events agree on NYC
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z' }),
      // A third, close in time, places the SAME entity in LA — a real conflict
      makeEvent({ sourceId: 'report-c', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T10:00:00.000Z' })
    ];

    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });

  it('never includes source identities — only a count', () => {
    const events = [
      makeEvent({ sourceId: 'top-secret-source-alpha', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'top-secret-source-beta', entityRefs: ['John Smith'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z' })
    ];

    const findings = computeCorroboratedFindings(events);
    const serialized = JSON.stringify(findings);

    expect(serialized).not.toContain('top-secret-source-alpha');
    expect(serialized).not.toContain('top-secret-source-beta');
  });

  it('is case/punctuation insensitive to entity naming (reuses normalizeEntityName)', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['john smith.'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z' })
    ];

    expect(computeCorroboratedFindings(events)).toHaveLength(1);
  });

  it('skips events with no location entirely, rather than crashing', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'] }), // no lat/lon
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 40.7580, lon: -73.9855 })
    ];

    expect(() => computeCorroboratedFindings(events)).not.toThrow();
    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });

  it('sorts most-corroborated (highest confidence, then most sources) first', () => {
    const events = [
      // Weak-confidence pair for "Weak Entity"
      makeEvent({ sourceId: 'w1', entityRefs: ['Weak Entity'], lat: 51.5072, lon: -0.1276, timestamp: '2026-06-01T08:00:00.000Z', confidence: 0.3 }),
      makeEvent({ sourceId: 'w2', entityRefs: ['Weak Entity'], lat: 51.5080, lon: -0.1280, timestamp: '2026-06-01T09:00:00.000Z', confidence: 0.3 }),
      // Strong-confidence pair for "Strong Entity"
      makeEvent({ sourceId: 's1', entityRefs: ['Strong Entity'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z', confidence: 0.9 }),
      makeEvent({ sourceId: 's2', entityRefs: ['Strong Entity'], lat: 40.7130, lon: -74.0062, timestamp: '2026-06-01T09:00:00.000Z', confidence: 0.9 })
    ];

    const findings = computeCorroboratedFindings(events);

    expect(findings).toHaveLength(2);
    expect(findings[0].entityRef).toBe('Strong Entity');
    expect(findings[0].confidence).toBeGreaterThan(findings[1].confidence);
  });

  it('defaults confidence to 0.5 per event when missing, not 0 or 1', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z', confidence: undefined }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z', confidence: undefined })
    ];

    const findings = computeCorroboratedFindings(events);
    expect(findings[0].confidence).toBe(0.5);
  });
});

describe('independence is measured in feeds, not records (D12)', () => {
  const atSamePlace = (over: Partial<Event>) => makeEvent({
    entityRefs: ['Acme Corp'], lat: 51.5, lon: -0.12,
    timestamp: '2026-06-01T12:00:00.000Z', confidence: 0.8, ...over,
  });

  it('does NOT let one feed corroborate itself, however many records it emits', () => {
    // The defect this pins. `sourceId` for an observation is the RECORD id, so
    // counting distinct sourceIds made two rows from one feed look like two
    // independent sources. Measured on the real UCDP asset: 1,795 records
    // produced 38 corroborated findings, every one single-feed, each
    // publishing sourceCount >= 2 on the wire.
    const oneFeed = [
      atSamePlace({ sourceId: 'ucdp-row-1', feedId: 'ucdp-ged' }),
      atSamePlace({ sourceId: 'ucdp-row-2', feedId: 'ucdp-ged' }),
      atSamePlace({ sourceId: 'ucdp-row-3', feedId: 'ucdp-ged' }),
    ];
    expect(computeCorroboratedFindings(oneFeed)).toEqual([]);
  });

  it('does corroborate across two genuinely independent feeds', () => {
    const twoFeeds = [
      atSamePlace({ sourceId: 'ucdp-row-1', feedId: 'ucdp-ged' }),
      atSamePlace({ sourceId: 'gdacs-row-1', feedId: 'gdacs' }),
    ];
    const found = computeCorroboratedFindings(twoFeeds);
    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('counts feeds, not records, in the published sourceCount', () => {
    // Four records, two feeds. Publishing 4 would overstate independence to
    // every consumer deriving a weight from it.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'a1', feedId: 'ucdp-ged' }),
      atSamePlace({ sourceId: 'a2', feedId: 'ucdp-ged' }),
      atSamePlace({ sourceId: 'b1', feedId: 'gdacs' }),
      atSamePlace({ sourceId: 'b2', feedId: 'gdacs' }),
    ]);
    expect(found[0].sourceCount).toBe(2);
  });

  it('still treats two analyst reports as two independent sources', () => {
    // Reports set feedId to their own id: each is authored separately by a
    // person, so the record IS the source. This must not regress.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'report-a', feedId: 'report-a' }),
      atSamePlace({ sourceId: 'report-b', feedId: 'report-b' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('falls back to the record id when no feed is stated, rather than refusing', () => {
    // Legacy events carry no feedId. Treating them as one anonymous feed would
    // silently stop all corroboration for existing data.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'legacy-a' }),
      atSamePlace({ sourceId: 'legacy-b' }),
    ]);
    expect(found).toHaveLength(1);
  });
});

describe('a feed and the feed it republishes are one source, not two', () => {
  const atSamePlace = (over: Partial<Event>) => makeEvent({
    entityRefs: ['Quake 7'], lat: -60.2649, lon: -47.2591,
    timestamp: '2026-08-22T07:40:00.000Z', confidence: 0.8, ...over,
  });

  it('refuses to corroborate USGS with a feed that republishes USGS', () => {
    // Verified against the live feeds: all 31 USGS earthquakes had a GDACS
    // counterpart at EXACTLY 0 metres — min, median and max. GDACS reprints
    // USGS coordinates. Counting that as two sources would be D12 again in a
    // more convincing costume.
    const echo = [
      atSamePlace({ sourceId: 'usgs-1', feedId: 'usgs-earthquakes' }),
      atSamePlace({ sourceId: 'gdacs-1', feedId: 'gdacs', derivesFrom: ['usgs-earthquakes'] }),
    ];
    expect(computeCorroboratedFindings(echo)).toEqual([]);
  });

  it('still counts the derived feed on its own when its upstream is absent', () => {
    // GDACS reporting a quake USGS did not is a real observation, just a
    // weaker one. Silencing it entirely would lose evidence.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'gdacs-1', feedId: 'gdacs', derivesFrom: ['usgs-earthquakes'] }),
      atSamePlace({ sourceId: 'eonet-1', feedId: 'nasa-eonet' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('counts three feeds as two when one of them is an echo of another', () => {
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'usgs-1', feedId: 'usgs-earthquakes' }),
      atSamePlace({ sourceId: 'gdacs-1', feedId: 'gdacs', derivesFrom: ['usgs-earthquakes'] }),
      atSamePlace({ sourceId: 'eonet-1', feedId: 'nasa-eonet' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('leaves undeclared feeds alone — this is a declaration, not a guess', () => {
    // Derivation cannot be inferred from agreement: perfect agreement is what
    // derivation looks like AND what strong corroboration looks like.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'a-1', feedId: 'feed-a' }),
      atSamePlace({ sourceId: 'b-1', feedId: 'feed-b' }),
    ]);
    expect(found[0].sourceCount).toBe(2);
  });
});

describe('attributes compared by equality, not distance', () => {
  const claim = (over: Partial<Event>, value: string, attribute = 'registeredCity') =>
    makeEvent({
      entityRefs: ['Lohner Capital GmbH'],
      timestamp: '2026-08-01T00:00:00.000Z',
      confidence: 0.8,
      claim: { attribute, value },
      ...over,
    });

  it('corroborates when two independent feeds assert the same value', () => {
    // There is no "within 5km" for a jurisdiction. Two registries either say
    // Winsen or they do not.
    const found = computeCorroboratedFindings([
      claim({ sourceId: 'g1', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'w1', feedId: 'res' }, 'winsen'),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].attribute).toBe('registeredCity');
    expect(found[0].value).toBe('winsen');
    expect(found[0].sourceCount).toBe(2);
  });

  it('does not corroborate when the two feeds disagree', () => {
    expect(computeCorroboratedFindings([
      claim({ sourceId: 'g1', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'w1', feedId: 'res' }, 'berlin'),
    ])).toEqual([]);
  });

  it('says NOTHING when a value is contested, rather than reporting the winning side', () => {
    // Two feeds say winsen, two say berlin. "Two independent sources agree on
    // winsen" would be true and misleading: it presents a contested claim as a
    // settled one by omitting the contest.
    expect(computeCorroboratedFindings([
      claim({ sourceId: 'a', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'b', feedId: 'res' }, 'winsen'),
      claim({ sourceId: 'c', feedId: 'sirene' }, 'berlin'),
      claim({ sourceId: 'd', feedId: 'euromp' }, 'berlin'),
    ])).toEqual([]);
  });

  it('tolerates a lone outlier against independently backed agreement', () => {
    // One unbacked variant is not a contest, it is an outlier. Suppressing on
    // it would let any single bad record veto a real corroboration.
    const found = computeCorroboratedFindings([
      claim({ sourceId: 'a', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'b', feedId: 'res' }, 'winsen'),
      claim({ sourceId: 'c', feedId: 'sirene' }, 'berlin'),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].value).toBe('winsen');
  });

  it('refuses a feed corroborating itself, exactly as the location path does', () => {
    expect(computeCorroboratedFindings([
      claim({ sourceId: 'g1', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'g2', feedId: 'gleif' }, 'winsen'),
    ])).toEqual([]);
  });

  it('refuses a feed corroborating the feed it republishes', () => {
    // The Wikidata statements citing "Global LEI Index" are GLEIF. 5,957 of
    // them, measured. They must not corroborate GLEIF.
    expect(computeCorroboratedFindings([
      claim({ sourceId: 'g1', feedId: 'gleif' }, 'winsen'),
      claim({ sourceId: 'w1', feedId: 'wikidata-gleif', derivesFrom: ['gleif'] }, 'winsen'),
    ])).toEqual([]);
  });

  it('keeps location and equality findings independent of each other', () => {
    // A contradiction about where something was physically seen says nothing
    // about whether two registries agree on its registered city.
    const found = computeCorroboratedFindings([
      makeEvent({ entityRefs: ['Acme'], lat: 51.5, lon: -0.12, sourceId: 'p1', feedId: 'f1', subjectKind: 'object', timestamp: '2026-08-01T00:00:00.000Z' }),
      makeEvent({ entityRefs: ['Acme'], lat: 40.0, lon: 10.0, sourceId: 'p2', feedId: 'f2', subjectKind: 'object', timestamp: '2026-08-01T01:00:00.000Z' }),
      claim({ entityRefs: ['Acme'], sourceId: 'g1', feedId: 'gleif' }, 'winsen'),
      claim({ entityRefs: ['Acme'], sourceId: 'w1', feedId: 'res' }, 'winsen'),
    ]);
    expect(found.map(f => f.attribute)).toEqual(['registeredCity']);
  });

  it('produces one finding per attribute', () => {
    const found = computeCorroboratedFindings([
      claim({ sourceId: 'g1', feedId: 'gleif' }, 'winsen', 'registeredCity'),
      claim({ sourceId: 'w1', feedId: 'res' }, 'winsen', 'registeredCity'),
      claim({ sourceId: 'g2', feedId: 'gleif' }, 'de', 'registeredCountry'),
      claim({ sourceId: 'w2', feedId: 'res' }, 'de', 'registeredCountry'),
    ]);
    expect(found.map(f => f.attribute).sort()).toEqual(['registeredCity', 'registeredCountry']);
  });
});
describe('GLEIF is downstream of the registers it validates against', () => {
  const atSamePlace = (over: Partial<Event>) => makeEvent({
    entityRefs: ['Acme Holdings'], lat: 59.9139, lon: 10.7522,
    timestamp: '2026-08-22T09:00:00.000Z', confidence: 0.8, ...over,
  });

  it('refuses to corroborate a national register with GLEIF', () => {
    /**
     * An LEI issuer validates each entity against its home register and
     * records the number it found there, then revalidates annually. So this
     * agreement is one source restating another, not two observers.
     *
     * Measured rather than assumed: 57,187 Norwegian entities joined on
     * organisation number agree on postcode 91% of the time, and the agreement
     * is maintained by the copying — records still revalidated disagree 2.96%,
     * lapsed ones 23.50%. See docs/measurements/gleif-register-agreement.md.
     */
    const echo = [
      atSamePlace({ sourceId: 'brreg-1', feedId: 'brreg' }),
      atSamePlace({ sourceId: 'gleif-1', feedId: 'gleif', derivesFrom: [...NATIONAL_REGISTER_SOURCE_IDS] }),
    ];

    expect(computeCorroboratedFindings(echo)).toEqual([]);
  });

  it('still counts GLEIF on its own when no register is present', () => {
    // GLEIF holding an entity no ingested register covers is a real
    // observation. Silencing it entirely would lose evidence.
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'gleif-1', feedId: 'gleif', derivesFrom: [...NATIONAL_REGISTER_SOURCE_IDS] }),
      atSamePlace({ sourceId: 'wd-1', feedId: 'wikidata' }),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('counts a register, GLEIF and a third feed as two independent sources', () => {
    const found = computeCorroboratedFindings([
      atSamePlace({ sourceId: 'ch-1', feedId: 'companies-house' }),
      atSamePlace({ sourceId: 'gleif-1', feedId: 'gleif', derivesFrom: [...NATIONAL_REGISTER_SOURCE_IDS] }),
      atSamePlace({ sourceId: 'wd-1', feedId: 'wikidata' }),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].sourceCount).toBe(2);
  });

  it('names every register id the adapter declares, so adding one cannot be forgotten quietly', () => {
    // The declaration is only worth what the ids are worth: a register source
    // added under an id missing from this list is silently independent again.
    // Built through the factory, because there is no singleton — the resolver
    // is irrelevant to what the source declares about its own provenance.
    const adapter = createGleifAdapter(() => undefined);
    expect(adapter.source.derivesFrom).toEqual([...NATIONAL_REGISTER_SOURCE_IDS]);
    expect(NATIONAL_REGISTER_SOURCE_IDS.length).toBeGreaterThan(0);
  });
});
