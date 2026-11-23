/**
 * Where the desk's leads are, for its map (decision D-LD, LD2): how many leads name each country, and
 * each US state, by the places their records give — a report's jurisdictions, a sanctions
 * publication's named organisations' countries, a month of exclusions' named businesses' states.
 * People are never placed (BF2). A place the globe's countries cannot hold is counted as unplaced,
 * never guessed.
 *
 * Countries are the globe's own (Natural Earth's ADM0_A3, as the territories are baked); a two-letter
 * code is read by ISO_A2, or ISO_A2_EH where Natural Earth leaves ISO_A2 blank (France, Norway,
 * Kosovo); a country OFAC names in its own words is read as sdnByCountry.ts reads it.
 */
import { countryNameIndex, namedCountries } from './feeds/sdnByCountry';
import type { Lead } from './leads';

type Feature = { properties?: Record<string, unknown> | null };

export interface PlaceIndex {
  byIso2: (iso2: string) => string | undefined;
  byName: (name: string) => string | undefined;
}

export function placeIndex(features: readonly Feature[]): PlaceIndex {
  const iso2 = new Map<string, string>();
  const valid = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);
  for (const key of ['ISO_A2', 'ISO_A2_EH'] as const) {
    for (const f of features) {
      const code = f.properties?.ADM0_A3;
      const a2 = f.properties?.[key];
      if (typeof code === 'string' && /^[A-Z]{3}$/.test(code) && valid(a2) && !iso2.has(a2)) iso2.set(a2, code);
    }
  }
  const byName = countryNameIndex(namedCountries(features));
  return { byIso2: (a2) => iso2.get(a2.toUpperCase()), byName };
}

export interface PlaceCounts {
  /** The leads naming each country, by its code; a US state's leads are its country's too. */
  countries: Map<string, string[]>;
  /** The leads naming each US state, by its two-letter code. */
  states: Map<string, string[]>;
  /** Places named that no country on the globe holds, as the record wrote them. */
  unplaced: string[];
}

const add = (map: Map<string, string[]>, key: string, id: string) => {
  const ids = map.get(key) ?? [];
  if (!ids.includes(id)) map.set(key, [...ids, id]);
};

export function countsByPlace(leads: readonly Lead[], index: PlaceIndex): PlaceCounts {
  const countries = new Map<string, string[]>();
  const states = new Map<string, string[]>();
  const unplaced = new Set<string>();
  for (const lead of leads) {
    for (const place of lead.places) {
      if ('countryName' in place) {
        const code = index.byName(place.countryName);
        if (code) add(countries, code, lead.id);
        else unplaced.add(place.countryName);
        continue;
      }
      const [country, sub] = place.jurisdiction.split('-');
      const code = index.byIso2(country);
      if (!code) { unplaced.add(place.jurisdiction); continue; }
      add(countries, code, lead.id);
      if (country === 'us' && sub && /^[a-z]{2}$/.test(sub)) add(states, sub.toUpperCase(), lead.id);
    }
  }
  return { countries, states, unplaced: [...unplaced].sort() };
}
