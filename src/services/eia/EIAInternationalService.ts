// EIAInternationalService — per-country oil, gas and renewables production for Resource Zones'
// ranking: EIA's own figures (crude oil 57/TBPD, dry natural gas 26/BCF, renewables and other
// 4418/QBTU, production), read on demand through energyProduction.ts — Mecha Jono's notes on The
// Record, else the 3.3 KB file made from EIA's keyless bulk file (decision D-DP, DP17). It asked
// api.eia.gov with a person's own key until 2026-10-13, so every visitor without one saw no oil or gas.
import { ENERGY_SERIES, loadEnergyProduction, type EnergySeries } from '../geopolitical/energyProduction';

export type RealResourceType = EnergySeries;

export interface CountryResourceProduction {
  countryISO3: string;
  resourceType: RealResourceType;
  value: number;
  unit: string;
  period: string;
}

// EIA publishes these once a year; a session reads them once (loadEnergyProduction).
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getRealResourceProductionData(): Promise<CountryResourceProduction[]> {
  const production = await loadEnergyProduction();
  return ENERGY_SERIES.flatMap((resourceType) => {
    const series = production[resourceType];
    if (!series) return [];
    return Object.entries(series.values).map(([countryISO3, value]) => ({
      countryISO3,
      resourceType,
      value,
      unit: series.unit,
      period: String(series.year),
    }));
  });
}
