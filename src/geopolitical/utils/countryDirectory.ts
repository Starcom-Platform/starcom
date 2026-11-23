// countryDirectory.ts — pairs each country's computeCountryCentroids result
// (countryCentroids.ts, unmodified) with a human-readable name, producing the
// flat, sorted list the search bar (GlobalHeader.tsx) needs to show and fly
// to a country. Kept as a separate function rather than folding name
// resolution into computeCountryCentroids itself, so that Piece 1's
// already-tested centroid math and its call sites stay untouched.
import { computeCountryCentroids, type CentroidSourcePart, type CountryCentroid } from './countryCentroids';

export interface CountryDirectoryEntry {
  countryCode: string;
  name: string;
  lat: number;
  lng: number;
}

export interface DirectorySourcePart extends CentroidSourcePart {
  name?: string;
}

/**
 * First non-empty part.name seen per countryCode, across all given parts.
 * Split out from buildCountryDirectory so a caller that already has a
 * separately-computed centroids map (see NationalTerritoriesService's
 * getCountryDirectory, which reuses getCountryCentroids()'s memoized result)
 * doesn't have to pay for computeCountryCentroids running a second time.
 */
export function extractCountryNames(parts: DirectorySourcePart[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const part of parts) {
    if (!part.countryCode || names.has(part.countryCode)) continue;
    const trimmed = part.name?.trim();
    if (trimmed) names.set(part.countryCode, trimmed);
  }
  return names;
}

/**
 * Combines an already-computed centroids map with a name map into the flat,
 * name-sorted directory list. A country present in `centroids` but absent
 * from `names` falls back to its countryCode as the display name.
 */
export function combineCentroidsAndNames(
  centroids: Map<string, CountryCentroid>,
  names: Map<string, string>
): CountryDirectoryEntry[] {
  const entries: CountryDirectoryEntry[] = [];
  centroids.forEach((centroid, countryCode) => {
    entries.push({
      countryCode,
      name: names.get(countryCode) ?? countryCode,
      lat: centroid.lat,
      lng: centroid.lng
    });
  });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/**
 * One entry per country that resolves a centroid, sorted by name. A part
 * with no countryCode, or whose countryCode never resolves a centroid (see
 * computeCountryCentroids — degenerate/zero-area geometry), contributes no
 * entry. The name is the first non-empty part.name seen for that
 * countryCode; if none of a country's parts carry a name, its countryCode
 * is used as the display name instead of dropping the entry.
 *
 * A thin composition of extractCountryNames + combineCentroidsAndNames,
 * computing centroids itself — the convenient one-call form for a caller
 * that doesn't already have a centroids map lying around.
 */
export function buildCountryDirectory(parts: DirectorySourcePart[]): CountryDirectoryEntry[] {
  return combineCentroidsAndNames(computeCountryCentroids(parts), extractCountryNames(parts));
}
