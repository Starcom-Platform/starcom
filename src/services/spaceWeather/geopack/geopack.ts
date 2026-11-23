/**
 * geopack's frames, the Earth's own field, and field-line tracing (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4, SW13).
 *
 * Ported by hand from geopack.py (github.com/tsssss/geopack at ab7efdc8; MIT, Copyright (c) 2018
 * Sheng Tian, whose notice t96.ts carries), itself from N. A. Tsyganenko's Fortran GEOPACK, and
 * checked against the values geopack's tests record (__tests__/geopack.test.ts):
 *
 * - `sun` and `recalc`: where the Sun is, and the tilt of the Earth's dipole and the turn between
 *   geographic (GEO) and solar-magnetospheric (GSM) axes for a moment. Kept as a value, `Frame`,
 *   where geopack keeps module state.
 * - `igrfGsm` and `dipole`: the Earth's own field, IGRF-14 (igrf14.ts) or its dipole alone.
 * - `trace`: a field line from a place, through T96 (t96.ts) and the Earth's own field, to the ground
 *   or out of the model. As the Fortran does, and the Python does not: the step size carries from
 *   step to step, and a line reaching the ground ends at it, interpolated, not inside it.
 *
 * Positions are in Earth radii (6371.2 km), fields in nT; GSM's x points at the Sun, z along the
 * dipole's northern axis as seen from it.
 */
import { t96, type T96Drivers } from './t96';
import { IGRF14, IGRF14_EPOCHS } from './igrf14';

export type Vec3 = [number, number, number];

const TWO_PI = 2 * Math.PI;
/** numpy's np.mod for a positive divisor: fmod, moved into [0, b). */
const npMod = (a: number, b: number): number => {
  const m = a % b;
  return m !== 0 && m < 0 ? m + b : m;
};

/** The Sun for a moment, seconds since 1970 UTC: Greenwich mean sidereal time, its ecliptic longitude, right ascension and declination, and the ecliptic's obliquity, radians. */
export function sun(ut: number): { gmst: number; slong: number; srasn: number; sdec: number; obliq: number } {
  const d = ut * (1 / 86400) + 2440587.5 - 2451545.0;
  const e = 0.4090877233749509 - 6.2831853e-9 * d;
  const g = npMod(6.2400582213628066 + 0.017201969994578 * d, TWO_PI);
  const q = npMod(4.8949329668507771 + 0.0172027916955899 * d, TWO_PI);
  const l = q + 0.0334230551756914 * Math.sin(g) + 0.0003490658503989 * Math.sin(2 * g);
  const sdec = Math.asin(Math.sin(e) * Math.sin(l));
  const srasn = npMod(Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)), TWO_PI);
  const gmst = npMod(4.894961212735792 + 6.30038809898489 * d, TWO_PI);
  return { gmst, slong: l, srasn, sdec, obliq: e };
}

/** Coefficients by index n(n+1)/2 + m, degree 0 to 13, as geopack keeps them. */
const NMN = 105;
const indexOf = (n: number, m: number) => (n * (n + 1)) / 2 + m;

/**
 * IGRF's coefficients at each epoch, read as 32-bit numbers as geopack and the Fortran read them,
 * with 2030 made from 2025 and five years of the secular variation, as geopack makes it.
 */
const EPOCHS = (() => {
  const years = [...IGRF14_EPOCHS, IGRF14_EPOCHS[IGRF14_EPOCHS.length - 1] + 5];
  const g = years.map(() => new Float64Array(NMN));
  const h = years.map(() => new Float64Array(NMN));
  for (const [gh, n, m, values, sv] of IGRF14) {
    const into = gh === 'g' ? g : h;
    values.forEach((v, k) => { into[k][indexOf(n, m)] = Math.fround(v); });
    into[values.length][indexOf(n, m)] = Math.fround(values[values.length - 1]) + Math.fround(sv) * 5;
  }
  return { at: years.map((y) => Date.UTC(y, 0, 1) / 1000), g, h };
})();

