/**
 * The geoid from EGM96 (decision D-PW, PW78; NASA GSFC and NGA, public domain): its fully normalised coefficients to
 * degree 12, the GRS80 normal field's C20, C40 and C60 taken away, so what is left is the geoid's own relief, metres
 * above or below the ellipsoid, as R·Σ Σ P̄nm(cos θ)(Cnm cos mλ + Snm sin mλ) from degree 2, R 6,378.137 km. Used by
 * the bake (`scripts/psi/bake-psi-base.ts`) for the persistence ridges and valleys.
 */
import { schmidtLegendre } from '../shield/igrfField';

export const GEOID_DEGREE = 12;
const R_M = 6378.137e3;
/** GRS80's normal field, fully normalised: what is taken from EGM96's zonal terms. */
const NORMAL: Record<number, number> = { 2: -4.841667749e-4, 4: 7.903037e-7, 6: -1.687249e-9 };

export interface Geopotential { C: number[][]; S: number[][]; nmax: number }

/** EGM96's coefficients file (degree, order, C, S per row; `#` comments), to `nmax`, the normal field removed. */
export function readEgm96(text: string, nmax = GEOID_DEGREE): Geopotential {
  const C = Array.from({ length: nmax + 1 }, () => new Array<number>(nmax + 1).fill(0));
  const S = Array.from({ length: nmax + 1 }, () => new Array<number>(nmax + 1).fill(0));
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const p = line.trim().split(/\s+/);
    const n = Number(p[0]);
    const m = Number(p[1]);
    if (n > nmax) continue;
    C[n][m] = Number(p[2].replace(/D/i, 'E'));
    S[n][m] = Number(p[3].replace(/D/i, 'E'));
  }
  for (const [n, value] of Object.entries(NORMAL)) if (Number(n) <= nmax) C[Number(n)][0] -= value;
  return { C, S, nmax };
}

/** The geoid's height, metres, at each unit vector (`[x, y, z]` per place). */
export function geoidAt(gp: Geopotential, units: Float64Array): Float64Array {
  const count = units.length / 3;
  const out = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const x = units[k * 3];
    const y = units[k * 3 + 1];
    const z = Math.max(-1, Math.min(1, units[k * 3 + 2]));
    const st = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = Math.atan2(y, x);
    const { P } = schmidtLegendre(z, st, gp.nmax);
    let sum = 0;
    for (let n = 2; n <= gp.nmax; n++) {
      const full = Math.sqrt(2 * n + 1);
      for (let m = 0; m <= n; m++) {
        sum += full * P[n][m] * (gp.C[n][m] * Math.cos(m * phi) + gp.S[n][m] * Math.sin(m * phi));
      }
    }
    out[k] = sum * R_M;
  }
  return out;
}
