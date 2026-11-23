/**
 * Astrocartography's lines, the kit's PsiLines (decision D-PW, PW7; Mecha Jono's kit v0, `vectors_psi.json`): where on
 * Earth each body stands on the meridian overhead (MC) or underfoot (IC), and where it rises (ASC) or sets (DSC) at a
 * moment. From each body's geocentric apparent place of date and the Greenwich apparent sidereal time; the horizon is
 * geometric (no refraction, no semidiameter), and the Moon's lines are its geocentric ones. Longitudes east, in
 * (−180, 180].
 */
import * as Astronomy from 'astronomy-engine';
import { ASTRO_BODIES, norm360, type AstroBody } from './sky';

const RAD = Math.PI / 180;

/** x → (−180, 180], as the kit's `wrap180`. */
export const wrap180 = (x: number): number => 180 - norm360(180 - x);

const BODY = Object.fromEntries(ASTRO_BODIES.map((name) => [name, Astronomy.Body[name]])) as Record<AstroBody, Astronomy.Body>;

/** A body's geocentric apparent right ascension and declination of date, degrees. */
export function equatorialOfDate(body: AstroBody, at: Date): { ra: number; dec: number } {
  const apparent = Astronomy.GeoVector(BODY[body], at, true);
  const sphere = Astronomy.SphereFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(at), apparent));
  return { ra: norm360(sphere.lon), dec: sphere.lat };
}

/** Greenwich apparent sidereal time, degrees. */
export const gastDeg = (at: Date): number => Astronomy.SiderealTime(at) * 15;

/** Where a body rises and sets at a latitude: two longitudes, or why there are none. */
export type HorizonCrossing =
  | { lat: number; asc: number; dsc: number }
  | { lat: number; state: 'circumpolar' | 'never_rises' };

export interface BodyLines {
  body: AstroBody;
  ra: number;
  dec: number;
  /** The longitude where the body is overhead on the meridian, and its opposite. */
  mc: number;
  ic: number;
}

/** A body's MC and IC longitudes at a moment. */
export function meridianLines(body: AstroBody, at: Date, gast = gastDeg(at)): BodyLines {
  const { ra, dec } = equatorialOfDate(body, at);
  const mc = wrap180(ra - gast);
  return { body, ra, dec, mc, ic: wrap180(mc + 180) };
}

/** Where a body of a declination crosses the horizon at a latitude, given its MC longitude. */
export function horizonCrossing(mc: number, dec: number, lat: number): HorizonCrossing {
  const x = -Math.tan(lat * RAD) * Math.tan(dec * RAD);
  if (x < -1) return { lat, state: 'circumpolar' };
  if (x > 1) return { lat, state: 'never_rises' };
  const h0 = Math.acos(x) / RAD;
  return { lat, asc: wrap180(mc - h0), dsc: wrap180(mc + h0) };
}

/** Each body's lines at a moment, and its rising and setting at each latitude asked. */
export function linesAt(at: Date, lats: number[], bodies: readonly AstroBody[] = ASTRO_BODIES): (BodyLines & { horizon: HorizonCrossing[] })[] {
  const gast = gastDeg(at);
  return bodies.map((body) => {
    const lines = meridianLines(body, at, gast);
    return { ...lines, horizon: lats.map((lat) => horizonCrossing(lines.mc, lines.dec, lat)) };
  });
}