/** IGRF's g and h for a moment, interpolated between its epochs (and carried on past the ends), as geopack's load_igrf does. */
function igrfAt(ut: number): { g: Float64Array; h: Float64Array } {
  const at = EPOCHS.at;
  let i: number;
  if (ut <= at[0]) i = 0;
  else if (ut >= at[at.length - 1]) i = at.length - 2;
  else { i = 0; while (at[i + 1] <= ut) i++; }
  const f1 = (ut - at[i]) / (at[i + 1] - at[i]);
  const f0 = 1 - f1;
  const g = new Float64Array(NMN), h = new Float64Array(NMN);
  for (let k = 0; k < NMN; k++) {
    g[k] = EPOCHS.g[i][k] * f0 + EPOCHS.g[i + 1][k] * f1;
    h[k] = EPOCHS.h[i][k] * f0 + EPOCHS.h[i + 1][k] * f1;
  }
  return { g, h };
}

/** What geopack's recalc prepares for a moment: the dipole's tilt, IGRF's normalised coefficients, and the GEO-to-GSM rotation. */
export interface Frame {
  ut: number;
  /** The dipole's tilt toward the Sun, radians, and its sine and cosine. */
  psi: number;
  sps: number;
  cps: number;
  g: Float64Array;
  h: Float64Array;
  rec: Float64Array;
  /** a11, a12, a13, a21 … a33: GSM = A · GEO. */
  a: readonly number[];
  /** The dipole's northern axis, a unit vector in GEO (geopack's ezmag). */
  axis: Vec3;
}

/** The frame for a moment, seconds since 1970 UTC (geopack's recalc, in GSM). */
export function recalc(ut: number): Frame {
  const k = 14;
  const rec = new Float64Array(NMN);
  let mn = 0;
  for (let n = 0; n < k; n++) {
    let n2 = 2 * n + 1;
    n2 = n2 * (n2 - 2);
    for (let m = 0; m <= n; m++) rec[mn++] = ((n - m) * (n + m)) / n2;
  }
  const { g, h } = igrfAt(ut);
  // The Schmidt quasi-normalisation, so the Legendre recursion is simple (Davis 2004, eq. 18).
  let s = 1;
  mn = 0;
  for (let n = 1; n < k; n++) {
    mn += 1;
    s *= (2 * n - 1) / n;
    g[mn] *= s;
    h[mn] *= s;
    let p = s;
    for (let m = 1; m <= n; m++) {
      const aa = m === 1 ? 2 : 1;
      p *= Math.sqrt((aa * (n - m + 1)) / (n + m));
      mn += 1;
      g[mn] *= p;
      h[mn] *= p;
    }
  }
  const g10 = -g[1], g11 = -g[2], h11 = -h[2];
  const sq = g11 ** 2 + h11 ** 2;
  const sqq = Math.sqrt(sq);
  const sqr = Math.sqrt(g10 ** 2 + sq);
  const sl0 = h11 / sqq, cl0 = g11 / sqq, st0 = sqq / sqr, ct0 = g10 / sqr;
  const stcl = st0 * cl0, stsl = st0 * sl0;

  const { gmst, srasn, sdec } = sun(ut);
  // In GEI: GSE's x, toward the Sun (its y and z, from the ecliptic's obliquity, GSM does not need).
  const xgse = [Math.cos(srasn) * Math.cos(sdec), Math.sin(srasn) * Math.cos(sdec), Math.sin(sdec)];
  const cgst = Math.cos(gmst), sgst = Math.sin(gmst);
  // The dipole's axis in GEI.
  const zsm = [stcl * cgst - stsl * sgst, stcl * sgst + stsl * cgst, ct0];
  // GSM: x = GSE's x; y = zsm × x, normalised; z = x × y.
  const xgsm = xgse;
  let ygsm = [zsm[1] * xgsm[2] - zsm[2] * xgsm[1], zsm[2] * xgsm[0] - zsm[0] * xgsm[2], zsm[0] * xgsm[1] - zsm[1] * xgsm[0]];
  const y = Math.sqrt(ygsm[0] ** 2 + ygsm[1] ** 2 + ygsm[2] ** 2);
  ygsm = ygsm.map((v) => v / y);
  const zgsm = [xgse[1] * ygsm[2] - xgse[2] * ygsm[1], xgse[2] * ygsm[0] - xgse[0] * ygsm[2], xgse[0] * ygsm[1] - xgse[1] * ygsm[0]];
  const sps = zsm[0] * xgse[0] + zsm[1] * xgse[1] + zsm[2] * xgse[2];
  const cps = Math.sqrt(1 - sps ** 2);
  const psi = Math.asin(sps);
  // GEO's axes in GEI: x (cgst, sgst, 0), y (-sgst, cgst, 0), z (0, 0, 1).
  const a = [
    xgsm[0] * cgst + xgse[1] * sgst, -xgsm[0] * sgst + xgse[1] * cgst, xgsm[2],
    ygsm[0] * cgst + ygsm[1] * sgst, -ygsm[0] * sgst + ygsm[1] * cgst, ygsm[2],
    zgsm[0] * cgst + zgsm[1] * sgst, -zgsm[0] * sgst + zgsm[1] * cgst, zgsm[2],
  ];
  return { ut, psi, sps, cps, g, h, rec, a, axis: [stcl, stsl, ct0] };
}

