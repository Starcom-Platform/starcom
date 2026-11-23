/**
 * Names for what the engine matches by identifier (plan item 3.6). The walk of
 * 2026-09-26 found single-source claims listed as `headquartersCity: Q169376`
 * under a bare LEI. The records carry the names; this reads them back.
 */
import { describe, it, expect } from 'vitest';
import { attributeWords, buildReadableNames } from '../readableNames';
import type { Event } from '../../adapters/eventsAdapter';

const LEI = '2138009TF1SYOMQLBJ60';
const event = (over: Partial<Event>): Event => ({
  id: `e-${Math.random()}`,
  title: 't',
  timestamp: '2026-08-18T00:00:00.000Z',
  category: 'X',
  tags: [],
  sourceType: 'OBSERVATION',
  sourceId: `obs-${Math.random()}`,
  entityRefs: [LEI],
  ...over,
});

const SOURCES = [{ id: 'gleif', label: 'GLEIF Global LEI Index' }];

describe('a subject', () => {
  it('reads as the name a record gives it, found whatever the case or spacing of the id', () => {
    const names = buildReadableNames([
      event({ subjectName: 'THE GO-AHEAD GROUP LIMITED' }),
    ], SOURCES);
    expect(names.subject(LEI)).toBe('THE GO-AHEAD GROUP LIMITED');
    expect(names.subject(` ${LEI.toLowerCase()} `)).toBe('THE GO-AHEAD GROUP LIMITED');
  });

  it('with no name anywhere, says what kind of id it is; a name stays itself', () => {
    const names = buildReadableNames([event({})], SOURCES);
    expect(names.subject(LEI)).toBe(`LEI ${LEI}`);
    expect(names.subject('Q169376')).toBe('Wikidata Q169376');
    expect(names.subject('Acme Corp')).toBe('Acme Corp');
  });

  it('takes the name from any record about the subject, not only the one making the claim', () => {
    // A Wikidata statement names no company; GLEIF's record of the same LEI does.
    const names = buildReadableNames([
      event({ claim: { attribute: 'headquartersCity', value: 'Q1726' } }),
      event({ subjectName: 'Lohner Capital GmbH', claim: { attribute: 'registeredCountry', value: 'DE' } }),
    ], SOURCES);
    expect(names.subject(LEI)).toBe('Lohner Capital GmbH');
  });
});

describe('a value', () => {
  it('reads a place id as its label, preferring one written in mixed case, in either order', () => {
    const gleif = event({ claim: { attribute: 'registeredCity', value: 'Q1425428' }, valueLabel: 'NEWCASTLE UPON TYNE' });
    const wikidata = event({ claim: { attribute: 'headquartersCity', value: 'Q1425428' }, valueLabel: 'Newcastle upon Tyne' });
    for (const order of [[gleif, wikidata], [wikidata, gleif]]) {
      const names = buildReadableNames(order, SOURCES);
      expect(names.value('registeredCity', 'Q1425428')).toBe('Newcastle upon Tyne');
      expect(names.value('headquartersCity', 'Q1425428')).toBe('Newcastle upon Tyne');
    }
  });

  it('keeps an all-capitals label when it is the only one', () => {
    const names = buildReadableNames([event({ claim: { attribute: 'registeredCity', value: 'Q1425428' }, valueLabel: 'NEWCASTLE UPON TYNE' })], SOURCES);
    expect(names.value('registeredCity', 'Q1425428')).toBe('NEWCASTLE UPON TYNE');
  });

  it('reads a country code as the country, under a country attribute only', () => {
    const names = buildReadableNames([], SOURCES);
    expect(names.value('registeredCountry', 'DE')).toBe('Germany');
    expect(names.value('headquartersCountry', 'GB')).toBe('United Kingdom');
    expect(names.value('registeredCountry', 'XX')).toBe('XX');
    // What Intl calls a code it does not know is not a country's name.
    expect(names.value('registeredCountry', 'ZZ')).toBe('ZZ');
    expect(names.value('status', 'DE')).toBe('DE');
  });

  it('keeps a label that is not a place id to the attribute it came with', () => {
    const names = buildReadableNames([event({ claim: { attribute: 'status', value: 'A' }, valueLabel: 'Active' })], SOURCES);
    expect(names.value('status', 'A')).toBe('Active');
    expect(names.value('grade', 'A')).toBe('A');
  });

  it('says an unlabelled place id is a Wikidata id', () => {
    expect(buildReadableNames([], SOURCES).value('headquartersCity', 'Q169376')).toBe('Wikidata Q169376');
  });
});

describe('a source', () => {
  it("reads a registered source by its own label, before any label a relayed statement gives it", () => {
    const names = buildReadableNames([event({ feedId: 'gleif', feedLabel: 'Global LEI Index' })], SOURCES);
    expect(names.feed('gleif')).toBe('GLEIF Global LEI Index');
  });

  it('reads a cited source by the label its statement gives, unless that label is itself an id', () => {
    const names = buildReadableNames([
      event({ feedId: 'wikidata-cites:Q3509449', feedLabel: 'SIRENE' }),
      event({ feedId: 'wikidata-cites:Q12013', feedLabel: 'Q12013' }),
    ], SOURCES);
    expect(names.feed('wikidata-cites:Q3509449')).toBe('SIRENE');
    expect(names.feed('wikidata-cites:Q12013')).toBe('a source Wikidata cites');
    expect(names.feed('usgs-earthquakes')).toBe('usgs-earthquakes');
  });
});

describe('attributeWords', () => {
  it('says an attribute as words', () => {
    expect(attributeWords('headquartersCity')).toBe('headquarters city');
    expect(attributeWords('registeredCountry')).toBe('registered country');
    expect(attributeWords('location')).toBe('location');
    expect(attributeWords('hq_city')).toBe('hq city');
  });
});
