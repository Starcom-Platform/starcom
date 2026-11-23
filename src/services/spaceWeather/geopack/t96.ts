/**
 * T96, N. A. Tsyganenko's 1996 data-based model of the magnetosphere's own field (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4, SW13).
 *
 * Given the solar wind's dynamic pressure, Dst, and the IMF's By and Bz, and the dipole's tilt, it
 * gives the field of the magnetopause currents, the ring current, the tail, and the region 1 and 2
 * field-aligned currents at a place in GSM, in nT; the Earth's own field is added by the caller.
 * Tsyganenko, N. A. (1995), J. Geophys. Res., 100, 5599; Tsyganenko & Stern (1996), J. Geophys. Res.,
 * 101, 27187. Valid for a pressure of 0.5 to 10 nPa, Dst of -100 to +20 nT, and By and Bz of -10 to
 * +10 nT; the caller keeps the drivers within that and says so where it does.
 *
 * Machine-translated from geopack's t96.py (github.com/tsssss/geopack at ab7efdc8; the file last
 * changed at ae30121f) and checked against it at 330 places and conditions (135 inside the boundary
 * layer), and against the Fortran's recorded value (__tests__/t96.test.ts). Everything below the
 * helpers is the translation, routine by routine and name by name, so it can be read beside the
 * Python; it is not to be edited by hand.
 *
 * geopack: MIT License, Copyright (c) 2018 Sheng Tian.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: The above copyright notice and this
 * permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
 * OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/** The solar wind and the ring current, as T96 takes them. */
export interface T96Drivers {
  /** The solar wind's dynamic pressure, nPa. */
  pdyn: number;
  /** Dst, nT. */
  dst: number;
  /** The IMF's By and Bz, GSM, nT. */
  byImf: number;
  bzImf: number;
}

/** The field T96 gives at (x, y, z) Re GSM for a dipole tilt `ps`, radians, as [Bx, By, Bz] GSM, nT. */
export function t96(drivers: T96Drivers, ps: number, x: number, y: number, z: number): [number, number, number] {
  const b = t96Model([drivers.pdyn, drivers.dst, drivers.byImf, drivers.bzImf], ps, x, y, z);
  return [b[0], b[1], b[2]];
}

// Bessel functions of the first kind, orders 0 and 1, for x >= 0: Abramowitz & Stegun 9.4.1-9.4.6 (error under 1e-7).
function besselJ0(x: number): number {
  if (x <= 3) {
    const t = (x / 3) ** 2;
    return 1 + t * (-2.2499997 + t * (1.2656208 + t * (-0.3163866 + t * (0.0444479 + t * (-0.0039444 + t * 0.00021)))));
  }
  const u = 3 / x;
  const f = 0.79788456 + u * (-0.00000077 + u * (-0.0055274 + u * (-0.00009512 + u * (0.00137237 + u * (-0.00072805 + u * 0.00014476)))));
  const th = x - 0.78539816 + u * (-0.04166397 + u * (-0.00003954 + u * (0.00262573 + u * (-0.00054125 + u * (-0.00029333 + u * 0.00013558)))));
  return (f * Math.cos(th)) / Math.sqrt(x);
}

function besselJ1(x: number): number {
  if (x <= 3) {
    const t = (x / 3) ** 2;
    return x * (0.5 + t * (-0.56249985 + t * (0.21093573 + t * (-0.03954289 + t * (0.00443319 + t * (-0.00031761 + t * 0.00001109))))));
  }
  const u = 3 / x;
  const f = 0.79788456 + u * (0.00000156 + u * (0.01659667 + u * (0.00017105 + u * (-0.00249511 + u * (0.00113653 + u * -0.00020033)))));
  const th = x - 2.35619449 + u * (0.12499612 + u * (0.0000565 + u * (-0.00637879 + u * (0.00074348 + u * (0.00079824 + u * -0.00029166)))));
  return (f * Math.cos(th)) / Math.sqrt(x);
}

// numpy's np.empty and np.dot, as the translation uses them.
const zeros = (n: number): number[] => new Array(n).fill(0);
const matrix = (rows: number, cols: number): number[][] => Array.from({ length: rows }, () => zeros(cols));
function dot(a: number[], b: number): number[];
function dot(a: number[][], b: number[]): number[];
function dot(a: number[], b: number[]): number;
function dot(a: number[] | number[][], b: number[] | number): number[] | number {
  if (typeof b === 'number') return (a as number[]).map((v) => v * b);
  if (Array.isArray(a[0])) return (a as number[][]).map((row) => row.reduce((sum, v, k) => sum + v * (b as number[])[k], 0));
  return (a as number[]).reduce((sum, v, k) => sum + v * (b as number[])[k], 0);
}

// ---- The translation of t96.py ----

// Fortran common blocks, kept as the Python kept them: state one routine sets and others read.
let cpss: number = 0;
let d: number = 0;
let ddzetadx: number = 0;
let ddzetady: number = 0;
let ddzetadz: number = 0;
let dipx: number = 0;
let dipy: number = 0;
let dpsrr: number = 0;
let dr: number = 0;
let dx: number = 0;
let dxsx: number = 0;
let dxsy: number = 0;
let dxsz: number = 0;
let dzetas: number = 0;
let dzsx: number = 0;
let dzsy: number = 0;
let dzsz: number = 0;
let radius: number[] = [];
let rh: number = 0;
let rps: number = 0;
let scalein: number = 0;
let scaleout: number = 0;
let spss: number = 0;
let tilt: number = 0;
let warp: number = 0;
let xcentre: number[] = [];
let xs: number = 0;
let xx1: number[] = [];
let xx2: number[] = [];
let yy1: number[] = [];
let yy2: number[] = [];
let zs: number = 0;
let zsww: number = 0;
let zz2: number[] = [];

function t96Model(parmod: number[], ps: number, x: number, y: number, z: number): number[] {
  let pdyn0: number = 0, eps10: number = 0, a: number[] = [], am0: number = 0, s0: number = 0, x00: number = 0, dsig: number = 0, delimfx: number = 0, delimfy: number = 0, pdyn: number = 0, dst: number = 0, byimf: number = 0, bzimf: number = 0, sps: number = 0, depr: number = 0, bt: number = 0, theta: number = 0, ct: number = 0, st: number = 0, eps: number = 0, facteps: number = 0, factpd: number = 0, rcampl: number = 0, tampl2: number = 0, tampl3: number = 0, b1ampl: number = 0, b2ampl: number = 0, reconn: number = 0, xappa: number = 0, xappa3: number = 0, ys: number = 0, zs: number = 0, factimf: number = 0, oimfx: number = 0, oimfy: number = 0, oimfz: number = 0, rimfampl: number = 0, pps: number = 0, xx: number = 0, yy: number = 0, zz: number = 0, x0: number = 0, am: number = 0, rho2: number = 0, asq: number = 0, xmxm: number = 0, axx0: number = 0, aro: number = 0, sigma: number = 0, cfx: number = 0, cfy: number = 0, cfz: number = 0, bxrc: number = 0, byrc: number = 0, bzrc: number = 0, bxt2: number = 0, byt2: number = 0, bzt2: number = 0, bxt3: number = 0, byt3: number = 0, bzt3: number = 0, r1x: number = 0, r1y: number = 0, r1z: number = 0, r2x: number = 0, r2y: number = 0, r2z: number = 0, rimfx: number = 0, rimfys: number = 0, rimfzs: number = 0, rimfy: number = 0, rimfz: number = 0, fx: number = 0, fy: number = 0, fz: number = 0, bx: number = 0, by: number = 0, bz: number = 0, fint: number = 0, fext: number = 0, qx: number = 0, qy: number = 0, qz: number = 0;
  pdyn0 = 2.0;
  eps10 = 3630.7;
  a = [1.162, 22.344, 18.5, 2.602, 6.903, 5.287, 0.579, 0.4462, 0.785];
  am0 = 70.0;
  s0 = 1.08;
  x00 = 5.48;
  dsig = 0.005;
  delimfx = 20.0;
  delimfy = 10.0;
  [pdyn, dst, byimf, bzimf] = parmod.slice(0, 4);
  sps = Math.sin(ps);
  depr = ((0.8 * dst) - (13.0 * Math.sqrt(pdyn)));
  bt = Math.sqrt(((byimf ** 2) + (bzimf ** 2)));
  if ((byimf === 0) && (bzimf === 0)) {
    theta = 0;
  } else {
    theta = Math.atan2(byimf, bzimf);
    if (theta < 0) {
      theta += (2 * Math.PI);
    }
  }
  ct = Math.cos(theta);
  st = Math.sin(theta);
  eps = (((718.5 * Math.sqrt(pdyn)) * bt) * Math.sin((theta / 2.0)));
  facteps = ((eps / eps10) - 1.0);
  factpd = (Math.sqrt((pdyn / pdyn0)) - 1.0);
  rcampl = ((-a[0]) * depr);
  tampl2 = ((a[1] + (a[2] * factpd)) + (a[3] * facteps));
  tampl3 = (a[4] + (a[5] * factpd));
  b1ampl = (a[6] + (a[7] * facteps));
  b2ampl = (20.0 * b1ampl);
  reconn = a[8];
  xappa = ((pdyn / pdyn0) ** 0.14);
  xappa3 = (xappa ** 3);
  ys = ((y * ct) - (z * st));
  zs = ((z * ct) + (y * st));
  factimf = Math.exp(((x / delimfx) - ((ys / delimfy) ** 2)));
  oimfx = 0.0;
  oimfy = ((reconn * byimf) * factimf);
  oimfz = ((reconn * bzimf) * factimf);
  rimfampl = (reconn * bt);
  pps = ps;
  xx = (x * xappa);
  yy = (y * xappa);
  zz = (z * xappa);
  x0 = (x00 / xappa);
  am = (am0 / xappa);
  rho2 = ((y ** 2) + (z ** 2));
  asq = (am ** 2);
  xmxm = ((am + x) - x0);
  if (xmxm < 0) {
    xmxm = 0;
  }
  axx0 = (xmxm ** 2);
  aro = (asq + rho2);
  sigma = Math.sqrt((((aro + axx0) + Math.sqrt((((aro + axx0) ** 2) - ((4.0 * asq) * axx0)))) / (2.0 * asq)));
  if (sigma < (s0 + dsig)) {
    [cfx, cfy, cfz] = dipshld(pps, xx, yy, zz);
    [bxrc, byrc, bzrc, bxt2, byt2, bzt2, bxt3, byt3, bzt3] = tailrc96(sps, xx, yy, zz);
    [r1x, r1y, r1z] = birk1tot_02(pps, xx, yy, zz);
    [r2x, r2y, r2z] = birk2tot_02(pps, xx, yy, zz);
    [rimfx, rimfys, rimfzs] = intercon(xx, (ys * xappa), (zs * xappa));
    rimfy = ((rimfys * ct) + (rimfzs * st));
    rimfz = ((rimfzs * ct) - (rimfys * st));
    fx = (((((((cfx * xappa3) + (rcampl * bxrc)) + (tampl2 * bxt2)) + (tampl3 * bxt3)) + (b1ampl * r1x)) + (b2ampl * r2x)) + (rimfampl * rimfx));
    fy = (((((((cfy * xappa3) + (rcampl * byrc)) + (tampl2 * byt2)) + (tampl3 * byt3)) + (b1ampl * r1y)) + (b2ampl * r2y)) + (rimfampl * rimfy));
    fz = (((((((cfz * xappa3) + (rcampl * bzrc)) + (tampl2 * bzt2)) + (tampl3 * bzt3)) + (b1ampl * r1z)) + (b2ampl * r2z)) + (rimfampl * rimfz));
    if (sigma < (s0 - dsig)) {
      bx = fx;
      by = fy;
      bz = fz;
    } else {
      fint = (0.5 * (1.0 - ((sigma - s0) / dsig)));
      fext = (0.5 * (1.0 + ((sigma - s0) / dsig)));
      [qx, qy, qz] = dipole(ps, x, y, z);
      bx = ((((fx + qx) * fint) + (oimfx * fext)) - qx);
      by = ((((fy + qy) * fint) + (oimfy * fext)) - qy);
      bz = ((((fz + qz) * fint) + (oimfz * fext)) - qz);
    }
  } else {
    [qx, qy, qz] = dipole(ps, x, y, z);
    bx = (oimfx - qx);
    by = (oimfy - qy);
    bz = (oimfz - qz);
  }
  return [bx, by, bz];
}

function dipshld(ps: number, x: number, y: number, z: number): number[] {
  let cps: number = 0, sps: number = 0, a1: number[] = [], a2: number[] = [], hx: number = 0, hy: number = 0, hz: number = 0, fx: number = 0, fy: number = 0, fz: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  cps = Math.cos(ps);
  sps = Math.sin(ps);
  a1 = [0.24777, (-27.003), (-0.46815), 7.0637, (-1.5918), (-0.090317), 57.522, 13.757, 2.01, 10.458, 4.5798, 2.1695];
  a2 = [(-0.65385), (-18.061), (-0.40457), (-5.0995), 1.2846, 0.078231, 39.592, 13.291, 1.997, 10.062, 4.514, 2.1558];
  [hx, hy, hz] = cylharm(a1, x, y, z);
  [fx, fy, fz] = cylhar1(a2, x, y, z);
  bx = ((hx * cps) + (fx * sps));
  by = ((hy * cps) + (fy * sps));
  bz = ((hz * cps) + (fz * sps));
  return [bx, by, bz];
}

function cylharm(a: number[], x: number, y: number, z: number): number[] {
  let rho: number = 0, sinfi: number = 0, cosfi: number = 0, sinfi2: number = 0, si2co2: number = 0, bx: number = 0, by: number = 0, bz: number = 0, i: number = 0, dzeta: number = 0, xksi: number = 0, xj0: number = 0, xj1: number = 0, xexp: number = 0, brho: number = 0, bphi: number = 0;
  rho = Math.sqrt(((y ** 2) + (z ** 2)));
  if (rho < 1e-08) {
    sinfi = 1.0;
    cosfi = 0.0;
    rho = 1e-08;
  } else {
    sinfi = (z / rho);
    cosfi = (y / rho);
  }
  sinfi2 = (sinfi ** 2);
  si2co2 = (sinfi2 - (cosfi ** 2));
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  for (i = 0; i < 3; i++) {
    dzeta = (rho / a[(i + 6)]);
    xksi = (x / a[(i + 6)]);
    xj0 = besselJ0(dzeta);
    xj1 = besselJ1(dzeta);
    xexp = Math.exp(xksi);
    bx = (bx - (((a[i] * xj1) * xexp) * sinfi));
    by = (by + ((((a[i] * (((2 * xj1) / dzeta) - xj0)) * xexp) * sinfi) * cosfi));
    bz = (bz + ((a[i] * (((xj1 / dzeta) * si2co2) - (xj0 * sinfi2))) * xexp));
  }
  for (i = 3; i < 6; i++) {
    dzeta = (rho / a[(i + 6)]);
    xksi = (x / a[(i + 6)]);
    xj0 = besselJ0(dzeta);
    xj1 = besselJ1(dzeta);
    xexp = Math.exp(xksi);
    brho = ((((xksi * xj0) - (((((dzeta ** 2) + xksi) - 1) * xj1) / dzeta)) * xexp) * sinfi);
    bphi = (((xj0 + ((xj1 / dzeta) * (xksi - 1))) * xexp) * cosfi);
    bx = (bx + (((a[i] * ((dzeta * xj0) + (xksi * xj1))) * xexp) * sinfi));
    by = (by + (a[i] * ((brho * cosfi) - (bphi * sinfi))));
    bz = (bz + (a[i] * ((brho * sinfi) + (bphi * cosfi))));
  }
  return [bx, by, bz];
}

