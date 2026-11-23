import { describe, it, expect } from 'vitest';
import { runAdapterContract } from '../adapterContract';
import { createGleifAdapter, type GleifRecord, NATIONAL_REGISTER_SOURCE_IDS } from '../gleifAdapter';
import { buildPlaceResolver } from '../../placeGazetteer';

const record = (over: Partial<GleifRecord['attributes']> = {}, lei = '391200XXYCPAKDL8MN50'): GleifRecord => ({
  attributes: {
    lei,
    entity: {
      legalName: { name: 'Lohner Capital GmbH' },
      legalAddress: { city: 'Winsen', region: 'DE-NI', country: 'DE', postalCode: '21423' },
      status: 'ACTIVE',
    },
    registration: { lastUpdateDate: '2026-03-04T09:12:00Z', status: 'ISSUED' },
    ...over,
  },
});

/** Cologne and Munich, with their real cross-language names. */
const GAZETTEER = buildPlaceResolver([
  { qid: 'Q365', countryIso: 'DE', names: ['Cologne', 'Köln', 'Keulen'] },
  { qid: 'Q1726', countryIso: 'DE', names: ['Munich', 'München'] },
  { qid: 'Q1055', countryIso: 'DE', names: ['Hamburg'] },
  { qid: 'QWINSEN', countryIso: 'DE', names: ['Winsen'] },
]);
const gleifAdapter = createGleifAdapter(GAZETTEER);

describe('GleifAdapter', () => {
  runAdapterContract(gleifAdapter, [record(), record({}, '529900RZW197X0YYRJ82')]);
});

