/**
 * Earth's magnetic shield as Psi Watch draws it (decision D-PW, PW7, PW58), for one year: the main field's strength
 * on a 2° grid, its isolines every 5,000 nT, the South Atlantic Anomaly as the field under 30,000 nT, the dip equator
 * where the field lies flat; and both dip poles' tracks from 1900 to 2030, a point a year.
 * IGRF-14 (`igrfField.ts`); the aurora stays Space Weather's own.
 */
import { coefficientsAt, fieldAt, strengthAndDip, type IgrfCoefficients } from './igrfField';
import { isolines, type LatLonGrid, type Segment } from './isolines';

export const GRID_STEP = 2;
/** The field's isolines, nT. */
export const STRENGTH_LEVELS = [25_000, 35_000, 40_000, 45_000, 50_000, 55_000, 60_000, 65_000];
/** The South Atlantic Anomaly's outline: where the field is under this, nT. */
export const ANOMALY_NT = 30_000;

export type PoleTrack = Array<[year: number, lat: number, lon: number]>;

export interface ShieldData extends IgrfCoefficients {
  poles: { north: PoleTrack; south: PoleTrack };
}

export interface Shield {
  year: number;
  strength: Array<{ level: number; segments: Segment[] }>;
  anomaly: Segment[];
  dipEquator: Segment[];
  /** The weakest field on the grid, and where. */
  weakest: { lat: number; lon: number; total: number };
  tracks: { north: PoleTrack; south: PoleTrack };
}

/** The field's strength and dip on the grid, rows south to north from 88°S, columns west to east from 180°W. */
export function shieldGrids(c: ReturnType<typeof coefficientsAt>, step = GRID_STEP): { total: LatLonGrid; dip: LatLonGrid } {
  const lat0 = -90 + step;
  const rows = Math.round((180 - 2 * step) / step) + 1;
  const cols = Math.round(360 / step);
  const total = new Float64Array(rows * cols);
  const dip = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const sd = strengthAndDip(fieldAt(c, lat0 + r * step, -180 + col * step));
      total[r * cols + col] = sd.total;
      dip[r * cols + col] = sd.dip;
    }
  }
  const grid = (values: Float64Array): LatLonGrid => ({ values, rows, cols, lat0, lon0: -180, step });
  return { total: grid(total), dip: grid(dip) };
}

/** A pole at a year, between the track's yearly points. */
export function poleAt(track: PoleTrack, year: number): { lat: number; lon: number } {
  const first = track[0];
  const last = track[track.length - 1];
  if (year <= first[0]) return { lat: first[1], lon: first[2] };
  if (year >= last[0]) return { lat: last[1], lon: last[2] };
  const i = Math.min(track.length - 2, Math.floor(year - first[0]));
  const [y0, la0, lo0] = track[i];
  const [, la1, lo1] = track[i + 1];
  const t = year - y0;
  // Across the antimeridian, the shorter way.
  const dLon = ((lo1 - lo0 + 540) % 360) - 180;
  return { lat: la0 + (la1 - la0) * t, lon: ((lo0 + dLon * t + 540) % 360) - 180 };
}

/** How far a pole moves in the year from `year`, km along the surface: the track's yearly step there. */
export function poleSpeedKm(track: PoleTrack, year: number): number {
  const i = Math.max(0, Math.min(track.length - 2, Math.floor(year - track[0][0])));
  const [, la0, lo0] = track[i];
  const [, la1, lo1] = track[i + 1];
  const r = Math.PI / 180;
  const cos = Math.sin(la0 * r) * Math.sin(la1 * r) + Math.cos(la0 * r) * Math.cos(la1 * r) * Math.cos((lo1 - lo0) * r);
  return 6371.2 * Math.acos(Math.min(1, cos));
}

/** The weakest field near a grid point, found to a few hundredths of a degree by halving steps across and along. */
function weakestNear(c: ReturnType<typeof coefficientsAt>, from: { lat: number; lon: number; total: number }): { lat: number; lon: number; total: number } {
  let best = from;
  const totalAt = (lat: number, lon: number) => strengthAndDip(fieldAt(c, lat, lon)).total;
  for (let step = GRID_STEP / 2; step >= 0.02; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dLat, dLon] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const lat = best.lat + dLat;
        const lon = best.lon + dLon;
        const total = totalAt(lat, lon);
        if (total < best.total) { best = { lat, lon, total }; moved = true; }
      }
    }
  }
  return best;
}

export function shieldAt(data: ShieldData, year: number): Shield {
  const c = coefficientsAt(data, year);
  const { total, dip } = shieldGrids(c);
  let weakest = { lat: 0, lon: 0, total: Infinity };
  total.values.forEach((v, i) => {
    if (v < weakest.total) weakest = { lat: total.lat0 + Math.floor(i / total.cols) * total.step, lon: total.lon0 + (i % total.cols) * total.step, total: v };
  });
  weakest = weakestNear(c, weakest);
  return {
    year,
    strength: STRENGTH_LEVELS.map((level) => ({ level, segments: isolines(total, level) })),
    anomaly: isolines(total, ANOMALY_NT),
    dipEquator: isolines(dip, 0),
    weakest: { ...weakest, total: Math.round(weakest.total) },
    tracks: data.poles,
  };
}

/** A moment's decimal year, UTC. */
export function decimalYear(ms: number): number {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (ms - start) / (end - start);
}