function cylhar1(a: number[], x: number, y: number, z: number): number[] {
  let rho: number = 0, sinfi: number = 0, cosfi: number = 0, bx: number = 0, by: number = 0, bz: number = 0, i: number = 0, dzeta: number = 0, xksi: number = 0, xj0: number = 0, xj1: number = 0, xexp: number = 0, brho: number = 0;
  rho = Math.sqrt(((y ** 2) + (z ** 2)));
  if (rho < 1e-08) {
    sinfi = 1.0;
    cosfi = 0.0;
    rho = 1e-08;
  } else {
    sinfi = (z / rho);
    cosfi = (y / rho);
  }
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  for (i = 0; i < 3; i++) {
    dzeta = (rho / a[(i + 6)]);
    xksi = (x / a[(i + 6)]);
    xj0 = besselJ0(dzeta);
    xj1 = besselJ1(dzeta);
    xexp = Math.exp(xksi);
    brho = (xj1 * xexp);
    bx = (bx - ((a[i] * xj0) * xexp));
    by = (by + ((a[i] * brho) * cosfi));
    bz = (bz + ((a[i] * brho) * sinfi));
  }
  for (i = 3; i < 6; i++) {
    dzeta = (rho / a[(i + 6)]);
    xksi = (x / a[(i + 6)]);
    xj0 = besselJ0(dzeta);
    xj1 = besselJ1(dzeta);
    xexp = Math.exp(xksi);
    brho = (((dzeta * xj0) + (xksi * xj1)) * xexp);
    bx = (bx + ((a[i] * ((dzeta * xj1) - (xj0 * (xksi + 1)))) * xexp));
    by = (by + ((a[i] * brho) * cosfi));
    bz = (bz + ((a[i] * brho) * sinfi));
  }
  return [bx, by, bz];
}

function tailrc96(sps: number, x: number, y: number, z: number): number[] {
  let arc: number[] = [], atail2: number[] = [], atail3: number[] = [], rh: number = 0, dr: number = 0, g: number = 0, d0: number = 0, deltady: number = 0, dr2: number = 0, c11: number = 0, c12: number = 0, c1: number = 0, spsc1: number = 0, r: number = 0, sq1: number = 0, sq2: number = 0, c: number = 0, cs: number = 0, wfac: number = 0, w: number = 0, ws: number = 0, dddy: number = 0, wx: number = 0, wy: number = 0, wz: number = 0, hx: number = 0, hy: number = 0, hz: number = 0, bxrc: number = 0, byrc: number = 0, bzrc: number = 0, bxt2: number = 0, byt2: number = 0, bzt2: number = 0, bxt3: number = 0, byt3: number = 0, bzt3: number = 0;
  arc = [(-3.087699646), 3.516259114, 18.81380577, (-13.95772338), (-5.497076303), 0.1712890838, 2.392629189, (-2.728020808), (-14.79349936), 11.08738083, 4.388174084, 0.02492163197, 0.7030375685, (-0.7966023165), (-3.835041334), 2.642228681, (-0.2405352424), (-0.7297705678), (-0.3680255045), 0.1333685557, 2.795140897, (-1.078379954), 0.801402863, 0.1245825565, 0.6149982835, (-0.2207267314), (-4.424578723), 1.730471572, (-1.716313926), (-0.2306302941), (-0.2450342688), 0.08617173961, 1.54697858, (-0.6569391113), (-0.6537525353), 0.2079417515, 12.75434981, 11.37659788, 636.4346279, 1.752483754, 3.604231143, 12.83078674, 7.412066636, 9.434625736, 676.7557193, 1.701162737, 3.580307144, 14.64298662];
  atail2 = [0.8747515218, (-0.9116821411), 2.209365387, (-2.159059518), (-7.059828867), 5.924671028, (-1.916935691), 1.996707344, (-3.877101873), 3.947666061, 11.38715899, (-8.343210833), 1.194109867, (-1.244316975), 3.73895491, (-4.406522465), (-20.66884863), 3.020952989, 0.2189908481, (-0.09942543549), (-0.927225562), 0.1555224669, 0.6994137909, (-0.08111721003), (-0.7565493881), 0.4686588792, 4.266058082, (-0.3717470262), (-3.920787807), 0.0229856987, 0.7039506341, (-0.5498352719), (-6.675140817), 0.8279283559, (-2.234773608), (-1.622656137), 5.187666221, 6.802472048, 39.13543412, 2.784722096, 6.979576616, 25.7171676, 4.495005873, 8.068408272, 93.47887103, 4.158030104, 9.313492566, 57.18240483];
  atail3 = [(-19091.95061), (-3011.613928), 20582.16203, 4242.91843, (-2377.091102), (-1504.820043), 19884.0465, 2725.150544, (-21389.04845), (-3990.475093), 2401.610097, 1548.171792, (-946.5493963), 490.1528941, 986.9156625, (-489.326593), (-67.99278499), 8.71117571, (-45.1573426), (-10.761065), 210.7927312, 11.41764141, (-178.0262808), 0.7558830028, 339.3806753, 9.904695974, 69.50583193, (-118.0271581), 22.85935896, 45.91014857, (-425.6607164), 15.47250738, 118.2988915, 65.58594397, (-201.4478068), (-14.5706294), 19.6987797, 20.3009568, 86.4540742, 22.50403727, 23.41617329, 48.48140573, 24.61031329, 123.5395974, 223.5367692, 39.50824342, 65.83385762, 266.2948657];
  rh = 9.0;
  dr = 4.0;
  g = 10.0;
  d0 = 2.0;
  deltady = 10.0;
  dr2 = (dr * dr);
  c11 = Math.sqrt((((1 + rh) ** 2) + dr2));
  c12 = Math.sqrt((((1 - rh) ** 2) + dr2));
  c1 = (c11 - c12);
  spsc1 = (sps / c1);
  rps = ((0.5 * (c11 + c12)) * sps);
  r = Math.sqrt((((x * x) + (y * y)) + (z * z)));
  sq1 = Math.sqrt((((r + rh) ** 2) + dr2));
  sq2 = Math.sqrt((((r - rh) ** 2) + dr2));
  c = (sq1 - sq2);
  cs = (((r + rh) / sq1) - ((r - rh) / sq2));
  spss = ((spsc1 / r) * c);
  cpss = Math.sqrt((1 - (spss ** 2)));
  dpsrr = (((sps / (r * r)) * ((cs * r) - c)) / Math.sqrt((((r * c1) ** 2) - ((c * sps) ** 2))));
  wfac = (y / ((y ** 4) + 10000.0));
  w = (wfac * (y ** 3));
  ws = ((40000.0 * y) * (wfac ** 2));
  warp = ((g * sps) * w);
  xs = ((x * cpss) - (z * spss));
  zsww = ((z * cpss) + (x * spss));
  zs = (zsww + warp);
  dxsx = (cpss - ((x * zsww) * dpsrr));
  dxsy = (((-y) * zsww) * dpsrr);
  dxsz = ((-spss) - ((z * zsww) * dpsrr));
  dzsx = (spss + ((x * xs) * dpsrr));
  dzsy = (((xs * y) * dpsrr) + ((g * sps) * ws));
  dzsz = (cpss + ((xs * z) * dpsrr));
  d = (d0 + (deltady * ((y / 20) ** 2)));
  dddy = ((deltady * y) * 0.005);
  dzetas = Math.sqrt(((zs ** 2) + (d ** 2)));
  ddzetadx = ((zs * dzsx) / dzetas);
  ddzetady = (((zs * dzsy) + (d * dddy)) / dzetas);
  ddzetadz = ((zs * dzsz) / dzetas);
  [wx, wy, wz] = shlcar3x3(arc, x, y, z, sps);
  [hx, hy, hz] = ringcurr96(x, y, z);
  bxrc = (wx + hx);
  byrc = (wy + hy);
  bzrc = (wz + hz);
  [wx, wy, wz] = shlcar3x3(atail2, x, y, z, sps);
  [hx, hy, hz] = taildisk(x, y, z);
  bxt2 = (wx + hx);
  byt2 = (wy + hy);
  bzt2 = (wz + hz);
  [wx, wy, wz] = shlcar3x3(atail3, x, y, z, sps);
  [hx, hz] = tail87(x, z);
  bxt3 = (wx + hx);
  byt3 = wy;
  bzt3 = (wz + hz);
  return [bxrc, byrc, bzrc, bxt2, byt2, bzt2, bxt3, byt3, bzt3];
}

function shlcar3x3(a: number[], x: number, y: number, z: number, sps: number): number[] {
  let cps: number = 0, s3ps: number = 0, hx: number = 0, hy: number = 0, hz: number = 0, l: number = 0, m: number = 0, i: number = 0, p: number = 0, q: number = 0, cypi: number = 0, cyqi: number = 0, sypi: number = 0, syqi: number = 0, k: number = 0, r: number = 0, s: number = 0, szrk: number = 0, czsk: number = 0, czrk: number = 0, szsk: number = 0, sqpr: number = 0, sqqs: number = 0, epr: number = 0, eqs: number = 0, n: number = 0, dx: number = 0, dy: number = 0, dz: number = 0;
  cps = Math.sqrt((1 - (sps ** 2)));
  s3ps = ((4 * (cps ** 2)) - 1);
  hx = 0.0;
  hy = 0.0;
  hz = 0.0;
  l = 0;
  for (m = 0; m < 2; m++) {
    for (i = 0; i < 3; i++) {
      p = a[(36 + i)];
      q = a[(42 + i)];
      cypi = Math.cos((y / p));
      cyqi = Math.cos((y / q));
      sypi = Math.sin((y / p));
      syqi = Math.sin((y / q));
      for (k = 0; k < 3; k++) {
        r = a[(39 + k)];
        s = a[(45 + k)];
        szrk = Math.sin((z / r));
        czsk = Math.cos((z / s));
        czrk = Math.cos((z / r));
        szsk = Math.sin((z / s));
        sqpr = Math.sqrt(((1 / (p ** 2)) + (1 / (r ** 2))));
        sqqs = Math.sqrt(((1 / (q ** 2)) + (1 / (s ** 2))));
        epr = Math.exp((x * sqpr));
        eqs = Math.exp((x * sqqs));
        for (n = 0; n < 2; n++) {
          if (m === 0) {
            if (n === 0) {
              dx = ((((-sqpr) * epr) * cypi) * szrk);
              dy = (((epr / p) * sypi) * szrk);
              dz = ((((-epr) / r) * cypi) * czrk);
              hx = (hx + (a[l] * dx));
              hy = (hy + (a[l] * dy));
              hz = (hz + (a[l] * dz));
            } else {
              dx = (dx * cps);
              dy = (dy * cps);
              dz = (dz * cps);
              hx = (hx + (a[l] * dx));
              hy = (hy + (a[l] * dy));
              hz = (hz + (a[l] * dz));
            }
          } else if (n === 0) {
            dx = (((((-sps) * sqqs) * eqs) * cyqi) * czsk);
            dy = ((((sps * eqs) / q) * syqi) * czsk);
            dz = ((((sps * eqs) / s) * cyqi) * szsk);
            hx = (hx + (a[l] * dx));
            hy = (hy + (a[l] * dy));
            hz = (hz + (a[l] * dz));
          } else {
            dx = (dx * s3ps);
            dy = (dy * s3ps);
            dz = (dz * s3ps);
            hx = (hx + (a[l] * dx));
            hy = (hy + (a[l] * dy));
            hz = (hz + (a[l] * dz));
          }
          l += 1;
        }
      }
    }
  }
  return [hx, hy, hz];
}

function ringcurr96(x: number, y: number, z: number): number[] {
  let d0: number = 0, deltadx: number = 0, xd: number = 0, xldx: number = 0, f: number[] = [], beta: number[] = [], dzsy: number = 0, xxd: number = 0, fdx: number = 0, dddx: number = 0, d: number = 0, zs: number = 0, dzetas: number = 0, rhos: number = 0, ddzetadx: number = 0, ddzetady: number = 0, ddzetadz: number = 0, drhosdx: number = 0, drhosdy: number = 0, drhosdz: number = 0, bx: number = 0, by: number = 0, bz: number = 0, i: number = 0, bi: number = 0, s1: number = 0, s2: number = 0, ds1ddz: number = 0, ds2ddz: number = 0, ds1drhos: number = 0, ds2drhos: number = 0, ds1dx: number = 0, ds1dy: number = 0, ds1dz: number = 0, ds2dx: number = 0, ds2dy: number = 0, ds2dz: number = 0, s1ts2: number = 0, s1ps2: number = 0, s1ps2sq: number = 0, fac1: number = 0, as0: number = 0, term1: number = 0, fac2: number = 0, dasds1: number = 0, dasds2: number = 0, dasdx: number = 0, dasdy: number = 0, dasdz: number = 0;
  d0 = 2.0;
  deltadx = 0.0;
  xd = 0.0;
  xldx = 4.0;
  f = [569.895366, (-1603.386993)];
  beta = [2.722188, 3.766875];
  dzsy = ((xs * y) * dpsrr);
  xxd = (x - xd);
  fdx = (0.5 * (1 + (xxd / Math.sqrt(((xxd ** 2) + (xldx ** 2))))));
  dddx = (((deltadx * 0.5) * (xldx ** 2)) / (Math.sqrt(((xxd ** 2) + (xldx ** 2))) ** 3));
  d = (d0 + (deltadx * fdx));
  zs = zsww;
  dzetas = Math.sqrt(((zs ** 2) + (d ** 2)));
  rhos = Math.sqrt(((xs ** 2) + (y ** 2)));
  ddzetadx = (((zs * dzsx) + (d * dddx)) / dzetas);
  ddzetady = ((zs * dzsy) / dzetas);
  ddzetadz = ((zs * dzsz) / dzetas);
  if (rhos < 1e-05) {
    drhosdx = 0;
    drhosdy = Math.sign(y);
    drhosdz = 0;
  } else {
    drhosdx = ((xs * dxsx) / rhos);
    drhosdy = (((xs * dxsy) + y) / rhos);
    drhosdz = ((xs * dxsz) / rhos);
  }
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  for (i = 0; i < 2; i++) {
    bi = beta[i];
    s1 = Math.sqrt((((dzetas + bi) ** 2) + ((rhos + bi) ** 2)));
    s2 = Math.sqrt((((dzetas + bi) ** 2) + ((rhos - bi) ** 2)));
    ds1ddz = ((dzetas + bi) / s1);
    ds2ddz = ((dzetas + bi) / s2);
    ds1drhos = ((rhos + bi) / s1);
    ds2drhos = ((rhos - bi) / s2);
    ds1dx = ((ds1ddz * ddzetadx) + (ds1drhos * drhosdx));
    ds1dy = ((ds1ddz * ddzetady) + (ds1drhos * drhosdy));
    ds1dz = ((ds1ddz * ddzetadz) + (ds1drhos * drhosdz));
    ds2dx = ((ds2ddz * ddzetadx) + (ds2drhos * drhosdx));
    ds2dy = ((ds2ddz * ddzetady) + (ds2drhos * drhosdy));
    ds2dz = ((ds2ddz * ddzetadz) + (ds2drhos * drhosdz));
    s1ts2 = (s1 * s2);
    s1ps2 = (s1 + s2);
    s1ps2sq = (s1ps2 ** 2);
    fac1 = Math.sqrt((s1ps2sq - ((2 * bi) ** 2)));
    as0 = (fac1 / (s1ts2 * s1ps2sq));
    term1 = (1 / ((s1ts2 * s1ps2) * fac1));
    fac2 = (as0 / s1ps2sq);
    dasds1 = (term1 - ((fac2 / s1) * ((s2 * s2) + (s1 * ((3 * s1) + (4 * s2))))));
    dasds2 = (term1 - ((fac2 / s2) * ((s1 * s1) + (s2 * ((3 * s2) + (4 * s1))))));
    dasdx = ((dasds1 * ds1dx) + (dasds2 * ds2dx));
    dasdy = ((dasds1 * ds1dy) + (dasds2 * ds2dy));
    dasdz = ((dasds1 * ds1dz) + (dasds2 * ds2dz));
    bx = (bx + (f[i] * (((((2 * as0) + (y * dasdy)) * spss) - (xs * dasdz)) + ((as0 * dpsrr) * (((y ** 2) * cpss) + (z * zs))))));
    by = (by - ((f[i] * y) * ((((as0 * dpsrr) * xs) + (dasdz * cpss)) + (dasdx * spss))));
    bz = (bz + (f[i] * (((((2 * as0) + (y * dasdy)) * cpss) + (xs * dasdx)) - ((as0 * dpsrr) * ((x * zs) + ((y ** 2) * spss))))));
  }
  return [bx, by, bz];
}

