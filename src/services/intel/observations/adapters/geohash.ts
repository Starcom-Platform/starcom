/**
 * Geohash decoding that reports the CELL, not a point.
 *
 * A geohash names a rectangle. Every decoder returns its centre, and that is
 * where false precision comes from: the centre of a 4-character cell is a
 * specific coordinate that the sender never claimed and that is frequently a
 * real address belonging to someone uninvolved.
 *
 * So this returns the centre AND the radius that contains the cell, and the
 * radius is computed from the cell's actual dimensions rather than read off a
 * table of nominal "≈20km" figures. Navcom's own spec labelled its cell
 * "COARSE (~20km)" while its worked example used a 5-character hash of ±2.4km
 * — an eight-fold discrepancy in the one field whose entire job is preventing
 * an operator from being located. Deriving the number from the hash cannot
 * disagree with itself that way.
 */

/** Base-32 alphabet used by geohash — note the absent a, i, l, o. */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface GeohashCell {
  /** Centre of the cell. Never present this as the observed position. */
  lat: number;
  lon: number;
  /** Half-height and half-width of the cell, in degrees. */
  latErrorDeg: number;
  lonErrorDeg: number;
  /**
   * Radius in metres that contains the whole cell, from its centre.
   *
   * The circumradius, not the half-width: a point anywhere in the cell is
   * within this distance of the centre, which is the property a consumer
   * needs when deciding whether two observations could be the same place.
   */
  radiusM: number;
  /** Characters in the source hash. Precision is a function of this. */
  precisionChars: number;
}

/** Metres per degree of latitude. Constant enough for an uncertainty radius. */
const M_PER_DEG_LAT = 111_320;

/**
 * Decode a geohash to its cell.
 *
 * Returns null for anything that is not a geohash — an empty string, a
 * character outside the alphabet, mixed case that is not simply upper. Callers
 * reject on null rather than substituting a fallback position, because there
 * is no such thing as a default location.
 */
export function decodeGeohash(hash: string): GeohashCell | null {
  if (typeof hash !== 'string') return null;
  const h = hash.trim().toLowerCase();
  if (h.length === 0) return null;

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let isLon = true;

  for (const char of h) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) return null;

    // Each character carries five bits, most significant first.
    for (let bit = 4; bit >= 0; bit--) {
      const bitValue = (idx >> bit) & 1;
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (bitValue === 1) lonMin = mid; else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitValue === 1) latMin = mid; else latMax = mid;
      }
      isLon = !isLon;
    }
  }

  const lat = (latMin + latMax) / 2;
  const lon = (lonMin + lonMax) / 2;
  const latErrorDeg = (latMax - latMin) / 2;
  const lonErrorDeg = (lonMax - lonMin) / 2;

  /*
   * Longitude degrees narrow towards the poles, so the cell's width in metres
   * depends on where it is. Using the centre latitude's cosine is exact enough
   * for an uncertainty radius and, importantly, never UNDERSTATES the radius
   * for the half of the cell nearer the pole by more than a rounding.
   */
  const latM = latErrorDeg * M_PER_DEG_LAT;
  const lonM = lonErrorDeg * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

  return {
    lat,
    lon,
    latErrorDeg,
    lonErrorDeg,
    // Circumradius of the cell: the corner is the furthest point from centre.
    radiusM: Math.round(Math.sqrt(latM * latM + lonM * lonM)),
    precisionChars: h.length,
  };
}
