import { describe, it, expect } from 'vitest';
import { runAdapterContract } from '../adapterContract';
import { wikidataAdapter, type WikidataHqStatement } from '../wikidataAdapter';
import { observationsToEvents } from '../../observationsToEvents';
import { createGleifAdapter } from '../gleifAdapter';
import { buildPlaceResolver } from '../../placeGazetteer';
import { computeCorroboratedFindings } from '../../../../../applications/intelanalyzer/state/correlationUtils';

const st = (over: Partial<WikidataHqStatement> = {}): WikidataHqStatement => ({
  lei: '391200XXYCPAKDL8MN50',
  hqQid: 'QWINSEN',
  hq: 'Winsen',
  country: 'Germany',
  sourceQid: 'Q104806723',
  sourceLabel: 'Commercial Register',
  modified: '2026-02-01T00:00:00Z',
  ...over,
});

describe('WikidataAdapter', () => {
  runAdapterContract(wikidataAdapter, [st(), st({ lei: '529900RZW197X0YYRJ82' })]);
});

describe('an aggregator attributes each statement to what it cites', () => {
  const upstream = (s: WikidataHqStatement) =>
    wikidataAdapter.toObservations([s]).observations[0]?.upstreamSourceId;

  it('maps a Global LEI Index citation onto GLEIF\'s own feed', () => {
    // Q55259097 is the Global LEI Index. 5,957 of these statements cite it.
    // They ARE GLEIF, and must land in GLEIF's feed.
    expect(upstream(st({ sourceQid: 'Q55259097' }))).toBe('gleif');
  });

  it('namespaces other citations by item id, not by label', () => {
    // Labels get edited; Q-ids do not. A feed identity that changed when
    // someone renamed a page would silently split one source into two.
    expect(upstream(st({ sourceQid: 'Q3509449', sourceLabel: 'SIRENE' }))).toBe('wikidata-cites:Q3509449');
  });

  it('drops a statement citing no source at all', () => {
    // Unattributed provenance is not permission. An unsourced edit counted as
    // an independent registry is the cheapest way to manufacture
    // corroboration: anyone can make one.
    const { observations, dropped } = wikidataAdapter.toObservations([st({ sourceQid: undefined })]);
    expect(observations).toEqual([]);
    expect(dropped[0].reason).toMatch(/cites no source/);
  });

  it('grades encyclopaedia citations down, but keeps them', () => {
    const viaWikipedia = wikidataAdapter.toObservations([st({ sourceQid: 'Q48183' })]).observations[0];
    const viaRegistry = wikidataAdapter.toObservations([st()]).observations[0];
    expect(viaWikipedia.observedTrust).toBe('D');
    expect(viaRegistry.observedTrust).toBeUndefined();
  });

  it('joins on the LEI, uppercased, so case cannot split one company in two', () => {
    expect(wikidataAdapter.toObservations([st({ lei: '391200xxycpakdl8mn50' })]).observations[0].subjectEntityRef)
      .toBe('391200XXYCPAKDL8MN50');
  });
});

describe('end to end against GLEIF', () => {
  const gleifRecord = (lei: string, city: string) => ({
    attributes: {
      lei,
      entity: { legalName: { name: 'Lohner Capital GmbH' }, legalAddress: { city, country: 'DE' } },
      registration: { lastUpdateDate: '2026-03-04T09:12:00Z' },
    },
  });

  const gleifAdapter = createGleifAdapter(buildPlaceResolver([
    { qid: 'QWINSEN', countryIso: 'DE', names: ['Winsen'] },
    { qid: 'Q64', countryIso: 'DE', names: ['Berlin'] },
  ]));

  const eventsFrom = (statements: WikidataHqStatement[], city = 'Winsen') => [
    ...observationsToEvents(gleifAdapter.toObservations([gleifRecord('391200XXYCPAKDL8MN50', city)]).observations, [gleifAdapter.source]),
    ...observationsToEvents(wikidataAdapter.toObservations(statements).observations, [wikidataAdapter.source]),
  ];

  it('does NOT corroborate GLEIF, because registered and headquarters are different facts', () => {
    // GLEIF asserts where the entity is REGISTERED; Wikidata asserts where it
    // is HEADQUARTERED. A company registered in Frankfurt and headquartered in
    // Munich is not a contradiction, and treating the two as one attribute
    // manufactured a 65% "agreement" that measured nothing.
    const found = computeCorroboratedFindings(eventsFrom([st({ sourceQid: 'Q3509449', sourceLabel: 'SIRENE' })]));
    expect(found.map(f => f.attribute)).not.toContain('registeredCity');
  });

  it('corroborates two independent registries that both assert headquarters', () => {
    const found = computeCorroboratedFindings(eventsFrom([
      st({ sourceQid: 'Q3509449', sourceLabel: 'SIRENE' }),
      st({ sourceQid: 'Q104806723', sourceLabel: 'Commercial Register' }),
    ]));
    const city = found.find(f => f.attribute === 'headquartersCity');
    expect(city).toBeDefined();
    expect(city!.value).toBe('QWINSEN');
    expect(city!.sourceCount).toBe(2);
  });

  it('does NOT let two statements imported from GLEIF corroborate each other', () => {
    // The whole point of per-statement attribution: one measurement, twice.
    const found = computeCorroboratedFindings(eventsFrom([
      st({ sourceQid: 'Q55259097', sourceLabel: 'Global LEI Index' }),
      st({ sourceQid: 'Q55259097', sourceLabel: 'Global LEI Index', lei: '391200XXYCPAKDL8MN50' }),
    ]));
    expect(found.filter(f => f.attribute === 'headquartersCity')).toEqual([]);
  });

  it('does not corroborate when two independent registries disagree', () => {
    const found = computeCorroboratedFindings(eventsFrom([
      st({ hqQid: 'Q64', hq: 'Berlin', sourceQid: 'Q3509449' }),
      st({ hqQid: 'QWINSEN', hq: 'Winsen', sourceQid: 'Q104806723' }),
    ]));
    expect(found.filter(f => f.attribute === 'headquartersCity')).toEqual([]);
  });
});

describe('Wikidata names, for reading only (plan item 3.6)', () => {
  it('carries the place label and the cited source label, beside the ids it matches on', () => {
    const { observations } = wikidataAdapter.toObservations([st({ hqQid: 'Q1726', hq: 'Munich', sourceQid: 'Q3509449', sourceLabel: 'SIRENE' })]);
    const city = observations.find(o => o.claim.attribute === 'headquartersCity')!;
    expect(city.valueLabel).toBe('Munich');
    expect(city.claim).toEqual({ attribute: 'headquartersCity', value: 'Q1726' });
    for (const o of observations) expect(o.upstreamSourceLabel).toBe('SIRENE');
  });

  it('names the company when the snapshot gave its statement one', () => {
    for (const o of wikidataAdapter.toObservations([st({ company: ' Lohner Capital GmbH ' })]).observations) {
      expect(o.subjectName).toBe('Lohner Capital GmbH');
      expect(o.subjectEntityRef).toBe('391200XXYCPAKDL8MN50');
    }
  });

  it('names no company when the statement carries none', () => {
    for (const o of wikidataAdapter.toObservations([st()]).observations) expect(o.subjectName).toBeUndefined();
  });
});
