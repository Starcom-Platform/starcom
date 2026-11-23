// commHubsConnectivity.ts — pure, presentation-adjacent aggregation for CommHubs.
// Mirrors cyberAttackClustering.ts's shape: pure functions, no THREE.js or rendering
// concerns, operating on real data already fetched by SubmarineCableService.ts.
import type { SubmarineCable } from '../types/CommHubs';

export interface CountryConnectivity {
  country: string;
  cableIds: string[]; // distinct real cable ids landing in this country, per this dataset
  landingPointIds: string[]; // distinct real landing point ids in this country
  isSingleCableDependency: boolean; // true when only one distinct real cable (in this dataset) lands here
}

/**
 * Real per-country cable redundancy, derived from each cable's own real `landingPoints`
 * (which carry a real `country` field the geo-only LandingPoint list lacks — see
 * types/CommHubs.ts). This dataset covers ~521-525 of TeleGeography's live ~724 real
 * cables (see SubmarineCableService.ts's header), so a country flagged here as
 * single-cable-dependent may genuinely have additional real cables this mirror doesn't
 * carry. Treat this as "at least this many, from what's verifiably known here," not a
 * claim of completeness — disclosed in the settings UI (Phase E), not hidden.
 */
export function analyzeCountryConnectivity(cables: SubmarineCable[]): CountryConnectivity[] {
  const cableIdsByCountry = new Map<string, Set<string>>();
  const landingPointIdsByCountry = new Map<string, Set<string>>();

  for (const cable of cables) {
    for (const lp of cable.landingPoints) {
      // Trimmed: a stray leading/trailing space on an otherwise-identical real country
      // name (a plausible scrape/generation artifact in external data) would otherwise
      // silently split one real country's redundancy count across two map entries.
      const country = lp.country?.trim();
      if (!country) continue;

      const cableSet = cableIdsByCountry.get(country) ?? new Set<string>();
      cableSet.add(cable.id);
      cableIdsByCountry.set(country, cableSet);

      const lpSet = landingPointIdsByCountry.get(country) ?? new Set<string>();
      lpSet.add(lp.id);
      landingPointIdsByCountry.set(country, lpSet);
    }
  }

  const results: CountryConnectivity[] = [];
  for (const [country, cableIds] of cableIdsByCountry) {
    results.push({
      country,
      cableIds: Array.from(cableIds).sort(),
      landingPointIds: Array.from(landingPointIdsByCountry.get(country) ?? []).sort(),
      isSingleCableDependency: cableIds.size === 1
    });
  }

  return results.sort((a, b) => a.country.localeCompare(b.country));
}

/** Map from real landing-point id to its real country, derived the same way as
 * analyzeCountryConnectivity — used by rendering code to style individual markers
 * without recomputing the full per-country aggregation. */
export function buildLandingPointCountryMap(cables: SubmarineCable[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cable of cables) {
    for (const lp of cable.landingPoints) {
      const country = lp.country?.trim();
      if (country) map.set(lp.id, country);
    }
  }
  return map;
}

export interface ChokepointDefinition {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Approximate bounding boxes for well-known real submarine-cable chokepoint corridors —
// a disclosed heuristic (loose containment boxes, not survey-grade strait boundaries),
// not authoritative geofencing. Good enough to flag "this real cable's real path passes
// through this real corridor," not to claim precise crossing coordinates.
//
// None of these boxes cross the antimeridian (±180° longitude) or a pole, so the
// straightforward min/max range check below doesn't need dateline-wraparound handling —
// verified deliberately, not just assumed, since a box that DID straddle ±180° would
// need an OR (lng >= min || lng <= max) instead of the AND used here. If a future
// corridor needs to cross it, this comment is the flag that the check must change too.
export const CHOKEPOINTS: ChokepointDefinition[] = [
  { name: 'Red Sea / Bab-el-Mandeb', minLat: 10, maxLat: 30, minLng: 32, maxLng: 44 },
  { name: 'Strait of Malacca', minLat: -2, maxLat: 8, minLng: 95, maxLng: 104 },
  { name: 'Luzon Strait', minLat: 18, maxLat: 22, minLng: 118, maxLng: 123 }
];

export interface CableChokepointMatch {
  cableId: string;
  cableName: string;
  chokepoints: string[]; // distinct real chokepoint names matched, sorted
}

/** Flags real cables whose real path geometry passes through one of the named,
 * approximate chokepoint corridors above. Simple bounding-box containment on real path
 * points — a disclosed heuristic, not a precise strait-crossing analysis. */
export function identifyChokepointCables(cables: SubmarineCable[]): CableChokepointMatch[] {
  const results: CableChokepointMatch[] = [];

  for (const cable of cables) {
    const matched = new Set<string>();
    for (const path of cable.paths) {
      for (const [lng, lat] of path) {
        for (const zone of CHOKEPOINTS) {
          if (lat >= zone.minLat && lat <= zone.maxLat && lng >= zone.minLng && lng <= zone.maxLng) {
            matched.add(zone.name);
          }
        }
      }
    }
    if (matched.size > 0) {
      results.push({ cableId: cable.id, cableName: cable.name, chokepoints: Array.from(matched).sort() });
    }
  }

  return results;
}
