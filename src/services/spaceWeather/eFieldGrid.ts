/**
 * The geoelectric field as one grid (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW1).
 *
 * NOAA SWPC serves two models of the field at the ground, a file a minute, both on
 * one regular 0.5° grid: InterMag EarthScope, from 3-D magnetotelluric transfer
 * functions (EMTF), over the contiguous US; and US-Canada 1D, from 1-D conductivity
 * profiles, wider. Every sample is kept: the 3D model's value where it has one, the
 * 1D model's elsewhere. A cell neither holds is empty, never zero, so the field is
 * not drawn where nobody measured it.
 *
 * The components as NOAA's own files name them: "Ex (north component E-field)" and
 * "Ey (east component E-field)", in mV/km (the netCDF archive's attributes, read
 * 2026-10-10).
 */
import type { ProcessedElectricFieldData } from '../../types/data/spaceWeather';

export const E_FIELD_STEP_DEG = 0.5;

/** Which of NOAA's two models the field is drawn from (SW2). */
export type EFieldGrids = 'both' | 'interMag' | 'usCanada';
export type EFieldModel = ProcessedElectricFieldData['source'];

export interface EFieldGrid {
  /** The south-west cell's centre; column i is longitude lon0 + i·step, row j latitude lat0 + j·step. */
  lon0: number;
  lat0: number;
  step: number;
  cols: number;
  rows: number;
  /** mV/km, by row then column; NaN where no model holds the cell. */
  east: Float32Array;
  north: Float32Array;
  /** The model each cell came from: 0 none, 1 US-Canada 1D, 2 InterMag EarthScope. */
  model: Uint8Array;
  count: number;
  fromInterMag: number;
  fromUsCanada: number;
  maxMagnitude: number;
  /** When the newest file drawn was made, as NOAA stamped it. */
  timestamp: string | null;
}

const MODEL_CODE: Record<EFieldModel, number> = { 'US-Canada-1D': 1, InterMagEarthScope: 2 };
const MODEL_OF: Record<number, EFieldModel> = { 1: 'US-Canada-1D', 2: 'InterMagEarthScope' };

const snap = (deg: number) => Math.round(deg / E_FIELD_STEP_DEG) * E_FIELD_STEP_DEG;
const usable = (v: { ex: number; ey: number; longitude: number; latitude: number }) =>
  [v.ex, v.ey, v.longitude, v.latitude].every((n) => Number.isFinite(n));

/** One grid of the models asked for, or null when they hold no sample. */
export function eFieldGrid(
  sets: { interMag: ProcessedElectricFieldData | null; usCanada: ProcessedElectricFieldData | null },
  grids: EFieldGrids = 'both',
): EFieldGrid | null {
  // The 1D model first, so the 3D model's value takes the cell where both have one.
  const drawn = [grids !== 'interMag' ? sets.usCanada : null, grids !== 'usCanada' ? sets.interMag : null]
    .filter((s): s is ProcessedElectricFieldData => s !== null);
  const samples = drawn.flatMap((s) => s.vectors.filter(usable).map((v) => ({ v, code: MODEL_CODE[s.source] })));
  if (!samples.length) return null;

  const lons = samples.map(({ v }) => snap(v.longitude));
  const lats = samples.map(({ v }) => snap(v.latitude));
  const lon0 = Math.min(...lons), lat0 = Math.min(...lats);
  const cols = Math.round((Math.max(...lons) - lon0) / E_FIELD_STEP_DEG) + 1;
  const rows = Math.round((Math.max(...lats) - lat0) / E_FIELD_STEP_DEG) + 1;
  const east = new Float32Array(cols * rows).fill(Number.NaN);
  const north = new Float32Array(cols * rows).fill(Number.NaN);
  const model = new Uint8Array(cols * rows);
  samples.forEach(({ v, code }, k) => {
    const cell = Math.round((lats[k] - lat0) / E_FIELD_STEP_DEG) * cols + Math.round((lons[k] - lon0) / E_FIELD_STEP_DEG);
    north[cell] = v.ex;
    east[cell] = v.ey;
    model[cell] = code;
  });

  let count = 0, fromInterMag = 0, fromUsCanada = 0, maxMagnitude = 0;
  for (let c = 0; c < model.length; c++) {
    if (!model[c]) continue;
    count += 1;
    if (model[c] === 2) fromInterMag += 1; else fromUsCanada += 1;
    maxMagnitude = Math.max(maxMagnitude, Math.hypot(east[c], north[c]));
  }
  const stamps = drawn.map((s) => s.timestamp).filter(Boolean).sort();
  return {
    lon0, lat0, step: E_FIELD_STEP_DEG, cols, rows, east, north, model,
    count, fromInterMag, fromUsCanada, maxMagnitude, timestamp: stamps.length ? stamps[stamps.length - 1] : null,
  };
}

/** The field at a place: its cell's, within half a step of the cell's centre, or null where no model holds it. */
export function eFieldAt(grid: EFieldGrid, lat: number, lon: number): { north: number; east: number; magnitude: number; model: EFieldModel } | null {
  const i = Math.round((lon - grid.lon0) / grid.step);
  const j = Math.round((lat - grid.lat0) / grid.step);
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return null;
  const c = j * grid.cols + i;
  if (!grid.model[c]) return null;
  return { north: grid.north[c], east: grid.east[c], magnitude: Math.hypot(grid.east[c], grid.north[c]), model: MODEL_OF[grid.model[c]] };
}
