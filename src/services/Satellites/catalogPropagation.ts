/**
 * The whole satellite catalogue placed for a moment (D-GV GV2): SGP4 from CelesTrak's elements (OMM), each object's
 * position in the globe's scene frame, as latLngToGlobeWorld places it, at its true height.
 *
 * The globe drew 100 satellites, chosen once and moved on the page's thread. satellite.js propagates an object in
 * about 0.72 µs on an M2 (measured, 2026-10-23): the whole active catalogue, about 12,000, is some 9 ms, and perhaps
 * five times that on a weak laptop. So it runs in a worker once a second, for two moments a second apart, and the
 * GPU blends between them each frame (screenPoints.ts, `blend`).
 */
import { json2satrec, propagate, gstime, eciToGeodetic, type SatRec } from 'satellite.js';

/** 100 scene units to an Earth radius, as the globe draws it (globe-engine/SpaceWeatherGeometry.ts). */
export const GLOBE_RADIUS_UNITS = 100;
export const EARTH_RADIUS_KM = 6371;
const DEG = 180 / Math.PI;
/** Lower than this an object has come down; higher than this, as SatelliteDataManager rules, the answer is not believed. */
export const MIN_HEIGHT_KM = 80;
export const MAX_HEIGHT_KM = 50_000;

/** Orbital elements as CelesTrak's JSON gives them: what json2satrec reads. */
export type OmmRecord = Parameters<typeof json2satrec>[0];

/** Each record's SatRec, or null where its elements cannot be read. */
export function satrecsOf(records: readonly OmmRecord[]): Array<SatRec | null> {
  return records.map((record) => {
    try {
      const satrec = json2satrec(record);
      return satrec && !satrec.error ? satrec : null;
    } catch {
      return null;
    }
  });
}

/**
 * Every object at `timeMs`: x, y, z into `out` (three a object) and its height in km into `heights`. One that will
 * not propagate, decayed or unreadable, is put at the Earth's centre, where the planet hides it, at height NaN.
 */
export function propagateCatalog(satrecs: ReadonlyArray<SatRec | null>, timeMs: number, out: Float32Array, heights?: Float32Array): void {
  const date = new Date(timeMs);
  const gmst = gstime(date);
  for (let i = 0; i < satrecs.length; i += 1) {
    const satrec = satrecs[i];
    let placed = false;
    if (satrec) {
      const pv = propagate(satrec, date);
      const p = pv && typeof pv.position === 'object' ? pv.position : null;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
        const geo = eciToGeodetic(p, gmst);
        // Below the atmosphere's edge, or past SatelliteDataManager's 50,000 km: SGP4's answer for an object long
        // decayed, not a place.
        if (geo.height > MIN_HEIGHT_KM && geo.height < MAX_HEIGHT_KM) {
          const lat = geo.latitude;
          const lng = geo.longitude;
          const r = GLOBE_RADIUS_UNITS * (1 + geo.height / EARTH_RADIUS_KM);
          // latLngToGlobeWorld, in the scene's frame, without three.js in the worker.
          out[i * 3] = r * Math.cos(lat) * Math.sin(lng);
          out[i * 3 + 1] = r * Math.sin(lat);
          out[i * 3 + 2] = r * Math.cos(lat) * Math.cos(lng);
          if (heights) heights[i] = geo.height;
          placed = true;
        }
      }
    }
    if (!placed) {
      out[i * 3] = 0; out[i * 3 + 1] = 0; out[i * 3 + 2] = 0;
      if (heights) heights[i] = NaN;
    }
  }
}

/** The latitude and longitude, in degrees, of a placed position: for a hover's words. */
export function latLngOfPlaced(x: number, y: number, z: number): { lat: number; lng: number } {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(y / r) * DEG, lng: Math.atan2(x, z) * DEG };
}
