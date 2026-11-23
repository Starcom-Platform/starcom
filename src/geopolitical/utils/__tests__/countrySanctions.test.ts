import { describe, expect, it, vi } from 'vitest';
import { SANCTIONS_BY_COUNTRY_URL, loadSanctionsByCountry, parseSanctionsByCountry, sanctionsLineOf } from '../countrySanctions';

const file = {
  version: 1, source: 'OFAC', url: 'u', license: 'l', retrievedAt: '2026-10-13T21:00:00Z',
  countries: {
    RUS: { entries: 5207, people: 1730, programmes: { 'RUSSIA-EO14024': 4714, CYBER2: 147, 'UKRAINE-EO13662': 251 } },
    bad: { entries: 1, people: 0, programmes: {} },
    IRN: { entries: -1, people: 0, programmes: {} },
  },
  unmatched: { 'Region: Crimea': 1 },
};

describe('the SDN list by country', () => {
  it('reads each country, leaving out one that does not read', () => {
    expect(Object.keys(parseSanctionsByCountry(file).countries)).toEqual(['RUS']);
    expect(parseSanctionsByCountry({ ...file, version: 2 }).countries).toEqual({});
  });

  it("gives a country's line: entries, people, its programmes the largest first, and the day it was read", () => {
    expect(sanctionsLineOf('RUS', parseSanctionsByCountry(file))).toEqual({
      entries: 5207, people: 1730, asOf: '2026-10-13',
      programmes: [['RUSSIA-EO14024', 4714], ['UKRAINE-EO13662', 251], ['CYBER2', 147]],
    });
    expect(sanctionsLineOf('ISL', parseSanctionsByCountry(file))).toBeNull();
  });

  it('is read from the build’s file', async () => {
    const fetchJson = vi.fn(async () => file);
    await loadSanctionsByCountry(fetchJson);
    expect(fetchJson).toHaveBeenCalledWith(SANCTIONS_BY_COUNTRY_URL);
  });
});
