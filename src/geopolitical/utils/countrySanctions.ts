/**
 * The SDN list by country, for Diplomacy's country brief (decision D-DP, DP6, its deferred part; D-BF
 * step 6): how many of OFAC's entries have an address in the country, by programme, and how many are
 * people, counted, never named. Read on a country's first selection from
 * public/data/sanctions-by-country.json, made at each build by scripts/snapshot-ofac.mjs
 * (sdnByCountry.ts says how OFAC's country names are matched).
 */
import type { CountrySanctions } from '../../services/exchange/feeds/sdnByCountry';

export type { CountrySanctions } from '../../services/exchange/feeds/sdnByCountry';

export const SANCTIONS_BY_COUNTRY_URL = '/data/sanctions-by-country.json';

export interface SanctionsByCountry {
  /** When the build read OFAC's list, ISO 8601. */
  retrievedAt: string;
  countries: Record<string, CountrySanctions>;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function countryOf(raw: unknown): CountrySanctions | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || !isCount(c.entries) || !isCount(c.people) || !c.programmes || typeof c.programmes !== 'object') return null;
  const programmes = Object.entries(c.programmes as Record<string, unknown>).filter((e): e is [string, number] => !!e[0] && isCount(e[1]));
  return { entries: c.entries, people: c.people, programmes: Object.fromEntries(programmes) };
}

/** The file, each country checked; one that does not read is left out. */
export function parseSanctionsByCountry(json: unknown): SanctionsByCountry {
  const f = json as Record<string, unknown> | null;
  if (!f || f.version !== 1 || !f.countries || typeof f.countries !== 'object' || typeof f.retrievedAt !== 'string') {
    return { retrievedAt: '', countries: {} };
  }
  const countries: Record<string, CountrySanctions> = {};
  for (const [code, raw] of Object.entries(f.countries as Record<string, unknown>)) {
    const c = /^[A-Z]{3}$/.test(code) ? countryOf(raw) : null;
    if (c) countries[code] = c;
  }
  return { retrievedAt: f.retrievedAt, countries };
}

export interface SanctionsLine {
  entries: number;
  people: number;
  /** The programmes with the most entries first: [code, entries]. */
  programmes: Array<[string, number]>;
  /** The day the build read OFAC's list, YYYY-MM-DD. */
  asOf: string;
}

/** The country's line in the brief; null when no SDN entry has an address there. */
export function sanctionsLineOf(code: string, file: SanctionsByCountry): SanctionsLine | null {
  const c = file.countries[code];
  if (!c) return null;
  return {
    entries: c.entries,
    people: c.people,
    programmes: Object.entries(c.programmes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    asOf: file.retrievedAt.slice(0, 10),
  };
}

export async function loadSanctionsByCountry(fetchJson: (url: string) => Promise<unknown> = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}): Promise<SanctionsByCountry> {
  return parseSanctionsByCountry(await fetchJson(SANCTIONS_BY_COUNTRY_URL));
}
