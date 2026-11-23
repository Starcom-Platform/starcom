import { normalizeEntityName } from './normalizeEntityName';
import { jaroWinklerSimilarity } from './jaroWinkler';
import { isIdentifier } from './identifiers';

export interface EntityMergeSuggestion {
  nameA: string;
  nameB: string;
  similarity: number; // 0..1
}

// High bar deliberately — these are surfaced to a human as "possibly the
// same, confirm?", not auto-merged, but suggestion fatigue (a queue full
// of implausible pairs) makes people stop checking it. 0.88 catches real
// near-misses (typos, minor spelling variants) while staying well above
// the score two genuinely different short names can hit by chance.
const SIMILARITY_THRESHOLD = 0.88;

/**
 * Entity resolution, option B: suggest — never silently merge — pairs of
 * entity names that are similar enough to plausibly be the same real-world
 * entity under different spellings, but not identical after option A's
 * normalization (exact match already handles those). A human confirms or
 * rejects each suggestion; nothing here changes any stored data on its
 * own. Misses true aliases with no string similarity (nicknames, married
 * names, "J. Smith" only if the shared prefix is long enough) — that
 * needs curated aliasing, a separate, harder problem.
 */
export function findMergeSuggestions(entityNames: string[]): EntityMergeSuggestion[] {
  // Dedupe to one representative spelling per already-normalized key —
  // no point suggesting "John Smith" ~ "john smith." to a human, option A
  // already merged those.
  const byKey = new Map<string, string>();
  for (const name of entityNames) {
    // An LEI, a Wikidata id or a key is compared by equality, never by
    // spelling: two one digit apart name two different things (plan item 3.6).
    if (isIdentifier(name)) continue;
    const key = normalizeEntityName(name);
    if (!byKey.has(key)) byKey.set(key, name);
  }
  const uniqueNames = Array.from(byKey.values());

  const suggestions: EntityMergeSuggestion[] = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const a = uniqueNames[i];
      const b = uniqueNames[j];
      const similarity = jaroWinklerSimilarity(normalizeEntityName(a), normalizeEntityName(b));
      if (similarity >= SIMILARITY_THRESHOLD) {
        suggestions.push({ nameA: a, nameB: b, similarity });
      }
    }
  }
  suggestions.sort((x, y) => y.similarity - x.similarity);
  return suggestions;
}
