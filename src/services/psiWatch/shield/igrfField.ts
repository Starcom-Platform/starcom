/**
 * Earth's main field from IGRF-14 (decision D-PW, PW7, PW58): every epoch from 1900 to 2025 and the secular
 * variation to 2030, as NOAA NCEI serves the IAGA's coefficients (public data), baked by `scripts/psi/bake-igrf.ts`.
 * The field at a place and a moment, its strength and dip; and the two dip poles, where it stands vertical, year by
 * year. Spherical harmonics to degree 13 about the reference radius 6371.2 km; places are geodetic, on the WGS84
 * ellipsoid at sea level, as IGRF's own synthesis program and NOAA's pole positions take them.
 */

export interface IgrfCoefficients {
  /** The epochs, years: 1900, 1905, … 2025. */
  epochs: number[];
  /** Each coefficient: 'g' or 'h', degree, order, its value at each epoch (nT), its change a year after the last (nT/yr). */
  terms: Array<['g' | 'h', number, number, number[], number]>;
}

const RAD = Math.PI / 180;
const MAX_N = 13;

/** The Schmidt semi-normalised g and h for a decimal year: linear between epochs, the secular variation past the last. */
export function coefficientsAt(igrf: IgrfCoefficients, year: number): { g: number[][]; h: number[][] } {
  const g = Array.from({ length: MAX_N + 1 }, () => new Array<number>(MAX_N + 1).fill(0));
  const h = Array.from({ length: MAX_N + 1 }, () => new Array<number>(MAX_N + 1).fill(0));
  const last = igrf.epochs.length - 1;
  const y = Math.max(igrf.epochs[0], Math.min(year, igrf.epochs[last] + 5));
  let i = igrf.epochs.findIndex((e, k) => k < last && y >= e && y < igrf.epochs[k + 1]);
  if (i < 0) i = last;
  for (const [gh, n, m, values, sv] of igrf.terms) {
    const value = i === last
      ? values[last] + sv * (y - igrf.epochs[last])
      : values[i] + ((values[i + 1] - values[i]) * (y - igrf.epochs[i])) / (igrf.epochs[i + 1] - igrf.epochs[i]);
    (gh === 'g' ? g : h)[n][m] = value;
  }
  return { g, h };
}

const A = 6371.2;
const EQUATOR_KM = 6378.137;
const POLE_KM = EQUATOR_KM * (1 - 1 / 298.257223563);

/**
 * A geodetic place at a height, as the geocentric radius and colatitude the harmonics take, and the turn between the
 * two frames (IGRF's gg_to_geo).
 */
function geocentric(latDeg: number, heightKm: number): { r: number; theta: number; sd: number; cd: number } {
  const colat = (90 - latDeg) * RAD;
  const ct = Math.cos(colat);
  const st = Math.sin(colat);
  const a2 = EQUATOR_KM ** 2;
  const b2 = POLE_KM ** 2;
  const rho = Math.sqrt(a2 * st * st + b2 * ct * ct);
  const r = Math.sqrt(heightKm * (heightKm + 2 * rho) + (a2 * a2 * st * st + b2 * b2 * ct * ct) / (rho * rho));
  const cd = (heightKm + rho) / r;
  const sd = ((a2 - b2) * ct * st) / (rho * r);
  return { r, theta: Math.acos(Math.max(-1, Math.min(1, ct * cd - st * sd))), sd, cd };
}

/**
 * Schmidt semi-normalised associated Legendre functions P[n][m] of cos θ and their θ-derivatives, to degree `nmax`,
 * by the standard recursion, without the Condon–Shortley phase. Fully normalised (geodesy's 4π) is √(2n+1) times P.
 */
export function schmidtLegendre(ct: number, st: number, nmax = MAX_N): { P: number[][]; dP: number[][] } {
  const P = Array.from({ length: nmax + 1 }, () => new Array<number>(nmax + 1).fill(0));
  const dP = Array.from({ length: nmax + 1 }, () => new Array<number>(nmax + 1).fill(0));
  P[0][0] = 1;
  for (let n = 1; n <= nmax; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * st * P[n - 1][n - 1];
        dP[n][n] = k * (st * dP[n - 1][n - 1] + ct * P[n - 1][n - 1]);
      } else {
        const a = (2 * n - 1) / Math.sqrt(n * n - m * m);
        const b = n - 1 > m ? Math.sqrt(((n - 1) * (n - 1) - m * m) / (n * n - m * m)) : 0;
        P[n][m] = a * ct * P[n - 1][m] - (b ? b * P[n - 2][m] : 0);
        dP[n][m] = a * (ct * dP[n - 1][m] - st * P[n - 1][m]) - (b ? b * dP[n - 2][m] : 0);
      }
    }
  }
  return { P, dP };
}

/**
 * The field at a geodetic place and height (km above the ellipsoid, sea level by default): north (X), east (Y) and
 * down (Z), nT. sin θ guarded at the poles.
 */
export function fieldAt(c: { g: number[][]; h: number[][] }, latDeg: number, lonDeg: number, heightKm = 0): { x: number; y: number; z: number } {
  const { r, theta, sd, cd } = geocentric(latDeg, heightKm);
  const phi = lonDeg * RAD;
  const ct = Math.cos(theta);
  const st = Math.max(1e-9, Math.sin(theta));
  const { P, dP } = schmidtLegendre(ct, st);
  let x = 0;
  let y = 0;
  let z = 0;
  let scale = A / r;
  for (let n = 1; n <= MAX_N; n++) {
    // (a/r)^(n+2), the field falling away with height.
    scale *= A / r;
    for (let m = 0; m <= n; m++) {
      const cos = Math.cos(m * phi);
      const sin = Math.sin(m * phi);
      const gh = c.g[n][m] * cos + c.h[n][m] * sin;
      // X = (1/r)∂V/∂θ, Y = −(1/(r sin θ))∂V/∂φ, Z = ∂V/∂r.
      x += scale * gh * dP[n][m];
      y += scale * m * (c.g[n][m] * sin - c.h[n][m] * cos) * P[n][m];
      z -= scale * (n + 1) * gh * P[n][m];
    }
  }
  // Back from the geocentric frame to the place's own.
  return { x: x * cd + z * sd, y: y / st, z: z * cd - x * sd };
}

