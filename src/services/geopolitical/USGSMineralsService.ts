// USGSMineralsService — real, per-country mineral production data, baked into a static
// file rather than fetched live: USGS publishes the Mineral Commodity Summaries annually,
// not continuously (same reasoning useGlobeVolcanoCatalog.ts uses for its baked JSON).
// public/geopolitical/minerals-baked.json is a curated subset (copper, gold, iron ore,
// lithium, rare earths) of USGS's National Minerals Information Center 2026 data release
// (DOI 10.5066/P1WKQ63T, CC0 public domain) — 65 real per-country 2024 production records,
// correctly topped by known producers (Chile/copper, China/rare-earths, Australia/lithium
// and iron ore) when this was extracted. See that file's own header for source details.
import { createLogger } from '@utils/logger';
import type { RealResourceRecord } from '../../geopolitical/theme/resourceZoneTheme';

const log = createLogger({ prefix: 'USGSMineralsService' });

const CATALOG_URL = '/geopolitical/minerals-baked.json';

export interface MineralProductionRecord {
  countryISO3: string;
  countryName: string;
  commodity: string;
  value: number;
  unit: string;
  year: string;
}

interface MineralsBakedFile {
  records: MineralProductionRecord[];
}

let cache: MineralProductionRecord[] | null = null;
let inFlight: Promise<MineralProductionRecord[]> | null = null;

async function loadBakedRecords(): Promise<MineralProductionRecord[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load minerals catalog: ${res.status}`);
      return res.json() as Promise<MineralsBakedFile>;
    })
    .then((data) => {
      cache = data.records;
      return cache;
    })
    .catch((error) => {
      log.error('Failed to load baked minerals catalog', error);
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * A country can be a real major producer of several different minerals at once (e.g.
 * China leads both rare earths and gold), each in incomparable units (metric tons of gold
 * vs. thousand metric tons of copper). Rather than summing incomparable raw values, each
 * commodity is percentile-ranked independently, and a country's overall "minerals" record
 * is its BEST real standing among the commodities it actually produces — mirroring
 * pickRealResourceType's own "rank highest among active types" logic one level down, so a
 * country renowned for one mineral isn't diluted by having no data for the other four.
 * Pure function, exported for direct unit testing.
 */
export function deriveMineralsResourceRecords(records: MineralProductionRecord[]): RealResourceRecord[] {
  const byCommodity = new Map<string, MineralProductionRecord[]>();
  for (const record of records) {
    const list = byCommodity.get(record.commodity) ?? [];
    list.push(record);
    byCommodity.set(record.commodity, list);
  }

  const bestPercentileByCountry = new Map<string, number>();
  for (const list of byCommodity.values()) {
    const sorted = [...list].sort((a, b) => a.value - b.value);
    const n = sorted.length;
    sorted.forEach((record, index) => {
      const percentile = n <= 1 ? 100 : (index / (n - 1)) * 100;
      const existing = bestPercentileByCountry.get(record.countryISO3) ?? -1;
      if (percentile > existing) bestPercentileByCountry.set(record.countryISO3, percentile);
    });
  }

  return Array.from(bestPercentileByCountry.entries()).map(([countryISO3, value]) => ({
    countryISO3,
    resourceType: 'minerals' as const,
    value
  }));
}

export async function getRealMineralsResourceRecords(): Promise<RealResourceRecord[]> {
  const records = await loadBakedRecords();
  return deriveMineralsResourceRecords(records);
}

/** Each commodity's producers as USGS counts them, with units and year: Diplomacy's brief names a country's best (D-DP, DP18). */
export function getMineralProductionRecords(): Promise<MineralProductionRecord[]> {
  return loadBakedRecords();
}
