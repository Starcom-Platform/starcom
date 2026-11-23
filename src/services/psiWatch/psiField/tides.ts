/**
 * The ψ field's sky term F (decision D-PW, PW78): the Moon's and the Sun's degree-2 tidal potential over the grid at a
 * moment, GM·R²/d³·(3cos²γ − 1)/2 from each body's sub-point (γ the angle from it), summed, then divided by its
 * largest magnitude at that moment: 1 under a body at new or full moon, −½ on the great circle between, and down to
 * −1 near a quarter moon when the Moon is far and the Sun near. Sub-points from Astronomy Engine: the geocentric
 * apparent vector, turned into the equator of date, its longitude less Greenwich apparent sidereal time.
 */
import * as Astronomy from 'astronomy-engine';
import { EARTH_KM, gridUnits, PSI_CELLS, unit } from './grid';

const AU_KM = 149597870.7;
const GM: Record<'Moon' | 'Sun', number> = { Moon: 4902.800066, Sun: 132712440041.94 };
const DEG = 180 / Math.PI;

export interface SubPoint { lat: number; lon: number; distanceKm: number }

/** Where the body stands overhead at a moment, and how far it is. */
export function subPoint(body: 'Moon' | 'Sun', when: Date): SubPoint {
  const time = Astronomy.MakeTime(when);
  const w = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), Astronomy.GeoVector(body as Astronomy.Body, time, true));
  const r = Math.hypot(w.x, w.y, w.z);
  const lon = Math.atan2(w.y, w.x) * DEG - Astronomy.SiderealTime(time) * 15;
  return { lat: Math.asin(w.z / r) * DEG, lon: ((((lon + 540) % 360) + 360) % 360) - 180, distanceKm: r * AU_KM };
}

/** F over the grid at a moment, with the two sub-points. */
export function tidalTerm(when: Date): { F: Float64Array; moon: SubPoint; sun: SubPoint } {
  const g = gridUnits();
  const W = new Float64Array(PSI_CELLS);
  const moon = subPoint('Moon', when);
  const sun = subPoint('Sun', when);
  for (const [body, p] of [['Moon', moon], ['Sun', sun]] as const) {
    const [ux, uy, uz] = unit(p.lat, p.lon);
    const k = (GM[body] * EARTH_KM ** 2) / p.distanceKm ** 3;
    for (let i = 0; i < PSI_CELLS; i++) {
      const c = g[i * 3] * ux + g[i * 3 + 1] * uy + g[i * 3 + 2] * uz;
      W[i] += (k * (3 * c * c - 1)) / 2;
    }
  }
  let most = 0;
  for (let i = 0; i < PSI_CELLS; i++) most = Math.max(most, Math.abs(W[i]));
  for (let i = 0; i < PSI_CELLS; i++) W[i] /= most;
  return { F: W, moon, sun };
}
