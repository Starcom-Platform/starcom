/**
 * Where the Sun, the Moon and the planets stand, as astrology reads them (decision D-PW, PW2): geocentric, apparent,
 * in the ecliptic of date, from `astronomy-engine` (MIT; about an arcminute). The tropical longitude is what every
 * frame starts from (frames.ts); the speed says whether a body is retrograde.
 */
import * as Astronomy from 'astronomy-engine';

export const ASTRO_BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
export type AstroBody = (typeof ASTRO_BODIES)[number];
/** The Moon's mean north node, which astrology reads beside the bodies. */
export type AstroPoint = AstroBody | 'NorthNode';

export interface SkyPosition {
  body: AstroPoint;
  /** Tropical ecliptic longitude of date, degrees 0–360, and latitude. */
  lon: number;
  lat: number;
  /** Degrees a day along the ecliptic: below zero, retrograde. */
  speed: number;
  retrograde: boolean;
}

const DAY_MS = 86_400_000;
export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
/** The shortest signed way from `a` to `b`, degrees in (−180, 180]. */
export const arc = (a: number, b: number): number => {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
};

const BODY: Record<AstroBody, Astronomy.Body> = {
  Sun: Astronomy.Body.Sun, Moon: Astronomy.Body.Moon, Mercury: Astronomy.Body.Mercury, Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars, Jupiter: Astronomy.Body.Jupiter, Saturn: Astronomy.Body.Saturn, Uranus: Astronomy.Body.Uranus,
  Neptune: Astronomy.Body.Neptune, Pluto: Astronomy.Body.Pluto,
};

/** A body's tropical ecliptic longitude and latitude of date, degrees. */
export function eclipticOfDate(body: AstroBody, at: Date): { lon: number; lat: number } {
  const vector = Astronomy.GeoVector(BODY[body], at, true);
  const ect = Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECT(at), vector);
  const sphere = Astronomy.SphereFromVector(ect);
  return { lon: norm360(sphere.lon), lat: sphere.lat };
}

/** The Moon's mean north node, tropical of date (Meeus, Astronomical Algorithms, 47.7). */
export function meanNorthNode(at: Date): number {
  const t = (at.getTime() / DAY_MS + 2440587.5 - 2451545.0) / 36525;
  return norm360(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t + (t * t * t) / 467441 - (t * t * t * t) / 60616000);
}

function longitudeOf(point: AstroPoint, at: Date): { lon: number; lat: number } {
  return point === 'NorthNode' ? { lon: meanNorthNode(at), lat: 0 } : eclipticOfDate(point, at);
}

/** Where a point stands at a moment: its longitude, latitude and speed (over a day either side, half a day for the Moon). */
export function positionAt(point: AstroPoint, at: Date): SkyPosition {
  const half = point === 'Moon' ? 0.25 : 0.5;
  const here = longitudeOf(point, at);
  const before = longitudeOf(point, new Date(at.getTime() - half * DAY_MS)).lon;
  const after = longitudeOf(point, new Date(at.getTime() + half * DAY_MS)).lon;
  const speed = arc(before, after) / (2 * half);
  return { body: point, lon: here.lon, lat: here.lat, speed, retrograde: speed < 0 };
}

/** The sky at a moment: every body and the north node. */
export function skyAt(at: Date): SkyPosition[] {
  return [...ASTRO_BODIES, 'NorthNode' as const].map((point) => positionAt(point, at));
}
