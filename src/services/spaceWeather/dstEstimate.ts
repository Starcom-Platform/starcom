/**
 * Dst estimated from the measured solar wind (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4): T96 takes Dst, and
 * Kyoto, whose quick-look index NOAA relays, asks to be contacted before it is used in publications,
 * which a card is. Until that is settled, Dst is estimated from public NOAA data.
 *
 * The model is O'Brien & McPherron (2000), J. Atmos. Sol.-Terr. Phys. 62, 1295: the ring current's
 * part of Dst, Dst*, is fed by the solar wind's dawn-dusk electric field when the IMF points south,
 * and decays at a rate that slows as that field strengthens,
 *
 *   dDst* / dt = Q - Dst* / τ,  Q = -4.4 (VBs - 0.49) nT/h for VBs > 0.49 mV/m, else 0,
 *   τ = 2.4 exp(9.74 / (4.69 + VBs)) h,  Dst = Dst* + 7.26 √Pdyn - 11 nT,
 *
 * with V the wind's speed, Bs its field's southward part, and Pdyn its proton pressure. It is run a
 * minute a step over NOAA's real-time wind (the last day, a minute a row, from the spacecraft then
 * active at L1), each minute timed for when it reaches the Earth, 1.5 million km on at its own speed,
 * from Dst* = 0 a day back: the start is forgotten in a few τ, which is hours.
 */

export const REALTIME_WIND_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
export const REALTIME_MAG_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';

/** The least wind the estimate is made from, hours: a few τ, so the start is forgotten. */
const MIN_HOURS = 6;
/** From L1 to the Earth, km. */
const L1_KM = 1.5e6;
/** A gap longer than this, hours, is not stepped across in one step: the last minute is held through it. */
const MAX_STEP_HOURS = 1 / 6;

export interface WindMinute {
  /** When it was measured at L1, ms. */
  t: number;
  /** km/s, protons per cm³, and the IMF's Bz, GSM, nT. */
  speed: number;
  density: number;
  bz: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const timeOf = (v: unknown): number => (typeof v === 'string' ? Date.parse(/[zZ]$/.test(v) ? v : `${v}Z`) : NaN);

/** The active spacecraft's minutes, the wind's speed and density joined to the field's Bz by the minute; oldest first. */
export function joinRealtimeWind(wind: unknown, mag: unknown): WindMinute[] {
  const bzAt = new Map<number, number>();
  if (Array.isArray(mag)) {
    for (const row of mag as Array<Record<string, unknown>>) {
      const t = timeOf(row?.time_tag);
      if (row?.active === true && Number.isFinite(t) && finite(row.bz_gsm)) bzAt.set(t, row.bz_gsm);
    }
  }
  const minutes = new Map<number, WindMinute>();
  if (Array.isArray(wind)) {
    for (const row of wind as Array<Record<string, unknown>>) {
      const t = timeOf(row?.time_tag);
      const bz = bzAt.get(t);
      if (row?.active !== true || bz === undefined || !finite(row.proton_speed) || !finite(row.proton_density)) continue;
      minutes.set(t, { t, speed: row.proton_speed, density: row.proton_density, bz });
    }
  }
  return [...minutes.values()].sort((a, b) => a.t - b.t);
}

/** When a minute's wind reaches the Earth, ms. */
export const arrivesAt = (m: WindMinute): number => m.t + (L1_KM / m.speed) * 1000;

/** Dst estimated for when the last minute's wind reaches the Earth, nT, with how many hours of wind it was made from; none from less than six. */
export function estimateDst(measured: readonly WindMinute[]): { dst: number; at: string; hours: number } | null {
  // Timed for the Earth; a faster minute can overtake a slower one, and is taken in its order there.
  const minutes = measured.map((m) => ({ ...m, t: arrivesAt(m) })).sort((a, b) => a.t - b.t);
  if (minutes.length < 2) return null;
  const hours = (minutes[minutes.length - 1].t - minutes[0].t) / 3_600_000;
  if (hours < MIN_HOURS) return null;
  let star = 0;
  for (let k = 1; k < minutes.length; k++) {
    // The wind of the minute before, held until this one.
    const { speed, bz } = minutes[k - 1];
    const vbs = speed * Math.max(-bz, 0) * 1e-3;
    const q = vbs > 0.49 ? -4.4 * (vbs - 0.49) : 0;
    const tau = 2.4 * Math.exp(9.74 / (4.69 + vbs));
    let left = (minutes[k].t - minutes[k - 1].t) / 3_600_000;
    while (left > 0) {
      const dt = Math.min(left, MAX_STEP_HOURS);
      star += (q - star / tau) * dt;
      left -= dt;
    }
  }
  const last = minutes[minutes.length - 1];
  const pressure = 1.6726e-6 * last.density * last.speed ** 2;
  return { dst: star + 7.26 * Math.sqrt(pressure) - 11, at: new Date(Math.round(last.t / 1000) * 1000).toISOString().replace('.000Z', 'Z'), hours };
}

/** The estimate from NOAA's real-time wind, both files read together; throws why when it cannot be made. */
export async function fetchDstEstimate(fetchImpl: typeof fetch = fetch): Promise<{ dst: number; at: string; hours: number }> {
  const [wind, mag] = await Promise.all([REALTIME_WIND_URL, REALTIME_MAG_URL].map(async (url) => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
    return res.json();
  }));
  const est = estimateDst(joinRealtimeWind(wind, mag));
  if (!est) throw new Error('less than six hours of solar wind');
  return est;
}
