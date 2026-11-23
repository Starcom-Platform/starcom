import { describe, it, expect } from 'vitest';
import { resourceTypeColor, pickRealResourceType, computeCountryPercentiles, conflictZoneColor, type ResourceType, type CountryResourceRank } from '../resourceZoneTheme';

describe('resourceTypeColor', () => {
  it('returns a distinct color for each resource type', () => {
    const types: ResourceType[] = ['oil', 'gas', 'minerals', 'water', 'renewable'];
    const colors = types.map(resourceTypeColor);
    expect(new Set(colors).size).toBe(types.length);
  });
});

describe('pickRealResourceType', () => {
  const ranks = (entries: CountryResourceRank[]) => new Map([['USA', entries]]);

  it('returns null when no types are active', () => {
    expect(pickRealResourceType('USA', [], ranks([{ resourceType: 'oil', percentile: 90 }]))).toBeNull();
  });

  it('returns null when the country has no real data at all', () => {
    expect(pickRealResourceType('ZZZ', ['oil', 'gas'], ranks([{ resourceType: 'oil', percentile: 90 }]))).toBeNull();
  });

  it('returns null when the country has real data, but none of it is for an active type', () => {
    const percentiles = ranks([{ resourceType: 'oil', percentile: 90 }]);
    expect(pickRealResourceType('USA', ['gas', 'renewable'], percentiles)).toBeNull();
  });

  it('picks the active type the country ranks highest in, not just the first active type', () => {
    const percentiles = ranks([
      { resourceType: 'oil', percentile: 40 },
      { resourceType: 'gas', percentile: 85 },
      { resourceType: 'renewable', percentile: 60 }
    ]);
    expect(pickRealResourceType('USA', ['oil', 'gas', 'renewable'], percentiles)).toBe('gas');
  });

  it('ignores real data for types the user has toggled off', () => {
    const percentiles = ranks([
      { resourceType: 'oil', percentile: 99 }, // highest overall, but not active below
      { resourceType: 'renewable', percentile: 30 }
    ]);
    expect(pickRealResourceType('USA', ['renewable'], percentiles)).toBe('renewable');
  });
});

describe('computeCountryPercentiles (bug-injection verified)', () => {
  it('ranks the single highest producer at the 100th percentile and lowest at 0th', () => {
    const percentiles = computeCountryPercentiles([
      { countryISO3: 'AAA', resourceType: 'oil', value: 10 },
      { countryISO3: 'BBB', resourceType: 'oil', value: 50 },
      { countryISO3: 'CCC', resourceType: 'oil', value: 100 }
    ]);

    expect(percentiles.get('CCC')![0].percentile).toBe(100);
    expect(percentiles.get('AAA')![0].percentile).toBe(0);
    expect(percentiles.get('BBB')![0].percentile).toBe(50);
  });

  it('keeps resource types independently ranked, not mixed together', () => {
    const percentiles = computeCountryPercentiles([
      { countryISO3: 'AAA', resourceType: 'oil', value: 1000 },
      { countryISO3: 'AAA', resourceType: 'gas', value: 1 },
      { countryISO3: 'BBB', resourceType: 'gas', value: 100 }
    ]);

    const aaa = percentiles.get('AAA')!;
    const oilEntry = aaa.find(p => p.resourceType === 'oil')!;
    const gasEntry = aaa.find(p => p.resourceType === 'gas')!;
    // AAA is the only oil producer (100th percentile) but the smallest of two gas
    // producers (0th percentile) — huge raw oil value shouldn't leak into its gas rank.
    expect(oilEntry.percentile).toBe(100);
    expect(gasEntry.percentile).toBe(0);
  });

  it('assigns a lone country in a resource type the 100th percentile, not NaN from divide-by-zero', () => {
    const percentiles = computeCountryPercentiles([
      { countryISO3: 'ONLY', resourceType: 'renewable', value: 5 }
    ]);

    expect(percentiles.get('ONLY')![0].percentile).toBe(100);
  });

  it('combines records from different real-data sources (e.g. EIA oil + World Bank water) into one map per country', () => {
    const percentiles = computeCountryPercentiles([
      { countryISO3: 'USA', resourceType: 'oil', value: 12943 }, // EIA-sourced
      { countryISO3: 'USA', resourceType: 'water', value: 8846 }, // World-Bank-sourced
      { countryISO3: 'CAN', resourceType: 'water', value: 80000 }
    ]);

    const usa = percentiles.get('USA')!;
    expect(usa.find(p => p.resourceType === 'oil')).toBeDefined();
    expect(usa.find(p => p.resourceType === 'water')).toBeDefined();
    // USA is the smaller of two real water values, so it should rank lower than Canada.
    expect(usa.find(p => p.resourceType === 'water')!.percentile).toBeLessThan(
      percentiles.get('CAN')!.find(p => p.resourceType === 'water')!.percentile
    );
  });
});

describe('conflictZoneColor', () => {
  it('returns a distinct color for each alert level', () => {
    const levels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
    const colors = levels.map(conflictZoneColor);
    expect(new Set(colors).size).toBe(levels.length);
  });
});
