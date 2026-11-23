/**
 * One satellite's orbit, ground track and footprint, for the one a person chose (D-GV GV2: "on click, the orbit, a
 * ground track one orbit either way, and the footprint").
 *
 * - The orbit: one period around now, each point where the satellite will be relative to the stars, turned into the
 *   Earth's frame as it stands now, so it reads as the ring the satellite flies on.
 * - The ground track: the point beneath it from one orbit before to one after, the Earth turning under it.
 * - The footprint: the ground that sees it above the horizon, a circle round the point beneath it of angular radius
 *   acos(R / (R + h)): about 20.5° for the ISS at 420 km.
 */
import { propagate, gstime, eciToGeodetic, type SatRec } from 'satellite.js';
import { EARTH_RADIUS_KM, GLOBE_RADIUS_UNITS } from './catalogPropagation';

export type LngLat = [number, number];

export interface SatelliteTrack {
  /** x, y, z per point in the globe's scene frame, at the satellite's height, closed. */
  orbit: number[];
  /** [lng, lat] beneath it, from one orbit before to one after. */
  groundTrack: LngLat[];
  /** [lng, lat] round the edge of what sees it, closed. */
  footprint: LngLat[];
  /** Where it is now. */
  now: { lat: number; lng: number; heightKm: number };
  /** Its period, in minutes, and the footprint's angular radius, in degrees. */
  periodMin: number;
  footprintDeg: number;
}

const DEG = 180 / Math.PI;
const ORBIT_STEPS = 180;
const TRACK_STEPS_PER_ORBIT = 360;
const FOOTPRINT_STEPS = 96;

/** Its period in minutes, from SGP4's mean motion (radians a minute). */
export function periodMinutes(satrec: SatRec): number {
  return (2 * Math.PI) / satrec.no;
}

const geodeticAt = (satrec: SatRec, at: Date, gmst: number) => {
  const pv = propagate(satrec, at);
  const p = pv && typeof pv.position === 'object' ? pv.position : null;
  return p ? eciToGeodetic(p, gmst) : null;
};

/** A point `distDeg` from (lat, lng) on the bearing `bearingDeg`, on a sphere. */
function destination(lat: number, lng: number, distDeg: number, bearingDeg: number): LngLat {
  const φ1 = lat / DEG, λ1 = lng / DEG, δ = distDeg / DEG, θ = bearingDeg / DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((λ2 * DEG + 540) % 360) - 180, φ2 * DEG];
}

/** The chosen satellite's orbit, ground track and footprint at `nowMs`, or null when it does not propagate. */
export function satelliteTrack(satrec: SatRec, nowMs: number): SatelliteTrack | null {
  const nowDate = new Date(nowMs);
  const gmstNow = gstime(nowDate);
  const here = geodeticAt(satrec, nowDate, gmstNow);
  if (!here || !Number.isFinite(here.height) || here.height <= 0) return null;
  const periodMin = periodMinutes(satrec);
  if (!Number.isFinite(periodMin) || periodMin <= 0) return null;

  const orbit: number[] = [];
  for (let i = 0; i <= ORBIT_STEPS; i += 1) {
    const at = new Date(nowMs + ((i / ORBIT_STEPS) - 0.5) * periodMin * 60_000);
    // Turned by the Earth's angle NOW, not at each moment: the ring in space, not the ground under it.
    const g = geodeticAt(satrec, at, gmstNow);
    if (!g) continue;
    const r = GLOBE_RADIUS_UNITS * (1 + g.height / EARTH_RADIUS_KM);
    orbit.push(r * Math.cos(g.latitude) * Math.sin(g.longitude), r * Math.sin(g.latitude), r * Math.cos(g.latitude) * Math.cos(g.longitude));
  }

  const groundTrack: LngLat[] = [];
  const steps = TRACK_STEPS_PER_ORBIT * 2;
  for (let i = 0; i <= steps; i += 1) {
    const at = new Date(nowMs + ((i / steps) * 2 - 1) * periodMin * 60_000);
    const g = geodeticAt(satrec, at, gstime(at));
    if (g) groundTrack.push([g.longitude * DEG, g.latitude * DEG]);
  }

  const footprintDeg = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + here.height)) * DEG;
  const lat = here.latitude * DEG;
  const lng = here.longitude * DEG;
  const footprint: LngLat[] = Array.from({ length: FOOTPRINT_STEPS + 1 }, (_, i) => destination(lat, lng, footprintDeg, (360 * i) / FOOTPRINT_STEPS));

  return { orbit, groundTrack, footprint, now: { lat, lng, heightKm: here.height }, periodMin, footprintDeg };
}
