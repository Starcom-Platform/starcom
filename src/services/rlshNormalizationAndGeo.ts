// src/services/rlshNormalizationAndGeo.ts
/**
 * Pure normalization utilities and geo-resolution logic for the RLSH pipeline.
 * All functions are stateless — no `this` references, no side effects.
 * Extracted from RLSHVisualizationService.ts monolith.
 */

import type { RLSHOverlayMarker } from '../interfaces/RLSHOverlay';
import type { GeoResolutionResult, ResolutionTier } from './rlshVisualizationTypes';

// ─── Scrape artefacts ────────────────────────────────────────────────────────

/**
 * List bullets, which the wiki scrape turned into members.
 *
 * The source markup was a bulleted list:
 *
 *   * Rose City Rebellion (co-founder)
 *   * The Alternates (former)
 *
 * and the scraper split on whitespace, so Apocalypse Meow arrived with
 * team = ["*","Rose City Rebellion","(co-founder)","*","The Alternates","(former)"]
 * — six teams where there are two, with the bullets and the role qualifiers
 * promoted to team names of their own.
 *
 * Across 197 entries that made "*" the largest team in the dataset with 76
 * members, "(former)" the second with 59, and "•" another with 11 — ahead of
 * every real team, the largest of which has 17. Those values also reach `tags`
 * as team:* and team:(former), and tags drive filtering.
 */
const BULLETS = new Set(['*', '•', '·', '-', '–', '—', '‣', '▪']);

/**
 * Characters that occupy a wiki cell without saying anything.
 *
 * Enumerating bullets was not enough. Cleaning the list revealed a team of
 * eight called "⠀" (U+2800 BRAILLE PATTERN BLANK), another called "‎"
 * (U+200E LEFT-TO-RIGHT MARK), and two called "(" and ")". Worse, "ㅤ"
 * (U+3164 HANGUL FILLER) is a Unicode LETTER, so "does this contain a letter?"
 * waved it through — an invisible character that is categorically a letter is
 * exactly the shape of thing an enumerated denylist keeps missing.
 *
 * So these are stripped BEFORE deciding, and then a name has to contain a
 * letter or digit that survived. That rule subsumes every bullet above and
 * every spacer someone invents next.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u2028\u2029\u2060\u2800\u3164\uFEFF\u00A0]/gu;

/** Does anything meaningful remain once the invisibles are gone? */
const hasVisibleContent = (raw: string): boolean =>
  /[\p{L}\p{N}]/u.test(raw.replace(INVISIBLE, '').trim());

/** A parenthetical on its own is a qualifier that lost its noun: "(former)". */
const STANDALONE_QUALIFIER = /^\(.*\)$/;

/**
 * Words that describe a MEMBERSHIP rather than name a team.
 *
 * A closed list, because the distinction cannot be made structurally.
 * "XJL (former)" and "BASH (Bay Area Superheroes)" are the same shape — a name
 * followed by a balanced parenthetical — and only one of them is a qualifier.
 * "I Rivendicatori (Vindicators)" is a team's name beside its translation, and
 * an implementation that stripped every bracket would delete that.
 *
 * So only these come off, and anything else in brackets is part of the name.
 */
const MEMBERSHIP_QUALIFIERS = new Set([
  'former', 'current', 'ex', 'past', 'founder', 'co-founder', 'cofounder',
  'founding member', 'retired', 'inactive', 'active', 'honorary', 'member',
  'leader', 'former member', 'current member', 'co-leader',
]);