/** A place or field in GEO, turned into GSM. */
export function geoToGsm(frame: Frame, [x, y, z]: readonly number[]): Vec3 {
  const a = frame.a;
  return [a[0] * x + a[1] * y + a[2] * z, a[3] * x + a[4] * y + a[5] * z, a[6] * x + a[7] * y + a[8] * z];
}

/** A place or field in GSM, turned into GEO. */
export function gsmToGeo(frame: Frame, [x, y, z]: readonly number[]): Vec3 {
  const a = frame.a;
  return [a[0] * x + a[3] * y + a[6] * z, a[1] * x + a[4] * y + a[7] * z, a[2] * x + a[5] * y + a[8] * z];
}

/** IGRF in spherical GEO: r, Re; colatitude and east longitude, radians; returns Br (out), Bθ (south), Bφ (east), nT. */
function igrfGeo(frame: Frame, r: number, theta: number, phi: number): Vec3 {
  const { g, h, rec } = frame;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const smlst = Math.abs(st) < 1e-5;
  // The highest degree worth summing, from how far out the place is.
  const irp3 = Math.trunc(r + 2);
  const nm = Math.min(Math.trunc(3 + 30 / irp3), 13);
  const k = nm + 1;
  const a = new Float64Array(k), b = new Float64Array(k);
  const ar = 1 / r;
  a[0] = ar * ar;
  b[0] = a[0];
  for (let n = 1; n < k; n++) {
    a[n] = a[n - 1] * ar;
    b[n] = a[n] * (n + 1);
  }
  let br = 0, bt = 0, bf = 0;
  let d = 0, p = 1;
  // m = 0
  let p1 = p, d1 = d, p2 = 0, d2 = 0;
  let mn = 0;
  for (let n = 0; n < k; n++) {
    const w = g[mn];
    br += b[n] * w * p1;
    bt -= a[n] * w * d1;
    const xk = rec[mn];
    const d0 = ct * d1 - st * p1 - xk * d2;
    const p0 = ct * p1 - xk * p2;
    d2 = d1; p2 = p1; d1 = d0;
    p1 = p0;
    mn += n + 1;
  }
  d = st * d + ct * p;
  p = st * p;
  let l0 = 0;
  for (let m = 1; m < k; m++) {
    const smf = Math.sin(m * phi), cmf = Math.cos(m * phi);
    p1 = p; d1 = d; p2 = 0; d2 = 0;
    let tbf = 0;
    l0 += m + 1;
    mn = l0;
    for (let n = m; n < k; n++) {
      const w = g[mn] * cmf + h[mn] * smf;
      br += b[n] * w * p1;
      bt -= a[n] * w * d1;
      tbf += a[n] * (g[mn] * smf - h[mn] * cmf) * (smlst ? d1 : p1);
      const xk = rec[mn];
      const d0 = ct * d1 - st * p1 - xk * d2;
      const p0 = ct * p1 - xk * p2;
      d2 = d1; p2 = p1; d1 = d0;
      p1 = p0;
      mn += n + 1;
    }
    d = st * d + ct * p;
    p = st * p;
    bf += tbf * m;
  }
  if (smlst) { if (ct < 0) bf = -bf; } else bf /= st;
  return [br, bt, bf];
}

