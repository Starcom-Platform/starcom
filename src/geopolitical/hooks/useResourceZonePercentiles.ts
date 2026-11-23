// useResourceZonePercentiles.ts — shared real-data fetch for ResourceZones. Both the 3D
// layer (useResourceZones3D.ts) and the country click popup (CountryInfoPopup.tsx) need
// the exact same per-country percentile ranks, or the popup could claim a resource type
// the scene isn't actually showing. Combines every real data source (EIA for oil/gas/
// renewable, World Bank for water, USGS for minerals) into one percentile map via
// resourceZoneTheme.ts's computeCountryPercentiles, so pickRealResourceType can compare a
// country's rank across all active resource types fairly.
//
// Built on useRealDataLayer, mirroring the other three real GeoPolitical hooks — see
// useRealDiplomaticEvents.ts's header for why a one-shot fetch-on-enable wasn't enough.
// intervalMs matches EIA's/World Bank's own 24h CACHE_TTL_MS (both real sources share the
// same annual-cadence reasoning; USGS's minerals data is baked/static and re-resolves
// from its own already-cached promise on every call regardless of this interval).
import { getRealResourceProductionData, CACHE_TTL_MS as EIA_CACHE_TTL_MS } from '../../services/eia/EIAInternationalService';
import { getRealWaterResourceData } from '../../services/geopolitical/WorldBankWaterService';
import { deriveMineralsResourceRecords, getMineralProductionRecords } from '../../services/geopolitical/USGSMineralsService';
import { loadEnergyProduction } from '../../services/geopolitical/energyProduction';
import { computeCountryPercentiles, type CountryResourceRank, type RealResourceRecord } from '../theme/resourceZoneTheme';
import type { ResourceFigures } from '../utils/countryBrief';
import { useRealDataLayer } from './useRealDataLayer';

/**
 * How many records each source contributed. The percentile map merges them, so a
 * source that returned nothing simply vanished from it: with no EIA key, oil and gas
 * — two of the three types on by default — were missing from every Resources globe
 * and its share card said nothing. Null before the first load.
 */
export interface ResourceSourceCounts {
  eia: { records: number };
  water: { records: number };
  minerals: { records: number };
}

export interface UseResourceZonePercentilesResult {
  percentilesByCountry: Map<string, CountryResourceRank[]>;
  /**
   * The figures the ranks were made from, in their sources' units and years, for a fill's hover and the country
   * popup to say (resourceLines; critique-2026-11-01, O9). Null before the first load. Optional: a mock may omit it.
   */
  figures?: ResourceFigures | null;
  sources: ResourceSourceCounts | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  pausedByBudget: boolean;
}

interface CombinedPercentiles {
  percentiles: Map<string, CountryResourceRank[]>;
  figures: ResourceFigures;
  sources: ResourceSourceCounts;
}

async function fetchCombinedPercentiles(): Promise<CombinedPercentiles> {
  // Each source is read once a session (energyProduction.ts, USGSMineralsService.ts' caches), so the series
  // and the commodities read here are the very ones the ranks are made from.
  const [productionRecords, waterRecords, minerals, energy] = await Promise.all([
    getRealResourceProductionData(),
    getRealWaterResourceData(),
    getMineralProductionRecords(),
    loadEnergyProduction(),
  ]);
  const mineralsRecords = deriveMineralsResourceRecords(minerals);
  const combined: RealResourceRecord[] = [
    ...productionRecords,
    ...waterRecords.map((r) => ({ countryISO3: r.countryISO3, resourceType: 'water' as const, value: r.value })),
    ...mineralsRecords
  ];
  return {
    percentiles: computeCountryPercentiles(combined),
    figures: { energy, water: waterRecords, minerals },
    sources: {
      eia: { records: productionRecords.length },
      water: { records: waterRecords.length },
      minerals: { records: mineralsRecords.length },
    },
  };
}

const NO_PERCENTILES: Map<string, CountryResourceRank[]> = new Map();

// The real world has ~195 countries — generous headroom above that real ceiling for the
// distinct-country count this tracks, not a tightly measured figure.
const MAX_REAL_COUNTRIES_BUDGET = 500;

export function useResourceZonePercentiles(enabled: boolean): UseResourceZonePercentilesResult {
  const { data, loading, error, lastUpdated, pausedByBudget } = useRealDataLayer<CombinedPercentiles | null>({
    key: 'geopolitical-resource-zone-percentiles-fetch',
    enabled,
    fetchFn: fetchCombinedPercentiles,
    intervalMs: EIA_CACHE_TTL_MS,
    initialValue: null,
    resourceMode: 'GeoPolitical.ResourceZones',
    countRecords: (combined) => combined?.percentiles.size ?? 0,
    budget: { maxVectors: MAX_REAL_COUNTRIES_BUDGET }
  });

  return { percentilesByCountry: data?.percentiles ?? NO_PERCENTILES, figures: data?.figures ?? null, sources: data?.sources ?? null, loading, error, lastUpdated, pausedByBudget };
}