/**
 * The radial field Br, nT, outward positive, on a geocentric sphere of radius `rKm` (the core's surface, say), on a
 * latitude–longitude grid: rows south to north from `lat0`, columns west to east from `lon0`, `step` degrees apart.
 * The Legendre functions per row and the longitude terms per column, so a 1° grid is quick.
 */
export function radialGrid(c: { g: number[][]; h: number[][] }, rKm: number, grid: { lat0: number; lon0: number; step: number; rows: number; cols: number }): Float64Array {
  const { lat0, lon0, step, rows, cols } = grid;
  const out = new Float64Array(rows * cols);
  const cosM = new Float64Array(cols * (MAX_N + 1));
  const sinM = new Float64Array(cols * (MAX_N + 1));
  for (let col = 0; col < cols; col++) {
    const phi = (lon0 + col * step) * RAD;
    for (let m = 0; m <= MAX_N; m++) {
      cosM[col * (MAX_N + 1) + m] = Math.cos(m * phi);
      sinM[col * (MAX_N + 1) + m] = Math.sin(m * phi);
    }
  }
  const scale = new Float64Array(MAX_N + 1);
  for (let n = 1; n <= MAX_N; n++) scale[n] = (n + 1) * (A / rKm) ** (n + 2);
  for (let row = 0; row < rows; row++) {
    const theta = (90 - (lat0 + row * step)) * RAD;
    const { P } = schmidtLegendre(Math.cos(theta), Math.sin(theta));
    for (let col = 0; col < cols; col++) {
      let br = 0;
      for (let n = 1; n <= MAX_N; n++) {
        for (let m = 0; m <= n; m++) {
          br += scale[n] * (c.g[n][m] * cosM[col * (MAX_N + 1) + m] + c.h[n][m] * sinM[col * (MAX_N + 1) + m]) * P[n][m];
        }
      }
      out[row * cols + col] = br;
    }
  }
  return out;
}

/** Strength and dip: the total field, nT, and the inclination, degrees, down positive. */
export function strengthAndDip(f: { x: number; y: number; z: number }): { total: number; dip: number } {
  const horizontal = Math.hypot(f.x, f.y);
  return { total: Math.hypot(horizontal, f.z), dip: Math.atan2(f.z, horizontal) / RAD };
}

/**
 * A dip pole near a first guess: where the horizontal field vanishes, found by stepping along it, toward the north
 * pole and away from the south one, as a compass would lead you, until it is under a nanotesla.
 */
export function dipPole(c: { g: number[][]; h: number[][] }, guess: { lat: number; lon: number }, north: boolean): { lat: number; lon: number } {
  let { lat, lon } = guess;
  for (let i = 0; i < 600; i++) {
    const f = fieldAt(c, lat, lon);
    const horizontal = Math.hypot(f.x, f.y);
    if (horizontal < 1) break;
    const sign = north ? 1 : -1;
    const stepDeg = Math.min(2, horizontal / 2000);
    const bearing = Math.atan2(f.y, f.x);
    lat = Math.max(-89.999, Math.min(89.999, lat + sign * stepDeg * Math.cos(bearing)));
    lon = ((lon + (sign * stepDeg * Math.sin(bearing)) / Math.max(0.05, Math.cos(lat * RAD)) + 540) % 360) - 180;
  }
  return { lat, lon };
}

/** IGRF-14's coefficients file, as NOAA NCEI serves it: the epochs from its "g/h n m" header, each term's row. */
export function readCoefficients(text: string): IgrfCoefficients {
  const lines = text.split('\n');
  const head = lines.find((l) => l.startsWith('g/h'));
  if (!head) throw new Error('No "g/h n m" header: is this IGRF-14\'s coefficients file?');
  const epochs = head.trim().split(/\s+/).slice(3, -1).map(Number);
  const terms: IgrfCoefficients['terms'] = [];
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p[0] !== 'g' && p[0] !== 'h') continue;
    const values = p.slice(3, -1).map(Number);
    if (values.length !== epochs.length) throw new Error(`${p[0]}${p[1]},${p[2]} has ${values.length} values for ${epochs.length} epochs`);
    terms.push([p[0], Number(p[1]), Number(p[2]), values, Number(p[p.length - 1])]);
  }
  return { epochs, terms };
}

/** Both dip poles a year from `first` to `last`, each search starting where the year before's stood. */
export function poleTracks(igrf: IgrfCoefficients, first = 1900, last = 2030): { north: Array<[number, number, number]>; south: Array<[number, number, number]> } {
  const north: Array<[number, number, number]> = [];
  const south: Array<[number, number, number]> = [];
  let n = { lat: 70, lon: -96 };
  let s = { lat: -71, lon: 148 };
  const round = (v: number) => Math.round(v * 1000) / 1000;
  for (let year = first; year <= last; year++) {
    const c = coefficientsAt(igrf, year);
    n = dipPole(c, n, true);
    s = dipPole(c, s, false);
    north.push([year, round(n.lat), round(n.lon)]);
    south.push([year, round(s.lat), round(s.lon)]);
  }
  return { north, south };
}
