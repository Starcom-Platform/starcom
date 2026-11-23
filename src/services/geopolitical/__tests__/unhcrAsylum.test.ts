/**
 * UNHCR's displacement by country of asylum, read without the network: each country keeps UNHCR's own code
 * (`coa`), which its API's filter takes, so a Conflict Zones note can link the row its figures came from (C5).
 */
import { describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get } }));

const row = (coa: string, iso: string, name: string, over: Record<string, unknown> = {}) => ({
  year: 2025, coa, coa_iso: iso, coa_name: name, coo_iso: '-', refugees: '0', asylum_seekers: '0', idps: '0', ...over,
});

describe('getRealDisplacementData', () => {
  it("keeps UNHCR's own code beside the ISO code, and none it cannot use", async () => {
    get.mockReset().mockResolvedValueOnce({ data: { items: [
      row('GFR', 'DEU', 'Germany', { refugees: 2655191 }),
      row('TUR', 'TUR', 'Türkiye', { refugees: 2390414 }),
      row('a&b', 'NLD', 'Netherlands', { refugees: 100 }),
    ] } });
    const { getRealDisplacementData } = await import('../UNHCRDisplacementService');
    const rows = await getRealDisplacementData();

    expect(rows.map((r) => [r.countryISO3, r.unhcrCode])).toEqual([['DEU', 'GFR'], ['TUR', 'TUR'], ['NLD', undefined]]);
    expect(rows[2]).not.toHaveProperty('unhcrCode');
  });
});
