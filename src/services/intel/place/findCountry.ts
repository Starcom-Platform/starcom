/**
 * Finding a country by what it is called (plan item 3.5, story S6).
 *
 * The report form asked for jurisdiction codes ("us, us-nj"), which a newcomer
 * does not know. The countries are the globe's own territories, so nothing is
 * asked of a third-party geocoder, and nothing typed leaves the browser.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, upper case, as the territories carry it. */
  code: string;
  name: string;
}

/** A code typed exactly first, then names with a word that starts with what was typed. */
export function findCountries(query: string, countries: readonly Country[], limit = 6): Country[] {
  const q = query.trim().toLowerCase().replace(/[\s-]+/g, ' ');
  if (!q) return [];
  const byCode = countries.filter((c) => c.code.toLowerCase() === q);
  // Where a word of the name begins, what was typed may run on across the
  // words after it: "new zealand" as well as "zeal". Compared a word at a
  // time, a name of several words typed in full found nothing.
  const byName = countries.filter((c) => c.code.toLowerCase() !== q
    && ` ${c.name.toLowerCase().replace(/[\s-]+/g, ' ')}`.includes(` ${q}`));
  return [...byCode, ...byName].slice(0, limit);
}
