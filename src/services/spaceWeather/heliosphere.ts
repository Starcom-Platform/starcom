/**
 * The solar wind between the Sun and the Earth, as it was (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW7, SW16).
 *
 * Wind measured at L1 has already passed the Earth, so no measurement describes the Sun-Earth stretch
 * now. What can be drawn from measurements is a hindcast: the stream as it was a few days ago, every
 * parcel from the wind NOAA measured since (its 7-day propagated product, a minute a row).
 *
 * Two assumptions, the standard ones for mapping L1 back to the Sun, stated where it is drawn:
 *
 * - **Ballistic**: a parcel keeps its speed from the Sun to the Earth, so one that reached the Earth at
 *   t with speed v left the Sun at t - 1 AU / v, heading where the Earth then was.
 * - **Corotation**: the wind's structure is fixed to the turning Sun (its sidereal rotation, 14.18° a
 *   day), so the place on the Sun that sent that parcel kept sending wind like it, each later parcel
 *   leaving in a direction turned on by the Sun's rotation since.
 *
 * Together, each measured minute is a source on the Sun, and its parcels at the hindcast moment lie
 * along a spiral arm (r = v τ for a parcel sent τ before, in a direction trailing the Sun's turn): the
 * Parker spiral, with real fast and slow streams catching each other. Seven days of minutes cover about
 * ninety degrees of the Sun's longitude. Positions are in the Sun-Earth frame of the hindcast moment:
 * the Sun at the origin, the Earth then on +x at 1 AU, +y ahead of it along its orbit, in the ecliptic.
 */

export const PROPAGATED_WIND_7DAY_URL = 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind.json';

export const AU_KM = 149_597_870.7;
const DAY_MS = 86_400_000;
/** The Sun's sidereal rotation, and the Earth's mean motion round it, radians a millisecond. */
export const SUN_ROTATION = ((14.18 * Math.PI) / 180) / DAY_MS;
export const EARTH_MOTION = ((0.9856 * Math.PI) / 180) / DAY_MS;

export interface WindMinute {
  /** When it reached the Earth (the bow shock), ms. */
  arrive: number;
  /** km/s, protons per cm³, and the IMF, GSM, nT. */
  speed: number;
  density: number;
  bx: number;
  by: number;
  bz: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The 7-day propagated wind's complete minutes, by their columns' names, oldest first. */
export function parseWindHistory(data: unknown): WindMinute[] {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return [];
  const header = data[0] as unknown[];
  const [iArrive, iSpeed, iDensity, iBx, iBy, iBz] = ['propagated_time_tag', 'speed', 'density', 'bx', 'by', 'bz'].map((c) => header.indexOf(c));
  const byTime = new Map<number, WindMinute>();
  for (const row of data.slice(1)) {
    if (!Array.isArray(row)) continue;
    const arrive = typeof row[iArrive] === 'string' ? Date.parse(row[iArrive] as string) : NaN;
    const [speed, density, bx, by, bz] = [row[iSpeed], row[iDensity], row[iBx], row[iBy], row[iBz]];
    if (!Number.isFinite(arrive) || ![speed, density, bx, by, bz].every(finite) || (speed as number) <= 0) continue;
    byTime.set(arrive, { arrive, speed: speed as number, density: density as number, bx: bx as number, by: by as number, bz: bz as number });
  }
  return [...byTime.values()].sort((a, b) => a.arrive - b.arrive);
}

/** Days for a parcel at a speed, km/s, to cross 1 AU. */
export const daysToEarth = (speed: number): number => AU_KM / speed / 86_400;

/**
 * The hindcast moment: as late as the measurements fill the Sun-Earth stretch, which is the last
 * arrival less the time a parcel at the last day's median speed takes to come; to the hour.
 */
export function hindcastMoment(minutes: readonly WindMinute[]): number | null {
  if (!minutes.length) return null;
  const last = minutes[minutes.length - 1].arrive;
  const lastDay = minutes.filter((m) => m.arrive > last - DAY_MS).map((m) => m.speed).sort((a, b) => a - b);
  const median = lastDay[Math.floor(lastDay.length / 2)];
  const moment = last - daysToEarth(median) * DAY_MS;
  return Math.floor(moment / 3_600_000) * 3_600_000;
}

export interface WindSource {
  /** Where its parcels head at the hindcast moment, radians in the Sun-Earth frame, for a parcel sent then. */
  angle: number;
  speed: number;
  density: number;
  /** +1 where the IMF points away from the Sun, -1 toward it. */
  polarity: 1 | -1;
  /** How unsteady the wind was about this minute: the field's spread over the minutes either side, as a share of its strength. */
  turbulence: number;
}

/** The IMF's polarity, from GSM components: away from the Sun when the field lies along the outgoing spiral (Bx < 0, By > 0). */
export const polarityOf = (bx: number, by: number): 1 | -1 => (by - bx >= 0 ? 1 : -1);

/** Each measured minute (every `every`th) as a source on the turning Sun, for the hindcast moment. */
export function windSources(minutes: readonly WindMinute[], moment: number, every = 10): WindSource[] {
  const out: WindSource[] = [];
  for (let k = 0; k < minutes.length; k += every) {
    const m = minutes[k];
    const sent = m.arrive - daysToEarth(m.speed) * DAY_MS;
    // The direction it headed when sent (the Earth's at its arrival), turned on to the moment by the Sun.
    const angle = EARTH_MOTION * (m.arrive - moment) + SUN_ROTATION * (moment - sent);
    const near = minutes.slice(Math.max(0, k - 5), k + 6);
    const mean = (f: (w: WindMinute) => number) => near.reduce((s, w) => s + f(w), 0) / near.length;
    const [mx, my, mz] = [mean((w) => w.bx), mean((w) => w.by), mean((w) => w.bz)];
    const spread = Math.sqrt(mean((w) => (w.bx - mx) ** 2 + (w.by - my) ** 2 + (w.bz - mz) ** 2));
    const strength = Math.max(Math.hypot(mx, my, mz), 0.1);
    out.push({ angle, speed: m.speed, density: m.density, polarity: polarityOf(m.bx, m.by), turbulence: Math.min(spread / strength, 2) });
  }
  return out;
}

/**
 * Where a source's parcel sent `days` before the hindcast moment then was: AU, in the Sun-Earth frame.
 * It has gone out at its speed, in the direction the Sun's turn had brought its source to when it left.
 */
export function parcelAt(source: Pick<WindSource, 'angle' | 'speed'>, days: number): [number, number] {
  const r = (source.speed * days * 86_400) / AU_KM;
  const angle = source.angle - SUN_ROTATION * days * DAY_MS;
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

/** The 7 days of wind, read; throws why when it cannot be. */
export async function fetchWindHistory(fetchImpl: typeof fetch = fetch): Promise<WindMinute[]> {
  const res = await fetchImpl(PROPAGATED_WIND_7DAY_URL);
  if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
  const minutes = parseWindHistory(await res.json());
  if (minutes.length < 60) throw new Error('less than an hour of wind');
  return minutes;
}