/** The Earth's own field, IGRF, at a place in GSM, as GSM components, nT. */
export function igrfGsm(frame: Frame, x: number, y: number, z: number): Vec3 {
  const [gx, gy, gz] = gsmToGeo(frame, [x, y, z]);
  const rho2 = gx * gx + gy * gy;
  const r = Math.sqrt(rho2 + gz * gz);
  let theta: number, phi: number;
  if (rho2 !== 0) {
    phi = Math.atan2(gy, gx);
    theta = Math.atan2(Math.sqrt(rho2), gz);
    if (phi < 0) phi += TWO_PI;
  } else {
    phi = 0;
    theta = gz < 0 ? Math.PI : 0;
  }
  const [br, btheta, bphi] = igrfGeo(frame, r, theta, phi);
  const s = Math.sin(theta), c = Math.cos(theta), sf = Math.sin(phi), cf = Math.cos(phi);
  const be = br * s + btheta * c;
  return geoToGsm(frame, [be * cf - bphi * sf, be * sf + bphi * cf, br * c - btheta * s]);
}

/** The Earth's dipole alone, IGRF's for the moment, at a place in GSM, nT. */
export function dipole(frame: Frame, x: number, y: number, z: number): Vec3 {
  const { g, h, sps, cps } = frame;
  const dipmom = Math.sqrt(g[1] ** 2 + g[2] ** 2 + h[2] ** 2);
  const p = x * x, u = z * z, v = 3 * z * x, t = y * y;
  const q = dipmom / Math.sqrt(p + t + u) ** 5;
  return [q * ((t + u - 2 * p) * sps - v * cps), -3 * y * q * (x * sps + z * cps), q * ((p + t - 2 * u) * cps - v * sps)];
}

export interface TraceOptions {
  /** T96's drivers. */
  drivers: T96Drivers;
  /** Stop beyond this distance, Re (and, as geopack does, beyond 40 Re from the Sun-Earth line or 20 Re sunward). */
  rlim?: number;
  /** The ground: stop on reaching this distance, Re. */
  r0?: number;
  /** The Earth's own field: IGRF, or its dipole alone (faster, coarser near the ground). */
  internal?: 'igrf' | 'dipole';
  /** The most points a line may have. */
  maxPoints?: number;
  /** The error a step may make, as geopack's trace allows. */
  err?: number;
}

export interface FieldLine {
  /** Every point, GSM, Re, flat: x, y, z, x, y, z … */
  points: number[];
  end: Vec3;
  /** Why it ended: it reached the ground, left the model's box, ran too long, or could not take a step. */
  reason: 'ground' | 'boundary' | 'too long' | 'stalled';
}

/**
 * A field line from `start`, GSM, Re: `dir` 1 runs against the field (north to south, along a closed
 * line), -1 with it. Tsyganenko's TRACE and STEP: a Runge-Kutta step, halved until its error is small,
 * lengthened after an easy one, and shortened approaching the ground so the footpoint is close.
 */
