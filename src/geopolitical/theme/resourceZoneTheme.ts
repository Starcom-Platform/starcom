// resourceZoneTheme.ts — pure color/selection logic for the ResourceZones
// layer, kept apart from the THREE-touching hook (useResourceZones3D.ts) for
// the same reason materialTheme.ts's border palette lives apart from
// NationalTerritoriesService: trivially unit-testable, no THREE/DOM
// dependency.
//
// Resource-type assignment is driven by real per-country data (EIAInternationalService
// for oil/gas/renewable; water/minerals sources land in later phases of the same
// retrofit) — never a synthetic placeholder. A country with no real data in any
// currently-active resource type gets no fill at all; see pickRealResourceType.
export type ResourceType = 'oil' | 'gas' | 'minerals' | 'water' | 'renewable';

/*
 * By meaning, checked for colour vision (owner, 1 Nov: critique-2026-11-01 OR24): oil deep red, gas an amber
 * flame, renewables green, minerals bone, water blue. The closest pair at 55% over the globe is OKLab ΔE 0.141
 * normal, 0.104 deutan, 0.076 protan, 0.061 tritan. Gas and water were one cyan (0.016), and oil a grey the dark
 * globe swallowed.
 */
const RESOURCE_TYPE_COLORS: Record<ResourceType, number> = {
  oil: 0xc0392b,
  gas: 0xf5a623,
  minerals: 0xf4f1e8,
  water: 0x4a7cff,
  renewable: 0x1fbf8f
};

export function resourceTypeColor(type: ResourceType): number {
  return RESOURCE_TYPE_COLORS[type];
}

export interface CountryResourceRank {
  resourceType: ResourceType;
  percentile: number; // 0-100, rank within that resource type's real value distribution
}

export interface RealResourceRecord {
  countryISO3: string;
  resourceType: ResourceType;
  value: number;
}

/**
 * Percentile rank (0-100) of each country within its own resource type's real value
 * distribution — not raw units, which aren't comparable across barrels/day (oil), cubic
 * feet (gas), Btu (renewables), or cubic meters per capita (water). Combines records from
 * every real data source (EIAInternationalService, WorldBankWaterService, ...) into one
 * map so pickRealResourceType can compare a country's rank across ALL five resource types
 * fairly, regardless of which service supplied which type's real data.
 */
export function computeCountryPercentiles(records: RealResourceRecord[]): Map<string, CountryResourceRank[]> {
  const byType = new Map<ResourceType, RealResourceRecord[]>();
  for (const record of records) {
    const list = byType.get(record.resourceType) ?? [];
    list.push(record);
    byType.set(record.resourceType, list);
  }

  const result = new Map<string, CountryResourceRank[]>();
  for (const [resourceType, list] of byType) {
    const sorted = [...list].sort((a, b) => a.value - b.value);
    const n = sorted.length;
    sorted.forEach((record, index) => {
      const percentile = n <= 1 ? 100 : (index / (n - 1)) * 100;
      const existing = result.get(record.countryISO3) ?? [];
      existing.push({ resourceType, percentile });
      result.set(record.countryISO3, existing);
    });
  }
  return result;
}

/**
 * Picks whichever currently-active resource type a country ranks highest in, by real
 * global percentile (not raw units — barrels/day, cubic feet, and Btu aren't directly
 * comparable). Returns null when the country has no real data for any active type —
 * that country renders no fill, rather than a placeholder standing in for missing data.
 */
export function pickRealResourceType(
  countryISO3: string,
  activeTypes: ResourceType[],
  percentilesByCountry: Map<string, CountryResourceRank[]>
): ResourceType | null {
  if (activeTypes.length === 0) return null;
  const countryRanks = percentilesByCountry.get(countryISO3);
  if (!countryRanks || countryRanks.length === 0) return null;

  const activeSet = new Set(activeTypes);
  const candidates = countryRanks.filter((r) => activeSet.has(r.resourceType));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (current.percentile > best.percentile ? current : best)).resourceType;
}

const ALERT_LEVEL_COLORS: Record<'low' | 'medium' | 'high', number> = {
  low: 0xffcc00,
  medium: 0xff8800,
  high: 0xff3333
};

export function conflictZoneColor(alertLevel: 'low' | 'medium' | 'high'): number {
  return ALERT_LEVEL_COLORS[alertLevel];
}
