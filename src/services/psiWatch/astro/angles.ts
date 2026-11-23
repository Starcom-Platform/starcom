/**
 * A chart's angles (decision D-PW, PW6, PW23): the Midheaven, where the ecliptic crosses the meridian overhead, and the
 * Ascendant, where it rises in the east, with their opposites, the Imum Coeli and the Descendant. From the apparent
 * sidereal time at the place and the true obliquity of date; tropical longitudes, as the positions are.
 *
 * Past the polar circles the standard formula's point can fall on the western horizon, where it is setting; the
 * Ascendant is then its opposite, the point rising in the east, as Mecha Jono's catalogue has it. The Midheaven stays on
 * the upper meridian, so the Ascendant always stands 0–180° past it.
 */
import * as Astronomy from 'astronomy-engine';
import { norm360 } from './sky';

const RAD = Math.PI / 180;

export interface ChartAngles {
  /** The right ascension of the meridian (the local apparent sidereal time as an angle), degrees. */
  ramc: number;
  /** The true obliquity of the ecliptic, degrees. */
  obliquity: number;
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
  /** The formula's point fell in the west and was turned to its opposite, rising in the east (beyond the polar circles only). */
  ascTurned: boolean;
}

/** The true obliquity of date, degrees. */
export const obliquityAt = (at: Date): number => Astronomy.e_tilt(Astronomy.MakeTime(at)).tobl;

/** The right ascension of the meridian at a longitude (east positive), degrees. */
export const ramcAt = (at: Date, lonDeg: number): number => norm360(Astronomy.SiderealTime(at) * 15 + lonDeg);

/** The Midheaven for a meridian's right ascension: the ecliptic point with that right ascension. */
export const midheaven = (ramc: number, obliquity: number): number =>
  norm360(Math.atan2(Math.sin(ramc * RAD), Math.cos(ramc * RAD) * Math.cos(obliquity * RAD)) / RAD);

/** The standard formula's horizon point of the ecliptic, which past the polar circles can stand in the west. */
export const ascendantFormula = (ramc: number, obliquity: number, latDeg: number): number =>
  norm360(
    Math.atan2(
      Math.cos(ramc * RAD),
      -(Math.sin(ramc * RAD) * Math.cos(obliquity * RAD) + Math.tan(latDeg * RAD) * Math.sin(obliquity * RAD)),
    ) / RAD,
  );

/** Whether an ecliptic point on the horizon stands west of the meridian, where it sets. */
export function inTheWest(lon: number, ramc: number, obliquity: number): boolean {
  const { ra } = eclipticToEquatorial(lon, obliquity);
  return norm360(ramc - ra) < 180 && norm360(ramc - ra) > 0;
}

/** The Ascendant: the ecliptic point rising on the eastern horizon, and whether the formula's point had to be turned. Undefined at the poles. */
export function ascendant(ramc: number, obliquity: number, latDeg: number): { asc: number; turned: boolean } {
  const point = ascendantFormula(ramc, obliquity, latDeg);
  return inTheWest(point, ramc, obliquity) ? { asc: norm360(point + 180), turned: true } : { asc: point, turned: false };
}

/** A chart's four angles for a moment and a place. */
export function anglesAt(at: Date, latDeg: number, lonDeg: number): ChartAngles {
  const obliquity = obliquityAt(at);
  const ramc = ramcAt(at, lonDeg);
  const { asc, turned } = ascendant(ramc, obliquity, latDeg);
  const mc = midheaven(ramc, obliquity);
  return { ramc, obliquity, asc, mc, dsc: norm360(asc + 180), ic: norm360(mc + 180), ascTurned: turned };
}

/** An ecliptic point (latitude 0) as right ascension and declination, degrees. */
export function eclipticToEquatorial(lon: number, obliquity: number): { ra: number; dec: number } {
  const l = lon * RAD;
  const e = obliquity * RAD;
  return {
    ra: norm360(Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) / RAD),
    dec: Math.asin(Math.sin(e) * Math.sin(l)) / RAD,
  };
}
