/**
 * Entity resolution, option A (the cheapest tier of a three-tier plan —
 * see the entity-resolution research this implements). "John Smith" and
 * "john smith." previously produced two disconnected entities purely
 * because IntelWeb's entity registry and IntelAnalyzer's co-occurrence
 * pairing both keyed on the raw, unnormalized string.
 *
 * Deliberately conservative: case-folds, trims, collapses internal
 * whitespace, and strips trailing punctuation noise. Does NOT attempt
 * fuzzy matching (Levenshtein/Jaro-Winkler), alias resolution ("J. Smith"
 * ~ "John Smith"), or abbreviation expansion ("Corp." -> "Corporation") —
 * those need either a human-reviewed suggestion queue or a curated table
 * validated against real data, not a guess baked in here. This alone only
 * closes the dumbest version of the fragmentation problem, which is still
 * worth doing before anything more sophisticated is built on top of it.
 */
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"]+$/, '');
}
