/**
 * The magnetotail's current sheet (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * Down the night side the field points earthward in the northern lobe and tailward in the southern;
 * between them a sheet of current flows across the tail, dawn to dusk. Its place is where T96's Bx
 * turns from one to the other, found here on a grid of the tail (x from -8 to -50 Re, y across
 * +/-16 Re) by bisecting in z for Bx = 0, inside T96's own magnetopause. The sheet bends with the
 * dipole's tilt and warps toward the flanks, as T96 has it. How strong the field is a little above
 * and below it (the jump it makes across the sheet) says how much current the sheet carries there.
 */
import { recalc, dipole } from '../../../services/spaceWeather/geopack/geopack';
import { t96, type T96Drivers } from '../../../services/spaceWeather/geopack/t96';

/** The grid down the tail, Re, GSM. */
export const SHEET_GRID = { x: { from: -8, to: -50, step: 2 }, y: { from: -16, to: 16, step: 2 } };
/** How far either side of the sheet its field is looked for, Re, and the range it is looked for in. */
const LOBE_RE = 2.5;
const Z_RANGE = 14;
const BISECTIONS = 18;

export interface SheetRequest {
  ut: number;
  drivers: T96Drivers;
  /** The dipole's tilt, radians, in place of the moment's own: for a test. */
  psi?: number;
}
export interface TailSheet {
  /** Columns down the tail and rows across it, GSM, Re. */
  xs: number[];
  ys: number[];
  /** The sheet's z at each cell, row by row (y), Re; NaN where there is none inside the magnetopause. */
  z: Float32Array;
  /** The field's strength a little either side of it, nT: the current it carries there. */
  lobe: Float32Array;
}

/** T96's own magnetopause: inside where its boundary coordinate is under 1.08 (t96.ts's sigma, s0). */
export function insideMagnetopause(pdyn: number, x: number, y: number, z: number): boolean {
  const xappa = (pdyn / 2) ** 0.14;
  const x0 = 5.48 / xappa, am = 70 / xappa;
  const rho2 = y * y + z * z;
  const xmxm = Math.max(am + x - x0, 0);
  const asq = am * am, axx0 = xmxm * xmxm, aro = asq + rho2;
  const sigma = Math.sqrt((aro + axx0 + Math.sqrt((aro + axx0) ** 2 - 4 * asq * axx0)) / (2 * asq));
  return sigma < 1.08;
}

/** Where Bx turns from tailward (below) to earthward (above) in z, Re, by bisection; none if it does not turn there. */
export function findSheetZ(bxAt: (z: number) => number): number | null {
  let lo = -Z_RANGE, hi = Z_RANGE;
  // The northern lobe's field is earthward (+x), the southern's tailward: no turn, no sheet here.
  if (!(bxAt(hi) > 0 && bxAt(lo) < 0)) return null;
  for (let k = 0; k < BISECTIONS; k++) {
    const mid = (lo + hi) / 2;
    if (bxAt(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const range = ({ from, to, step }: { from: number; to: number; step: number }) => {
  const out: number[] = [];
  for (let v = from; from < to ? v <= to : v >= to; v += from < to ? step : -step) out.push(v);
  return out;
};

/** The sheet on the grid, for a moment and the wind's drivers. */
export function traceTailSheet(request: SheetRequest): TailSheet {
  const moment = recalc(request.ut);
  const frame = request.psi === undefined ? moment : { ...moment, psi: request.psi, sps: Math.sin(request.psi), cps: Math.cos(request.psi) };
  const bx = (x: number, y: number, z: number) => t96(request.drivers, frame.psi, x, y, z)[0] + dipole(frame, x, y, z)[0];
  const bAt = (x: number, y: number, z: number) => {
    const [ex, ey, ez] = t96(request.drivers, frame.psi, x, y, z);
    const [ix, iy, iz] = dipole(frame, x, y, z);
    return Math.hypot(ex + ix, ey + iy, ez + iz);
  };
  const xs = range(SHEET_GRID.x), ys = range(SHEET_GRID.y);
  const z = new Float32Array(xs.length * ys.length).fill(NaN);
  const lobe = new Float32Array(xs.length * ys.length);
  ys.forEach((y, j) => xs.forEach((x, i) => {
    const at = findSheetZ((z) => bx(x, y, z));
    if (at === null || !insideMagnetopause(request.drivers.pdyn, x, y, at)) return;
    z[j * xs.length + i] = at;
    lobe[j * xs.length + i] = (bAt(x, y, at + LOBE_RE) + bAt(x, y, at - LOBE_RE)) / 2;
  }));
  return { xs, ys, z, lobe };
}
