import { describe, it, expect } from 'vitest';
import { getRealDisplacementData, realNumber } from './UNHCRDisplacementService';

describe('UNHCRDisplacementService — real UNHCR population data (not mocked)', () => {
  it('fetches real per-country displacement magnitudes, ranking known crisis countries appropriately high', async () => {
    const records = await getRealDisplacementData();

    expect(records.length).toBeGreaterThan(50);

    records.forEach((record) => {
      expect(record.countryISO3).toMatch(/^[A-Z]{3}$/);
      expect(record.total).toBeGreaterThan(0);
      expect(record.total).toBe(record.idps + record.refugees + record.asylumSeekers);
    });
    // UNHCR's own code, which its API's coa filter takes (critique C5's link to the row).
    expect(records.find((r) => r.countryISO3 === 'DEU')?.unhcrCode).toBe('GFR');

    // UNHCR's own "country of asylum not reported" sentinel (coa_iso: 'UNK', coa_name:
    // 'Unknown') must never leak in as if it were a real country — same class of check as
    // WorldBankWaterService's aggregate exclusion.
    expect(records.some((r) => r.countryISO3 === 'UNK')).toBe(false);

    // Real-world sanity check: known 2024/2025 large-scale displacement crises should sit
    // far above a country with no notable displacement (e.g. New Zealand).
    const byTotal = [...records].sort((a, b) => b.total - a.total);
    const top20ISO3 = new Set(byTotal.slice(0, 20).map((r) => r.countryISO3));
    const knownCrisisCountries = ['SDN', 'SYR', 'COD', 'COL', 'UKR', 'AFG', 'VEN', 'SOM', 'YEM', 'USA'];
    const matchedCrisisCountries = knownCrisisCountries.filter((iso3) => top20ISO3.has(iso3));
    expect(matchedCrisisCountries.length).toBeGreaterThan(0);

    const nzl = records.find((r) => r.countryISO3 === 'NZL');
    const topCrisis = byTotal[0];
    if (nzl) {
      expect(topCrisis.total).toBeGreaterThan(nzl.total * 10);
    }
  }, 30000);
});

describe('realNumber (bug-injection verified)', () => {
  it('passes through a real finite number unchanged', () => {
    expect(realNumber(3199710)).toBe(3199710);
  });

  it('parses a real numeric string', () => {
    expect(realNumber('457647')).toBe(457647);
  });

  it('treats the "-" sentinel ("not tracked") as 0, not a crash or NaN', () => {
    expect(realNumber('-')).toBe(0);
  });

  it('treats undefined/null as 0', () => {
    expect(realNumber(undefined)).toBe(0);
    expect(realNumber(null)).toBe(0);
  });

  it('treats a non-finite number (NaN/Infinity) as 0, never propagating garbage into a total', () => {
    expect(realNumber(NaN)).toBe(0);
    expect(realNumber(Infinity)).toBe(0);
  });
});
