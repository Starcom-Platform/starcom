/**
 * OFAC's SDN list counted by country (decision D-DP, DP6; D-BF step 6): how many entries have an
 * address in each country, by sanctions programme, and how many of them are people. Diplomacy's
 * country brief states it. An entry with addresses in two countries counts in each, once; an entry
 * with no address is in no country.
 *
 * OFAC names countries in its own words ("Korea, North", "Burma", "Congo, Democratic Republic of
 * the"); each is matched to the globe's own country code (Natural Earth's ADM0_A3, as the territories
 * are baked), by Natural Earth's names and a short list of OFAC's spellings. A name that matches none
 * is listed in the file, never guessed.
 *
 * Used at build time (scripts/snapshot-ofac.mjs) and in tests, never by the app.
 */
import { csvRows } from './leieSupplement';

export interface CountrySanctions {
  /** Entries with an address in the country. */
  entries: number;
  /** Of them, people: counted, never named. */
  people: number;
  /** Entries by programme; an entry under two programmes counts under each. */
  programmes: Record<string, number>;
}

export interface SdnByCountry {
  countries: Record<string, CountrySanctions>;
  /** OFAC's country names that match no country on the globe, with how many entries each. */
  unmatched: Record<string, number>;
}

/** A country on the globe: its code and the names Natural Earth gives it. */
export interface NamedCountry {
  code: string;
  names: string[];
}

/**
 * OFAC's spellings Natural Earth's names do not reach, each to the Natural Earth name it means. A
 * region OFAC names apart whose country is in dispute ("Region: Crimea") is left unmatched and listed.
 */
const OFAC_NAMES: Readonly<Record<string, string>> = {
  'korea, north': 'north korea',
  'korea, south': 'south korea',
  burma: 'myanmar',
  'congo, democratic republic of the': 'democratic republic of the congo',
  'congo, republic of the': 'republic of the congo',
  'bahamas, the': 'the bahamas',
  'gambia, the': 'gambia',
  'micronesia, federated states of': 'federated states of micronesia',
  'west bank': 'palestine',
  'region: gaza': 'palestine',
  'gaza': 'palestine',
  'palestinian': 'palestine',
  'region: northern mali': 'mali',
  'region: kurdistan region': 'iraq',
  'macau': 'macao',
  'region: west bank': 'palestine',
  'region: northern gaza': 'palestine',
  'region: north gaza': 'palestine',
  'region: russia': 'russia',
  'region: iran': 'iran',
  'virgin islands, british': 'british virgin islands',
  'cote d ivoire': 'ivory coast',
  'north macedonia, the republic of': 'north macedonia',
  'man, isle of': 'isle of man',
};

const norm = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The globe's countries' names, read from a Natural Earth feature collection's properties. */
export function namedCountries(features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>): NamedCountry[] {
  const keys = ['ADMIN', 'NAME', 'NAME_LONG', 'FORMAL_EN', 'NAME_SORT', 'BRK_NAME', 'GEOUNIT', 'SOVEREIGNT'];
  return features.flatMap((f) => {
    const p = f.properties ?? {};
    const code = typeof p.ADM0_A3 === 'string' ? p.ADM0_A3 : '';
    if (!/^[A-Z]{3}$/.test(code)) return [];
    const names = keys.map((k) => p[k]).filter((v): v is string => typeof v === 'string' && !!v.trim());
    return [{ code, names }];
  });
}

const programmesOf = (field: string) => field.replace(/[[\]]/g, ' ').split(/\s+/).map((s) => s.trim()).filter((s) => s && s !== '-0-');

/** A country's code by its name as Natural Earth or OFAC writes it; undefined for a name it cannot place. */
export function countryNameIndex(countries: readonly NamedCountry[]): (name: string) => string | undefined {
  const byName = new Map<string, string>();
  // Sovereign names first, so a dependency's GEOUNIT does not take its sovereign's name.
  for (const c of countries) for (const n of c.names.slice(0, 6)) if (!byName.has(norm(n))) byName.set(norm(n), c.code);
  for (const [ofac, ne] of Object.entries(OFAC_NAMES)) {
    const code = byName.get(ne);
    if (code) byName.set(ofac, code);
  }
  return (name) => byName.get(norm(name));
}

/** SDN.CSV and ADD.CSV, as OFAC publishes them (no header row), counted by country. */
export function sdnByCountry(sdnCsv: string, addCsv: string, countries: readonly NamedCountry[]): SdnByCountry {
  const codeOf = countryNameIndex(countries);

  const entries = new Map<string, { person: boolean; programmes: string[] }>();
  for (const row of csvRows(sdnCsv)) {
    const [id, , type, program] = row;
    if (!id || !/^\d+$/.test(id.trim())) continue;
    entries.set(id.trim(), { person: type?.trim().toLowerCase() === 'individual', programmes: programmesOf(program ?? '') });
  }

  const placed = new Map<string, Set<string>>();
  const unmatched: Record<string, number> = {};
  const unmatchedSeen = new Map<string, Set<string>>();
  for (const row of csvRows(addCsv)) {
    const [id, , , , country] = row.map((f) => f.trim());
    if (!id || !country || country === '-0-' || !entries.has(id)) continue;
    const code = codeOf(country);
    if (!code) {
      const seen = unmatchedSeen.get(country) ?? new Set<string>();
      seen.add(id);
      unmatchedSeen.set(country, seen);
      continue;
    }
    const ids = placed.get(code) ?? new Set<string>();
    ids.add(id);
    placed.set(code, ids);
  }
  for (const [country, ids] of unmatchedSeen) unmatched[country] = ids.size;

  const out: Record<string, CountrySanctions> = {};
  for (const [code, ids] of [...placed].sort(([a], [b]) => a.localeCompare(b))) {
    const c: CountrySanctions = { entries: ids.size, people: 0, programmes: {} };
    for (const id of ids) {
      const e = entries.get(id)!;
      if (e.person) c.people += 1;
      for (const p of e.programmes) c.programmes[p] = (c.programmes[p] ?? 0) + 1;
    }
    out[code] = c;
  }
  return { countries: out, unmatched };
}
