import { describe, expect, it } from 'vitest';
import { displacementOf, resourceLines, standingAmong } from '../countryBrief';
import type { EnergyProduction } from '../../../services/geopolitical/energyProduction';

describe('standingAmong', () => {
  const values: Array<[string, number]> = [['USA', 13221], ['SAU', 9000], ['RUS', 9800], ['NOR', 1800], ['GBR', 600]];

  it('ranks by how many have more, of all with a figure', () => {
    expect(standingAmong(values, 'SAU')).toMatchObject({ rank: 3, of: 5 });
    expect(standingAmong(values, 'USA')).toMatchObject({ rank: 1, of: 5 });
  });

  it("gives the share at or above it as Resource Zones' percentile does, never under 1%", () => {
    // Third of five: percentile (5 - 3) / 4 = 50, so the top 50%.
    expect(standingAmong(values, 'SAU')?.top).toBe(50);
    expect(standingAmong(values, 'USA')?.top).toBe(1);
    expect(standingAmong(values, 'GBR')?.top).toBe(100);
  });

  it('shares a rank on a tie', () => {
    expect(standingAmong([['A', 5], ['B', 5], ['C', 1]], 'B')?.rank).toBe(1);
  });

  it('is nothing for a country without a figure', () => {
    expect(standingAmong(values, 'FRA')).toBeNull();
  });
});

const energy: EnergyProduction = {
  oil: { name: 'Crude oil', unit: 'thousand barrels per day', year: 2025, values: { USA: 13221, SAU: 9000, NOR: 1800 }, via: 'record' },
  gas: { name: 'Dry natural gas', unit: 'billion cubic feet', year: 2024, values: { USA: 37000, NOR: 4000 }, via: 'file' },
};
const minerals = [
  { countryISO3: 'CHL', countryName: 'Chile', commodity: 'copper', value: 5510, unit: 'thousand metric tons', year: '2024' },
  { countryISO3: 'NOR', countryName: 'Norway', commodity: 'copper', value: 10, unit: 'thousand metric tons', year: '2024' },
  { countryISO3: 'PER', countryName: 'Peru', commodity: 'copper', value: 2600, unit: 'thousand metric tons', year: '2024' },
  { countryISO3: 'NOR', countryName: 'Norway', commodity: 'iron_ore', value: 900, unit: 'thousand metric tons', year: '2024' },
  { countryISO3: 'AUS', countryName: 'Australia', commodity: 'iron_ore', value: 900000, unit: 'thousand metric tons', year: '2024' },
];
const water = [
  { countryISO3: 'NOR', countryName: 'Norway', value: 70000, year: '2021' },
  { countryISO3: 'EGY', countryName: 'Egypt', value: 10, year: '2021' },
];

describe('resourceLines', () => {
  const lines = resourceLines('NOR', { energy, minerals, water });

  it('states oil, gas, its best mineral and water, in that order, only where it has a figure', () => {
    expect(lines.map((l) => l.kind)).toEqual(['oil', 'gas', 'minerals', 'water']);
  });

  it('carries the amount in the source unit, the year, the source and where EIA was read', () => {
    expect(lines[0]).toMatchObject({ rank: 3, of: 3, value: 1800, unit: 'thousand barrels per day', year: '2025', source: 'EIA', via: 'record' });
    expect(lines[1]).toMatchObject({ rank: 2, of: 2, source: 'EIA', via: 'file' });
  });

  it('names the mineral it stands highest in', () => {
    // Copper, 3rd of 4 (top 67%), over iron ore, 2nd of 2 (top 100%).
    const line = resourceLines('NOR', { minerals: [...minerals, { countryISO3: 'ZMB', countryName: 'Zambia', commodity: 'copper', value: 5, unit: 'thousand metric tons', year: '2024' }] })[0];
    expect(line).toMatchObject({ kind: 'minerals', commodity: 'copper', rank: 3, of: 4, source: 'USGS' });
  });

  it('ranks water per person among the countries with a figure', () => {
    expect(lines[3]).toMatchObject({ kind: 'water', rank: 1, of: 2, unit: 'm3 per person', source: 'World Bank' });
  });

  it('is empty for a country none of the figures name', () => {
    expect(resourceLines('ATA', { energy, minerals, water })).toEqual([]);
  });
});

describe('displacementOf: UNHCR both ways (DP19)', () => {
  const hosted = [{ countryISO3: 'TUR', countryName: 'Türkiye', idps: 990_000, refugees: 2_900_000, asylumSeekers: 200_000, total: 4_090_000, year: 2025 }];
  const from = [
    { countryISO3: 'SDN', countryName: 'Sudan', refugees: 2_820_737, asylumSeekers: 100_000, idps: 9_139_309, year: 2025 },
    { countryISO3: 'TUR', countryName: 'Türkiye', refugees: 60_000, asylumSeekers: 90_000, idps: 1_000_000, year: 2025 },
  ];

  it('gives its people abroad and displaced inside, and those it hosts', () => {
    expect(displacementOf('TUR', hosted, from)).toEqual({
      year: 2025, refugeesAbroad: 60_000, asylumAbroad: 90_000, inside: 1_000_000, refugeesHosted: 2_900_000, asylumHosted: 200_000,
    });
  });

  it('keeps a country listed on one side only, either side', () => {
    expect(displacementOf('SDN', hosted, from)).toMatchObject({ refugeesAbroad: 2_820_737, inside: 9_139_309, refugeesHosted: 0 });
    const hostOnly = [{ countryISO3: 'DEU', countryName: 'Germany', idps: 0, refugees: 2_700_000, asylumSeekers: 300_000, total: 3_000_000, year: 2025 }];
    expect(displacementOf('DEU', hostOnly, from)).toMatchObject({ refugeesAbroad: 0, refugeesHosted: 2_700_000, year: 2025 });
  });

  it('is null for a country UNHCR lists on neither side', () => {
    expect(displacementOf('ISL', hosted, from)).toBeNull();
  });
});
