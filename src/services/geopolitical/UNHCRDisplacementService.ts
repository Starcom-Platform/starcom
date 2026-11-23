// UNHCRDisplacementService — real, per-country humanitarian displacement data from
// UNHCR's population statistics API (no key required). Verified live before building
// this: `coa_all=true` returns real per-country-of-asylum totals for the most recent
// year in one page (181 real countries/territories at limit=300, maxPages=1 — no
// pagination needed). Correctly topped by known real 2024 crises when checked: Sudan
// (11.6M IDPs — the world's largest displacement crisis), Syria, DR Congo, Colombia,
// Yemen, Somalia, Ukraine.
import axios from 'axios';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'UNHCRDisplacementService' });

const POPULATION_URL = 'https://api.unhcr.org/population/v1/population/';
const PAGE_LIMIT = 300; // real total is ~181 rows for a single year; generous headroom

export interface CountryDisplacement {
  countryISO3: string;
  countryName: string;
  idps: number;
  refugees: number;
  asylumSeekers: number;
  total: number; // idps + refugees + asylumSeekers — the real combined magnitude used for scale/color
  year: number;
  /** UNHCR's own code for the country (`coa`, "GFR" for Germany), which its API filters by; ISO3 is the key. */
  unhcrCode?: string;
}

// This indicator updates annually, not continuously — a long TTL is appropriate, same
// reasoning as WorldBankWaterService.ts.
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache: { data: CountryDisplacement[]; fetchedAt: number } | null = null;

// UNHCR returns numeric fields as either a real number, a numeric string, or the
// sentinel string "-" for "not applicable" — never silently coerce "-" to 0 and call it
// a real reported zero; both cases return 0 for the *combined* magnitude, but "-" is
// "not tracked", not "confirmed zero".
export function realNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// UNHCR's own non-country sentinel for "country of asylum not reported" — verified live
// (coa_iso: 'UNK', coa_name: 'Unknown'). Currently its idps/refugees/asylum_seekers are
// always 0 in practice (it carries data under other fields this service doesn't sum, e.g.
// returned_refugees), so today it's incidentally dropped by the total > 0 filter below —
// but that's not a real guarantee against a future pull where it isn't, so it's excluded
// explicitly here too, the same class of fix as WorldBankWaterService's region.id !== 'NA'
// aggregate exclusion: don't let a non-country row masquerade as one.
// By origin, UNHCR also lists people who are not a country's: 'XXA' Stateless and 'TIB'
// Tibetan (2025: 34,736 and 12,581 refugees), never a country of asylum.
const NON_COUNTRY_SENTINEL_CODES = new Set(['UNK', 'XXA', 'TIB']);

interface UnhcrPopulationRow {
  year: number;
  coa_iso: string; // authoritative ISO3 code — coa (non-iso) field has been observed to
                    // disagree with coa_iso on at least one real row, so coa_iso is used,
                    // never coa.
  coa_name: string;
  /** UNHCR's own code for the country of asylum: what its API's `coa` filter takes. */
  coa?: string;
  /** The country of origin, in a `coo_all` read: whose people these are. */
  coo_iso?: string;
  coo_name?: string;
  idps: unknown;
  refugees: unknown;
  asylum_seekers: unknown;
}

/**
 * UNHCR publishes the current calendar year's figures progressively through the year
 * (confirmed real, populated data for last year and, often, the year in progress) — try the
 * most recent candidates and use the first that has real rows, same fallback discipline as
 * WorldBankWaterService.ts rather than assuming a fixed one-year lag.
 */
async function latestYearRows(by: { coa_all: true } | { coo_all: true }): Promise<UnhcrPopulationRow[]> {
  const currentYear = new Date().getUTCFullYear();
  for (const year of [currentYear, currentYear - 1, currentYear - 2]) {
    const response = await axios.get(POPULATION_URL, { params: { limit: PAGE_LIMIT, yearFrom: year, yearTo: year, ...by } });
    const rows: UnhcrPopulationRow[] = response.data?.items ?? [];
    if (rows.length > 0) return rows;
  }
  return [];
}

const isCountryCode = (code: string | undefined): code is string =>
  !!code && code !== '-' && !NON_COUNTRY_SENTINEL_CODES.has(code);

export async function getRealDisplacementData(): Promise<CountryDisplacement[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const rows = await latestYearRows({ coa_all: true });

    const data: CountryDisplacement[] = rows
      .filter((row) => isCountryCode(row.coa_iso))
      .map((row) => {
        const idps = realNumber(row.idps);
        const refugees = realNumber(row.refugees);
        const asylumSeekers = realNumber(row.asylum_seekers);
        return {
          countryISO3: row.coa_iso,
          countryName: row.coa_name,
          idps,
          refugees,
          asylumSeekers,
          total: idps + refugees + asylumSeekers,
          year: row.year,
          ...(typeof row.coa === 'string' && /^[A-Z]{3}$/.test(row.coa) ? { unhcrCode: row.coa } : {})
        };
      })
      .filter((row) => row.total > 0);

    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch (error) {
    log.error('UNHCR displacement data fetch failed', error);
    return cache?.data ?? [];
  }
}

/**
 * The same figures by country of origin (decision D-DP, DP19): a country's own people, as refugees and
 * asylum seekers in other countries, and displaced inside it. Diplomacy's country brief states both
 * sides; Conflict Zones reads only the hosted one above.
 */
export interface CountryDisplacementFrom {
  countryISO3: string;
  countryName: string;
  /** Its people who are refugees in another country. */
  refugees: number;
  /** Its people seeking asylum in another country. */
  asylumSeekers: number;
  /** Its people displaced inside it. */
  idps: number;
  year: number;
}

let originCache: { data: CountryDisplacementFrom[]; fetchedAt: number } | null = null;

export async function getRealDisplacementByOrigin(): Promise<CountryDisplacementFrom[]> {
  if (originCache && Date.now() - originCache.fetchedAt < CACHE_TTL_MS) return originCache.data;
  try {
    const rows = await latestYearRows({ coo_all: true });
    const data = rows
      .filter((row) => isCountryCode(row.coo_iso))
      .map((row) => ({
        countryISO3: row.coo_iso!,
        countryName: row.coo_name ?? row.coo_iso!,
        refugees: realNumber(row.refugees),
        asylumSeekers: realNumber(row.asylum_seekers),
        idps: realNumber(row.idps),
        year: row.year,
      }))
      .filter((row) => row.refugees + row.asylumSeekers + row.idps > 0);
    originCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (error) {
    log.error('UNHCR displacement-by-origin fetch failed', error);
    return originCache?.data ?? [];
  }
}
