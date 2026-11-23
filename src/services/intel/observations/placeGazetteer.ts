/**
 * Resolving a place name to a stable identity.
 *
 * Cities do not share a name across languages. GLEIF records addresses in the
 * local language and writes `Köln` and `München`; Wikidata's English label
 * says `Cologne` and `Munich`. Compared as strings they read as disagreement —
 * measured at 52% agreement on real data, which silently excluded most German
 * cities from corroboration (D14).
 *
 * Fuzzy string matching is the wrong fix and this file deliberately does not
 * do it. Edit distance would happily match `Bonn` to `Bonin`, and inventing
 * agreement is a far worse failure than missing it.
 *
 * The right fix is the one that already made the company join work: identify
 * by an identifier a third party assigned, instead of inferring identity from
 * names. Wikidata gives every place a Q-id and knows its name in every
 * language, so both feeds resolve their local spelling to the same id and
 * compare that.
 */

export interface GazetteerPlace {
  /** Wikidata item id, e.g. `Q365` for Cologne. */
  qid: string;
  /** ISO 3166-1 alpha-2 of the country the place is in. */
  countryIso?: string;
  /** Every name this place is known by, across languages and aliases. */
  names: string[];
}

/** Resolves a local place name to its Wikidata id, or undefined. */
export type PlaceResolver = (name: string, countryIso?: string) => string | undefined;

/**
 * Fold a name to a comparison key.
 *
 * Diacritics are stripped so `Zürich` and `Zurich` agree — a transliteration
 * is the same name written for a different keyboard, not a different claim.
 * Nothing else is altered: no stemming, no substring matching, no distance.
 */
function fold(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a resolver from gazetteer entries.
 *
 * Keyed by country AND name. Place names collide across borders constantly —
 * there are dozens of Springfields — and a country-blind lookup would resolve
 * two different cities to whichever entry happened to load first, manufacturing
 * agreement between companies on separate continents.
 *
 * A name that is ambiguous WITHIN one country resolves to nothing rather than
 * to a guess. Silence is recoverable; a wrong identity is not.
 */
export function buildPlaceResolver(places: GazetteerPlace[]): PlaceResolver {
  const byCountry = new Map<string, string | null>();

  for (const place of places) {
    if (!place?.qid || !Array.isArray(place.names)) continue;
    for (const name of place.names) {
      if (typeof name !== 'string' || !name.trim()) continue;
      const key = `${(place.countryIso ?? '').toUpperCase()}:${fold(name)}`;
      const existing = byCountry.get(key);
      // null marks a name already known to be ambiguous in this country.
      if (existing === undefined) byCountry.set(key, place.qid);
      else if (existing !== place.qid) byCountry.set(key, null);
    }
  }

  return (name, countryIso) => {
    if (!name?.trim()) return undefined;
    const hit = byCountry.get(`${(countryIso ?? '').toUpperCase()}:${fold(name)}`);
    return hit ?? undefined;
  };
}

/** A resolver that resolves nothing — the honest default when no gazetteer is loaded. */
export const NO_PLACE_RESOLVER: PlaceResolver = () => undefined;
