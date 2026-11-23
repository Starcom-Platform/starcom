/**
 * The ψ field's eclipse term S (decision D-PW, PW78): on the UTC day of a central solar eclipse's peak (total, annular
 * or hybrid), the centre line of its shadow, where the axis from the Sun through the Moon meets the Earth, every
 * 5 seconds for 4 hours either side of the peak; S is its band, 150 km wide. Other days, S is nought.
 */
import * as Astronomy from 'astronomy-engine';

const DAY_MS = 86_400_000;
/** Earth's equatorial radius in AU, as the axis is met. */
const R_AU = 6378.137 / 149597870.7;
const DEG = 180 / Math.PI;
const CENTRAL = new Set(['total', 'annular', 'hybrid']);

export interface CentralEclipse {
  /** The peak, ms. */
  peakMs: number;
  kind: string;
  /** The centre line, [lat, lon] to 0.01°, in time order. */
  line: Array<[number, number]>;
}

/** Where the shadow's axis meets the Earth at a moment, or null when it misses. */
export function shadowCentre(time: Astronomy.AstroTime): [number, number] | null {
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const S = Astronomy.RotateVector(rot, Astronomy.GeoVector(Astronomy.Body.Sun, time, true));
  const M = Astronomy.RotateVector(rot, Astronomy.GeoVector(Astronomy.Body.Moon, time, true));
  const u = [S.x - M.x, S.y - M.y, S.z - M.z];
  const n = Math.hypot(u[0], u[1], u[2]);
  for (let i = 0; i < 3; i++) u[i] /= n;
  const m = [M.x, M.y, M.z];
  const mu = m[0] * u[0] + m[1] * u[1] + m[2] * u[2];
  const disc = mu * mu - (m[0] ** 2 + m[1] ** 2 + m[2] ** 2) + R_AU * R_AU;
  if (disc < 0) return null;
  // The nearer crossing, on the side away from the Sun.
  const s = mu - Math.sqrt(disc);
  const p = [m[0] - s * u[0], m[1] - s * u[1], m[2] - s * u[2]];
  const lon = Math.atan2(p[1], p[0]) * DEG - Astronomy.SiderealTime(time) * 15;
  const lat = Math.asin(p[2] / Math.hypot(p[0], p[1], p[2])) * DEG;
  return [Math.round(lat * 100) / 100, Math.round(((((lon + 540) % 360) + 360) % 360 - 180) * 100) / 100];
}

/** The central solar eclipse whose peak falls on the UTC day of `timeMs`, with its centre line, or null. */
export function centralEclipseOn(timeMs: number): CentralEclipse | null {
  const dayStart = Math.floor(timeMs / DAY_MS) * DAY_MS;
  const e = Astronomy.SearchGlobalSolarEclipse(new Date(dayStart));
  const peakMs = e.peak.date.getTime();
  if (peakMs >= dayStart + DAY_MS || !CENTRAL.has(String(e.kind))) return null;
  const line: Array<[number, number]> = [];
  for (let k = -2880; k <= 2880; k++) {
    const c = shadowCentre(e.peak.AddDays(k / 17280));
    if (c) line.push(c);
  }
  return { peakMs, kind: String(e.kind), line };
}
