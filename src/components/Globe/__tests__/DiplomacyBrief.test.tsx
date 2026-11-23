/**
 * Diplomacy's country brief (decision D-DP, DP6, DP18, DP19): UNHCR's displacement both ways, and the
 * country's standing among producers as rank, amount and year with the percentile beside it. A source
 * that did not answer is named, never filled in.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DiplomacyBriefView } from '../DiplomacyBrief';
import { messagesNow } from '../../../i18n/app/i18n';
import type { CountryBrief } from '../../../geopolitical/hooks/useCountryBrief';

const services = vi.hoisted(() => ({
  energy: vi.fn(), water: vi.fn(), minerals: vi.fn(), hosted: vi.fn(), from: vi.fn(), sanctions: vi.fn(),
}));
vi.mock('../../../geopolitical/utils/countrySanctions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../geopolitical/utils/countrySanctions')>()), loadSanctionsByCountry: services.sanctions,
}));
vi.mock('../../../services/geopolitical/energyProduction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/geopolitical/energyProduction')>()), loadEnergyProduction: services.energy,
}));
vi.mock('../../../services/geopolitical/WorldBankWaterService', () => ({ getRealWaterResourceData: services.water }));
vi.mock('../../../services/geopolitical/USGSMineralsService', () => ({ getMineralProductionRecords: services.minerals }));
vi.mock('../../../services/geopolitical/UNHCRDisplacementService', () => ({
  getRealDisplacementData: services.hosted, getRealDisplacementByOrigin: services.from,
}));

const words = messagesNow().diplomacy;

const brief = (over: Partial<CountryBrief> = {}): CountryBrief => ({
  resources: [
    { kind: 'oil', rank: 3, of: 99, top: 2, value: 13221.4, unit: 'thousand barrels per day', year: '2025', source: 'EIA', via: 'record' },
    { kind: 'gas', rank: 1, of: 96, top: 1, value: 37000, unit: 'billion cubic feet', year: '2024', source: 'EIA', via: 'file' },
    { kind: 'renewable', rank: 4, of: 205, top: 2, value: 6.1, unit: 'quadrillion Btu', year: '2024', source: 'EIA', via: 'file' },
    { kind: 'minerals', commodity: 'rare_earths', rank: 1, of: 12, top: 1, value: 270000, unit: 'metric tons', year: '2024', source: 'USGS' },
    { kind: 'water', rank: 120, of: 180, top: 67, value: 1234.5, unit: 'm3 per person', year: '2021', source: 'World Bank' },
  ],
  displacement: { year: 2025, refugeesAbroad: 2_671_560, asylumAbroad: 270_007, inside: 3_199_023, refugeesHosted: 0, asylumHosted: 45 },
  sanctions: { entries: 5207, people: 1730, asOf: '2026-10-13', programmes: [['RUSSIA-EO14024', 4714], ['UKRAINE-EO13662', 251], ['CYBER2', 147], ['SDGT', 40], ['IRAN', 3]] },
  failed: [],
  ...over,
});

describe("the brief's view", () => {
  it('lists UNHCR\'s figures both ways, leaving out the ones at zero', () => {
    render(<DiplomacyBriefView brief={brief()} words={words} />);
    expect(screen.getByText('Refugees from it, abroad').nextSibling).toHaveTextContent('2.67 million');
    expect(screen.getByText('Asylum seekers from it, abroad').nextSibling).toHaveTextContent('270,007');
    expect(screen.getByText('Displaced inside it').nextSibling).toHaveTextContent('3.2 million');
    expect(screen.getByText('Asylum seekers it hosts').nextSibling).toHaveTextContent('45');
    expect(screen.queryByText('Refugees it hosts')).toBeNull();
    expect(screen.getByText('UNHCR, 2025')).toBeInTheDocument();
  });

  it('gives each resource its rank, its percentile, the amount in whole units, the source and year', () => {
    render(<DiplomacyBriefView brief={brief()} words={words} />);
    const rows = screen.getAllByTestId('diplomacy-resource');
    expect(rows.map((r) => r.dataset.kind)).toEqual(['oil', 'gas', 'renewable', 'minerals', 'water']);
    expect(rows[0]).toHaveTextContent('Crude oil: rank 3 of 99 producers · top 2%');
    expect(rows[0]).toHaveTextContent('13.2 million barrels a day · EIA, 2025 · posted on The Record');
    expect(rows[1]).toHaveTextContent('37 trillion cubic feet a year · EIA, 2024');
    expect(rows[1]).not.toHaveTextContent('Mecha Jono');
    expect(rows[2]).toHaveTextContent('6.1 quadrillion Btu a year');
    expect(rows[3]).toHaveTextContent('Rare earths: rank 1 of 12 producers · top 1%');
    expect(rows[3]).toHaveTextContent('270,000 tonnes a year · USGS, 2024');
    expect(rows[4]).toHaveTextContent('Freshwater per person: rank 120 of 180 countries · top 67%');
    expect(rows[4]).toHaveTextContent('1,235 m³ a person · World Bank, 2021');
  });

  it("gives OFAC's SDN entries with an address there, people counted and never named, its four largest programmes and the day read", () => {
    render(<DiplomacyBriefView brief={brief()} words={words} />);
    expect(screen.getByText('Entries on OFAC’s SDN list with an address here').nextSibling).toHaveTextContent('5,207');
    expect(screen.getByText('Of them, people (counted, never named)').nextSibling).toHaveTextContent('1,730');
    expect(screen.getByTestId('diplomacy-sanctions-programmes')).toHaveTextContent('By programme: RUSSIA-EO14024 4,714, UKRAINE-EO13662 251, CYBER2 147 and SDGT 40');
    expect(screen.getByText('OFAC, 13 Oct 2026')).toBeInTheDocument();
  });

  it('says what is loading, and what is not there', () => {
    const { rerender } = render(<DiplomacyBriefView brief={brief({ resources: null, displacement: undefined, sanctions: undefined })} words={words} />);
    expect(screen.getAllByText('Loading its figures…')).toHaveLength(3);
    rerender(<DiplomacyBriefView brief={brief({ resources: [], displacement: null, sanctions: null })} words={words} />);
    expect(screen.getByText('No entry on OFAC’s SDN list has an address here.')).toBeInTheDocument();
    expect(screen.getByText('UNHCR lists no one displaced from it, and no one it hosts.')).toBeInTheDocument();
    expect(screen.getByText(/None of these figures name it/)).toBeInTheDocument();
  });

  it('names a source that did not answer instead of showing nothing', () => {
    render(<DiplomacyBriefView brief={brief({ resources: [], displacement: undefined, sanctions: undefined, failed: ['EIA', 'UNHCR', 'OFAC'] })} words={words} />);
    expect(screen.getByText('EIA did not answer.')).toBeInTheDocument();
    expect(screen.getByText('OFAC did not answer.')).toBeInTheDocument();
    expect(screen.getByText('UNHCR did not answer.')).toBeInTheDocument();
    expect(screen.queryByText(/None of these figures name it/)).toBeNull();
    expect(screen.queryByText('Loading its figures…')).toBeNull();
  });
});

describe('useCountryBrief', () => {
  beforeEach(() => {
    services.energy.mockResolvedValue({ oil: { name: 'Crude oil', unit: 'thousand barrels per day', year: 2025, values: { NOR: 1800, USA: 13221 }, via: 'file' } });
    services.water.mockResolvedValue([{ countryISO3: 'NOR', countryName: 'Norway', value: 70000, year: '2021' }]);
    services.minerals.mockResolvedValue([{ countryISO3: 'NOR', countryName: 'Norway', commodity: 'iron_ore', value: 900, unit: 'thousand metric tons', year: '2024' }]);
    services.hosted.mockResolvedValue([{ countryISO3: 'NOR', countryName: 'Norway', idps: 0, refugees: 80_000, asylumSeekers: 4_000, total: 84_000, year: 2025 }]);
    services.from.mockResolvedValue([{ countryISO3: 'SYR', countryName: 'Syria', refugees: 4_865_764, asylumSeekers: 1, idps: 5_542_227, year: 2025 }]);
    services.sanctions.mockResolvedValue({ retrievedAt: '2026-10-13T21:00:00Z', countries: { NOR: { entries: 3, people: 1, programmes: { RUSSIA: 3 } } } });
  });

  it('asks nothing before a country is selected', async () => {
    const { useCountryBrief } = await import('../../../geopolitical/hooks/useCountryBrief');
    const { result } = renderHook(() => useCountryBrief(null));
    expect(result.current).toBeNull();
    expect(services.energy).not.toHaveBeenCalled();
    expect(services.from).not.toHaveBeenCalled();
    expect(services.sanctions).not.toHaveBeenCalled();
  });

  it("reads every source once a country is selected, and states the country's figures", async () => {
    const { useCountryBrief } = await import('../../../geopolitical/hooks/useCountryBrief');
    const { result } = renderHook(() => useCountryBrief('NOR'));
    await waitFor(() => expect(result.current?.resources).not.toBeNull());
    await waitFor(() => expect(result.current?.displacement).not.toBeUndefined());
    expect(result.current!.resources!.map((l) => l.kind)).toEqual(['oil', 'minerals', 'water']);
    expect(result.current!.displacement).toMatchObject({ refugeesHosted: 80_000, refugeesAbroad: 0 });
    await waitFor(() => expect(result.current?.sanctions).not.toBeUndefined());
    expect(result.current!.sanctions).toMatchObject({ entries: 3, people: 1, asOf: '2026-10-13' });
    expect(result.current!.failed).toEqual([]);
  });

  it('names each source that answered with nothing', async () => {
    services.energy.mockResolvedValue({});
    services.hosted.mockResolvedValue([]);
    services.from.mockRejectedValue(new Error('offline'));
    services.sanctions.mockRejectedValue(new Error('404'));
    const { useCountryBrief } = await import('../../../geopolitical/hooks/useCountryBrief');
    const { result } = renderHook(() => useCountryBrief('NOR'));
    await waitFor(() => expect(result.current?.failed).toEqual(['EIA', 'UNHCR', 'OFAC']));
    expect(result.current!.sanctions).toBeUndefined();
    expect(result.current!.displacement).toBeUndefined();
  });
});
