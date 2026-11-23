/**
 * T96's drivers from what NOAA serves (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4).
 *
 * - The solar wind at Earth: NOAA SWPC's propagated 1-hour product, a minute a row, measured at L1
 *   and carried to the bow shock; its density and speed make the dynamic pressure, and its By and Bz
 *   (GSM) are the IMF's.
 * - Dst: estimated from NOAA's real-time wind (dstEstimate.ts). Kyoto's quick-look index, which SWPC
 *   relays, is not used: Kyoto asks to be contacted before it is used in publications, which a card is.
 *
 * T96 was fitted to a pressure of 0.5 to 10 nPa, Dst of -100 to +20 nT, and By and Bz of -10 to +10
 * nT. Outside that its field can be unphysical, so each driver is held at the range's edge, and what
 * was measured is kept to be said where the lines are drawn. A feed that cannot be read is replaced
 * by quiet values, and said so.
 */
import type { T96Drivers } from './geopack/t96';
import { fetchDstEstimate } from './dstEstimate';

export const SOLAR_WIND_URL = 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json';

/** The range T96 was fitted to: pressure, nPa; Dst, nT; the IMF's By and Bz, nT. */
export const T96_RANGE = { pdyn: [0.5, 10], dst: [-100, 20], imf: [-10, 10] } as const;

/** Quiet values, for a feed that cannot be read. */
const QUIET = { pdyn: 2, dst: 0, byImf: 0, bzImf: 0 };

export interface PropagatedWind {
  /** When it was measured at L1, and when it reaches Earth. */
  observed: string;
  arrives: string;
  /** km/s, and protons per cm³. */
  speed: number;
  density: number;
  /** The IMF, GSM, nT. */
  bx: number;
  by: number;
  bz: number;
}

/** Dst, estimated from the wind, nT: for when, and from how many hours of wind. */
export interface DstReading {
  at: string;
  dst: number;
  hours: number;
}

/** A driver held within T96's range: what was measured, and what T96 was given. */
export interface HeldDriver {
  driver: 'pressure' | 'Dst' | 'By' | 'Bz';
  measured: number;
  given: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const timeOf = (v: unknown): number => (typeof v === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`) : NaN);

/** The newest complete minute of the propagated wind, found by its columns' names; none if no row is complete. */
export function parsePropagatedWind(data: unknown): PropagatedWind | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const header = data[0] as unknown[];
  const col = (name: string) => header.indexOf(name);
  const [iTime, iSpeed, iDensity, iBx, iBy, iBz, iArrives] = ['time_tag', 'speed', 'density', 'bx', 'by', 'bz', 'propagated_time_tag'].map(col);
  let newest: PropagatedWind | null = null;
  let newestAt = -Infinity;
  for (const row of data.slice(1)) {
    if (!Array.isArray(row)) continue;
    const at = timeOf(row[iTime]);
    const [speed, density, bx, by, bz] = [row[iSpeed], row[iDensity], row[iBx], row[iBy], row[iBz]];
    if (!Number.isFinite(at) || at <= newestAt || ![speed, density, bx, by, bz].every(finite)) continue;
    newestAt = at;
    newest = { observed: String(row[iTime]), arrives: String(row[iArrives] ?? row[iTime]), speed, density, bx, by, bz };
  }
  return newest;
}

/** T96's drivers from the measurements, each held within its range; the dynamic pressure as Tsyganenko reckons it, 1.94e-6·n·V², the wind's helium included. */
export function driversFrom(wind: PropagatedWind | null, dst: DstReading | null): { drivers: T96Drivers; held: HeldDriver[] } {
  const held: HeldDriver[] = [];
  const hold = (driver: HeldDriver['driver'], measured: number, [lo, hi]: readonly [number, number]) => {
    const given = Math.min(Math.max(measured, lo), hi);
    if (given !== measured) held.push({ driver, measured, given });
    return given;
  };
  const pdyn = wind ? hold('pressure', 1.94e-6 * wind.density * wind.speed ** 2, T96_RANGE.pdyn) : QUIET.pdyn;
  const dstGiven = dst ? hold('Dst', dst.dst, T96_RANGE.dst) : QUIET.dst;
  const byImf = wind ? hold('By', wind.by, T96_RANGE.imf) : QUIET.byImf;
  const bzImf = wind ? hold('Bz', wind.bz, T96_RANGE.imf) : QUIET.bzImf;
  return { drivers: { pdyn, dst: dstGiven, byImf, bzImf }, held };
}

export interface T96DriverReading {
  drivers: T96Drivers;
  held: HeldDriver[];
  wind: PropagatedWind | null;
  dst: DstReading | null;
  /** The feeds that could not be read, and why; quiet values stand in for them. */
  missing: string[];
}

async function read<T>(fetchImpl: typeof fetch, url: string, parse: (data: unknown) => T | null, what: string, missing: string[]): Promise<T | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { missing.push(`${what} (NOAA answered ${res.status})`); return null; }
    const parsed = parse(await res.json());
    if (!parsed) missing.push(`${what} (no complete reading)`);
    return parsed;
  } catch (error) {
    missing.push(`${what} (${(error as Error).message})`);
    return null;
  }
}

/** The latest drivers, both feeds read together. */
export async function fetchT96Drivers(fetchImpl: typeof fetch = fetch): Promise<T96DriverReading> {
  const missing: string[] = [];
  const [wind, dst] = await Promise.all([
    read(fetchImpl, SOLAR_WIND_URL, parsePropagatedWind, 'the solar wind', missing),
    fetchDstEstimate(fetchImpl).catch((error: Error) => { missing.push(`Dst, estimated from the real-time wind (${error.message})`); return null; }),
  ]);
  return { ...driversFrom(wind, dst), wind, dst, missing };
}
