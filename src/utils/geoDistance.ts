// Small, dependency-free geo math helpers shared by globe-interaction features
// (context-menu distance measurement, location details, etc).

const EARTH_RADIUS_KM = 6371;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in kilometers.
 */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = degToRad(lat2 - lat1);
  const dLng = degToRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Rough UTC offset estimate for a longitude, at 15°/hour (the same convention
 * as nautical/solar time zones). This is NOT a real timezone lookup — it
 * ignores political timezone boundaries and DST — so callers should present
 * it as an estimate, not as "the timezone of this location".
 */
export function estimateUtcOffsetHours(lng: number): number {
  return Math.round(lng / 15);
}
