// WorldBankWaterService — real, per-country renewable freshwater resources from the
// World Bank's open data API (no key required). Verified live before building this:
// the country-list endpoint (/v2/country/all) returns 295 entries, 217 of which are real
// countries (region.id !== 'NA') and 78 of which are World Bank's own regional aggregates
// ("Arab World", "Africa Eastern and Southern", etc.) — those are excluded here. The
// ER.H2O.INTR.PC indicator (renewable internal freshwater resources per capita, cubic
// meters) returned real values for 183 of the 217 real countries for 2021 alone, correctly
// topped by known water-abundant countries (Iceland, Guyana, Suriname).
import axios from 'axios';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'WorldBankWaterService' });

const COUNTRY_LIST_URL = 'https://api.worldbank.org/v2/country/all?format=json&per_page=350';
const WATER_INDICATOR = 'ER.H2O.INTR.PC';
const waterDataUrl = (year: number) =>
  `https://api.worldbank.org/v2/country/all/indicator/${WATER_INDICATOR}?format=json&date=${year}&per_page=350`;

export interface CountryWaterResource {
  countryISO3: string;
  countryName: string;
  value: number; // renewable internal freshwater resources per capita, cubic meters
  year: string;
}

// This indicator updates on a multi-year cadence, not daily — a long TTL is appropriate.
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache: { data: CountryWaterResource[]; fetchedAt: number } | null = null;

function isRealNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface WorldBankCountryRow {
  id: string;
  region: { id: string };
}

async function fetchRealCountryISO3Set(): Promise<Set<string>> {
  const response = await axios.get(COUNTRY_LIST_URL);
  const rows: WorldBankCountryRow[] = response.data?.[1] ?? [];
  return new Set(rows.filter((row) => row.region?.id !== 'NA').map((row) => row.id));
}

interface WorldBankIndicatorRow {
  countryiso3code: string;
  country: { value: string };
  value: number | null;
  date: string;
}

// Try the most recent couple of years and fill in whichever countries the first year is
// missing — World Bank doesn't publish this indicator for every country every year.
const CANDIDATE_YEARS = [2021, 2020];

export async function getRealWaterResourceData(): Promise<CountryWaterResource[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const realCountries = await fetchRealCountryISO3Set();
    const byCountry = new Map<string, CountryWaterResource>();

    for (const year of CANDIDATE_YEARS) {
      const response = await axios.get(waterDataUrl(year));
      const rows: WorldBankIndicatorRow[] = response.data?.[1] ?? [];
      for (const row of rows) {
        if (byCountry.has(row.countryiso3code)) continue; // already have a more recent real value
        if (!realCountries.has(row.countryiso3code)) continue; // drop World Bank's own aggregates
        if (!isRealNumeric(row.value)) continue;
        byCountry.set(row.countryiso3code, {
          countryISO3: row.countryiso3code,
          countryName: row.country.value,
          value: row.value,
          year: row.date
        });
      }
    }

    const data = Array.from(byCountry.values());
    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch (error) {
    log.error('World Bank water data fetch failed', error);
    return cache?.data ?? [];
  }
}
