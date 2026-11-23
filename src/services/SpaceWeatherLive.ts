import { fallbackKpSnapshot, fallbackSolarWindSnapshot, type KpSnapshot, type SolarWindSnapshot } from './SpaceWeatherModeling';
import { noaaGeomagneticService } from './NOAAGeomagneticService';
import { fetchWithTimeout } from './space-weather/fetchWithTimeout';

/*
 * ─── WHERE THE SOLAR WIND COMES FROM, AND WHY NOT rtsw_*_1m ────────────────
 *
 * This read json/rtsw/rtsw_plasma_1m.json and rtsw_mag_1m.json. NOAA deleted
 * the plasma file — a 404, which a browser reports as a CORS failure, and was
 * first diagnosed as one — so every call since has returned the fixed fallback
 * reading below.
 *
 * The obvious replacement, rtsw_wind_1m.json, would have been wrong in four
 * ways, measured against a download on 2026-09-11 (rtsw_mag_1m, which still
 * loads, was already wrong in the first three):
 *
 *   - It is NEWEST FIRST. The parser took the last row as the latest, which is
 *     a reading from 24 hours earlier.
 *   - It interleaves three spacecraft (ACE, IMAP, SOLAR1), and `active` marks
 *     the one NOAA is using. That 24-hour-old row was from ACE, inactive.
 *   - Its time_tag carries no zone, so a browser parses it as LOCAL time —
 *     hours out, and west of Greenwich in the direction that hides staleness.
 *   - It is 2.5 MB (mag, 1.4 MB) for one reading, on a two-minute cycle.
 *
 * The geospace product below is NOAA's own selection: the active spacecraft's
 * speed, density and Bz in GSM — compared row by row with rtsw_mag_1m's
 * bz_gsm and rtsw_wind_1m's active rows, identical over all 55 — with UTC time
 * tags, one hour of rows, about 7 KB. One request where there were two.
 */
const SOLAR_WIND_URL = 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json';
const REQUEST_TIMEOUT_MS = 12000;

