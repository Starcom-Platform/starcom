/**
 * Coronal mass ejections from NASA's DONKI (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW8, SW20–SW22).
 *
 * CCMC's analysts fit each CME seen in the coronagraphs with the cone model: its direction from the Sun
 * (Stonyhurst latitude and longitude, longitude from the Sun-Earth line, west positive), its half-width,
 * and its speed when its leading edge was at 21.5 solar radii (`time21_5`). DONKI's `CME` records carry
 * those analyses, the most accurate marked, and the WSA-ENLIL runs CCMC made of them, with the shock's
 * modelled arrival at the Earth and whether it is a glancing blow.
 *
 * Read here: each CME from its most accurate analysis, and its arrival at the Earth from the latest ENLIL
 * run of it (SW21). Its front is moved out by the drag-based model (Vršnak et al. 2013, SW20): the CME
 * eases toward the surrounding wind's speed, dv/dt = -γ (v - w)|v - w|, with the model's usual γ and w.
 * One with an Earth arrival is paced to reach the Earth then (SW24): its measured speed kept, the
 * surrounding wind, the model's least certain value, fitted to the arrival; where no plausible wind
 * would, the model's timing stretched instead. It is in flight from `time21_5` until its front passes
 * 2 AU (SW22).
 *
 * Directions are drawn in the Sun-Earth frame (x from the Sun to the Earth, y ahead of the Earth in its
 * orbit, z the ecliptic's north): Stonyhurst latitude is taken from the Sun's equator, which is within
 * 7.25° of the ecliptic, and taken as ecliptic latitude.
 */
import { AU_KM } from './heliosphere';

export const DONKI_API = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';

/** The drag-based model's usual values: γ, per km, and the surrounding wind's speed, km/s. */
export const DBM = { gamma: 0.2e-7, wind: 400 } as const;
/** Where the analyses measure a CME: 21.5 solar radii, km. */
export const R0_KM = 21.5 * 695_700;
/** A CME is drawn until its front passes this far from the Sun, AU (SW22). */
export const CME_RANGE_AU = 2;
/** Days before the moment a CME may have left and still be in flight: a slow one takes about 10 to reach 2 AU. */
const LOOKBACK_DAYS = 12;

export type EarthArrival =
  /** CCMC's ENLIL run of it has the shock reaching the Earth. */
  | { kind: 'arrives'; at: number; glancing: boolean; modelledAt: number; link: string }
  /** It was modelled, and does not reach the Earth. */
  | { kind: 'misses'; modelledAt: number; link: string }
  | { kind: 'unmodelled' };

export interface Cme {
  id: string;
  /** When its leading edge was at 21.5 solar radii, ms. */
  leftAt: number;
  /** km/s there; degrees. */
  speed: number;
  halfAngle: number;
  lat: number;
  lon: number;
  /** DONKI's speed class: S, C, O, R or ER. */
  type: string;
  link: string;
  earth: EarthArrival;
  /** Paced to CCMC's arrival (SW24): the surrounding wind fitted, km/s, or the model's time stretched. Absent, the usual values. */
  wind?: number;
  timeScale?: number;
}

const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v.endsWith('Z') ? v : `${v}Z`) : NaN);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface Run { modelCompletionTime?: unknown; estimatedShockArrivalTime?: unknown; isEarthGB?: unknown; link?: unknown }
interface Analysis { isMostAccurate?: unknown; time21_5?: unknown; latitude?: unknown; longitude?: unknown; halfAngle?: unknown; speed?: unknown; type?: unknown; enlilList?: unknown }

/** DONKI's CME records, each from its most accurate analysis, those lacking a time, speed, width or direction left out. */
export function parseCmes(data: unknown): Cme[] {
  if (!Array.isArray(data)) return [];
  const out: Cme[] = [];
  for (const row of data as Array<{ activityID?: unknown; link?: unknown; cmeAnalyses?: unknown }>) {
    const analyses = Array.isArray(row?.cmeAnalyses) ? (row.cmeAnalyses as Analysis[]) : [];
    const most = analyses.filter((a) => a?.isMostAccurate === true);
    const a = most[most.length - 1] ?? analyses[analyses.length - 1];
    if (!a) continue;
    const leftAt = time(a.time21_5);
    if (!Number.isFinite(leftAt) || ![a.speed, a.halfAngle, a.latitude, a.longitude].every(finite)) continue;
    // The latest ENLIL run CCMC made of any of its analyses.
    const runs = analyses.flatMap((x) => (Array.isArray(x?.enlilList) ? (x.enlilList as Run[]) : []))
      .filter((r) => Number.isFinite(time(r?.modelCompletionTime)))
      .sort((p, q) => time(p.modelCompletionTime) - time(q.modelCompletionTime));
    const run = runs[runs.length - 1];
    const arrival = run ? time(run.estimatedShockArrivalTime) : NaN;
    const earth: EarthArrival = !run
      ? { kind: 'unmodelled' }
      : Number.isFinite(arrival)
        ? { kind: 'arrives', at: arrival, glancing: run.isEarthGB === true, modelledAt: time(run.modelCompletionTime), link: String(run.link ?? '') }
        : { kind: 'misses', modelledAt: time(run.modelCompletionTime), link: String(run.link ?? '') };
    out.push(paceToArrival({
      id: String(row.activityID ?? ''),
      leftAt,
      speed: a.speed as number,
      halfAngle: a.halfAngle as number,
      lat: a.latitude as number,
      lon: a.longitude as number,
      type: String(a.type ?? ''),
      link: String(row.link ?? ''),
      earth,
    }));
  }
  return out;
}