function taildisk(x: number, y: number, z: number): number[] {
  let xshift: number = 0, f: number[] = [], beta: number[] = [], rhos: number = 0, drhosdx: number = 0, drhosdy: number = 0, drhosdz: number = 0, bx: number = 0, by: number = 0, bz: number = 0, i: number = 0, bi: number = 0, s1: number = 0, s2: number = 0, ds1ddz: number = 0, ds2ddz: number = 0, ds1drhos: number = 0, ds2drhos: number = 0, ds1dx: number = 0, ds1dy: number = 0, ds1dz: number = 0, ds2dx: number = 0, ds2dy: number = 0, ds2dz: number = 0, s1ts2: number = 0, s1ps2: number = 0, s1ps2sq: number = 0, fac1: number = 0, as0: number = 0, term1: number = 0, fac2: number = 0, dasds1: number = 0, dasds2: number = 0, dasdx: number = 0, dasdy: number = 0, dasdz: number = 0;
  xshift = 4.5;
  f = [(-745796.7338), 1176470.141, (-444610.529), (-57508.01028)];
  beta = [7.925, 8.085, 8.47125, 27.895];
  rhos = Math.sqrt((((xs - xshift) ** 2) + (y ** 2)));
  if (rhos < 1e-05) {
    drhosdx = 0;
    drhosdy = Math.sign(y);
    drhosdz = 0;
  } else {
    drhosdx = (((xs - xshift) * dxsx) / rhos);
    drhosdy = ((((xs - xshift) * dxsy) + y) / rhos);
    drhosdz = (((xs - xshift) * dxsz) / rhos);
  }
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  for (i = 0; i < 4; i++) {
    bi = beta[i];
    s1 = Math.sqrt((((dzetas + bi) ** 2) + ((rhos + bi) ** 2)));
    s2 = Math.sqrt((((dzetas + bi) ** 2) + ((rhos - bi) ** 2)));
    ds1ddz = ((dzetas + bi) / s1);
    ds2ddz = ((dzetas + bi) / s2);
    ds1drhos = ((rhos + bi) / s1);
    ds2drhos = ((rhos - bi) / s2);
    ds1dx = ((ds1ddz * ddzetadx) + (ds1drhos * drhosdx));
    ds1dy = ((ds1ddz * ddzetady) + (ds1drhos * drhosdy));
    ds1dz = ((ds1ddz * ddzetadz) + (ds1drhos * drhosdz));
    ds2dx = ((ds2ddz * ddzetadx) + (ds2drhos * drhosdx));
    ds2dy = ((ds2ddz * ddzetady) + (ds2drhos * drhosdy));
    ds2dz = ((ds2ddz * ddzetadz) + (ds2drhos * drhosdz));
    s1ts2 = (s1 * s2);
    s1ps2 = (s1 + s2);
    s1ps2sq = (s1ps2 ** 2);
    fac1 = Math.sqrt((s1ps2sq - ((2 * bi) ** 2)));
    as0 = (fac1 / (s1ts2 * s1ps2sq));
    term1 = (1 / ((s1ts2 * s1ps2) * fac1));
    fac2 = (as0 / s1ps2sq);
    dasds1 = (term1 - ((fac2 / s1) * ((s2 * s2) + (s1 * ((3 * s1) + (4 * s2))))));
    dasds2 = (term1 - ((fac2 / s2) * ((s1 * s1) + (s2 * ((3 * s2) + (4 * s1))))));
    dasdx = ((dasds1 * ds1dx) + (dasds2 * ds2dx));
    dasdy = ((dasds1 * ds1dy) + (dasds2 * ds2dy));
    dasdz = ((dasds1 * ds1dz) + (dasds2 * ds2dz));
    bx = (bx + (f[i] * (((((2 * as0) + (y * dasdy)) * spss) - ((xs - xshift) * dasdz)) + ((as0 * dpsrr) * (((y ** 2) * cpss) + (z * zsww))))));
    by = (by - ((f[i] * y) * ((((as0 * dpsrr) * xs) + (dasdz * cpss)) + (dasdx * spss))));
    bz = (bz + (f[i] * (((((2 * as0) + (y * dasdy)) * cpss) + ((xs - xshift) * dasdx)) - ((as0 * dpsrr) * ((x * zsww) + ((y ** 2) * spss))))));
  }
  return [bx, by, bz];
}

function tail87(x: number, z: number): number[] {
  let dd: number = 0, hpi: number = 0, rt: number = 0, xn: number = 0, x1: number = 0, x2: number = 0, b0: number = 0, b1: number = 0, b2: number = 0, xn21: number = 0, xnr: number = 0, adln: number = 0, tscale: number = 0, zs: number = 0, zp: number = 0, zm: number = 0, xnx: number = 0, xnx2: number = 0, xc1: number = 0, xc2: number = 0, xc22: number = 0, xr2: number = 0, xc12: number = 0, d2: number = 0, b20: number = 0, b2p: number = 0, b2m: number = 0, b: number = 0, bp: number = 0, bm: number = 0, xa1: number = 0, xap1: number = 0, xam1: number = 0, xa2: number = 0, xap2: number = 0, xam2: number = 0, xna: number = 0, xnap: number = 0, xnam: number = 0, f: number = 0, fp: number = 0, fm: number = 0, xln1: number = 0, xlnp1: number = 0, xlnm1: number = 0, xln2: number = 0, xlnp2: number = 0, xlnm2: number = 0, aln: number = 0, s0: number = 0, s0p: number = 0, s0m: number = 0, s1: number = 0, s1p: number = 0, s1m: number = 0, s2: number = 0, s2p: number = 0, s2m: number = 0, g1: number = 0, g1p: number = 0, g1m: number = 0, g2: number = 0, g2p: number = 0, g2m: number = 0, bx: number = 0, bz: number = 0;
  dd = 3.0;
  hpi = 1.5707963;
  rt = 40.0;
  xn = (-10.0);
  x1 = (-1.261);
  x2 = (-0.663);
  b0 = 0.391734;
  b1 = 5.89715;
  b2 = 24.6833;
  xn21 = 76.37;
  xnr = (-0.1071);
  adln = 0.13238005;
  tscale = 1.0;
  b0 = 0.391734;
  b1 = (5.89715 * tscale);
  b2 = (24.6833 * (tscale ** 2));
  xn21 = ((xn - x1) ** 2);
  xnr = (1.0 / (xn - x2));
  adln = (-Math.log(((xnr ** 2) * xn21)));
  zs = ((z - rps) + warp);
  zp = (z - rt);
  zm = (z + rt);
  xnx = (xn - x);
  xnx2 = (xnx ** 2);
  xc1 = (x - x1);
  xc2 = (x - x2);
  xc22 = (xc2 ** 2);
  xr2 = (xc2 * xnr);
  xc12 = (xc1 ** 2);
  d2 = (dd ** 2);
  b20 = ((zs ** 2) + d2);
  b2p = ((zp ** 2) + d2);
  b2m = ((zm ** 2) + d2);
  b = Math.sqrt(b20);
  bp = Math.sqrt(b2p);
  bm = Math.sqrt(b2m);
  xa1 = (xc12 + b20);
  xap1 = (xc12 + b2p);
  xam1 = (xc12 + b2m);
  xa2 = (1.0 / (xc22 + b20));
  xap2 = (1.0 / (xc22 + b2p));
  xam2 = (1.0 / (xc22 + b2m));
  xna = (xnx2 + b20);
  xnap = (xnx2 + b2p);
  xnam = (xnx2 + b2m);
  f = (b20 - xc22);
  fp = (b2p - xc22);
  fm = (b2m - xc22);
  xln1 = Math.log((xn21 / xna));
  xlnp1 = Math.log((xn21 / xnap));
  xlnm1 = Math.log((xn21 / xnam));
  xln2 = (xln1 + adln);
  xlnp2 = (xlnp1 + adln);
  xlnm2 = (xlnm1 + adln);
  aln = (0.25 * ((xlnp1 + xlnm1) - (2.0 * xln1)));
  s0 = ((Math.atan((xnx / b)) + hpi) / b);
  s0p = ((Math.atan((xnx / bp)) + hpi) / bp);
  s0m = ((Math.atan((xnx / bm)) + hpi) / bm);
  s1 = (((xln1 * 0.5) + (xc1 * s0)) / xa1);
  s1p = (((xlnp1 * 0.5) + (xc1 * s0p)) / xap1);
  s1m = (((xlnm1 * 0.5) + (xc1 * s0m)) / xam1);
  s2 = (((((xc2 * xa2) * xln2) - xnr) - ((f * xa2) * s0)) * xa2);
  s2p = (((((xc2 * xap2) * xlnp2) - xnr) - ((fp * xap2) * s0p)) * xap2);
  s2m = (((((xc2 * xam2) * xlnm2) - xnr) - ((fm * xam2) * s0m)) * xam2);
  g1 = (((b20 * s0) - ((0.5 * xc1) * xln1)) / xa1);
  g1p = (((b2p * s0p) - ((0.5 * xc1) * xlnp1)) / xap1);
  g1m = (((b2m * s0m) - ((0.5 * xc1) * xlnm1)) / xam1);
  g2 = ((((((0.5 * f) * xln2) + (((2.0 * s0) * b20) * xc2)) * xa2) + xr2) * xa2);
  g2p = ((((((0.5 * fp) * xlnp2) + (((2.0 * s0p) * b2p) * xc2)) * xap2) + xr2) * xap2);
  g2m = ((((((0.5 * fm) * xlnm2) + (((2.0 * s0m) * b2m) * xc2)) * xam2) + xr2) * xam2);
  bx = (((b0 * ((zs * s0) - (0.5 * ((zp * s0p) + (zm * s0m))))) + (b1 * ((zs * s1) - (0.5 * ((zp * s1p) + (zm * s1m)))))) + (b2 * ((zs * s2) - (0.5 * ((zp * s2p) + (zm * s2m))))));
  bz = (((b0 * aln) + (b1 * (g1 - (0.5 * (g1p + g1m))))) + (b2 * (g2 - (0.5 * (g2p + g2m)))));
  return [bx, bz];
}

