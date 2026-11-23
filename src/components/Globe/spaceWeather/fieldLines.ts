/**
 * The magnetosphere's field lines (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4): Tsyganenko's T96
 * driven by the measured solar wind, and the Earth's own field, IGRF, traced from footpoints on a grid
 * of magnetic latitude and local time in both hemispheres (services/spaceWeather/geopack).
 *
 * A line from the north that comes down in the south is closed; one that leaves the model's box
 * (60 Re out, 40 Re from the Sun-Earth line, 20 Re sunward) is open, joined to the solar wind. From
 * the south only the open lines are kept: its closed ones are the north's, traced the other way.
 *
 * Traced in GSM for the moment shown, whose dipole tilt and orientation they carry, and drawn in the
 * globe's own frame: geographic, the scene's (x, y, z) being GEO's (y, z, x), 100 units an Earth
 * radius.
 */
import { gsmToGeo, recalc, trace, type Frame, type Vec3 } from '../../../services/spaceWeather/geopack/geopack';
import type { T96Drivers } from '../../../services/spaceWeather/geopack/t96';

/** Scene units an Earth radius: the globe's radius. */
export const RE_UNITS = 100;
/** Where a line starts, Re: just above the ground, so the first step leaves it. */
const SEED_RADIUS = 1.02;
/** How far out a line is followed, Re. */
export const TRACE_LIMIT_RE = 60;

export type Hemisphere = 'north' | 'south';

export interface FieldLineSeed {
  /** GSM, Re. */
  start: Vec3;
  /** 1 runs against the field (out of the north), -1 with it (out of the south). */
  dir: 1 | -1;
  hemisphere: Hemisphere;
  /** Magnetic latitude, degrees, and magnetic local time, hours (12 toward the Sun, 18 dusk). */
  lat: number;
  mlt: number;
}

/** Footpoints at each magnetic latitude and local time, both hemispheres: solar-magnetic, turned into GSM by the dipole's tilt. */
export function fieldLineSeeds(frame: Frame, latitudes: readonly number[], mlts: readonly number[]): FieldLineSeed[] {
  const seeds: FieldLineSeed[] = [];
  for (const hemisphere of ['north', 'south'] as const) {
    for (const lat of latitudes) {
      for (const mlt of mlts) {
        const lam = (lat * Math.PI) / 180;
        const phi = ((mlt - 12) * 15 * Math.PI) / 180;
        const xs = SEED_RADIUS * Math.cos(lam) * Math.cos(phi);
        const ys = SEED_RADIUS * Math.cos(lam) * Math.sin(phi);
        const zs = SEED_RADIUS * Math.sin(lam) * (hemisphere === 'north' ? 1 : -1);
        // geopack's smgsm: SM to GSM, a turn about y by the tilt.
        const start: Vec3 = [xs * frame.cps + zs * frame.sps, ys, zs * frame.cps - xs * frame.sps];
        seeds.push({ start, dir: hemisphere === 'north' ? 1 : -1, hemisphere, lat, mlt });
      }
    }
  }
  return seeds;
}

export interface TracedFieldLine {
  kind: 'closed' | 'open';
  hemisphere: Hemisphere;
  lat: number;
  mlt: number;
  /** GSM, Re, flat. */
  points: number[];
}

export interface FieldLineRequest {
  /** The moment, seconds since 1970 UTC: the dipole's tilt and orientation. */
  ut: number;
  drivers: T96Drivers;
  latitudes: readonly number[];
  mlts: readonly number[];
}

/** Every line from the request's footpoints; closed ones once, from the north. */
export function traceFieldLines(request: FieldLineRequest): TracedFieldLine[] {
  const frame = recalc(request.ut);
  const lines: TracedFieldLine[] = [];
  for (const seed of fieldLineSeeds(frame, request.latitudes, request.mlts)) {
    const line = trace(frame, seed.start, seed.dir, { drivers: request.drivers, rlim: TRACE_LIMIT_RE, r0: 1 });
    if (line.reason === 'stalled') continue;
    const closed = line.reason === 'ground';
    if (closed && seed.hemisphere === 'south') continue;
    lines.push({ kind: closed ? 'closed' : 'open', hemisphere: seed.hemisphere, lat: seed.lat, mlt: seed.mlt, points: line.points });
  }
  return lines;
}

/** A place in GSM, Re, in the scene's frame, units. */
export function gsmToScene(frame: Frame, gsm: readonly number[]): Vec3 {
  const [x, y, z] = gsmToGeo(frame, gsm);
  return [y * RE_UNITS, z * RE_UNITS, x * RE_UNITS];
}

/** A traced line's points in the scene's frame, units. */
export function lineToScene(frame: Frame, points: readonly number[]): Float32Array {
  const out = new Float32Array(points.length);
  for (let k = 0; k < points.length; k += 3) {
    const [sx, sy, sz] = gsmToScene(frame, [points[k], points[k + 1], points[k + 2]]);
    out[k] = sx;
    out[k + 1] = sy;
    out[k + 2] = sz;
  }
  return out;
}