/** A CME as DONKI lists it, measured or not yet: what is new since a moment counts every one (plan H10). */
export interface CmeSeen {
  id: string;
  /** When it was first seen in the coronagraphs, ms. */
  startTime: number;
  link: string;
  /** Its reading from its most accurate analysis, when DONKI has one. */
  cme: Cme | null;
}

/** Every CME DONKI lists with an id and a start time, each with its analysis where there is one. */
export function parseCmesSeen(data: unknown): CmeSeen[] {
  if (!Array.isArray(data)) return [];
  const measured = new Map(parseCmes(data).map((cme) => [cme.id, cme]));
  return (data as Array<{ activityID?: unknown; startTime?: unknown; link?: unknown }>).flatMap((row) => {
    const id = typeof row?.activityID === 'string' ? row.activityID : '';
    const startTime = time(row?.startTime);
    return id && Number.isFinite(startTime) ? [{ id, startTime, link: String(row.link ?? ''), cme: measured.get(id) ?? null }] : [];
  });
}

/** The drag-based model's speed, km/s, `seconds` after a CME at `v0` was measured, in a surrounding wind `wind`. */
export function dbmSpeed(v0: number, seconds: number, wind: number = DBM.wind): number {
  const dv = v0 - wind;
  const s = dv >= 0 ? 1 : -1;
  return dv / (1 + s * DBM.gamma * dv * seconds) + wind;
}

/** How far it has gone since, km: the model's closed form. */
export function dbmDistance(v0: number, seconds: number, wind: number = DBM.wind): number {
  const dv = v0 - wind;
  if (dv === 0) return wind * seconds;
  const s = dv >= 0 ? 1 : -1;
  return (s / DBM.gamma) * Math.log(1 + s * DBM.gamma * dv * seconds) + wind * seconds;
}

/** Its front's distance from the Sun at a moment, AU; null before it was measured. */
export function cmeFrontAu(cme: Pick<Cme, 'leftAt' | 'speed' | 'wind' | 'timeScale'>, at: number): number | null {
  if (at < cme.leftAt) return null;
  return (R0_KM + dbmDistance(cme.speed, ((at - cme.leftAt) / 1000) * (cme.timeScale ?? 1), cme.wind ?? DBM.wind)) / AU_KM;
}

/** The surrounding winds a fit may choose, km/s: from the slowest wind measured to the fastest streams. */
const FIT_WIND = { min: 250, max: 1000 };

/** The root of an increasing function between two ends, by halving. */
const bisect = (f: (x: number) => number, lo: number, hi: number) => {
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/**
 * A CME with CCMC's Earth arrival, paced to reach the Earth (1 AU) then (SW24): the surrounding wind
 * fitted within plausible winds, its measured speed kept; failing that, the usual model's time
 * stretched to the arrival. Any other CME, or an arrival before it left, as it was.
 */
export function paceToArrival(cme: Cme): Cme {
  if (cme.earth.kind !== 'arrives' || cme.earth.at <= cme.leftAt) return cme;
  const seconds = (cme.earth.at - cme.leftAt) / 1000;
  const target = AU_KM - R0_KM;
  const reach = (wind: number) => dbmDistance(cme.speed, seconds, wind) - target;
  if (reach(FIT_WIND.min) <= 0 && reach(FIT_WIND.max) >= 0) {
    return { ...cme, wind: bisect(reach, FIT_WIND.min, FIT_WIND.max), timeScale: 1 };
  }
  // No plausible wind gets it there then: the usual model, its time stretched to the arrival.
  const usual = bisect((t) => dbmDistance(cme.speed, t) - target, 0, 400 * 86_400);
  return { ...cme, wind: DBM.wind, timeScale: usual / seconds };
}

/** Those in flight at a moment, with their fronts. */
export function cmesInFlight(cmes: readonly Cme[], at: number): Array<{ cme: Cme; frontAu: number }> {
  return cmes.flatMap((cme) => {
    const frontAu = cmeFrontAu(cme, at);
    return frontAu !== null && frontAu <= CME_RANGE_AU ? [{ cme, frontAu }] : [];
  });
}

/** Its direction from the Sun, a unit vector in the Sun-Earth frame: west toward the side ahead of the Earth. */
export function cmeAxis(lat: number, lon: number): [number, number, number] {
  const [b, l] = [(lat * Math.PI) / 180, (lon * Math.PI) / 180];
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

/** Whether the Earth lies inside its cone. */
export function earthDirected(cme: Pick<Cme, 'lat' | 'lon' | 'halfAngle'>): boolean {
  return (Math.acos(Math.min(cmeAxis(cme.lat, cme.lon)[0], 1)) * 180) / Math.PI <= cme.halfAngle;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The CMEs that could be in flight at a moment: those that left in the days before it, up to it or today, whichever is sooner. */
export function donkiCmeUrl(at: number, now: number): string {
  const end = Math.min(at, now);
  return `${DONKI_API}/CME?startDate=${day(end - LOOKBACK_DAYS * 86_400_000)}&endDate=${day(end)}`;
}

/** The CMEs first seen from one moment to another, by DONKI's days. */
export function donkiCmesBetweenUrl(from: number, until: number): string {
  return `${DONKI_API}/CME?startDate=${day(from)}&endDate=${day(until)}`;
}

/** The CMEs for a moment, read; throws why when they cannot be. */
export async function fetchCmes(at: number, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Cme[]> {
  const res = await fetchImpl(donkiCmeUrl(at, now));
  if (!res.ok) throw new Error(`DONKI answered ${res.status}`);
  return parseCmes(await res.json());
}
