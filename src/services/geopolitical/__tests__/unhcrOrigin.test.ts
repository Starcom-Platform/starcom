/** UNHCR's displacement by country of origin (decision D-DP, DP19), read without the network. */
import { describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get } }));

const row = (coo: string, name: string, over: Record<string, unknown> = {}) => ({
  year: 2025, coo_iso: coo, coo_name: name, coa_iso: '-', coa_name: '-', refugees: '0', asylum_seekers: '0', idps: '0', ...over,
});

describe('getRealDisplacementByOrigin', () => {
  it("reads the latest year UNHCR has, each country's people abroad and displaced inside it", async () => {
    get.mockReset()
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({ data: { items: [
        row('AFG', 'Afghanistan', { refugees: 2671560, asylum_seekers: 270007, idps: 3199023 }),
        row('SDN', 'Sudan', { refugees: '2820737', idps: 9139309 }),
        row('ABW', 'Aruba', { asylum_seekers: 5 }),
        row('XXA', 'Stateless', { refugees: 34736 }),
        row('TIB', 'Tibetan', { refugees: 12581 }),
        row('UNK', 'Unknown ', { refugees: 126784 }),
        row('ISL', 'Iceland'),
      ] } });
    const { getRealDisplacementByOrigin } = await import('../UNHCRDisplacementService');
    const rows = await getRealDisplacementByOrigin();

    // The year in progress first, then the one before when it holds nothing yet.
    expect(get.mock.calls.map(([, config]) => config.params)).toEqual([
      expect.objectContaining({ coo_all: true, yearFrom: new Date().getUTCFullYear() }),
      expect.objectContaining({ coo_all: true, yearFrom: new Date().getUTCFullYear() - 1 }),
    ]);
    expect(rows.map((r) => r.countryISO3)).toEqual(['AFG', 'SDN', 'ABW']);
    expect(rows[0]).toEqual({ countryISO3: 'AFG', countryName: 'Afghanistan', refugees: 2671560, asylumSeekers: 270007, idps: 3199023, year: 2025 });
    expect(rows[1].refugees).toBe(2820737);
  });
});
