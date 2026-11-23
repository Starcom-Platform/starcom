import { describe, it, expect } from 'vitest';
import { getRealWaterResourceData } from './WorldBankWaterService';

describe('WorldBankWaterService — real World Bank data (not mocked)', () => {
  it('fetches real per-country freshwater resource data, excludes World Bank aggregates, and ranks known water-abundant countries highest', async () => {
    const records = await getRealWaterResourceData();

    expect(records.length).toBeGreaterThan(150);

    // World Bank's own regional aggregates ("Arab World", "Africa Eastern and Southern",
    // "Caribbean small states"...) must never leak in as if they were real countries.
    const codes = new Set(records.map(r => r.countryISO3));
    expect(codes.has('ARB')).toBe(false);
    expect(codes.has('AFE')).toBe(false);
    expect(codes.has('CSS')).toBe(false);

    // Real-world sanity check: Iceland is a well-known top freshwater-per-capita country.
    const iceland = records.find(r => r.countryISO3 === 'ISL');
    const bahrain = records.find(r => r.countryISO3 === 'BHR'); // known water-scarce country
    expect(iceland).toBeDefined();
    if (bahrain) {
      expect(iceland!.value).toBeGreaterThan(bahrain.value * 10);
    }
  }, 30000);
});