function birk1tot_02(ps: number, x: number, y: number, z: number): number[] {
  let c1: number[] = [], c2: number[] = [], xltday: number = 0, xltnght: number = 0, dtet0: number = 0, tnoonn: number = 0, tnoons: number = 0, dtetdn: number = 0, dr2: number = 0, sps: number = 0, r2: number = 0, r: number = 0, r3: number = 0, rmrh: number = 0, rprh: number = 0, sqm: number = 0, sqp: number = 0, c: number = 0, q: number = 0, spsas: number = 0, cpsas: number = 0, xas: number = 0, zas: number = 0, pas: number = 0, tas: number = 0, stas: number = 0, f: number = 0, tet0: number = 0, dtet: number = 0, tetr1n: number = 0, tetr1s: number = 0, loc: number = 0, bx: number = 0, by: number = 0, bz: number = 0, xi: number[] = [], d1: number[][] = [], i: number = 0, d2: number[][] = [], t01: number = 0, t02: number = 0, sqr: number = 0, st01as: number = 0, st02as: number = 0, ct01as: number = 0, ct02as: number = 0, xas1: number = 0, y1: number = 0, zas1: number = 0, x1: number = 0, z1: number = 0, bx1: number = 0, by1: number = 0, bz1: number = 0, xas2: number = 0, y2: number = 0, zas2: number = 0, x2: number = 0, z2: number = 0, bx2: number = 0, by2: number = 0, bz2: number = 0, ss: number = 0, ds: number = 0, frac: number = 0, bsx: number = 0, bsy: number = 0, bsz: number = 0;
  c1 = [(-0.000911582), (-0.00376654), (-0.00727423), (-0.00270084), (-0.00123899), (-0.00154387), (-0.0034004), (-0.0191858), (-0.0518979), 0.0635061, 0.44068, (-0.39657), 0.00561238, 0.00160938, (-0.00451229), (-0.0025181), (-0.00151599), (-0.00133665), (-0.000962089), (-0.0272085), (-0.0524319), 0.0717024, 0.523439, (-0.405015), (-89.5587), 23.2806];
  c2 = [6.04133, 0.305415, 0.00606066, 0.000128379, (-1.79406e-05), 1.41714, (-27.2586), (-4.28833), (-1.30675), 35.5607, 8.95792, 0.000961617, (-0.000801477), (-0.000782795), (-1.65242), (-16.5242), (-5.33798), 0.000424878, 0.000331787, (-0.000704305), 0.000844342, 9.53682e-05, 0.000886271, 25.112, 20.9299, 5.14569, (-44.167), (-51.0672), (-1.87725), 20.2998, 48.7505, (-2.97415), 3.35184, (-54.2921), (-0.838712), (-10.5123), 70.7594, (-4.94104), 0.000106166, 0.000465791, (-0.000193719), 10.8439, (-29.7968), 8.08068, 0.000463507, (-2.24475e-05), 0.000177035, (-0.000317581), (-0.000264487), 0.000102075, 7.7139, 10.1915, (-4.99797), (-23.1114), (-29.2043), 12.2928, 10.9542, 33.6671, (-9.3851), 0.000174615, (-7.89777e-07), 0.000686047, 4.60104e-05, (-0.00345216), 0.00221871, 0.0110078, (-0.00661373), 0.00249201, 0.0343978, (-1.93145e-06), 4.93963e-06, (-5.35748e-05), 1.91833e-05, (-0.000100496), (-0.000210103), (-0.00232195), 0.00315335, (-0.013432), (-0.0263222)];
  tilt = 1.00891;
  xcentre = [2.28397, (-5.60831)];
  radius = [1.86106, 7.83281];
  dipx = 1.12541;
  dipy = 0.945719;
  dx = (-0.16);
  scalein = 0.08;
  scaleout = 0.4;
  xx1 = [(-11.0), (-7), (-7), (-3), (-3), 1, 1, 1, 5, 5, 9, 9];
  yy1 = [2.0, 0, 4, 2, 6, 0, 4, 8, 2, 6, 0, 4];
  xx2 = [(-10.0), (-7), (-4), (-4), 0, 4, 4, 7, 10, 0, 0, 0, 0, 0];
  yy2 = [3.0, 6, 3, 9, 6, 3, 9, 6, 3, 0, 0, 0, 0, 0];
  zz2 = [20.0, 20, 4, 20, 4, 4, 20, 20, 20, 2, 3, 4.5, 7, 10];
  rh = 9.0;
  dr = 4.0;
  xltday = 78.0;
  xltnght = 70.0;
  dtet0 = 0.034906;
  tnoonn = ((90 - xltday) * 0.01745329);
  tnoons = (Math.PI - tnoonn);
  dtetdn = ((xltday - xltnght) * 0.01745329);
  dr2 = (dr ** 2);
  sps = Math.sin(ps);
  r2 = (((x ** 2) + (y ** 2)) + (z ** 2));
  r = Math.sqrt(r2);
  r3 = (r * r2);
  rmrh = (r - rh);
  rprh = (r + rh);
  sqm = Math.sqrt(((rmrh ** 2) + dr2));
  sqp = Math.sqrt(((rprh ** 2) + dr2));
  c = (sqp - sqm);
  q = (Math.sqrt((((rh + 1) ** 2) + dr2)) - Math.sqrt((((rh - 1) ** 2) + dr2)));
  spsas = (((sps / r) * c) / q);
  cpsas = Math.sqrt((1 - (spsas ** 2)));
  xas = ((x * cpsas) - (z * spsas));
  zas = ((x * spsas) + (z * cpsas));
  pas = 0.0;
  if ((xas !== 0) || (y !== 0)) {
    pas = Math.atan2(y, xas);
  }
  tas = Math.atan2(Math.sqrt(((xas ** 2) + (y ** 2))), zas);
  stas = Math.sin(tas);
  f = (stas / ((((stas ** 6) * (1 - r3)) + r3) ** 0.1666666667));
  tet0 = Math.asin(f);
  if (tas > 1.5707963) {
    tet0 = (Math.PI - tet0);
  }
  dtet = (dtetdn * (Math.sin((pas * 0.5)) ** 2));
  tetr1n = (tnoonn + dtet);
  tetr1s = (tnoons - dtet);
  loc = 0;
  if ((tet0 < (tetr1n - dtet0)) || (tet0 > (tetr1s + dtet0))) {
    loc = 1;
  }
  if ((tet0 > (tetr1n + dtet0)) && (tet0 < (tetr1s - dtet0))) {
    loc = 2;
  }
  if ((tet0 >= (tetr1n - dtet0)) && (tet0 <= (tetr1n + dtet0))) {
    loc = 3;
  }
  if ((tet0 >= (tetr1s - dtet0)) && (tet0 <= (tetr1s + dtet0))) {
    loc = 4;
  }
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  if (loc === 1) {
    xi = [x, y, z, ps];
    d1 = diploop1(xi);
    for (i = 0; i < 26; i++) {
      bx = (bx + (c1[i] * d1[0][i]));
      by = (by + (c1[i] * d1[1][i]));
      bz = (bz + (c1[i] * d1[2][i]));
    }
  } else if (loc === 2) {
    xi = [x, y, z, ps];
    d2 = condip1(xi);
    for (i = 0; i < 79; i++) {
      bx = (bx + (c2[i] * d2[0][i]));
      by = (by + (c2[i] * d2[1][i]));
      bz = (bz + (c2[i] * d2[2][i]));
    }
  } else if (loc === 3) {
    t01 = (tetr1n - dtet0);
    t02 = (tetr1n + dtet0);
    sqr = Math.sqrt(r);
    st01as = (sqr / (((r3 + (1 / (Math.sin(t01) ** 6))) - 1) ** 0.1666666667));
    st02as = (sqr / (((r3 + (1 / (Math.sin(t02) ** 6))) - 1) ** 0.1666666667));
    ct01as = Math.sqrt((1 - (st01as ** 2)));
    ct02as = Math.sqrt((1 - (st02as ** 2)));
    xas1 = ((r * st01as) * Math.cos(pas));
    y1 = ((r * st01as) * Math.sin(pas));
    zas1 = (r * ct01as);
    x1 = ((xas1 * cpsas) + (zas1 * spsas));
    z1 = (((-xas1) * spsas) + (zas1 * cpsas));
    xi = [x1, y1, z1, ps];
    d1 = diploop1(xi);
    bx1 = 0.0;
    by1 = 0.0;
    bz1 = 0.0;
    for (i = 0; i < 26; i++) {
      bx1 = (bx1 + (c1[i] * d1[0][i]));
      by1 = (by1 + (c1[i] * d1[1][i]));
      bz1 = (bz1 + (c1[i] * d1[2][i]));
    }
    xas2 = ((r * st02as) * Math.cos(pas));
    y2 = ((r * st02as) * Math.sin(pas));
    zas2 = (r * ct02as);
    x2 = ((xas2 * cpsas) + (zas2 * spsas));
    z2 = (((-xas2) * spsas) + (zas2 * cpsas));
    xi = [x2, y2, z2, ps];
    d2 = condip1(xi);
    bx2 = 0.0;
    by2 = 0.0;
    bz2 = 0.0;
    for (i = 0; i < 79; i++) {
      bx2 = (bx2 + (c2[i] * d2[0][i]));
      by2 = (by2 + (c2[i] * d2[1][i]));
      bz2 = (bz2 + (c2[i] * d2[2][i]));
    }
    ss = Math.sqrt(((((x2 - x1) ** 2) + ((y2 - y1) ** 2)) + ((z2 - z1) ** 2)));
    ds = Math.sqrt(((((x - x1) ** 2) + ((y - y1) ** 2)) + ((z - z1) ** 2)));
    frac = (ds / ss);
    bx = ((bx1 * (1 - frac)) + (bx2 * frac));
    by = ((by1 * (1 - frac)) + (by2 * frac));
    bz = ((bz1 * (1 - frac)) + (bz2 * frac));
  } else if (loc === 4) {
    t01 = (tetr1s - dtet0);
    t02 = (tetr1s + dtet0);
    sqr = Math.sqrt(r);
    st01as = (sqr / (((r3 + (1 / (Math.sin(t01) ** 6))) - 1) ** 0.1666666667));
    st02as = (sqr / (((r3 + (1 / (Math.sin(t02) ** 6))) - 1) ** 0.1666666667));
    ct01as = (-Math.sqrt((1 - (st01as ** 2))));
    ct02as = (-Math.sqrt((1 - (st02as ** 2))));
    xas1 = ((r * st01as) * Math.cos(pas));
    y1 = ((r * st01as) * Math.sin(pas));
    zas1 = (r * ct01as);
    x1 = ((xas1 * cpsas) + (zas1 * spsas));
    z1 = (((-xas1) * spsas) + (zas1 * cpsas));
    xi = [x1, y1, z1, ps];
    d2 = condip1(xi);
    bx1 = 0.0;
    by1 = 0.0;
    bz1 = 0.0;
    for (i = 0; i < 79; i++) {
      bx1 = (bx1 + (c2[i] * d2[0][i]));
      by1 = (by1 + (c2[i] * d2[1][i]));
      bz1 = (bz1 + (c2[i] * d2[2][i]));
    }
    xas2 = ((r * st02as) * Math.cos(pas));
    y2 = ((r * st02as) * Math.sin(pas));
    zas2 = (r * ct02as);
    x2 = ((xas2 * cpsas) + (zas2 * spsas));
    z2 = (((-xas2) * spsas) + (zas2 * cpsas));
    xi = [x2, y2, z2, ps];
    d1 = diploop1(xi);
    bx2 = 0.0;
    by2 = 0.0;
    bz2 = 0.0;
    for (i = 0; i < 26; i++) {
      bx2 = (bx2 + (c1[i] * d1[0][i]));
      by2 = (by2 + (c1[i] * d1[1][i]));
      bz2 = (bz2 + (c1[i] * d1[2][i]));
    }
    ss = Math.sqrt(((((x2 - x1) ** 2) + ((y2 - y1) ** 2)) + ((z2 - z1) ** 2)));
    ds = Math.sqrt(((((x - x1) ** 2) + ((y - y1) ** 2)) + ((z - z1) ** 2)));
    frac = (ds / ss);
    bx = ((bx1 * (1 - frac)) + (bx2 * frac));
    by = ((by1 * (1 - frac)) + (by2 * frac));
    bz = ((bz1 * (1 - frac)) + (bz2 * frac));
  } else {
    throw new Error('T96: an argument outside its domain');
  }
  [bsx, bsy, bsz] = birk1shld(ps, x, y, z);
  bx = (bx + bsx);
  by = (by + bsy);
  bz = (bz + bsz);
  return [bx, by, bz];
}

function diploop1(xi: number[]): number[][] {
  let x: number = 0, y: number = 0, z: number = 0, ps: number = 0, sps: number = 0, d: number[][] = [], i: number = 0, r2: number = 0, r: number = 0, rmrh: number = 0, rprh: number = 0, dr2: number = 0, sqm: number = 0, sqp: number = 0, c: number = 0, q: number = 0, spsas: number = 0, cpsas: number = 0, xd: number = 0, yd: number = 0, zd: number = 0, bx1x: number = 0, by1x: number = 0, bz1x: number = 0, _bx1y: number = 0, _by1y: number = 0, _bz1y: number = 0, bx1z: number = 0, by1z: number = 0, bz1z: number = 0, bx2x: number = 0, by2x: number = 0, bz2x: number = 0, _bx2y: number = 0, _by2y: number = 0, _bz2y: number = 0, bx2z: number = 0, by2z: number = 0, bz2z: number = 0, xoct1: number = 0, yoct1: number = 0, zoct1: number = 0, bxoct1: number = 0, byoct1: number = 0, bzoct1: number = 0, xoct2: number = 0, yoct2: number = 0, zoct2: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  [x, y, z, ps] = xi;
  sps = Math.sin(ps);
  d = matrix(3, 26);
  for (i = 0; i < 12; i++) {
    r2 = (((xx1[i] * dipx) ** 2) + ((yy1[i] * dipy) ** 2));
    r = Math.sqrt(r2);
    rmrh = (r - rh);
    rprh = (r + rh);
    dr2 = (dr ** 2);
    sqm = Math.sqrt(((rmrh ** 2) + dr2));
    sqp = Math.sqrt(((rprh ** 2) + dr2));
    c = (sqp - sqm);
    q = (Math.sqrt((((rh + 1) ** 2) + dr2)) - Math.sqrt((((rh - 1) ** 2) + dr2)));
    spsas = (((sps / r) * c) / q);
    cpsas = Math.sqrt((1 - (spsas ** 2)));
    xd = ((xx1[i] * dipx) * cpsas);
    yd = (yy1[i] * dipy);
    zd = ((-(xx1[i] * dipx)) * spsas);
    [bx1x, by1x, bz1x, _bx1y, _by1y, _bz1y, bx1z, by1z, bz1z] = dipxyz((x - xd), (y - yd), (z - zd));
    if (Math.abs(yd) > 1e-10) {
      [bx2x, by2x, bz2x, _bx2y, _by2y, _bz2y, bx2z, by2z, bz2z] = dipxyz((x - xd), (y + yd), (z - zd));
    } else {
      bx2x = 0.0;
      by2x = 0.0;
      bz2x = 0.0;
      bx2z = 0.0;
      by2z = 0.0;
      bz2z = 0.0;
    }
    d[0][i] = (bx1z + bx2z);
    d[1][i] = (by1z + by2z);
    d[2][i] = (bz1z + bz2z);
    d[0][(i + 12)] = ((bx1x + bx2x) * sps);
    d[1][(i + 12)] = ((by1x + by2x) * sps);
    d[2][(i + 12)] = ((bz1x + bz2x) * sps);
  }
  r2 = ((xcentre[0] + radius[0]) ** 2);
  r = Math.sqrt(r2);
  rmrh = (r - rh);
  rprh = (r + rh);
  dr2 = (dr ** 2);
  sqm = Math.sqrt(((rmrh ** 2) + dr2));
  sqp = Math.sqrt(((rprh ** 2) + dr2));
  c = (sqp - sqm);
  q = (Math.sqrt((((rh + 1) ** 2) + dr2)) - Math.sqrt((((rh - 1) ** 2) + dr2)));
  spsas = (((sps / r) * c) / q);
  cpsas = Math.sqrt((1 - (spsas ** 2)));
  xoct1 = ((x * cpsas) - (z * spsas));
  yoct1 = y;
  zoct1 = ((x * spsas) + (z * cpsas));
  [bxoct1, byoct1, bzoct1] = crosslp(xoct1, yoct1, zoct1, xcentre[0], radius[0], tilt);
  d[0][24] = ((bxoct1 * cpsas) + (bzoct1 * spsas));
  d[1][24] = byoct1;
  d[2][24] = (((-bxoct1) * spsas) + (bzoct1 * cpsas));
  r2 = ((radius[1] - xcentre[1]) ** 2);
  r = Math.sqrt(r2);
  rmrh = (r - rh);
  rprh = (r + rh);
  dr2 = (dr ** 2);
  sqm = Math.sqrt(((rmrh ** 2) + dr2));
  sqp = Math.sqrt(((rprh ** 2) + dr2));
  c = (sqp - sqm);
  q = (Math.sqrt((((rh + 1) ** 2) + dr2)) - Math.sqrt((((rh - 1) ** 2) + dr2)));
  spsas = (((sps / r) * c) / q);
  cpsas = Math.sqrt((1 - (spsas ** 2)));
  xoct2 = (((x * cpsas) - (z * spsas)) - xcentre[1]);
  yoct2 = y;
  zoct2 = ((x * spsas) + (z * cpsas));
  [bx, by, bz] = circle(xoct2, yoct2, zoct2, radius[1]);
  d[0][25] = ((bx * cpsas) + (bz * spsas));
  d[1][25] = by;
  d[2][25] = (((-bx) * spsas) + (bz * cpsas));
  return d;
}

function dipxyz(x: number, y: number, z: number): number[] {
  let x2: number = 0, y2: number = 0, z2: number = 0, r2: number = 0, xmr5: number = 0, xmr53: number = 0, bxx: number = 0, byx: number = 0, bzx: number = 0, bxy: number = 0, byy: number = 0, bzy: number = 0, bxz: number = 0, byz: number = 0, bzz: number = 0;
  x2 = (x ** 2);
  y2 = (y ** 2);
  z2 = (z ** 2);
  r2 = ((x2 + y2) + z2);
  xmr5 = (30574 / ((r2 * r2) * Math.sqrt(r2)));
  xmr53 = (3 * xmr5);
  bxx = (xmr5 * ((3 * x2) - r2));
  byx = ((xmr53 * x) * y);
  bzx = ((xmr53 * x) * z);
  bxy = byx;
  byy = (xmr5 * ((3 * y2) - r2));
  bzy = ((xmr53 * y) * z);
  bxz = bzx;
  byz = bzy;
  bzz = (xmr5 * ((3 * z2) - r2));
  return [bxx, byx, bzx, bxy, byy, bzy, bxz, byz, bzz];
}

function crosslp(x: number, y: number, z: number, xc: number, rl: number, al: number): number[] {
  let cal: number = 0, sal: number = 0, y1: number = 0, z1: number = 0, y2: number = 0, z2: number = 0, bx1: number = 0, by1: number = 0, bz1: number = 0, bx2: number = 0, by2: number = 0, bz2: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  cal = Math.cos(al);
  sal = Math.sin(al);
  y1 = ((y * cal) - (z * sal));
  z1 = ((y * sal) + (z * cal));
  y2 = ((y * cal) + (z * sal));
  z2 = (((-y) * sal) + (z * cal));
  [bx1, by1, bz1] = circle((x - xc), y1, z1, rl);
  [bx2, by2, bz2] = circle((x - xc), y2, z2, rl);
  bx = (bx1 + bx2);
  by = (((by1 + by2) * cal) + ((bz1 - bz2) * sal));
  bz = (((-(by1 - by2)) * sal) + ((bz1 + bz2) * cal));
  return [bx, by, bz];
}

