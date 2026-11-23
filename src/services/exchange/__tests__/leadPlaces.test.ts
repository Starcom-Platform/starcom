import { describe, expect, it } from 'vitest';
import { countsByPlace, placeIndex } from '../leadPlaces';
import type { Lead, LeadPlace } from '../leads';

const FEATURES = [
  { properties: { ADM0_A3: 'MEX', ISO_A2: 'MX', ADMIN: 'Mexico', NAME: 'Mexico' } },
  { properties: { ADM0_A3: 'USA', ISO_A2: 'US', ADMIN: 'United States of America', NAME: 'United States of America' } },
  { properties: { ADM0_A3: 'FRA', ISO_A2: '-99', ISO_A2_EH: 'FR', ADMIN: 'France', NAME: 'France' } },
  { properties: { ADM0_A3: 'AUS', ISO_A2: 'AU', ADMIN: 'Australia', NAME: 'Australia' } },
  { properties: { ADM0_A3: 'IOA', ISO_A2: '-99', ISO_A2_EH: 'AU', ADMIN: 'Indian Ocean Territories' } },
  { properties: { ADM0_A3: 'PRK', ISO_A2: 'KP', ADMIN: 'North Korea', NAME: 'North Korea' } },
];
const lead = (id: string, places: LeadPlace[]) => ({ id, places } as unknown as Lead);

describe('placeIndex', () => {
  const index = placeIndex(FEATURES);

  it("reads a two-letter code by ISO_A2, else ISO_A2_EH, never taking a country's own code from a dependency", () => {
    expect(index.byIso2('mx')).toBe('MEX');
    expect(index.byIso2('FR')).toBe('FRA');
    expect(index.byIso2('AU')).toBe('AUS');
    expect(index.byIso2('ZZ')).toBeUndefined();
  });

  it("reads a country OFAC names in its own words", () => {
    expect(index.byName('Korea, North')).toBe('PRK');
    expect(index.byName('Mexico')).toBe('MEX');
  });
});

describe('countsByPlace', () => {
  const counts = countsByPlace([
    lead('report:1', [{ jurisdiction: 'mx' }, { jurisdiction: 'us-oh' }]),
    lead('sanctions:1049', [{ countryName: 'Mexico' }, { countryName: 'Mexico' }, { countryName: 'Region: Crimea' }]),
    lead('exclusions:2026-09', [{ jurisdiction: 'us-nc' }, { jurisdiction: 'us-oh' }]),
    lead('funding:7', []),
  ], placeIndex(FEATURES));

  it('counts each lead once in each country it names, a US state rolled into the country', () => {
    expect(Object.fromEntries(counts.countries)).toEqual({ MEX: ['report:1', 'sanctions:1049'], USA: ['report:1', 'exclusions:2026-09'] });
  });

  it('counts each US state by its own code', () => {
    expect(Object.fromEntries(counts.states)).toEqual({ OH: ['report:1', 'exclusions:2026-09'], NC: ['exclusions:2026-09'] });
  });

  it('keeps a place it cannot hold as unplaced, as the record wrote it', () => {
    expect(counts.unplaced).toEqual(['Region: Crimea']);
  });
});
