/**
 * How precisely a publisher placed a report, in metres (decision D-F, section
 * 18, item 3).
 *
 * `geoPrecisionM` existed on the marker, and the popup and tooltip read it, and
 * the Nostr intake never filled it. So a report placed only to its county was
 * drawn, listed and captioned as if it were exact. Mecha Jono publishes
 * `geo_precision: county` for a filing address nothing resolves more finely,
 * and a geohash says its own precision in its length.
 *
 * The tag is `["geo_precision", "<word or distance>"]`. A word names a kind of
 * place; a distance is metres, or kilometres with `km`. An unknown word is not
 * guessed at: absent precision is already read conservatively downstream
 * (DEFAULT_GEO_PRECISION_M), and inventing one would claim more than was said.
 */

/** A radius for each kind of place a publisher may name, roughly its half-width. */
export const PRECISION_WORDS_M = {
  exact: 10,
  address: 30,
  street: 100,
  block: 250,
  neighbourhood: 2_000,
  neighborhood: 2_000,
  district: 5_000,
  town: 10_000,
  city: 10_000,
  county: 30_000,
  metro: 50_000,
  region: 150_000,
  state: 250_000,
  province: 250_000,
  country: 1_000_000,
} as const;

const TAG = 'geo_precision';

/** What the publisher stated, in metres, or null when they stated nothing usable. */
export function statedPrecisionM(tags: readonly unknown[]): number | null {
  for (const tag of tags) {
    if (!Array.isArray(tag) || String(tag[0] ?? '').toLowerCase() !== TAG) continue;
    const value = String(tag[1] ?? '').trim().toLowerCase();
    if (value in PRECISION_WORDS_M) return PRECISION_WORDS_M[value as keyof typeof PRECISION_WORDS_M];
    const distance = /^(\d+(?:\.\d+)?)\s*(m|km)?$/.exec(value);
    if (distance) {
      const metres = Number(distance[1]) * (distance[2] === 'km' ? 1000 : 1);
      if (metres > 0 && Number.isFinite(metres)) return metres;
    }
    return null;
  }
  return null;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Half the diagonal of the cell a geohash names, in metres, at the equator
 * (the widest a cell of that length gets), or null for what is not a geohash.
 */
export function geohashCellRadiusM(hash: string): number | null {
  const h = hash.trim().toLowerCase();
  if (!h || [...h].some((c) => !BASE32.includes(c))) return null;
  const bits = h.length * 5;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  const metresPerDegree = 111_320;
  const width = (360 / 2 ** lonBits) * metresPerDegree;
  const height = (180 / 2 ** latBits) * metresPerDegree;
  return Math.hypot(width, height) / 2;
}

/** The geohash of a point, `length` characters long (1 to 12). */
export function geohashOf(lat: number, lon: number, length: number): string {
  const size = Math.min(12, Math.max(1, Math.round(length)));
  let [latLo, latHi, lonLo, lonHi] = [-90, 90, -180, 180];
  let hash = '';
  let bits = 0;
  let value = 0;
  let even = true;
  while (hash.length < size) {
    if (even) {
      const mid = (lonLo + lonHi) / 2;
      if (lon >= mid) { value = value * 2 + 1; lonLo = mid; } else { value *= 2; lonHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { value = value * 2 + 1; latLo = mid; } else { value *= 2; latHi = mid; }
    }
    even = !even;
    if (++bits === 5) { hash += BASE32[value]; bits = 0; value = 0; }
  }
  return hash;
}

/**
 * A point's geohash no finer than how precisely it is known: the shortest whose cell's half-diagonal is within
 * `precisionM`, so a report placed only to its county does not publish the street it was typed at, and its point
 * is still within the stated distance of where it was put. With no precision, nine characters, a cell a few metres
 * across: the point as its author gave it.
 */
export function geohashWithin(lat: number, lon: number, precisionM: number | undefined): string {
  if (!(typeof precisionM === 'number' && precisionM > 0)) return geohashOf(lat, lon, 9);
  for (let n = 1; n < 9; n++) {
    if ((geohashCellRadiusM('0'.repeat(n)) ?? Infinity) <= precisionM) return geohashOf(lat, lon, n);
  }
  return geohashOf(lat, lon, 9);
}

/**
 * The precision a report carries: what the publisher stated, or else the
 * geohash cell its position was decoded from. `geoSource` is the parser's
 * record of where the point came from, so a geohash is never borrowed for a
 * position the publisher stated some other way.
 */
export function precisionForEvent(tags: readonly unknown[], geoSource: string | undefined): number | null {
  const stated = statedPrecisionM(tags);
  if (stated !== null) return stated;
  if (geoSource !== 'geohash') return null;
  for (const tag of tags) {
    if (Array.isArray(tag) && String(tag[0] ?? '').toLowerCase() === 'g') {
      const radius = geohashCellRadiusM(String(tag[1] ?? ''));
      if (radius !== null) return radius;
    }
  }
  return null;
}