function circle(x: number, y: number, z: number, rl: number): number[] {
  let rho2: number = 0, rho: number = 0, r22: number = 0, r2: number = 0, r12: number = 0, r32: number = 0, xk2: number = 0, xk2s: number = 0, dl: number = 0, k: number = 0, e: number = 0, brho: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  rho2 = ((x * x) + (y * y));
  rho = Math.sqrt(rho2);
  r22 = ((z * z) + ((rho + rl) ** 2));
  r2 = Math.sqrt(r22);
  r12 = (r22 - ((4 * rho) * rl));
  r32 = (0.5 * (r12 + r22));
  xk2 = (1 - (r12 / r22));
  xk2s = (1 - xk2);
  dl = Math.log((1 / xk2s));
  k = ((1.38629436112 + (xk2s * (0.09666344259 + (xk2s * (0.03590092383 + (xk2s * (0.03742563713 + (xk2s * 0.01451196212)))))))) + (dl * (0.5 + (xk2s * (0.12498593597 + (xk2s * (0.06880248576 + (xk2s * (0.03328355346 + (xk2s * 0.00441787012))))))))));
  e = ((1 + (xk2s * (0.44325141463 + (xk2s * (0.0626060122 + (xk2s * (0.04757383546 + (xk2s * 0.01736506451)))))))) + ((dl * xk2s) * (0.2499836831 + (xk2s * (0.09200180037 + (xk2s * (0.04069697526 + (xk2s * 0.00526449639))))))));
  if (rho > 1e-06) {
    brho = ((z / (rho2 * r2)) * (((r32 / r12) * e) - k));
  } else {
    brho = ((((((Math.PI * rl) / r2) * (rl - rho)) / r12) * z) / (r32 - rho2));
  }
  bx = (brho * x);
  by = (brho * y);
  bz = ((k - ((e * (r32 - ((2 * rl) * rl))) / r12)) / r2);
  return [bx, by, bz];
}

function condip1(xi: number[]): number[][] {
  let x: number = 0, y: number = 0, z: number = 0, ps: number = 0, sps: number = 0, cps: number = 0, d: number[][] = [], cf: number[] = [], sf: number[] = [], xsm: number = 0, zsm: number = 0, ro2: number = 0, ro: number = 0, r2: number = 0, r: number = 0, c: number = 0, s: number = 0, ch: number = 0, sh: number = 0, tnh: number = 0, cnh: number = 0, m: number = 0, m1: number = 0, bt: number = 0, bf: number = 0, bxsm: number = 0, by: number = 0, bzsm: number = 0, i: number = 0, xd: number = 0, yd: number = 0, zd: number = 0, bx1x: number = 0, by1x: number = 0, bz1x: number = 0, bx1y: number = 0, by1y: number = 0, bz1y: number = 0, bx1z: number = 0, by1z: number = 0, bz1z: number = 0, bx2x: number = 0, by2x: number = 0, bz2x: number = 0, bx2y: number = 0, by2y: number = 0, bz2y: number = 0, bx2z: number = 0, by2z: number = 0, bz2z: number = 0, bx3x: number = 0, by3x: number = 0, bz3x: number = 0, bx3y: number = 0, by3y: number = 0, bz3y: number = 0, bx3z: number = 0, by3z: number = 0, bz3z: number = 0, bx4x: number = 0, by4x: number = 0, bz4x: number = 0, bx4y: number = 0, by4y: number = 0, bz4y: number = 0, bx4z: number = 0, by4z: number = 0, bz4z: number = 0, ix: number = 0, iy: number = 0, iz: number = 0;
  [x, y, z, ps] = xi;
  sps = Math.sin(ps);
  cps = Math.cos(ps);
  d = matrix(3, 79);
  cf = zeros(5);
  sf = zeros(5);
  xsm = (((x * cps) - (z * sps)) - dx);
  zsm = ((z * cps) + (x * sps));
  ro2 = ((xsm ** 2) + (y ** 2));
  ro = Math.sqrt(ro2);
  cf[0] = (xsm / ro);
  sf[0] = (y / ro);
  cf[1] = ((cf[0] ** 2) - (sf[0] ** 2));
  sf[1] = ((2 * sf[0]) * cf[0]);
  cf[2] = ((cf[1] * cf[0]) - (sf[1] * sf[0]));
  sf[2] = ((sf[1] * cf[0]) + (cf[1] * sf[0]));
  cf[3] = ((cf[2] * cf[0]) - (sf[2] * sf[0]));
  sf[3] = ((sf[2] * cf[0]) + (cf[2] * sf[0]));
  cf[4] = ((cf[3] * cf[0]) - (sf[3] * sf[0]));
  sf[4] = ((sf[3] * cf[0]) + (cf[3] * sf[0]));
  r2 = (ro2 + (zsm ** 2));
  r = Math.sqrt(r2);
  c = (zsm / r);
  s = (ro / r);
  ch = Math.sqrt((0.5 * (1 + c)));
  sh = Math.sqrt((0.5 * (1 - c)));
  tnh = (sh / ch);
  cnh = (1 / tnh);
  for (m = 0; m < 5; m++) {
    m1 = (m + 1);
    bt = (((m1 * cf[m]) / (r * s)) * ((tnh ** m1) + (cnh ** m1)));
    bf = (((((-0.5) * m1) * sf[m]) / r) * (((tnh ** m) / (ch ** 2)) - ((cnh ** m) / (sh ** 2))));
    bxsm = (((bt * c) * cf[0]) - (bf * sf[0]));
    by = (((bt * c) * sf[0]) + (bf * cf[0]));
    bzsm = ((-bt) * s);
    d[0][m] = ((bxsm * cps) + (bzsm * sps));
    d[1][m] = by;
    d[2][m] = (((-bxsm) * sps) + (bzsm * cps));
  }
  xsm = ((x * cps) - (z * sps));
  zsm = ((z * cps) + (x * sps));
  for (i = 0; i < 9; i++) {
    if (((i === 2) || (i === 4)) || (i === 5)) {
      xd = (xx2[i] * scalein);
      yd = (yy2[i] * scalein);
    } else {
      xd = (xx2[i] * scaleout);
      yd = (yy2[i] * scaleout);
    }
    zd = zz2[i];
    [bx1x, by1x, bz1x, bx1y, by1y, bz1y, bx1z, by1z, bz1z] = dipxyz((xsm - xd), (y - yd), (zsm - zd));
    [bx2x, by2x, bz2x, bx2y, by2y, bz2y, bx2z, by2z, bz2z] = dipxyz((xsm - xd), (y + yd), (zsm - zd));
    [bx3x, by3x, bz3x, bx3y, by3y, bz3y, bx3z, by3z, bz3z] = dipxyz((xsm - xd), (y - yd), (zsm + zd));
    [bx4x, by4x, bz4x, bx4y, by4y, bz4y, bx4z, by4z, bz4z] = dipxyz((xsm - xd), (y + yd), (zsm + zd));
    ix = ((i * 3) + 5);
    iy = (ix + 1);
    iz = (iy + 1);
    d[0][ix] = (((((bx1x + bx2x) - bx3x) - bx4x) * cps) + ((((bz1x + bz2x) - bz3x) - bz4x) * sps));
    d[1][ix] = (((by1x + by2x) - by3x) - by4x);
    d[2][ix] = (((((bz1x + bz2x) - bz3x) - bz4x) * cps) - ((((bx1x + bx2x) - bx3x) - bx4x) * sps));
    d[0][iy] = (((((bx1y - bx2y) - bx3y) + bx4y) * cps) + ((((bz1y - bz2y) - bz3y) + bz4y) * sps));
    d[1][iy] = (((by1y - by2y) - by3y) + by4y);
    d[2][iy] = (((((bz1y - bz2y) - bz3y) + bz4y) * cps) - ((((bx1y - bx2y) - bx3y) + bx4y) * sps));
    d[0][iz] = (((((bx1z + bx2z) + bx3z) + bx4z) * cps) + ((((bz1z + bz2z) + bz3z) + bz4z) * sps));
    d[1][iz] = (((by1z + by2z) + by3z) + by4z);
    d[2][iz] = (((((bz1z + bz2z) + bz3z) + bz4z) * cps) - ((((bx1z + bx2z) + bx3z) + bx4z) * sps));
    ix = (ix + 27);
    iy = (iy + 27);
    iz = (iz + 27);
    d[0][ix] = (sps * (((((bx1x + bx2x) + bx3x) + bx4x) * cps) + ((((bz1x + bz2x) + bz3x) + bz4x) * sps)));
    d[1][ix] = (sps * (((by1x + by2x) + by3x) + by4x));
    d[2][ix] = (sps * (((((bz1x + bz2x) + bz3x) + bz4x) * cps) - ((((bx1x + bx2x) + bx3x) + bx4x) * sps)));
    d[0][iy] = (sps * (((((bx1y - bx2y) + bx3y) - bx4y) * cps) + ((((bz1y - bz2y) + bz3y) - bz4y) * sps)));
    d[1][iy] = (sps * (((by1y - by2y) + by3y) - by4y));
    d[2][iy] = (sps * (((((bz1y - bz2y) + bz3y) - bz4y) * cps) - ((((bx1y - bx2y) + bx3y) - bx4y) * sps)));
    d[0][iz] = (sps * (((((bx1z + bx2z) - bx3z) - bx4z) * cps) + ((((bz1z + bz2z) - bz3z) - bz4z) * sps)));
    d[1][iz] = (sps * (((by1z + by2z) - by3z) - by4z));
    d[2][iz] = (sps * (((((bz1z + bz2z) - bz3z) - bz4z) * cps) - ((((bx1z + bx2z) - bx3z) - bx4z) * sps)));
  }
  for (i = 0; i < 5; i++) {
    zd = zz2[(i + 9)];
    [bx1x, by1x, bz1x, bx1y, by1y, bz1y, bx1z, by1z, bz1z] = dipxyz(xsm, y, (zsm - zd));
    [bx2x, by2x, bz2x, bx2y, by2y, bz2y, bx2z, by2z, bz2z] = dipxyz(xsm, y, (zsm + zd));
    ix = (59 + (i * 2));
    iz = (ix + 1);
    d[0][ix] = (((bx1x - bx2x) * cps) + ((bz1x - bz2x) * sps));
    d[1][ix] = (by1x - by2x);
    d[2][ix] = (((bz1x - bz2x) * cps) - ((bx1x - bx2x) * sps));
    d[0][iz] = (((bx1z + bx2z) * cps) + ((bz1z + bz2z) * sps));
    d[1][iz] = (by1z + by2z);
    d[2][iz] = (((bz1z + bz2z) * cps) - ((bx1z + bx2z) * sps));
    ix = (ix + 10);
    iz = (iz + 10);
    d[0][ix] = (sps * (((bx1x + bx2x) * cps) + ((bz1x + bz2x) * sps)));
    d[1][ix] = (sps * (by1x + by2x));
    d[2][ix] = (sps * (((bz1x + bz2x) * cps) - ((bx1x + bx2x) * sps)));
    d[0][iz] = (sps * (((bx1z - bx2z) * cps) + ((bz1z - bz2z) * sps)));
    d[1][iz] = (sps * (by1z - by2z));
    d[2][iz] = (sps * (((bz1z - bz2z) * cps) - ((bx1z - bx2z) * sps)));
  }
  return d;
}

function birk1shld(ps: number, x: number, y: number, z: number): number[] {
  let a: number[] = [], p1: number[] = [], r1: number[] = [], q1: number[] = [], s1: number[] = [], rp: number[] = [], rr: number[] = [], rq: number[] = [], rs: number[] = [], bx: number = 0, by: number = 0, bz: number = 0, cps: number = 0, sps: number = 0, s3ps: number = 0, l: number = 0, m: number = 0, i: number = 0, cypi: number = 0, cyqi: number = 0, sypi: number = 0, syqi: number = 0, k: number = 0, szrk: number = 0, czsk: number = 0, czrk: number = 0, szsk: number = 0, sqpr: number = 0, sqqs: number = 0, epr: number = 0, eqs: number = 0, n: number = 0, hx: number = 0, hy: number = 0, hz: number = 0;
  a = [1.174198045, (-1.463820502), 4.840161537, (-3.674506864), 82.18368896, (-94.94071588), (-4122.331796), 4670.278676, (-21.54975037), 26.72661293, (-72.81365728), 44.09887902, 40.08073706, (-51.2356351), 1955.348537, (-1940.97155), 794.0496433, (-982.2441344), 1889.837171, (-558.9779727), (-1260.543238), 1260.063802, (-293.5942373), 344.7250789, (-773.7002492), 957.0094135, (-1824.143669), 520.7994379, 1192.484774, (-1192.184565), 89.15537624, (-98.52042999), (-0.08168777675), 0.04255969908, 0.3155237661, (-0.3841755213), 2.494553332, (-0.06571440817), (-2.76566131), 0.4331001908, 0.1099181537, (-0.0615412698), (-0.325864926), 0.6698439193, (-5.542735524), 0.1604203535, 5.854456934, (-0.8323632049), 3.732608869, (-3.130002153), 107.0972607, (-32.28483411), (-115.2389298), 54.4506436, (-0.582685332), (-3.582482231), (-4.046544561), 3.311978102, (-104.0839563), 30.26401293, 97.29109008, (-50.62370872), (-296.3734955), 127.7872523, 5.303648988, 10.40368955, 69.65230348, 466.5099509, 1.645049286, 3.82583819, 11.66675599, 558.9781177, 1.826531343, 2.066018073, 25.40971369, 990.2795225, 2.319489258, 4.555148484, 9.691185703, 591.8280358];
  p1 = a.slice(64, 68);
  r1 = a.slice(68, 72);
  q1 = a.slice(72, 76);
  s1 = a.slice(76, 80);
  rp = p1.map((v) => 1 / v);
  rr = r1.map((v) => 1 / v);
  rq = q1.map((v) => 1 / v);
  rs = s1.map((v) => 1 / v);
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  cps = Math.cos(ps);
  sps = Math.sin(ps);
  s3ps = ((4 * (cps ** 2)) - 1);
  l = 0;
  for (m = 0; m < 2; m++) {
    for (i = 0; i < 4; i++) {
      cypi = Math.cos((y * rp[i]));
      cyqi = Math.cos((y * rq[i]));
      sypi = Math.sin((y * rp[i]));
      syqi = Math.sin((y * rq[i]));
      for (k = 0; k < 4; k++) {
        szrk = Math.sin((z * rr[k]));
        czsk = Math.cos((z * rs[k]));
        czrk = Math.cos((z * rr[k]));
        szsk = Math.sin((z * rs[k]));
        sqpr = Math.sqrt(((rp[i] ** 2) + (rr[k] ** 2)));
        sqqs = Math.sqrt(((rq[i] ** 2) + (rs[k] ** 2)));
        epr = Math.exp((x * sqpr));
        eqs = Math.exp((x * sqqs));
        for (n = 0; n < 2; n++) {
          if (m === 0) {
            if (n === 0) {
              hx = ((((-sqpr) * epr) * cypi) * szrk);
              hy = (((rp[i] * epr) * sypi) * szrk);
              hz = ((((-rr[k]) * epr) * cypi) * czrk);
            } else {
              hx = (hx * cps);
              hy = (hy * cps);
              hz = (hz * cps);
            }
          } else if (n === 0) {
            hx = (((((-sps) * sqqs) * eqs) * cyqi) * czsk);
            hy = ((((sps * rq[i]) * eqs) * syqi) * czsk);
            hz = ((((sps * rs[k]) * eqs) * cyqi) * szsk);
          } else {
            hx = (hx * s3ps);
            hy = (hy * s3ps);
            hz = (hz * s3ps);
          }
          bx = (bx + (a[l] * hx));
          by = (by + (a[l] * hy));
          bz = (bz + (a[l] * hz));
          l = (l + 1);
        }
      }
    }
  }
  return [bx, by, bz];
}

function birk2tot_02(ps: number, x: number, y: number, z: number): number[] {
  let wx: number = 0, wy: number = 0, wz: number = 0, hx: number = 0, hy: number = 0, hz: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  [wx, wy, wz] = birk2shl(x, y, z, ps);
  [hx, hy, hz] = r2_birk(x, y, z, ps);
  bx = (wx + hx);
  by = (wy + hy);
  bz = (wz + hz);
  return [bx, by, bz];
}

