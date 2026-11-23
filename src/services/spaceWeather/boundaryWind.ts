/**
 * The solar wind at the bow shock for the moment shown, which the magnetopause and the bow shock stand off from
 * (record docs/missions/01-architecture-decisions/space-weather-visualization.md, SW30; the owner's pick,
 * 2026-10-25: they follow the moment, as every layer does, D-E).
 *
 * - Within NOAA's 7 days of propagated wind (heliosphere.ts): the minutes that reached the bow shock in the ten
 *   minutes up to the last one at or before the moment, averaged. Measured.
 * - Past the last of them, a moment ahead: the last ten minutes measured; and, once CCMC's ENLIL has a CME reach
 *   the Earth by then, its sheath pushing the magnetopause in, modelled: the wind at the CME's drag-based speed at
 *   the Earth and four times as dense (a strong shock's compression; twice for a glancing blow), easing back to the
 *   wind measured, gone a day and a half after it arrived. A CME that arrived within the measurements is in them.
 * - Before the first of them: the earliest measured, said so.
 */
import { dbmSpeed, DBM, type Cme } from './donki';
import type { WindMinute } from './heliosphere';
import type { SolarWindSnapshot } from '../SpaceWeatherModeling';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** The minutes averaged: ten up to the one taken. */
const AVERAGED_MS = 10 * MINUTE_MS;
/** The sheath's compression, a strong shock's; and a glancing blow's. */
const COMPRESSION = 4;
const GLANCING_COMPRESSION = 2;
/** How fast the sheath's density and speed ease back to the wind measured; and when it is gone. */
const DENSITY_EASES_MS = 10 * HOUR_MS;
const SPEED_EASES_MS = 30 * HOUR_MS;
export const PUSH_LASTS_MS = 36 * HOUR_MS;

export type BoundaryWindKind = 'measured' | 'last-measured' | 'earliest-measured';

/** The CME whose sheath pushes the magnetopause in at a moment ahead, as modelled. */
export interface BoundaryPush {
  cmeId: string;
  /** CCMC's arrival at the Earth, ms; and whether it is a glancing blow. */
  arrivedAt: number;
  glancing: boolean;
  /** The CME's speed at the Earth by the drag-based model, km/s; the sheath's compression at its arrival. */
  speed: number;
  compression: number;
}

export interface BoundaryWind {
  /** The wind the boundaries stand off from: as measured, or with a CME's sheath modelled. */
  snapshot: SolarWindSnapshot;
  kind: BoundaryWindKind;
  /** When the last of the minutes taken reached the bow shock, ms. */
  measuredAt: number;
  pushedBy: BoundaryPush | null;
}

/** The ten minutes up to the last at or before `upTo`, averaged: their speed, density and Bz. */
function averaged(minutes: readonly WindMinute[], index: number): { speed: number; density: number; bz: number; at: number } {
  const at = minutes[index].arrive;
  let k = index;
  while (k > 0 && minutes[k - 1].arrive > at - AVERAGED_MS) k -= 1;
  const taken = minutes.slice(k, index + 1);
  const mean = (f: (m: WindMinute) => number) => taken.reduce((s, m) => s + f(m), 0) / taken.length;
  return { speed: mean((m) => m.speed), density: mean((m) => m.density), bz: mean((m) => m.bz), at };
}

/** The sheath pushing hardest at a moment ahead: of the CMEs CCMC has reaching the Earth after the measurements and by then. */
function pushAt(cmes: readonly Cme[], after: number, moment: number, wind: { speed: number; density: number }): { push: BoundaryPush; speed: number; density: number } | null {
  let best: { push: BoundaryPush; speed: number; density: number; pressure: number } | null = null;
  for (const cme of cmes) {
    const e = cme.earth;
    if (e.kind !== 'arrives' || e.at <= after || e.at > moment || moment - e.at > PUSH_LASTS_MS) continue;
    const since = moment - e.at;
    const atEarth = dbmSpeed(cme.speed, ((e.at - cme.leftAt) / 1000) * (cme.timeScale ?? 1), cme.wind ?? DBM.wind);
    const compression = e.glancing ? GLANCING_COMPRESSION : COMPRESSION;
    const speed = wind.speed + Math.max(atEarth - wind.speed, 0) * Math.exp(-since / SPEED_EASES_MS);
    const density = wind.density * (1 + (compression - 1) * Math.exp(-since / DENSITY_EASES_MS));
    const pressure = density * speed * speed;
    if (!best || pressure > best.pressure) {
      best = { push: { cmeId: cme.id, arrivedAt: e.at, glancing: e.glancing, speed: atEarth, compression }, speed, density, pressure };
    }
  }
  return best && { push: best.push, speed: best.speed, density: best.density };
}

/** The wind at the bow shock for a moment, from the 7 days measured (oldest first) and the CMEs read; null with none measured. */
export function boundaryWindAt(minutes: readonly WindMinute[], moment: number, cmes: readonly Cme[] = []): BoundaryWind | null {
  if (!minutes.length) return null;
  const last = minutes.length - 1;
  if (moment < minutes[0].arrive) {
    const w = averaged(minutes, 0);
    return { snapshot: { speedKmPerSec: w.speed, densityPerCm3: w.density, bz: w.bz, timestamp: new Date(w.at).toISOString() }, kind: 'earliest-measured', measuredAt: w.at, pushedBy: null };
  }
  if (moment <= minutes[last].arrive) {
    // The last minute at or before the moment.
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (minutes[mid].arrive <= moment) lo = mid;
      else hi = mid - 1;
    }
    const w = averaged(minutes, lo);
    return { snapshot: { speedKmPerSec: w.speed, densityPerCm3: w.density, bz: w.bz, timestamp: new Date(w.at).toISOString() }, kind: 'measured', measuredAt: w.at, pushedBy: null };
  }
  const w = averaged(minutes, last);
  const pushed = pushAt(cmes, w.at, moment, w);
  return {
    snapshot: {
      speedKmPerSec: pushed?.speed ?? w.speed,
      densityPerCm3: pushed?.density ?? w.density,
      bz: w.bz,
      timestamp: new Date(pushed ? moment : w.at).toISOString(),
    },
    kind: 'last-measured',
    measuredAt: w.at,
    pushedBy: pushed?.push ?? null,
  };
}