export function trace(frame: Frame, start: readonly number[], dir: 1 | -1, options: TraceOptions): FieldLine {
  const { drivers, rlim = 10, r0 = 1, internal = 'igrf', maxPoints = 1000, err = 0.001 } = options;
  const own = internal === 'igrf' ? igrfGsm : dipole;
  let ds3 = 0;
  const rhand = (x: number, y: number, z: number): Vec3 => {
    const [ex, ey, ez] = t96(drivers, frame.psi, x, y, z);
    const [ix, iy, iz] = own(frame, x, y, z);
    const bx = ex + ix, by = ey + iy, bz = ez + iz;
    const b = ds3 / Math.sqrt(bx * bx + by * by + bz * bz);
    return [bx * b, by * b, bz * b];
  };
  let [x, y, z] = start;
  let ds = 0.5 * dir;
  // A step along the line from (x, y, z): false if no step small enough could be found.
  const step = (): boolean => {
    for (let halvings = 0; halvings < 100; halvings++) {
      ds3 = -ds / 3;
      const [r11, r12, r13] = rhand(x, y, z);
      const [r21, r22, r23] = rhand(x + r11, y + r12, z + r13);
      const [r31, r32, r33] = rhand(x + 0.5 * (r11 + r21), y + 0.5 * (r12 + r22), z + 0.5 * (r13 + r23));
      const [r41, r42, r43] = rhand(x + 0.375 * (r11 + 3 * r31), y + 0.375 * (r12 + 3 * r32), z + 0.375 * (r13 + 3 * r33));
      const [r51, r52, r53] = rhand(x + 1.5 * (r11 - 3 * r31 + 4 * r41), y + 1.5 * (r12 - 3 * r32 + 4 * r42), z + 1.5 * (r13 - 3 * r33 + 4 * r43));
      const errcur = Math.abs(r11 - 4.5 * r31 + 4 * r41 - 0.5 * r51) + Math.abs(r12 - 4.5 * r32 + 4 * r42 - 0.5 * r52) + Math.abs(r13 - 4.5 * r33 + 4 * r43 - 0.5 * r53);
      if (errcur < err) {
        x += 0.5 * (r11 + 4 * r41 + r51);
        y += 0.5 * (r12 + 4 * r42 + r52);
        z += 0.5 * (r13 + 4 * r43 + r53);
        if (errcur < err * 0.04 && Math.abs(ds) < 1.33) ds *= 1.5;
        return true;
      }
      ds *= 0.5;
    }
    return false;
  };

  // Which way is outward along the line, to know whether the ground was crossed from outside.
  ds3 = -ds / 3;
  const [s1, s2, s3] = rhand(x, y, z);
  const ad = x * s1 + y * s2 + z * s3 < 0 ? -0.01 : 0.01;
  let rr = Math.sqrt(x * x + y * y + z * z) + ad;
  let xr = x, yr = y, zr = z;
  const points: number[] = [];
  let reason: FieldLine['reason'] = 'too long';
  while (points.length < maxPoints * 3) {
    points.push(x, y, z);
    const ryz = y * y + z * z;
    const r = Math.sqrt(x * x + ryz);
    if (r >= rlim || ryz >= 1600 || x >= 20) { reason = 'boundary'; break; }
    if (r < r0 && rr > r) {
      // Back to where the line met the ground, between this point and the last.
      const f = (r0 - r) / (rr - r);
      x -= (x - xr) * f;
      y -= (y - yr) * f;
      z -= (z - zr) * f;
      points.splice(points.length - 3, 3, x, y, z);
      reason = 'ground';
      break;
    }
    if (!(r >= rr || r >= 5)) {
      // Inward, inside 5 Re: shorter steps toward the ground, from 3 Re, and keep the last point.
      if (r < 3) ds = dir * (r - r0 < 0.05 ? 0.05 : 0.2) * (r - r0 + 0.2);
      xr = x; yr = y; zr = z;
    }
    rr = r;
    if (!step()) { reason = 'stalled'; break; }
  }
  return { points, end: [x, y, z], reason };
}