/** Strip only the brackets whose whole content is membership wording. */
const stripMembershipQualifiers = (name: string): string =>
  name.replace(/\(([^()]*)\)/g, (whole, inner: string) => {
    const parts = inner.split(/[,/]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    return parts.length > 0 && parts.every((x) => MEMBERSHIP_QUALIFIERS.has(x)) ? '' : whole;
  }).replace(/\s{2,}/g, ' ').trim();

/**
 * Text meaning "there is nothing here", copied from the wiki as though it were
 * a value. 59 entries list "N/A" as an ALIAS; 46 name "Unknown" as a FOE.
 *
 * Applied to member lists and to free-text detail fields, NOT to the
 * classification fields — `status: "Unknown"` is a real category with 9 members,
 * and blanking it would delete a true statement about what is known.
 */
const PLACEHOLDERS = new Set([
  'n/a', 'na', 'n.a.', 'none', 'unknown', 'unspecified', 'tbd', 'tba', '?', '--', 'null', 'nil',
]);

const isPlaceholder = (raw: string): boolean => {
  const v = raw.replace(INVISIBLE, '').trim().toLowerCase();
  return v === '' || PLACEHOLDERS.has(v) || BULLETS.has(v) || !hasVisibleContent(raw);
};

/**
 * A list of actual members: bullets, orphaned qualifiers and placeholders out.
 *
 * The qualifier is dropped rather than reattached to the preceding name on
 * purpose. Grouping is the point of this field, and "Xtreme Justice League" and
 * "Xtreme Justice League (former)" would group as two different teams — the
 * membership history stays available in `fullText`, where it came from.
 */
/**
 * One member name, recovered from however the scrape mangled it.
 *
 * There are THREE artefact shapes in this data, not one, and Arachnight has all
 * of them at once. The wiki line was:
 *
 *   * The Paradox Core (former)
 *   * Rose City Watchmen (former, co-founder)
 *
 * and it arrived as:
 *
 *   ["*","The Paradox Core","(former)","* Rose City Watchmen (former","co-founder)"]
 *
 * because the scraper split on whitespace AND on the comma inside the
 * parenthesis. So a bullet can be its own element or sit inside one; a
 * qualifier can be its own element, or be left dangling on the end of a name
 * with its bracket unclosed, or arrive alone as a closing fragment.
 *
 * Returns '' for anything that is not a name.
 */
function cleanMemberName(raw: string): string {
  let v = raw.replace(INVISIBLE, '').trim();
  // A bullet leading its own line: "* Rose City Watchmen (former".
  v = v.replace(/^[*•·‣▪\-–—]+\s*/u, '').trim();
  const open = (v.match(/\(/g) ?? []).length;
  const close = (v.match(/\)/g) ?? []).length;
  // A closing fragment with nothing it could close — "co-founder)" — is the
  // tail of a qualifier, never a team.
  if (close > open) return '';
  // An unclosed qualifier means the name ends where the bracket begins.
  if (open > close) v = v.slice(0, v.indexOf('(')).trim();
  if (STANDALONE_QUALIFIER.test(v)) return '';
  // "XJL (former)" groups with "XJL"; "BASH (Bay Area Superheroes)" keeps its
  // expansion. Done after the unbalanced repair so both shapes land here.
  v = stripMembershipQualifiers(v);
  v = v.replace(/[,;]+$/, '').trim();
  // "(Current) None" reduces to "None" once the qualifier is gone, and that is
  // a statement that there is no team — re-tested here rather than before.
  if (isPlaceholder(v)) return '';
  return hasVisibleContent(v) ? v : '';
}

export function normalizeMemberList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => (typeof item === 'string' ? cleanMemberName(item) : ''))
    .filter((item) => item !== '' && !isPlaceholder(item));
  return [...new Set(cleaned)];
}

/** Free text where a placeholder means absent. Returns '' so callers can hide it. */
export function normalizeOptionalText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return isPlaceholder(trimmed) ? '' : trimmed;
}

/**
 * Tags, with every `team:` entry DERIVED from the cleaned team list.
 *
 * Cleaning the tag strings was the wrong instinct and the data said so. The
 * scraped tags come from a different parse of the same wiki cell — one where
 * the whole bulleted line became a single value — so they read
 * `team:* Rose City Watchmen (former`, `team:(Current) None` and
 * `team:*(Former)`. No amount of trimming turns those into the team names the
 * markers actually carry, and a filter tuned to that shape would just miss the
 * next one.
 *
 * So the `team:` namespace is rebuilt from `normalizeMemberList(team)` instead
 * of trusted. Tags and teams then agree by construction rather than by two
 * parsers happening to concur, which is what let them disagree in the first
 * place. Every other tag namespace is passed through, placeholders removed.
 */
export function normalizeMeaningfulTags(tags: unknown, team: unknown = []): string[] {
  const passthrough = (Array.isArray(tags) ? tags : [])
    .map((t) => (typeof t === 'string' ? t.replace(INVISIBLE, '').trim() : ''))
    .filter((t) => !isPlaceholder(t) && !STANDALONE_QUALIFIER.test(t))
    // Dropped wholesale — rebuilt below from the field that is now correct.
    .filter((t) => !t.toLowerCase().startsWith('team:'));

  const derived = normalizeMemberList(team).map((name) => `team:${name}`);
  return [...new Set([...passthrough, ...derived])];
}

// ─── Normalizer Functions ─────────────────────────────────────────────────────

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const normalized = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);

  return [...new Set(normalized)];
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  return [...new Set(normalized)];
}

export function normalizeOptionalIsoDate(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return Number.isNaN(Date.parse(trimmed)) ? '' : trimmed;
}

export function normalizeOptionalUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return isHttpUrl(trimmed) ? trimmed : '';
}

export function normalizeOptionalNpub(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /^npub1[ac-hj-np-z02-9]{20,}$/i.test(trimmed) ? trimmed : '';
}

export function normalizeOptionalEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}

export function normalizeUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0 && isHttpUrl(item));

  return [...new Set(normalized)];
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Milliseconds since the epoch, which is what IntelReportOverlayMarker.timestamp
 * holds. Named toUnixTimestamp until two readers took the name at its word and
 * multiplied by 1000. See markerTimeMs.
 */