function birk2shl(x: number, y: number, z: number, ps: number): number[] {
  let a: number[] = [], p: number[] = [], r: number[] = [], q: number[] = [], s: number[] = [], cps: number = 0, sps: number = 0, s3ps: number = 0, hx: number = 0, hy: number = 0, hz: number = 0, l: number = 0, m: number = 0, i: number = 0, cypi: number = 0, cyqi: number = 0, sypi: number = 0, syqi: number = 0, k: number = 0, szrk: number = 0, czsk: number = 0, czrk: number = 0, szsk: number = 0, sqpr: number = 0, sqqs: number = 0, epr: number = 0, eqs: number = 0, n: number = 0, dx: number = 0, dy: number = 0, dz: number = 0;
  a = [(-111.6371348), 124.5402702, 110.3735178, (-122.0095905), 111.9448247, (-129.1957743), (-110.7586562), 126.5649012, (-0.7865034384), (-0.2483462721), 0.8026023894, 0.2531397188, 10.72890902, 0.8483902118, (-10.96884315), (-0.8583297219), 13.85650567, 14.905545, 10.21914434, 10.09021632, 6.34038246, 14.40432686, 12.71023437, 12.83966657];
  p = a.slice(16, 18);
  r = a.slice(18, 20);
  q = a.slice(20, 22);
  s = a.slice(22, 24);
  cps = Math.cos(ps);
  sps = Math.sin(ps);
  s3ps = ((4 * (cps ** 2)) - 1);
  hx = 0.0;
  hy = 0.0;
  hz = 0.0;
  l = 0;
  for (m = 0; m < 2; m++) {
    for (i = 0; i < 2; i++) {
      cypi = Math.cos((y / p[i]));
      cyqi = Math.cos((y / q[i]));
      sypi = Math.sin((y / p[i]));
      syqi = Math.sin((y / q[i]));
      for (k = 0; k < 2; k++) {
        szrk = Math.sin((z / r[k]));
        czsk = Math.cos((z / s[k]));
        czrk = Math.cos((z / r[k]));
        szsk = Math.sin((z / s[k]));
        sqpr = Math.sqrt(((1 / (p[i] ** 2)) + (1 / (r[k] ** 2))));
        sqqs = Math.sqrt(((1 / (q[i] ** 2)) + (1 / (s[k] ** 2))));
        epr = Math.exp((x * sqpr));
        eqs = Math.exp((x * sqqs));
        for (n = 0; n < 2; n++) {
          if (m === 0) {
            if (n === 0) {
              dx = ((((-sqpr) * epr) * cypi) * szrk);
              dy = (((epr / p[i]) * sypi) * szrk);
              dz = ((((-epr) / r[k]) * cypi) * czrk);
              hx = (hx + (a[l] * dx));
              hy = (hy + (a[l] * dy));
              hz = (hz + (a[l] * dz));
            } else {
              dx = (dx * cps);
              dy = (dy * cps);
              dz = (dz * cps);
              hx = (hx + (a[l] * dx));
              hy = (hy + (a[l] * dy));
              hz = (hz + (a[l] * dz));
            }
          } else if (n === 0) {
            dx = (((((-sps) * sqqs) * eqs) * cyqi) * czsk);
            dy = ((((sps * eqs) / q[i]) * syqi) * czsk);
            dz = ((((sps * eqs) / s[k]) * cyqi) * szsk);
            hx = (hx + (a[l] * dx));
            hy = (hy + (a[l] * dy));
            hz = (hz + (a[l] * dz));
          } else {
            dx = (dx * s3ps);
            dy = (dy * s3ps);
            dz = (dz * s3ps);
            hx = (hx + (a[l] * dx));
            hy = (hy + (a[l] * dy));
            hz = (hz + (a[l] * dz));
          }
          l += 1;
        }
      }
    }
  }
  return [hx, hy, hz];
}

function r2_birk(x: number, y: number, z: number, ps: number): number[] {
  let delarg: number = 0, delarg1: number = 0, _psi: number = 0, cps: number = 0, sps: number = 0, xsm: number = 0, zsm: number = 0, xks: number = 0, bxsm: number = 0, by: number = 0, bzsm: number = 0, f2: number = 0, f1: number = 0, bxsm1: number = 0, by1: number = 0, bzsm1: number = 0, bxsm2: number = 0, by2: number = 0, bzsm2: number = 0, bx: number = 0, bz: number = 0;
  delarg = 0.03;
  delarg1 = 0.015;
  _psi = ps;
  cps = Math.cos(ps);
  sps = Math.sin(ps);
  xsm = ((x * cps) - (z * sps));
  zsm = ((z * cps) + (x * sps));
  xks = xksi(xsm, y, zsm);
  if (xks < (-(delarg + delarg1))) {
    [bxsm, by, bzsm] = dot(r2outer(xsm, y, zsm), (-0.02));
  } else if (xks < ((-delarg) + delarg1)) {
    f2 = ((-0.02) * tksi(xks, (-delarg), delarg1));
    f1 = ((-0.02) - f2);
    [bxsm1, by1, bzsm1] = dot(r2outer(xsm, y, zsm), f1);
    [bxsm2, by2, bzsm2] = dot(r2sheet(xsm, y, zsm), f2);
    bxsm = (bxsm1 + bxsm2);
    by = (by1 + by2);
    bzsm = (bzsm1 + bzsm2);
  } else if (xks < (delarg - delarg1)) {
    [bxsm, by, bzsm] = dot(r2sheet(xsm, y, zsm), (-0.02));
  } else if (xks < (delarg + delarg1)) {
    f1 = ((-0.02) * tksi(xks, delarg, delarg1));
    f2 = ((-0.02) - f1);
    [bxsm1, by1, bzsm1] = dot(r2inner(xsm, y, zsm), f1);
    [bxsm2, by2, bzsm2] = dot(r2sheet(xsm, y, zsm), f2);
    bxsm = (bxsm1 + bxsm2);
    by = (by1 + by2);
    bzsm = (bzsm1 + bzsm2);
  } else {
    [bxsm, by, bzsm] = dot(r2inner(xsm, y, zsm), (-0.02));
  }
  bx = ((bxsm * cps) + (bzsm * sps));
  bz = ((bzsm * cps) - (bxsm * sps));
  return [bx, by, bz];
}

function xksi(x: number, y: number, z: number): number {
  let a11a12: number = 0, a21a22: number = 0, a41a42: number = 0, a51a52: number = 0, a61a62: number = 0, b11b12: number = 0, b21b22: number = 0, c61c62: number = 0, c71c72: number = 0, r0: number = 0, dr: number = 0, tnoon: number = 0, dteta: number = 0, dr2: number = 0, x2: number = 0, y2: number = 0, z2: number = 0, _xy: number = 0, r2: number = 0, r: number = 0, xr: number = 0, yr: number = 0, zr: number = 0, pr: number = 0, f: number = 0, g: number = 0, h: number = 0, g2: number = 0, fgh: number = 0, fgh32: number = 0, fchsg2: number = 0, xksi: number = 0, sqfchsg2: number = 0, alpha: number = 0, theta: number = 0, phi: number = 0;
  a11a12 = 0.305662;
  a21a22 = (-0.383593);
  a41a42 = 0.2677733;
  a51a52 = (-0.097656);
  a61a62 = (-0.636034);
  b11b12 = (-0.359862);
  b21b22 = 0.424706;
  c61c62 = (-0.126366);
  c71c72 = 0.292578;
  r0 = 1.21563;
  dr = 7.50937;
  tnoon = 0.3665191;
  dteta = 0.09599309;
  dr2 = (dr * dr);
  x2 = (x * x);
  y2 = (y * y);
  z2 = (z * z);
  _xy = (x * y);
  r2 = ((x2 + y2) + z2);
  r = Math.sqrt(r2);
  xr = (x / r);
  yr = (y / r);
  zr = (z / r);
  if (r < r0) {
    pr = 0;
  } else {
    pr = (Math.sqrt((((r - r0) ** 2) + dr2)) - dr);
  }
  f = (x + (pr * ((((a11a12 + (a21a22 * xr)) + ((a41a42 * xr) * xr)) + ((a51a52 * yr) * yr)) + ((a61a62 * zr) * zr))));
  g = (y + (pr * ((b11b12 * yr) + ((b21b22 * xr) * yr))));
  h = (z + (pr * ((c61c62 * zr) + ((c71c72 * xr) * zr))));
  g2 = (g * g);
  fgh = (((f ** 2) + g2) + (h ** 2));
  fgh32 = (Math.sqrt(fgh) ** 3);
  fchsg2 = ((f ** 2) + g2);
  if (fchsg2 < 1e-05) {
    xksi = (-1.0);
  } else {
    sqfchsg2 = Math.sqrt(fchsg2);
    alpha = (fchsg2 / fgh32);
    theta = (tnoon + ((0.5 * dteta) * (1 - (f / sqfchsg2))));
    phi = (Math.sin(theta) ** 2);
    xksi = (alpha - phi);
  }
  return xksi;
}

function tksi(xksi: number, xks0: number, dxksi: number): number {
  let tdz3: number = 0, tksii: number = 0, br3: number = 0;
  tdz3 = (2.0 * (dxksi ** 3));
  if ((xksi - xks0) < (-dxksi)) {
    tksii = 0.0;
  } else if (xksi < xks0) {
    br3 = (((xksi - xks0) + dxksi) ** 3);
    tksii = ((1.5 * br3) / (tdz3 + br3));
  } else if ((xksi - xks0) < dxksi) {
    br3 = (((xksi - xks0) - dxksi) ** 3);
    tksii = (1.0 + ((1.5 * br3) / (tdz3 - br3)));
  } else if ((xksi - xks0) >= dxksi) {
    tksii = 1.0;
  } else {
    throw new Error('T96: an argument outside its domain');
  }
  return tksii;
}

function fexp(s: number, a: number): number {
  if (a < 0) {
    return ((Math.sqrt((((-2) * a) * Math.E)) * s) * Math.exp(((a * s) * s)));
  } else {
    return (s * Math.exp((a * ((s * s) - 1))));
  }
}

function fexp1(s: number, a: number): number {
  if (a <= 0) {
    return Math.exp(((a * s) * s));
  } else {
    return Math.exp((a * ((s * s) - 1)));
  }
}

function r2outer(x: number, y: number, z: number): number[] {
  let pl1: number = 0, pl2: number = 0, pl3: number = 0, pl4: number = 0, pl5: number = 0, pn1: number = 0, pn2: number = 0, pn3: number = 0, pn4: number = 0, pn5: number = 0, pn6: number = 0, pn7: number = 0, pn8: number = 0, pn9: number = 0, pn10: number = 0, pn11: number = 0, pn12: number = 0, pn13: number = 0, pn14: number = 0, pn15: number = 0, pn16: number = 0, pn17: number = 0, dbx1: number = 0, dby1: number = 0, dbz1: number = 0, dbx2: number = 0, dby2: number = 0, dbz2: number = 0, dbx3: number = 0, dby3: number = 0, dbz3: number = 0, dbx4: number = 0, dby4: number = 0, dbz4: number = 0, dbx5: number = 0, dby5: number = 0, dbz5: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  pl1 = (-34.105);
  pl2 = (-2.00019);
  pl3 = 628.639;
  pl4 = 73.4847;
  pl5 = 12.5162;
  pn1 = 0.55;
  pn2 = 0.694;
  pn3 = 0.0031;
  pn4 = 1.55;
  pn5 = 2.8;
  pn6 = 0.1375;
  pn7 = (-0.7);
  pn8 = 0.2;
  pn9 = 0.9625;
  pn10 = (-2.994);
  pn11 = 2.925;
  pn12 = (-1.775);
  pn13 = 4.3;
  pn14 = (-0.275);
  pn15 = 2.7;
  pn16 = 0.4312;
  pn17 = 1.55;
  [dbx1, dby1, dbz1] = crosslp(x, y, z, pn1, pn2, pn3);
  [dbx2, dby2, dbz2] = crosslp(x, y, z, pn4, pn5, pn6);
  [dbx3, dby3, dbz3] = crosslp(x, y, z, pn7, pn8, pn9);
  [dbx4, dby4, dbz4] = circle((x - pn10), y, z, pn11);
  [dbx5, dby5, dbz5] = loops4(x, y, z, pn12, pn13, pn14, pn15, pn16, pn17);
  bx = (((((pl1 * dbx1) + (pl2 * dbx2)) + (pl3 * dbx3)) + (pl4 * dbx4)) + (pl5 * dbx5));
  by = (((((pl1 * dby1) + (pl2 * dby2)) + (pl3 * dby3)) + (pl4 * dby4)) + (pl5 * dby5));
  bz = (((((pl1 * dbz1) + (pl2 * dbz2)) + (pl3 * dbz3)) + (pl4 * dbz4)) + (pl5 * dbz5));
  return [bx, by, bz];
}

function loops4(x: number, y: number, z: number, xc: number, yc: number, zc: number, r: number, theta: number, phi: number): number[] {
  let ct: number = 0, st: number = 0, cp: number = 0, sp: number = 0, xs: number = 0, yss: number = 0, zs: number = 0, xss: number = 0, zss: number = 0, bxss: number = 0, bys: number = 0, bzss: number = 0, bxs: number = 0, bz1: number = 0, bx1: number = 0, by1: number = 0, bz2: number = 0, bx2: number = 0, by2: number = 0, bz3: number = 0, bx3: number = 0, by3: number = 0, bz4: number = 0, bx4: number = 0, by4: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  ct = Math.cos(theta);
  st = Math.sin(theta);
  cp = Math.cos(phi);
  sp = Math.sin(phi);
  xs = (((x - xc) * cp) + ((y - yc) * sp));
  yss = (((y - yc) * cp) - ((x - xc) * sp));
  zs = (z - zc);
  xss = ((xs * ct) - (zs * st));
  zss = ((zs * ct) + (xs * st));
  [bxss, bys, bzss] = circle(xss, yss, zss, r);
  bxs = ((bxss * ct) + (bzss * st));
  bz1 = ((bzss * ct) - (bxss * st));
  bx1 = ((bxs * cp) - (bys * sp));
  by1 = ((bxs * sp) + (bys * cp));
  xs = (((x - xc) * cp) - ((y + yc) * sp));
  yss = (((y + yc) * cp) + ((x - xc) * sp));
  zs = (z - zc);
  xss = ((xs * ct) - (zs * st));
  zss = ((zs * ct) + (xs * st));
  [bxss, bys, bzss] = circle(xss, yss, zss, r);
  bxs = ((bxss * ct) + (bzss * st));
  bz2 = ((bzss * ct) - (bxss * st));
  bx2 = ((bxs * cp) + (bys * sp));
  by2 = (((-bxs) * sp) + (bys * cp));
  xs = (((-(x - xc)) * cp) + ((y + yc) * sp));
  yss = (((-(y + yc)) * cp) - ((x - xc) * sp));
  zs = (z + zc);
  xss = ((xs * ct) - (zs * st));
  zss = ((zs * ct) + (xs * st));
  [bxss, bys, bzss] = circle(xss, yss, zss, r);
  bxs = ((bxss * ct) + (bzss * st));
  bz3 = ((bzss * ct) - (bxss * st));
  bx3 = (((-bxs) * cp) - (bys * sp));
  by3 = ((bxs * sp) - (bys * cp));
  xs = (((-(x - xc)) * cp) - ((y - yc) * sp));
  yss = (((-(y - yc)) * cp) + ((x - xc) * sp));
  zs = (z + zc);
  xss = ((xs * ct) - (zs * st));
  zss = ((zs * ct) + (xs * st));
  [bxss, bys, bzss] = circle(xss, yss, zss, r);
  bxs = ((bxss * ct) + (bzss * st));
  bz4 = ((bzss * ct) - (bxss * st));
  bx4 = (((-bxs) * cp) + (bys * sp));
  by4 = (((-bxs) * sp) - (bys * cp));
  bx = (((bx1 + bx2) + bx3) + bx4);
  by = (((by1 + by2) + by3) + by4);
  bz = (((bz1 + bz2) + bz3) + bz4);
  return [bx, by, bz];
}

