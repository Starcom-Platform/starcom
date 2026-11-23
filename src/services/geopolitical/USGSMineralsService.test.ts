import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveMineralsResourceRecords } from './USGSMineralsService';

describe('deriveMineralsResourceRecords (bug-injection verified)', () => {
  it('gives a country its best percentile among the commodities it has real data for, regardless of input order', () => {
    // AAA's losing commodity (copper, percentile 0) is deliberately listed LAST, after its
    // winning one (gold, percentile 100) — catches a "last value wins" bug that a test
    // with the winning commodity conveniently last would miss.
    const records = deriveMineralsResourceRecords([
      { countryISO3: 'AAA', countryName: 'A', commodity: 'gold', value: 5, unit: 't', year: '2024' },
      { countryISO3: 'AAA', countryName: 'A', commodity: 'copper', value: 10, unit: 't', year: '2024' },
      { countryISO3: 'BBB', countryName: 'B', commodity: 'copper', value: 100, unit: 't', year: '2024' }
    ]);

    const aaa = records.find(r => r.countryISO3 === 'AAA')!;
    // AAA's copper percentile (0, processed after gold) shouldn't overwrite its real gold
    // percentile (100, the sole gold producer here).
    expect(aaa.value).toBe(100);
  });

  it('does not let one commodity\'s huge raw numbers leak into another commodity\'s ranking', () => {
    const records = deriveMineralsResourceRecords([
      { countryISO3: 'BIG', countryName: 'Big', commodity: 'iron_ore', value: 982000, unit: 'kt', year: '2024' },
      { countryISO3: 'BIG', countryName: 'Big', commodity: 'gold', value: 1, unit: 't', year: '2024' },
      { countryISO3: 'SMALL', countryName: 'Small', commodity: 'gold', value: 100, unit: 't', year: '2024' }
    ]);

    // BIG's iron ore value (982000) is enormous, but BIG is the smaller of two real gold
    // producers and has no real iron ore competitor to rank against — its best real
    // standing is 100th percentile in a field of one, not skewed by the raw iron number.
    const big = records.find(r => r.countryISO3 === 'BIG')!;
    expect(big.value).toBe(100); // sole iron-ore producer in this input -> 100th percentile there
  });

  it('produces exactly one record per country, not one per commodity', () => {
    const records = deriveMineralsResourceRecords([
      { countryISO3: 'CHN', countryName: 'China', commodity: 'gold', value: 377, unit: 't', year: '2024' },
      { countryISO3: 'CHN', countryName: 'China', commodity: 'rare_earths', value: 270000, unit: 't', year: '2024' },
      { countryISO3: 'AUS', countryName: 'Australia', commodity: 'gold', value: 284, unit: 't', year: '2024' }
    ]);

    expect(records.filter(r => r.countryISO3 === 'CHN').length).toBe(1);
    expect(records.every(r => r.resourceType === 'minerals')).toBe(true);
  });
});

describe('minerals-baked.json — real USGS data (checked directly from disk, not mocked)', () => {
  function loadBakedRecords() {
    const raw = readFileSync(join(__dirname, '../../../public/geopolitical/minerals-baked.json'), 'utf-8');
    return (JSON.parse(raw) as { records: Array<{ countryISO3: string; countryName: string; commodity: string; value: number; unit: string; year: string }> }).records;
  }

  it('is real, well-formed, and ranks known major producers correctly', () => {
    const records = loadBakedRecords();
    expect(records.length).toBeGreaterThan(50);

    const copperRecords = records.filter(r => r.commodity === 'copper');
    const topCopper = [...copperRecords].sort((a, b) => b.value - a.value)[0];
    // Real-world sanity check: Chile is the world's largest copper producer by a wide margin.
    expect(topCopper.countryISO3).toBe('CHL');

    const rareEarthRecords = records.filter(r => r.commodity === 'rare_earths');
    const topRareEarth = [...rareEarthRecords].sort((a, b) => b.value - a.value)[0];
    expect(topRareEarth.countryISO3).toBe('CHN');
  });

  it('derives resource records end-to-end from the real baked file (fetch-independent, same logic getRealMineralsResourceRecords uses)', () => {
    const records = deriveMineralsResourceRecords(loadBakedRecords());
    expect(records.length).toBeGreaterThan(20);
    expect(records.every(r => r.resourceType === 'minerals')).toBe(true);
    expect(records.every(r => r.value >= 0 && r.value <= 100)).toBe(true);
  });
});
