import { describe, expect, it } from 'vitest';
import { namedCountries, sdnByCountry } from '../sdnByCountry';

// OFAC's SDN.CSV and ADD.CSV shapes (no header), with invented entries.
const SDN = [
  '1,"EXAMPLE TRADING LLC",-0- ,"RUSSIA-EO14024",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ',
  '2,"INVENTED, PERSON",individual,"RUSSIA-EO14024] [UKRAINE-EO13662",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ',
  '3,"EXAMPLE SHIPPING",-0- ,"DPRK3",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ',
  '4,"EXAMPLE HOLDINGS",-0- ,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ',
].join('\n');
const ADD = [
  '1,10,"1 Example St",Moscow,Russia,-0- ',
  '1,11,"2 Example St",Saint Petersburg,Russia,-0- ',
  '1,12,-0- ,Dubai,United Arab Emirates,-0- ',
  '2,13,-0- ,Moscow,Russia,-0- ',
  '3,14,-0- ,Pyongyang,"Korea, North",-0- ',
  '4,15,-0- ,-0- ,"Region: Crimea",-0- ',
  '9,16,-0- ,Nowhere,Russia,-0- ',
].join('\n');
const COUNTRIES = namedCountries([
  { properties: { ADM0_A3: 'RUS', ADMIN: 'Russia', NAME: 'Russia', FORMAL_EN: 'Russian Federation' } },
  { properties: { ADM0_A3: 'PRK', ADMIN: 'North Korea', NAME: 'North Korea' } },
  { properties: { ADM0_A3: 'ARE', ADMIN: 'United Arab Emirates', NAME: 'United Arab Emirates' } },
  { properties: { ADM0_A3: '-99', ADMIN: 'Nowhere' } },
]);

describe('sdnByCountry', () => {
  const out = sdnByCountry(SDN, ADD, COUNTRIES);

  it("counts each entry once in each country it has an address in, people among them", () => {
    expect(out.countries.RUS).toEqual({ entries: 2, people: 1, programmes: { 'RUSSIA-EO14024': 2, 'UKRAINE-EO13662': 1 } });
    expect(out.countries.ARE).toEqual({ entries: 1, people: 0, programmes: { 'RUSSIA-EO14024': 1 } });
  });

  it("reads OFAC's own spellings of a country", () => {
    expect(out.countries.PRK).toEqual({ entries: 1, people: 0, programmes: { DPRK3: 1 } });
  });

  it('lists a name it cannot match, a disputed region among them, rather than guessing', () => {
    expect(out.unmatched).toEqual({ 'Region: Crimea': 1 });
  });

  it('carries no name, and no address of an entry not on the list', () => {
    expect(JSON.stringify(out)).not.toMatch(/INVENTED|EXAMPLE|Example St/);
    expect(Object.values(out.countries).reduce((n, c) => n + c.entries, 0)).toBe(4);
  });

  it("keeps only the globe's countries, by their three-letter code", () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual(['RUS', 'PRK', 'ARE']);
  });
});
