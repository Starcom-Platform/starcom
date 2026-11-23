/**
 * The polar cusps, and reconnection on the day side (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * A cusp is where the day side's closed field lines give way to the polar cap's open ones, near local
 * noon: there the solar wind's particles reach down into the atmosphere, feeding the aurora. Its
 * latitude is found from T96 itself, by bisection at noon between the last closed and the first open
 * line, so it moves with the wind (equatorward when the IMF points south). A small bundle of lines is
 * traced round it, each out to its highest point or 14 Earth radii, whichever comes first (a closed
 * line comes down again in the other hemisphere), and kept in the order a pulse runs down them: from
 * space to the ground.
 *
 * While the IMF points south its field joins the Earth's at the day side's magnetopause, in bursts:
 * flashes drawn there, at T96's own magnetopause nose, more often the stronger the wind's electric
 * field (V·Bs). Their times and places are an illustration, not a measurement, and the same for the
 * same moment, so a still makes the same picture.
 */
import { recalc, trace, type Frame } from '../../../services/spaceWeather/geopack/geopack';
import type { T96Drivers } from '../../../services/spaceWeather/geopack/t96';
import { fieldLineSeeds, type Hemisphere, type TracedFieldLine } from './fieldLines';

/** How far out a cusp's lines are drawn, Re. */
const CUSP_REACH_RE = 14;
/** Where the bisection looks for the cusp, magnetic latitude, degrees, and how finely. */
const SEARCH = { from: 62, to: 88, steps: 9 };
/** The bundle round each cusp: latitudes either side of it, degrees, and local times, hours. */
const BUNDLE = { dLat: [-0.8, 0, 0.8], mlts: [10.5, 11.25, 12, 12.75, 13.5] };

/** Whether the line from a footpoint at this latitude and noon closes in the other hemisphere. */
function closesAt(frame: Frame, drivers: T96Drivers, hemisphere: Hemisphere, lat: number): boolean {
  const [seed] = fieldLineSeeds(frame, [lat], [12]).filter((s) => s.hemisphere === hemisphere);
  return trace(frame, seed.start, seed.dir, { drivers, rlim: 60, r0: 1 }).reason === 'ground';
}

/** The cusp's magnetic latitude, degrees (positive north, negative south): between the last closed and the first open line at noon. */
export function cuspLatitude(frame: Frame, drivers: T96Drivers, hemisphere: Hemisphere): number {
  let closed = SEARCH.from, open = SEARCH.to;
  for (let k = 0; k < SEARCH.steps; k++) {
    const mid = (closed + open) / 2;
    if (closesAt(frame, drivers, hemisphere, mid)) closed = mid;
    else open = mid;
  }
  const lat = (closed + open) / 2;
  return hemisphere === 'north' ? lat : -lat;
}

export interface CuspRequest { ut: number; drivers: T96Drivers }
export interface Cusps {
  /** Each cusp's magnetic latitude, degrees. */
  latitude: { north: number; south: number };
  /** The bundle round each, GSM, Re, each from space down to the ground. */
  lines: TracedFieldLine[];
}

/** Both cusps, and their bundles of lines. */
export function traceCusps(request: CuspRequest): Cusps {
  const frame = recalc(request.ut);
  const latitude = { north: 0, south: 0 };
  const lines: TracedFieldLine[] = [];
  for (const hemisphere of ['north', 'south'] as const) {
    const at = Math.abs(cuspLatitude(frame, request.drivers, hemisphere));
    latitude[hemisphere] = hemisphere === 'north' ? at : -at;
    const seeds = fieldLineSeeds(frame, BUNDLE.dLat.map((d) => at + d), BUNDLE.mlts).filter((s) => s.hemisphere === hemisphere);
    for (const seed of seeds) {
      const line = trace(frame, seed.start, seed.dir, { drivers: request.drivers, rlim: 60, r0: 1 });
      // Out to its highest point or the reach, then turned round: a pulse runs down from space to the ground.
      const kept: number[] = [];
      let highest = 0;
      for (let k = 0; k < line.points.length; k += 3) {
        const [x, y, z] = [line.points[k], line.points[k + 1], line.points[k + 2]];
        const r = Math.hypot(x, y, z);
        if (r > CUSP_REACH_RE || r < highest) break;
        highest = r;
        kept.push(x, y, z);
      }
      const down: number[] = [];
      for (let k = kept.length - 3; k >= 0; k -= 3) down.push(kept[k], kept[k + 1], kept[k + 2]);
      if (down.length >= 6) lines.push({ kind: 'open', hemisphere, lat: seed.lat, mlt: seed.mlt, points: down });
    }
  }
  return { latitude, lines };
}

/** T96's magnetopause nose, Re sunward along the Sun-Earth line, for a pressure, nPa: where its boundary coordinate is 1.08. */
export function magnetopauseNoseRe(pdyn: number): number {
  const xappa = (pdyn / 2) ** 0.14;
  return 5.48 / xappa + 0.08 * (70 / xappa);
}

/** The solar wind's dawn-dusk electric field while the IMF points south, mV/m: V·Bs. */
export const vbsOf = (speedKmS: number, bzNt: number): number => speedKmS * Math.max(-bzNt, 0) * 1e-3;

/** Seconds between bursts of reconnection for a V·Bs, mV/m: none at 0; every 6 s at 2 mV/m, faster with it, never more often than 0.8 s. */
export function flashInterval(vbs: number): number | null {
  if (vbs <= 0.05) return null;
  return Math.min(Math.max(12 / vbs, 0.8), 30);
}

const hash = (n: number) => {
  const v = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return v - Math.floor(v);
};

export interface Flash {
  /** 0 to 1, rising and falling over the burst. */
  strength: number;
  /** Where on the magnetopause, GSM, Re, about the nose. */
  y: number;
  z: number;
}

/** How long a burst lasts, seconds. */
export const FLASH_SECONDS = 0.7;

/** The bursts lit at `seconds`, for a V·Bs: the same for the same moment. */
export function flashesAt(seconds: number, vbs: number): Flash[] {
  const interval = flashInterval(vbs);
  if (interval === null) return [];
  const out: Flash[] = [];
  const slot = Math.floor(seconds / interval);
  for (const k of [slot - 1, slot]) {
    const start = k * interval + hash(k) * 0.3 * interval;
    const t = (seconds - start) / FLASH_SECONDS;
    if (t < 0 || t > 1) continue;
    out.push({ strength: Math.sin(Math.PI * t), y: (hash(k + 0.5) - 0.5) * 8, z: (hash(k + 0.25) - 0.5) * 6 });
  }
  return out;
}