export function toEpochMs(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

// ─── Geo Resolution ───────────────────────────────────────────────────────────

const CITY_COORDS = new Map<string, { latitude: number; longitude: number }>([
  ['seattle|wa|us', { latitude: 47.6062, longitude: -122.3321 }],
  ['chicago|il|us', { latitude: 41.8781, longitude: -87.6298 }],
  ['new york|ny|us', { latitude: 40.7128, longitude: -74.006 }],
  ['london||gb', { latitude: 51.5074, longitude: -0.1278 }]
]);

const REGION_COORDS = new Map<string, { latitude: number; longitude: number }>([
  ['wa|us', { latitude: 47.3826, longitude: -120.4472 }],
  ['il|us', { latitude: 40.6331, longitude: -89.3985 }],
  ['ny|us', { latitude: 42.9134, longitude: -75.5963 }]
]);

const COUNTRY_COORDS = new Map<string, { latitude: number; longitude: number }>([
  ['us', { latitude: 39.8283, longitude: -98.5795 }],
  ['gb', { latitude: 55.3781, longitude: -3.436 }]
]);

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isValidGeoConfidence(value: unknown): value is RLSHOverlayMarker['geoConfidence'] {
  return value === 'exact' || value === 'city' || value === 'region' || value === 'country' || value === 'unknown';
}

export function resolveGeoCandidate(candidate: Partial<RLSHOverlayMarker> & { city?: unknown; region?: unknown; countryCode?: unknown }): GeoResolutionResult {
  const latitude = toFiniteNumber(candidate.latitude);
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return { latitude: 0, longitude: 0, geoConfidence: 'unknown', conflict: false, reason: 'invalid-latitude' };
  }

  const longitude = toFiniteNumber(candidate.longitude);
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return { latitude: 0, longitude: 0, geoConfidence: 'unknown', conflict: false, reason: 'invalid-longitude' };
  }

  const explicitConfidence = candidate.geoConfidence;
  if (typeof explicitConfidence !== 'undefined' && !isValidGeoConfidence(explicitConfidence)) {
    return { latitude: 0, longitude: 0, geoConfidence: 'unknown', conflict: false, reason: 'invalid-geo-confidence' };
  }

  const city = normalizePlaceToken(candidate.city);
  const region = normalizePlaceToken(candidate.region);
  const countryCode = normalizeCountryCode(candidate.countryCode);
  const hasCoords = latitude !== null && longitude !== null;
  const mapped = lookupGeoresolution(city, region, countryCode);

  if (hasCoords) {
    const inferred: RLSHOverlayMarker['geoConfidence'] =
      city ? 'city' : region ? 'region' : countryCode ? 'country' : 'exact';
    const mergedConfidence = mergeConfidence(explicitConfidence, inferred);
    let conflict = false;

    if (mapped) {
      const distanceKm = calculateDistanceKm(latitude, longitude, mapped.latitude, mapped.longitude);
      const thresholdKm = mapped.tier === 'city' ? 500 : mapped.tier === 'region' ? 1000 : 1500;
      conflict = distanceKm > thresholdKm;
    }

    return {
      latitude,
      longitude,
      geoConfidence: mergedConfidence,
      city,
      region,
      countryCode,
      conflict
    };
  }

  if (mapped) {
    return {
      latitude: mapped.latitude,
      longitude: mapped.longitude,
      geoConfidence: mergeConfidence(explicitConfidence, mapped.tier),
      city,
      region,
      countryCode,
      conflict: false
    };
  }

  return {
    latitude: 0,
    longitude: 0,
    geoConfidence: 'unknown',
    city,
    region,
    countryCode,
    conflict: false,
    reason: 'unresolved-geo'
  };
}

export function normalizePlaceToken(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

export function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length === 2 ? normalized : undefined;
}

export function lookupGeoresolution(city?: string, region?: string, countryCode?: string): ({ latitude: number; longitude: number; tier: ResolutionTier }) | null {
  if (city && countryCode) {
    const cityWithRegionKey = `${city}|${region || ''}|${countryCode}`;
    const cityWithoutRegionKey = `${city}||${countryCode}`;
    const cityMatch = CITY_COORDS.get(cityWithRegionKey)
      || CITY_COORDS.get(cityWithoutRegionKey);

    if (cityMatch) {
      return { ...cityMatch, tier: 'city' };
    }
  }

  if (region && countryCode) {
    const regionMatch = REGION_COORDS.get(`${region}|${countryCode}`);
    if (regionMatch) {
      return { ...regionMatch, tier: 'region' };
    }
  }

  if (countryCode) {
    const countryMatch = COUNTRY_COORDS.get(countryCode);
    if (countryMatch) {
      return { ...countryMatch, tier: 'country' };
    }
  }

  return null;
}

export function mergeConfidence(
  explicitConfidence: RLSHOverlayMarker['geoConfidence'] | undefined,
  inferredConfidence: RLSHOverlayMarker['geoConfidence']
): RLSHOverlayMarker['geoConfidence'] {
  if (!explicitConfidence) {
    return inferredConfidence;
  }

  const rank: Record<RLSHOverlayMarker['geoConfidence'], number> = {
    exact: 0,
    city: 1,
    region: 2,
    country: 3,
    unknown: 4
  };

  return rank[explicitConfidence] >= rank[inferredConfidence] ? explicitConfidence : inferredConfidence;
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}