function r2sheet(x: number, y: number, z: number): number[] {
  let pnonx1: number = 0, pnonx2: number = 0, pnonx3: number = 0, pnonx4: number = 0, pnonx5: number = 0, pnonx6: number = 0, pnonx7: number = 0, pnonx8: number = 0, pnony1: number = 0, pnony2: number = 0, pnony3: number = 0, pnony4: number = 0, pnony5: number = 0, pnony6: number = 0, pnony7: number = 0, pnony8: number = 0, pnonz1: number = 0, pnonz2: number = 0, pnonz3: number = 0, pnonz4: number = 0, pnonz5: number = 0, pnonz6: number = 0, pnonz7: number = 0, pnonz8: number = 0, a1: number = 0, a2: number = 0, a3: number = 0, a4: number = 0, a5: number = 0, a6: number = 0, a7: number = 0, a8: number = 0, a9: number = 0, a10: number = 0, a11: number = 0, a12: number = 0, a13: number = 0, a14: number = 0, a15: number = 0, a16: number = 0, a17: number = 0, a18: number = 0, a19: number = 0, a20: number = 0, a21: number = 0, a22: number = 0, a23: number = 0, a24: number = 0, a25: number = 0, a26: number = 0, a27: number = 0, a28: number = 0, a29: number = 0, a30: number = 0, a31: number = 0, a32: number = 0, a33: number = 0, a34: number = 0, a35: number = 0, a36: number = 0, a37: number = 0, a38: number = 0, a39: number = 0, a40: number = 0, a41: number = 0, a42: number = 0, a43: number = 0, a44: number = 0, a45: number = 0, a46: number = 0, a47: number = 0, a48: number = 0, a49: number = 0, a50: number = 0, a51: number = 0, a52: number = 0, a53: number = 0, a54: number = 0, a55: number = 0, a56: number = 0, a57: number = 0, a58: number = 0, a59: number = 0, a60: number = 0, a61: number = 0, a62: number = 0, a63: number = 0, a64: number = 0, a65: number = 0, a66: number = 0, a67: number = 0, a68: number = 0, a69: number = 0, a70: number = 0, a71: number = 0, a72: number = 0, a73: number = 0, a74: number = 0, a75: number = 0, a76: number = 0, a77: number = 0, a78: number = 0, a79: number = 0, a80: number = 0, b1: number = 0, b2: number = 0, b3: number = 0, b4: number = 0, b5: number = 0, b6: number = 0, b7: number = 0, b8: number = 0, b9: number = 0, b10: number = 0, b11: number = 0, b12: number = 0, b13: number = 0, b14: number = 0, b15: number = 0, b16: number = 0, b17: number = 0, b18: number = 0, b19: number = 0, b20: number = 0, b21: number = 0, b22: number = 0, b23: number = 0, b24: number = 0, b25: number = 0, b26: number = 0, b27: number = 0, b28: number = 0, b29: number = 0, b30: number = 0, b31: number = 0, b32: number = 0, b33: number = 0, b34: number = 0, b35: number = 0, b36: number = 0, b37: number = 0, b38: number = 0, b39: number = 0, b40: number = 0, b41: number = 0, b42: number = 0, b43: number = 0, b44: number = 0, b45: number = 0, b46: number = 0, b47: number = 0, b48: number = 0, b49: number = 0, b50: number = 0, b51: number = 0, b52: number = 0, b53: number = 0, b54: number = 0, b55: number = 0, b56: number = 0, b57: number = 0, b58: number = 0, b59: number = 0, b60: number = 0, b61: number = 0, b62: number = 0, b63: number = 0, b64: number = 0, b65: number = 0, b66: number = 0, b67: number = 0, b68: number = 0, b69: number = 0, b70: number = 0, b71: number = 0, b72: number = 0, b73: number = 0, b74: number = 0, b75: number = 0, b76: number = 0, b77: number = 0, b78: number = 0, b79: number = 0, b80: number = 0, c1: number = 0, c2: number = 0, c3: number = 0, c4: number = 0, c5: number = 0, c6: number = 0, c7: number = 0, c8: number = 0, c9: number = 0, c10: number = 0, c11: number = 0, c12: number = 0, c13: number = 0, c14: number = 0, c15: number = 0, c16: number = 0, c17: number = 0, c18: number = 0, c19: number = 0, c20: number = 0, c21: number = 0, c22: number = 0, c23: number = 0, c24: number = 0, c25: number = 0, c26: number = 0, c27: number = 0, c28: number = 0, c29: number = 0, c30: number = 0, c31: number = 0, c32: number = 0, c33: number = 0, c34: number = 0, c35: number = 0, c36: number = 0, c37: number = 0, c38: number = 0, c39: number = 0, c40: number = 0, c41: number = 0, c42: number = 0, c43: number = 0, c44: number = 0, c45: number = 0, c46: number = 0, c47: number = 0, c48: number = 0, c49: number = 0, c50: number = 0, c51: number = 0, c52: number = 0, c53: number = 0, c54: number = 0, c55: number = 0, c56: number = 0, c57: number = 0, c58: number = 0, c59: number = 0, c60: number = 0, c61: number = 0, c62: number = 0, c63: number = 0, c64: number = 0, c65: number = 0, c66: number = 0, c67: number = 0, c68: number = 0, c69: number = 0, c70: number = 0, c71: number = 0, c72: number = 0, c73: number = 0, c74: number = 0, c75: number = 0, c76: number = 0, c77: number = 0, c78: number = 0, c79: number = 0, c80: number = 0, xks: number = 0, t1x: number = 0, t2x: number = 0, t3x: number = 0, t1y: number = 0, t2y: number = 0, t3y: number = 0, t1z: number = 0, t2z: number = 0, t3z: number = 0, rho2: number = 0, r: number = 0, rho: number = 0, c1p: number = 0, s1p: number = 0, s2p: number = 0, c2p: number = 0, s3p: number = 0, c3p: number = 0, s4p: number = 0, ct: number = 0, _st: number = 0, s1: number = 0, s2: number = 0, s3: number = 0, s4: number = 0, s5: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  pnonx1 = (-19.0969);
  pnonx2 = (-9.28828);
  pnonx3 = (-0.129687);
  pnonx4 = 5.58594;
  pnonx5 = 22.5055;
  pnonx6 = 0.048375;
  pnonx7 = 0.0396953;
  pnonx8 = 0.0579023;
  pnony1 = (-13.675);
  pnony2 = (-6.70625);
  pnony3 = 2.31875;
  pnony4 = 11.4062;
  pnony5 = 20.4562;
  pnony6 = 0.047875;
  pnony7 = 0.036375;
  pnony8 = 0.05675;
  pnonz1 = (-16.7125);
  pnonz2 = (-16.4625);
  pnonz3 = (-0.1625);
  pnonz4 = 5.1;
  pnonz5 = 23.7125;
  pnonz6 = 0.0355625;
  pnonz7 = 0.031875;
  pnonz8 = 0.053875;
  a1 = 8.0719;
  a2 = (-7.39582);
  a3 = (-7.62341);
  a4 = 0.684671;
  a5 = (-13.5672);
  a6 = 11.6681;
  a7 = 13.1154;
  a8 = (-0.890217);
  a9 = 7.78726;
  a10 = (-5.38346);
  a11 = (-8.08738);
  a12 = 0.609385;
  a13 = (-2.7041);
  a14 = 3.53741;
  a15 = 3.15549;
  a16 = (-1.11069);
  a17 = (-8.47555);
  a18 = 0.278122;
  a19 = 2.73514;
  a20 = 4.55625;
  a21 = 13.1134;
  a22 = 1.15848;
  a23 = (-3.52648);
  a24 = (-8.24698);
  a25 = (-6.8571);
  a26 = (-2.81369);
  a27 = 2.03795;
  a28 = 4.64383;
  a29 = 2.49309;
  a30 = (-1.22041);
  a31 = (-1.67432);
  a32 = (-0.422526);
  a33 = (-5.39796);
  a34 = 7.10326;
  a35 = 5.5373;
  a36 = (-13.1918);
  a37 = 4.67853;
  a38 = (-7.60329);
  a39 = (-2.53066);
  a40 = 7.76338;
  a41 = 5.60165;
  a42 = 5.34816;
  a43 = (-4.56441);
  a44 = 7.05976;
  a45 = (-2.62723);
  a46 = (-0.529078);
  a47 = 1.42019;
  a48 = (-2.93919);
  a49 = 55.6338;
  a50 = (-1.55181);
  a51 = 39.8311;
  a52 = (-80.6561);
  a53 = (-46.9655);
  a54 = 32.8925;
  a55 = (-6.32296);
  a56 = 19.7841;
  a57 = 124.731;
  a58 = 10.4347;
  a59 = (-30.7581);
  a60 = 102.68;
  a61 = (-47.4037);
  a62 = (-3.31278);
  a63 = 9.37141;
  a64 = (-50.0268);
  a65 = (-533.319);
  a66 = 110.426;
  a67 = 1000.2;
  a68 = (-1051.4);
  a69 = 1619.48;
  a70 = 589.855;
  a71 = (-1462.73);
  a72 = 1087.1;
  a73 = (-1994.73);
  a74 = (-1654.12);
  a75 = 1263.33;
  a76 = (-260.21);
  a77 = 1424.84;
  a78 = 1255.71;
  a79 = (-956.733);
  a80 = 219.946;
  b1 = (-9.08427);
  b2 = 10.6777;
  b3 = 10.3288;
  b4 = (-0.969987);
  b5 = 6.45257;
  b6 = (-8.42508);
  b7 = (-7.97464);
  b8 = 1.41996;
  b9 = (-1.9249);
  b10 = 3.93575;
  b11 = 2.83283;
  b12 = (-1.48621);
  b13 = 0.244033;
  b14 = (-0.757941);
  b15 = (-0.386557);
  b16 = 0.344566;
  b17 = 9.56674;
  b18 = (-2.5365);
  b19 = (-3.32916);
  b20 = (-5.86712);
  b21 = (-6.19625);
  b22 = 1.83879;
  b23 = 2.52772;
  b24 = 4.34417;
  b25 = 1.87268;
  b26 = (-2.13213);
  b27 = (-1.69134);
  b28 = (-0.176379);
  b29 = (-0.261359);
  b30 = 0.566419;
  b31 = 0.3138;
  b32 = (-0.134699);
  b33 = (-3.83086);
  b34 = (-8.4154);
  b35 = 4.77005;
  b36 = (-9.31479);
  b37 = 37.5715;
  b38 = 19.3992;
  b39 = (-17.9582);
  b40 = 36.4604;
  b41 = (-14.9993);
  b42 = (-3.1442);
  b43 = 6.17409;
  b44 = (-15.5519);
  b45 = 2.28621;
  b46 = (-0.00891549);
  b47 = (-0.462912);
  b48 = 2.47314;
  b49 = 41.7555;
  b50 = 208.614;
  b51 = (-45.7861);
  b52 = (-77.8687);
  b53 = 239.357;
  b54 = (-67.9226);
  b55 = 66.8743;
  b56 = 238.534;
  b57 = (-112.136);
  b58 = 16.2069;
  b59 = (-40.4706);
  b60 = (-134.328);
  b61 = 21.56;
  b62 = (-0.201725);
  b63 = 2.21;
  b64 = 32.5855;
  b65 = (-108.217);
  b66 = (-1005.98);
  b67 = 585.753;
  b68 = 323.668;
  b69 = (-817.056);
  b70 = 235.75;
  b71 = (-560.965);
  b72 = (-576.892);
  b73 = 684.193;
  b74 = 85.0275;
  b75 = 168.394;
  b76 = 477.776;
  b77 = (-289.253);
  b78 = (-123.216);
  b79 = 75.6501;
  b80 = (-178.605);
  c1 = 1167.61;
  c2 = (-917.782);
  c3 = (-1253.2);
  c4 = (-274.128);
  c5 = (-1538.75);
  c6 = 1257.62;
  c7 = 1745.07;
  c8 = 113.479;
  c9 = 393.326;
  c10 = (-426.858);
  c11 = (-641.1);
  c12 = 190.833;
  c13 = (-29.9435);
  c14 = (-1.04881);
  c15 = 117.125;
  c16 = (-25.7663);
  c17 = (-1168.16);
  c18 = 910.247;
  c19 = 1239.31;
  c20 = 289.515;
  c21 = 1540.56;
  c22 = (-1248.29);
  c23 = (-1727.61);
  c24 = (-131.785);
  c25 = (-394.577);
  c26 = 426.163;
  c27 = 637.422;
  c28 = (-187.965);
  c29 = 30.0348;
  c30 = 0.221898;
  c31 = (-116.68);
  c32 = 26.0291;
  c33 = 12.6804;
  c34 = 4.84091;
  c35 = 1.18166;
  c36 = (-2.75946);
  c37 = (-17.9822);
  c38 = (-6.80357);
  c39 = (-1.47134);
  c40 = 3.02266;
  c41 = 4.79648;
  c42 = 0.665255;
  c43 = (-0.256229);
  c44 = (-0.0857282);
  c45 = (-0.588997);
  c46 = 0.0634812;
  c47 = 0.164303;
  c48 = (-0.15285);
  c49 = 22.2524;
  c50 = (-22.4376);
  c51 = (-3.85595);
  c52 = 6.07625;
  c53 = (-105.959);
  c54 = (-41.6698);
  c55 = 0.378615;
  c56 = 1.55958;
  c57 = 44.3981;
  c58 = 18.8521;
  c59 = 3.19466;
  c60 = 5.89142;
  c61 = (-8.63227);
  c62 = (-2.36418);
  c63 = (-1.027);
  c64 = (-2.31515);
  c65 = 1035.38;
  c66 = 2040.66;
  c67 = (-131.881);
  c68 = (-744.533);
  c69 = (-3274.93);
  c70 = (-4845.61);
  c71 = 482.438;
  c72 = 1567.43;
  c73 = 1354.02;
  c74 = 2040.47;
  c75 = (-151.653);
  c76 = (-845.012);
  c77 = (-111.723);
  c78 = (-265.343);
  c79 = (-26.1171);
  c80 = 216.632;
  xks = xksi(x, y, z);
  t1x = (xks / Math.sqrt(((xks ** 2) + (pnonx6 ** 2))));
  t2x = ((pnonx7 ** 3) / (Math.sqrt(((xks ** 2) + (pnonx7 ** 2))) ** 3));
  t3x = (((xks / (Math.sqrt(((xks ** 2) + (pnonx8 ** 2))) ** 5)) * 3.493856) * (pnonx8 ** 4));
  t1y = (xks / Math.sqrt(((xks ** 2) + (pnony6 ** 2))));
  t2y = ((pnony7 ** 3) / (Math.sqrt(((xks ** 2) + (pnony7 ** 2))) ** 3));
  t3y = (((xks / (Math.sqrt(((xks ** 2) + (pnony8 ** 2))) ** 5)) * 3.493856) * (pnony8 ** 4));
  t1z = (xks / Math.sqrt(((xks ** 2) + (pnonz6 ** 2))));
  t2z = ((pnonz7 ** 3) / (Math.sqrt(((xks ** 2) + (pnonz7 ** 2))) ** 3));
  t3z = (((xks / (Math.sqrt(((xks ** 2) + (pnonz8 ** 2))) ** 5)) * 3.493856) * (pnonz8 ** 4));
  rho2 = ((x * x) + (y * y));
  r = Math.sqrt((rho2 + (z * z)));
  rho = Math.sqrt(rho2);
  c1p = (x / rho);
  s1p = (y / rho);
  s2p = ((2 * s1p) * c1p);
  c2p = ((c1p * c1p) - (s1p * s1p));
  s3p = ((s2p * c1p) + (c2p * s1p));
  c3p = ((c2p * c1p) - (s2p * s1p));
  s4p = ((s3p * c1p) + (c3p * s1p));
  ct = (z / r);
  _st = (rho / r);
  s1 = fexp(ct, pnonx1);
  s2 = fexp(ct, pnonx2);
  s3 = fexp(ct, pnonx3);
  s4 = fexp(ct, pnonx4);
  s5 = fexp(ct, pnonx5);
  bx = (((((s1 * ((((((a1 + (a2 * t1x)) + (a3 * t2x)) + (a4 * t3x)) + (c1p * (((a5 + (a6 * t1x)) + (a7 * t2x)) + (a8 * t3x)))) + (c2p * (((a9 + (a10 * t1x)) + (a11 * t2x)) + (a12 * t3x)))) + (c3p * (((a13 + (a14 * t1x)) + (a15 * t2x)) + (a16 * t3x))))) + (s2 * ((((((a17 + (a18 * t1x)) + (a19 * t2x)) + (a20 * t3x)) + (c1p * (((a21 + (a22 * t1x)) + (a23 * t2x)) + (a24 * t3x)))) + (c2p * (((a25 + (a26 * t1x)) + (a27 * t2x)) + (a28 * t3x)))) + (c3p * (((a29 + (a30 * t1x)) + (a31 * t2x)) + (a32 * t3x)))))) + (s3 * ((((((a33 + (a34 * t1x)) + (a35 * t2x)) + (a36 * t3x)) + (c1p * (((a37 + (a38 * t1x)) + (a39 * t2x)) + (a40 * t3x)))) + (c2p * (((a41 + (a42 * t1x)) + (a43 * t2x)) + (a44 * t3x)))) + (c3p * (((a45 + (a46 * t1x)) + (a47 * t2x)) + (a48 * t3x)))))) + (s4 * ((((((a49 + (a50 * t1x)) + (a51 * t2x)) + (a52 * t3x)) + (c1p * (((a53 + (a54 * t1x)) + (a55 * t2x)) + (a56 * t3x)))) + (c2p * (((a57 + (a58 * t1x)) + (a59 * t2x)) + (a60 * t3x)))) + (c3p * (((a61 + (a62 * t1x)) + (a63 * t2x)) + (a64 * t3x)))))) + (s5 * ((((((a65 + (a66 * t1x)) + (a67 * t2x)) + (a68 * t3x)) + (c1p * (((a69 + (a70 * t1x)) + (a71 * t2x)) + (a72 * t3x)))) + (c2p * (((a73 + (a74 * t1x)) + (a75 * t2x)) + (a76 * t3x)))) + (c3p * (((a77 + (a78 * t1x)) + (a79 * t2x)) + (a80 * t3x))))));
  s1 = fexp(ct, pnony1);
  s2 = fexp(ct, pnony2);
  s3 = fexp(ct, pnony3);
  s4 = fexp(ct, pnony4);
  s5 = fexp(ct, pnony5);
  by = (((((s1 * ((((s1p * (((b1 + (b2 * t1y)) + (b3 * t2y)) + (b4 * t3y))) + (s2p * (((b5 + (b6 * t1y)) + (b7 * t2y)) + (b8 * t3y)))) + (s3p * (((b9 + (b10 * t1y)) + (b11 * t2y)) + (b12 * t3y)))) + (s4p * (((b13 + (b14 * t1y)) + (b15 * t2y)) + (b16 * t3y))))) + (s2 * ((((s1p * (((b17 + (b18 * t1y)) + (b19 * t2y)) + (b20 * t3y))) + (s2p * (((b21 + (b22 * t1y)) + (b23 * t2y)) + (b24 * t3y)))) + (s3p * (((b25 + (b26 * t1y)) + (b27 * t2y)) + (b28 * t3y)))) + (s4p * (((b29 + (b30 * t1y)) + (b31 * t2y)) + (b32 * t3y)))))) + (s3 * ((((s1p * (((b33 + (b34 * t1y)) + (b35 * t2y)) + (b36 * t3y))) + (s2p * (((b37 + (b38 * t1y)) + (b39 * t2y)) + (b40 * t3y)))) + (s3p * (((b41 + (b42 * t1y)) + (b43 * t2y)) + (b44 * t3y)))) + (s4p * (((b45 + (b46 * t1y)) + (b47 * t2y)) + (b48 * t3y)))))) + (s4 * ((((s1p * (((b49 + (b50 * t1y)) + (b51 * t2y)) + (b52 * t3y))) + (s2p * (((b53 + (b54 * t1y)) + (b55 * t2y)) + (b56 * t3y)))) + (s3p * (((b57 + (b58 * t1y)) + (b59 * t2y)) + (b60 * t3y)))) + (s4p * (((b61 + (b62 * t1y)) + (b63 * t2y)) + (b64 * t3y)))))) + (s5 * ((((s1p * (((b65 + (b66 * t1y)) + (b67 * t2y)) + (b68 * t3y))) + (s2p * (((b69 + (b70 * t1y)) + (b71 * t2y)) + (b72 * t3y)))) + (s3p * (((b73 + (b74 * t1y)) + (b75 * t2y)) + (b76 * t3y)))) + (s4p * (((b77 + (b78 * t1y)) + (b79 * t2y)) + (b80 * t3y))))));
  s1 = fexp1(ct, pnonz1);
  s2 = fexp1(ct, pnonz2);
  s3 = fexp1(ct, pnonz3);
  s4 = fexp1(ct, pnonz4);
  s5 = fexp1(ct, pnonz5);
  bz = (((((s1 * ((((((c1 + (c2 * t1z)) + (c3 * t2z)) + (c4 * t3z)) + (c1p * (((c5 + (c6 * t1z)) + (c7 * t2z)) + (c8 * t3z)))) + (c2p * (((c9 + (c10 * t1z)) + (c11 * t2z)) + (c12 * t3z)))) + (c3p * (((c13 + (c14 * t1z)) + (c15 * t2z)) + (c16 * t3z))))) + (s2 * ((((((c17 + (c18 * t1z)) + (c19 * t2z)) + (c20 * t3z)) + (c1p * (((c21 + (c22 * t1z)) + (c23 * t2z)) + (c24 * t3z)))) + (c2p * (((c25 + (c26 * t1z)) + (c27 * t2z)) + (c28 * t3z)))) + (c3p * (((c29 + (c30 * t1z)) + (c31 * t2z)) + (c32 * t3z)))))) + (s3 * ((((((c33 + (c34 * t1z)) + (c35 * t2z)) + (c36 * t3z)) + (c1p * (((c37 + (c38 * t1z)) + (c39 * t2z)) + (c40 * t3z)))) + (c2p * (((c41 + (c42 * t1z)) + (c43 * t2z)) + (c44 * t3z)))) + (c3p * (((c45 + (c46 * t1z)) + (c47 * t2z)) + (c48 * t3z)))))) + (s4 * ((((((c49 + (c50 * t1z)) + (c51 * t2z)) + (c52 * t3z)) + (c1p * (((c53 + (c54 * t1z)) + (c55 * t2z)) + (c56 * t3z)))) + (c2p * (((c57 + (c58 * t1z)) + (c59 * t2z)) + (c60 * t3z)))) + (c3p * (((c61 + (c62 * t1z)) + (c63 * t2z)) + (c64 * t3z)))))) + (s5 * ((((((c65 + (c66 * t1z)) + (c67 * t2z)) + (c68 * t3z)) + (c1p * (((c69 + (c70 * t1z)) + (c71 * t2z)) + (c72 * t3z)))) + (c2p * (((c73 + (c74 * t1z)) + (c75 * t2z)) + (c76 * t3z)))) + (c3p * (((c77 + (c78 * t1z)) + (c79 * t2z)) + (c80 * t3z))))));
  return [bx, by, bz];
}

