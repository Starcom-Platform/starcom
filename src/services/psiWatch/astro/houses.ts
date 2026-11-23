/**
 * A chart's houses (decision D-PW, PW6): whole-sign, the sign holding the Ascendant as the first house; and Placidus,
 * each cusp the ecliptic point that has run its stated share of its own day arc (its diurnal semi-arc) from the
 * meridian. Placidus is undefined where some of the ecliptic never rises or sets, beyond the polar circles (90° less
 * the obliquity, about 66.6°): a chart there refuses it and says so.
 */
import { eclipticToEquatorial, type ChartAngles } from './angles';
import { inFrame, type ZodiacFrame } from './frames';
import { arc, norm360 } from './sky';

const RAD = Math.PI / 180;

export type HouseSystem = 'whole-sign' | 'placidus';
export const HOUSE_SYSTEMS: readonly HouseSystem[] = ['placidus', 'whole-sign'];
export const HOUSE_SYSTEM_NAMES: Record<HouseSystem, string> = { 'whole-sign': 'Whole sign', placidus: 'Placidus' };

/** Twelve cusps in a frame's longitudes, the first house's first; or why there are none. */
export type Houses =
  | { system: HouseSystem; cusps: number[] }
  | { system: HouseSystem; refused: string };

/** The latitude beyond which Placidus is undefined at an obliquity, degrees. */
export const placidusLimit = (obliquity: number): number => 90 - obliquity;

export const PLACIDUS_POLAR =
  'Placidus has no houses this close to a pole: part of the ecliptic never rises or sets here, so its day arcs cannot be divided.';

/** A point's diurnal semi-arc, degrees: half the arc it travels above the horizon. */
export function diurnalSemiArc(decDeg: number, latDeg: number): number {
  const x = Math.tan(latDeg * RAD) * Math.tan(decDeg * RAD);
  return 90 + Math.asin(Math.max(-1, Math.min(1, x))) / RAD;
}

/** The ecliptic point with a right ascension. */
const eclipticOfRa = (ra: number, obliquity: number): number =>
  norm360(Math.atan2(Math.sin(ra * RAD), Math.cos(ra * RAD) * Math.cos(obliquity * RAD)) / RAD);

/**
 * A Placidus cusp above the horizon: the ecliptic point whose hour angle is `share` of its diurnal semi-arc, east of
 * the meridian when `share` is below zero. Found by fixed-point iteration, which converges inside the polar circles.
 */
export function placidusCusp(share: number, angles: ChartAngles, latDeg: number): number {
  const { ramc, obliquity } = angles;
  let lon = eclipticOfRa(ramc - share * 90, obliquity);
  for (let i = 0; i < 100; i++) {
    const { dec } = eclipticToEquatorial(lon, obliquity);
    const next = eclipticOfRa(ramc - share * diurnalSemiArc(dec, latDeg), obliquity);
    if (Math.abs(arc(lon, next)) < 1e-9) return next;
    lon = next;
  }
  return lon;
}

/** Placidus's twelve tropical cusps, or its polar refusal. */
export function placidusCusps(angles: ChartAngles, latDeg: number): number[] | null {
  if (Math.abs(latDeg) >= placidusLimit(angles.obliquity)) return null;
  const c11 = placidusCusp(-1 / 3, angles, latDeg);
  const c12 = placidusCusp(-2 / 3, angles, latDeg);
  const c9 = placidusCusp(1 / 3, angles, latDeg);
  const c8 = placidusCusp(2 / 3, angles, latDeg);
  // Opposite cusps stand 180° apart: the second is the eighth's opposite, the third the ninth's, and so on.
  const opposite = (lon: number) => norm360(lon + 180);
  return [angles.asc, opposite(c8), opposite(c9), angles.ic, opposite(c11), opposite(c12), angles.dsc, c8, c9, angles.mc, c11, c12];
}

/** A chart's houses in a frame's longitudes. */
export function housesOf(system: HouseSystem, angles: ChartAngles, latDeg: number, frame: ZodiacFrame, at: Date): Houses {
  if (system === 'whole-sign') {
    const first = Math.floor(inFrame(angles.asc, frame, at) / 30) * 30;
    return { system, cusps: Array.from({ length: 12 }, (_, i) => norm360(first + 30 * i)) };
  }
  const cusps = placidusCusps(angles, latDeg);
  if (!cusps) return { system, refused: PLACIDUS_POLAR };
  return { system, cusps: cusps.map((lon) => inFrame(lon, frame, at)) };
}

/** Which house (1–12) a frame longitude falls in. */
export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const span = norm360(cusps[(i + 1) % 12] - start);
    if (norm360(lon - start) < span) return i + 1;
  }
  return 12;
}
