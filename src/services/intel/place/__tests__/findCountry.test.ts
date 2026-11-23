/**
 * Finding a country by what it is called (plan item 3.5, story S6). The
 * report form asked for jurisdiction codes ("us, us-nj"), which a newcomer
 * does not know. No third-party geocoder: the countries are the globe's own.
 */
import { describe, it, expect } from 'vitest';
import { findCountries } from '../findCountry';

const countries = [
  { code: 'DE', name: 'Germany' },
  { code: 'GE', name: 'Georgia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'US', name: 'United States of America' },
];

describe('findCountries', () => {
  it('finds a country by the start of any word in its name', () => {
    expect(findCountries('ger', countries).map((c) => c.code)).toEqual(['DE']);
    expect(findCountries('new', countries).map((c) => c.code)).toEqual(['NZ', 'PG']);
    expect(findCountries('zeal', countries).map((c) => c.code)).toEqual(['NZ']);
    // A name of several words, typed in full or in part (the review found "new zealand" found nothing).
    expect(findCountries('new zealand', countries).map((c) => c.code)).toEqual(['NZ']);
    expect(findCountries('united  states of', countries).map((c) => c.code)).toEqual(['US']);
    // The start of a word, not anywhere inside one: "and" is in Zealand and starts nothing.
    expect(findCountries('and', countries)).toEqual([]);
  });

  it('finds one by its code, and puts that first', () => {
    expect(findCountries('ge', countries).map((c) => c.code)).toEqual(['GE', 'DE']);
    expect(findCountries('US', countries)[0].code).toBe('US');
  });

  it('finds nothing for nothing typed, and at most a few', () => {
    expect(findCountries('  ', countries)).toEqual([]);
    expect(findCountries('new', countries, 1)).toHaveLength(1);
  });
});