function r2inner(x: number, y: number, z: number): number[] {
  let pl1: number = 0, pl2: number = 0, pl3: number = 0, pl4: number = 0, pl5: number = 0, pl6: number = 0, pl7: number = 0, pl8: number = 0, pn1: number = 0, pn2: number = 0, pn3: number = 0, pn4: number = 0, pn5: number = 0, pn6: number = 0, pn7: number = 0, pn8: number = 0, cbx: number[] = [], cby: number[] = [], cbz: number[] = [], dbx8: number = 0, dby8: number = 0, dbz8: number = 0, dbx6: number = 0, dby6: number = 0, dbz6: number = 0, dbx7: number = 0, dby7: number = 0, dbz7: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  pl1 = 154.185;
  pl2 = (-2.12446);
  pl3 = 0.0601735;
  pl4 = (-0.00153954);
  pl5 = 3.55077e-05;
  pl6 = 29.9996;
  pl7 = 262.886;
  pl8 = 99.9132;
  pn1 = (-8.1902);
  pn2 = 6.5239;
  pn3 = 5.504;
  pn4 = 7.7815;
  pn5 = 0.8573;
  pn6 = 3.0986;
  pn7 = 0.0774;
  pn8 = (-0.038);
  [cbx, cby, cbz] = bconic(x, y, z, 5);
  [dbx8, dby8, dbz8] = loops4(x, y, z, pn1, pn2, pn3, pn4, pn5, pn6);
  [dbx6, dby6, dbz6] = dipdistr((x - pn7), y, z, 0);
  [dbx7, dby7, dbz7] = dipdistr((x - pn8), y, z, 1);
  bx = ((((((((pl1 * cbx[0]) + (pl2 * cbx[1])) + (pl3 * cbx[2])) + (pl4 * cbx[3])) + (pl5 * cbx[4])) + (pl6 * dbx6)) + (pl7 * dbx7)) + (pl8 * dbx8));
  by = ((((((((pl1 * cby[0]) + (pl2 * cby[1])) + (pl3 * cby[2])) + (pl4 * cby[3])) + (pl5 * cby[4])) + (pl6 * dby6)) + (pl7 * dby7)) + (pl8 * dby8));
  bz = ((((((((pl1 * cbz[0]) + (pl2 * cbz[1])) + (pl3 * cbz[2])) + (pl4 * cbz[3])) + (pl5 * cbz[4])) + (pl6 * dbz6)) + (pl7 * dbz7)) + (pl8 * dbz8));
  return [bx, by, bz];
}

function bconic(x: number, y: number, z: number, nmax: number): number[][] {
  let cbx: number[] = [], cby: number[] = [], cbz: number[] = [], ro2: number = 0, ro: number = 0, cf: number = 0, sf: number = 0, cfm1: number = 0, sfm1: number = 0, r2: number = 0, r: number = 0, c: number = 0, s: number = 0, ch: number = 0, sh: number = 0, tnhm1: number = 0, cnhm1: number = 0, tnh: number = 0, cnh: number = 0, m: number = 0, m1: number = 0, cfm: number = 0, sfm: number = 0, tnhm: number = 0, cnhm: number = 0, bt: number = 0, bf: number = 0;
  cbx = zeros(nmax);
  cby = zeros(nmax);
  cbz = zeros(nmax);
  ro2 = ((x ** 2) + (y ** 2));
  ro = Math.sqrt(ro2);
  cf = (x / ro);
  sf = (y / ro);
  cfm1 = 1;
  sfm1 = 0;
  r2 = (ro2 + (z ** 2));
  r = Math.sqrt(r2);
  c = (z / r);
  s = (ro / r);
  ch = Math.sqrt((0.5 * (1 + c)));
  sh = Math.sqrt((0.5 * (1 - c)));
  tnhm1 = 1;
  cnhm1 = 1;
  tnh = (sh / ch);
  cnh = (1 / tnh);
  for (m = 0; m < nmax; m++) {
    m1 = (m + 1);
    cfm = ((cfm1 * cf) - (sfm1 * sf));
    sfm = ((cfm1 * sf) + (sfm1 * cf));
    cfm1 = cfm;
    sfm1 = sfm;
    tnhm = (tnhm1 * tnh);
    cnhm = (cnhm1 * cnh);
    bt = (((m1 * cfm) / (r * s)) * (tnhm + cnhm));
    bf = (((((-0.5) * m1) * sfm) / r) * ((tnhm1 / (ch ** 2)) - (cnhm1 / (sh ** 2))));
    tnhm1 = tnhm;
    cnhm1 = cnhm;
    cbx[m] = (((bt * c) * cf) - (bf * sf));
    cby[m] = (((bt * c) * sf) + (bf * cf));
    cbz[m] = ((-bt) * s);
  }
  return [cbx, cby, cbz];
}

function dipdistr(x: number, y: number, z: number, mode: number): number[] {
  let x2: number = 0, rho2: number = 0, r2: number = 0, r3: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  x2 = (x * x);
  rho2 = (x2 + (y * y));
  r2 = (rho2 + (z * z));
  r3 = (r2 * Math.sqrt(r2));
  if (mode === 0) {
    bx = (((z / (rho2 ** 2)) * ((r2 * ((y * y) - x2)) - (rho2 * x2))) / r3);
    by = ((((((-x) * y) * z) / (rho2 ** 2)) * ((2 * r2) + rho2)) / r3);
    bz = (x / r3);
  } else {
    bx = ((z / (rho2 ** 2)) * ((y * y) - x2));
    by = (((((-2) * x) * y) * z) / (rho2 ** 2));
    bz = (x / rho2);
  }
  return [bx, by, bz];
}

function intercon(x: number, y: number, z: number): number[] {
  let a: number[] = [], p: number[] = [], r: number[] = [], rp: number[] = [], rr: number[] = [], l: number = 0, bx: number = 0, by: number = 0, bz: number = 0, i: number = 0, cypi: number = 0, sypi: number = 0, k: number = 0, szrk: number = 0, czrk: number = 0, sqpr: number = 0, epr: number = 0, hx: number = 0, hy: number = 0, hz: number = 0;
  a = [(-8.411078731), 5932254.951, (-9073284.93), (-11.68794634), 6027598.824, (-9218378.368), (-6.508798398), (-11824.42793), 18015.66212, 7.99754043, 13.9669886, 90.24475036, 16.75728834, 1015.645781, 1553.493216];
  p = a.slice(9, 12);
  r = a.slice(12, 15);
  rp = p.map((v) => 1 / v);
  rr = r.map((v) => 1 / v);
  l = 0;
  bx = 0.0;
  by = 0.0;
  bz = 0.0;
  for (i = 0; i < 3; i++) {
    cypi = Math.cos((y * rp[i]));
    sypi = Math.sin((y * rp[i]));
    for (k = 0; k < 3; k++) {
      szrk = Math.sin((z * rr[k]));
      czrk = Math.cos((z * rr[k]));
      sqpr = Math.sqrt(((rp[i] ** 2) + (rr[k] ** 2)));
      epr = Math.exp((x * sqpr));
      hx = ((((-sqpr) * epr) * cypi) * szrk);
      hy = (((rp[i] * epr) * sypi) * szrk);
      hz = ((((-rr[k]) * epr) * cypi) * czrk);
      bx = (bx + (a[l] * hx));
      by = (by + (a[l] * hy));
      bz = (bz + (a[l] * hz));
      l += 1;
    }
  }
  return [bx, by, bz];
}

function dipole(ps: number, x: number, y: number, z: number): number[] {
  let sps: number = 0, cps: number = 0, p: number = 0, u: number = 0, v: number = 0, t: number = 0, q: number = 0, bx: number = 0, by: number = 0, bz: number = 0;
  sps = Math.sin(ps);
  cps = Math.cos(ps);
  p = (x ** 2);
  u = (z ** 2);
  v = ((3 * z) * x);
  t = (y ** 2);
  q = (30574.0 / (Math.sqrt(((p + t) + u)) ** 5));
  bx = (q * ((((t + u) - (2 * p)) * sps) - (v * cps)));
  by = ((((-3) * y) * q) * ((x * sps) + (z * cps)));
  bz = (q * ((((p + t) - (2 * u)) * cps) - (v * sps)));
  return [bx, by, bz];
}
