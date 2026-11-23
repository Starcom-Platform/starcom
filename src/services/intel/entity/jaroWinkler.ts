/**
 * Jaro-Winkler string similarity — the standard, well-documented algorithm
 * (Winkler's 1990 refinement of Jaro's 1989 distance), implemented directly
 * rather than pulling in a dependency for one small, stable function. Used
 * by findMergeSuggestions (entity resolution, option B) to catch near-miss
 * spellings — "J. Smith" vs "John Smith" — that exact-match normalization
 * (option A) can't.
 *
 * Returns a similarity score in [0, 1]; 1 means identical.
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  return (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;
}

const WINKLER_PREFIX_SCALE = 0.1; // standard value from Winkler's original paper
const WINKLER_MAX_PREFIX = 4;

export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  let prefixLength = 0;
  const maxPrefix = Math.min(WINKLER_MAX_PREFIX, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] !== s2[i]) break;
    prefixLength++;
  }
  return jaro + prefixLength * WINKLER_PREFIX_SCALE * (1 - jaro);
}