describe('GLEIF observations', () => {
  it('asserts registered city and country as equality-matched claims', () => {
    const { observations } = gleifAdapter.toObservations([record()]);
    expect(observations.map(o => o.claim.attribute).sort()).toEqual(['registeredCity', 'registeredCountry']);
    // The place's Wikidata id, not its local spelling — see placeGazetteer.
    expect(observations.find(o => o.claim.attribute === 'registeredCity')?.claim.value).toBe('QWINSEN');
  });

  it('emits no coordinates, because GLEIF publishes none', () => {
    // Geocoding these would need a credentialed third party and would invent
    // precision the registry never claimed.
    for (const o of gleifAdapter.toObservations([record()]).observations) {
      expect(o.geo).toBeUndefined();
    }
  });

  it('identifies the subject by LEI, not by name', () => {
    // The whole reason this pairing works: identity is GIVEN by a third party
    // rather than inferred. Names differ across registries in punctuation,
    // legal form and language.
    const { observations } = gleifAdapter.toObservations([record()]);
    expect(observations[0].subjectEntityRef).toBe('391200XXYCPAKDL8MN50');
    expect(observations[0].label).toContain('Lohner Capital GmbH');
  });

  it('timestamps from the registration update, never from fetch time', () => {
    // Stamping "now" would make a decade-old filing look like today's evidence
    // and make the age-decayed weight overstate every record.
    const { observations } = gleifAdapter.toObservations([record()]);
    expect(observations[0].timestamp).toBe('2026-03-04T09:12:00.000Z');
  });

  it('treats the subject as an organisation, so contradiction detection stays off', () => {
    // A company is not in one place at a time; two addresses are not impossible.
    expect(gleifAdapter.toObservations([record()]).observations[0].subjectKind).toBe('organization');
  });

  it('drops a record with no usable registration date and says why', () => {
    const { observations, dropped } = gleifAdapter.toObservations([
      record({ registration: { lastUpdateDate: undefined } }),
    ]);
    expect(observations).toEqual([]);
    expect(dropped[0].reason).toMatch(/lastUpdateDate/);
  });

  it('drops a record whose address states neither city nor country', () => {
    const { observations, dropped } = gleifAdapter.toObservations([
      record({ entity: { legalName: { name: 'X' }, legalAddress: { city: null, country: null } } }),
    ]);
    expect(observations).toEqual([]);
    expect(dropped[0].reason).toMatch(/neither a city nor a country/);
  });

  it('still emits the country when only the city is missing', () => {
    const { observations } = gleifAdapter.toObservations([
      record({ entity: { legalName: { name: 'X' }, legalAddress: { city: null, country: 'DE' } } }),
    ]);
    expect(observations.map(o => o.claim.attribute)).toEqual(['registeredCountry']);
  });

  it('resolves a local spelling to the same id as its exonym', () => {
    // GLEIF writes Köln; another registry writes Cologne. Compared as strings
    // they read as disagreement, which is what D14 measured at 52%.
    const { observations } = gleifAdapter.toObservations([
      record({ entity: { legalName: { name: 'X' }, legalAddress: { city: 'Köln', country: 'DE' } } }),
    ]);
    expect(observations.find(o => o.claim.attribute === 'registeredCity')?.claim.value).toBe('Q365');
  });

  it('drops an unresolvable city and counts it, rather than guessing', () => {
    // Emitting the raw name would reintroduce the cross-language mismatch.
    // Fuzzy matching would invent agreement, which is worse than missing it.
    const { observations, dropped } = gleifAdapter.toObservations([
      record({ entity: { legalName: { name: 'X' }, legalAddress: { city: 'Nowhereville', country: 'DE' } } }),
    ]);
    expect(observations.map(o => o.claim.attribute)).toEqual(['registeredCountry']);
    expect(dropped[0].reason).toMatch(/not in the place gazetteer/);
  });

  it('declares itself downstream of the registers it validates against', () => {
    /**
     * This asserted `derivesFrom: []` under the heading "upstream of nothing,
     * so Wikidata GLEIF imports cannot corroborate it". The conclusion is
     * right and the mechanism was not: a Wikidata statement citing the Global
     * LEI Index is discounted because WIKIDATA names its upstream, not because
     * GLEIF names none. The two were conflated, and the empty array read as a
     * claim of independence from everything.
     *
     * GLEIF is downstream of national registers. An accredited Local Operating
     * Unit validates each entity against its home register and records the
     * number it found there. Measured: 57,187 Norwegian entities agree on
     * postcode 91% of the time, and the agreement is maintained by copying —
     * revalidated records disagree 2.96%, lapsed ones 23.50%.
     */
    expect(gleifAdapter.source.derivesFrom).toEqual([...NATIONAL_REGISTER_SOURCE_IDS]);
    expect(gleifAdapter.source.id).toBe('gleif');
  });

  it('does not name Wikidata as an upstream, because that arrow points the other way', () => {
    // GLEIF is the index Wikidata imports from. If this ever listed wikidata,
    // the two would discount each other and neither could corroborate anything.
    expect(gleifAdapter.source.derivesFrom).not.toContain('wikidata');
  });
});

describe('GLEIF names, for reading only (plan item 3.6)', () => {
  it('carries the legal name and the city as written, beside the ids it matches on', () => {
    const { observations } = gleifAdapter.toObservations([record({
      entity: { legalName: { name: 'Lohner Capital GmbH' }, legalAddress: { city: 'München', country: 'DE' } },
    })]);
    const city = observations.find(o => o.claim.attribute === 'registeredCity')!;
    const country = observations.find(o => o.claim.attribute === 'registeredCountry')!;
    expect(city.subjectName).toBe('Lohner Capital GmbH');
    expect(country.subjectName).toBe('Lohner Capital GmbH');
    expect(city.valueLabel).toBe('München');
    // The match stays on the ids: the name is beside the claim, never in it.
    expect(city.claim).toEqual({ attribute: 'registeredCity', value: 'Q1726' });
    expect(city.subjectEntityRef).toBe('391200XXYCPAKDL8MN50');
  });

  it('gives no name when the record has none, rather than repeating the LEI as one', () => {
    const { observations } = gleifAdapter.toObservations([record({
      entity: { legalAddress: { city: 'Hamburg', country: 'DE' } },
    })]);
    for (const o of observations) expect(o.subjectName).toBeUndefined();
  });
});