// Unlike fetchLiveKpSnapshot (backed by noaaGeomagneticService's own 5-min cache), this had
// no caching at all — every call hit NOAA fresh. Real duplicate callers exist today:
// GlobeEngine's periodic space-weather poller (every 5 min) and the
// useSolarWindData/useMagnetopauseData HUD hooks (each fetch once per toggle, independent
// of the poller's cadence) all call this directly. A 2-minute TTL — shorter than
// noaaGeomagneticService's 5 min since the product gains a row every minute — absorbs
// near-simultaneous calls from multiple callers without serving data meaningfully staler
// than the source's own cadence.
const SOLAR_WIND_CACHE_TTL_MS = 2 * 60 * 1000;
let solarWindCache: { result: { snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' }; fetchedAt: number } | null = null;
/**
 * The request currently on its way to NOAA, shared by every caller that
 * arrives before it lands.
 *
 * The TTL cache above only helps once a response is back. Until then each
 * caller missed it and sent its own — measured on 2026-09-25, a single layer
 * selection that started five space-weather overlays sent NOAA five requests
 * at once. Cleared when the request settles, success or failure, so a failure
 * is retried by the next caller rather than shared forever.
 */
let solarWindInFlight: Promise<{ snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' }> | null = null;

/** A number, or null. NOAA writes null for a missing value, and Number(null) is 0. */
function reading(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A NOAA time tag, as UTC. One without a zone is UTC as well — never the reader's local time. */
function utcTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * The newest complete reading in NOAA's propagated solar wind product — a
 * header row of column names, then a row a minute.
 *
 * Columns are found by NAME and the newest row by its TIME, not by position:
 * position is the assumption that read yesterday's Bz out of rtsw_mag_1m. A
 * row without a time, a speed or a density is skipped rather than completed —
 * the code this replaces stamped a missing time as "now".
 *
 * `timestamp` is when the wind was measured, upstream at L1. The product also
 * forecasts when it reaches Earth (propagated_time_tag, ~an hour later), which
 * nothing here uses yet.
 */
export function parsePropagatedSolarWind(data: unknown): SolarWindSnapshot | null {
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[0])) return null;
  const header = data[0] as unknown[];
  const [iTime, iSpeed, iDensity, iBz] = ['time_tag', 'speed', 'density', 'bz'].map((c) => header.indexOf(c));
  if (iTime < 0 || iSpeed < 0 || iDensity < 0) return null;

  let newest: SolarWindSnapshot | null = null;
  let newestAt = -Infinity;
  for (const row of data.slice(1)) {
    if (!Array.isArray(row)) continue;
    const at = utcTime(row[iTime]);
    const speed = reading(row[iSpeed]);
    const density = reading(row[iDensity]);
    if (at === null || speed === null || density === null || at <= newestAt) continue;
    newestAt = at;
    newest = {
      speedKmPerSec: speed,
      densityPerCm3: density,
      bz: (iBz >= 0 ? reading(row[iBz]) : null) ?? undefined,
      timestamp: new Date(at).toISOString(),
    };
  }
  return newest;
}

export async function fetchLiveSolarWindSnapshot(): Promise<{ snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' }>
{
  if (solarWindCache && Date.now() - solarWindCache.fetchedAt < SOLAR_WIND_CACHE_TTL_MS) {
    return solarWindCache.result;
  }
  if (solarWindInFlight) return solarWindInFlight;

  solarWindInFlight = requestSolarWindSnapshot().finally(() => { solarWindInFlight = null; });
  return solarWindInFlight;
}

async function requestSolarWindSnapshot(): Promise<{ snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' }> {
  try {
    const response = await fetchWithTimeout(SOLAR_WIND_URL, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`NOAA solar wind http ${response.status}`);
    const snapshot = parsePropagatedSolarWind(await response.json());
    if (!snapshot) throw new Error('NOAA solar wind: no complete reading');
    const result: { snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' } = { snapshot, quality: 'live' };
    solarWindCache = { result, fetchedAt: Date.now() };
    return result;
  } catch {
    // Deliberately not cached — a transient failure shouldn't lock every caller into the
    // fallback snapshot for the full TTL; the next call (from any caller) retries for real.
    return { snapshot: fallbackSolarWindSnapshot(), quality: 'fallback' };
  }
}

/** Test-only escape hatch — mirrors noaaGeomagneticService.clearCache()'s existing role for
 * the Kp side of this same module, so tests don't leak cached solar-wind state across runs. */
export function clearSolarWindCache(): void {
  solarWindInFlight = null;
  solarWindCache = null;
}

export async function fetchLiveKpSnapshot(): Promise<{ snapshot: KpSnapshot; quality: 'live' | 'fallback' }>
{
  try {
    const result = await noaaGeomagneticService.getCurrentConditions();
    if (!result.success || !result.data) throw new Error(result.error || 'geomagnetic fetch failed');
    const kp = result.data.kIndex;
    const timestamp = result.data.timestamp.toISOString();
    if (!Number.isFinite(kp)) throw new Error('invalid kp');
    return { snapshot: { kp, timestamp }, quality: 'live' };
  } catch {
    return { snapshot: fallbackKpSnapshot(), quality: 'fallback' };
  }
}

export interface GeomagneticTrendPoint {
  date: string; // ISO
  predictedKp: number;
}

// NOAAGeomagneticService.getForecast() (a real, already-implemented,
// previously-uncalled NOAA 3-day forecast endpoint) — wrapped here to
// match this file's existing live/fallback shape. Fallback is an empty
// array, not a fabricated prediction: "no forecast available" is an
// honest signal a caller can act on (e.g. hide the trend row), unlike
// fetchLiveKpSnapshot's fallback (a real illustrative Kp value is at
// least defensible as "assume typical/quiet conditions"; a fabricated
// *forecast* would misrepresent something we have no basis to predict).
export async function fetchGeomagneticForecast(): Promise<{ forecast: GeomagneticTrendPoint[]; quality: 'live' | 'fallback' }> {
  try {
    const result = await noaaGeomagneticService.getForecast();
    if (!result.success || !result.data || result.data.length === 0) {
      throw new Error(result.error || 'geomagnetic forecast fetch failed');
    }
    const forecast = result.data.map((entry) => ({
      date: entry.date.toISOString(),
      predictedKp: entry.predictedKIndex
    }));
    return { forecast, quality: 'live' };
  } catch {
    return { forecast: [], quality: 'fallback' };
  }
}

export interface GeomagneticRisk {
  level: 'low' | 'medium' | 'high';
  description: string;
}

// NOAAGeomagneticService.getDisruptionRisk() — likewise real and
// previously-uncalled. Fallback is null (no assessment), same honesty
// stance as the forecast above.
export async function fetchGeomagneticDisruptionRisk(): Promise<{ risk: GeomagneticRisk | null; quality: 'live' | 'fallback' }> {
  try {
    const result = await noaaGeomagneticService.getDisruptionRisk();
    if (!result.success || !result.data) throw new Error(result.error || 'geomagnetic risk fetch failed');
    return { risk: { level: result.data.risk, description: result.data.description }, quality: 'live' };
  } catch {
    return { risk: null, quality: 'fallback' };
  }
}
