/**
 * NOAA SWPC's OVATION aurora forecast (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW3).
 *
 * One file, `ovation_aurora_latest.json`, made every few minutes: the chance of
 * seeing aurora overhead, in whole percent, on a 1° grid of the whole planet
 * (65,160 cells, both hemispheres), for a moment about an hour ahead of when it
 * was observed. Read as it states itself, "[Longitude, Latitude, Aurora]",
 * longitudes 0 to 359 east; a file in any other form is refused rather than
 * drawn in the wrong places.
 */

export const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const FORMAT = '[Longitude, Latitude, Aurora]';
const COLS = 360;
const ROWS = 181;

export interface OvationGrid {
  /** When the observations it was made from end, and the moment it forecasts. */
  observed: string;
  forecast: string;
  /** Percent, by row (latitude −90 to 90) then column (longitude 0 to 359 east). */
  values: Uint8Array;
  max: number;
  nonZero: number;
}

const isTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

/** The file as served, read; throws why when it is not in the form it states. */
export function parseOvation(json: unknown): OvationGrid {
  const d = json as Record<string, unknown>;
  if (d['Data Format'] !== FORMAT) throw new Error(`OVATION's data format was "${String(d['Data Format'])}", not "${FORMAT}".`);
  const coordinates = d.coordinates as unknown;
  if (!Array.isArray(coordinates) || coordinates.length !== COLS * ROWS) {
    throw new Error(`OVATION held ${Array.isArray(coordinates) ? new Intl.NumberFormat('en-US').format(coordinates.length) : 'no'} cells, not ${new Intl.NumberFormat('en-US').format(COLS * ROWS)}.`);
  }
  for (const key of ['Observation Time', 'Forecast Time']) {
    if (!isTime(d[key])) throw new Error(`OVATION's ${key.toLowerCase()} "${String(d[key])}" is not a time.`);
  }
  const values = new Uint8Array(COLS * ROWS);
  let max = 0, nonZero = 0;
  for (const cell of coordinates) {
    const [lon, lat, value] = cell as [number, number, number];
    if (![lon, lat, value].every(Number.isFinite)) continue;
    const v = Math.min(Math.max(Math.round(value), 0), 100);
    values[(Math.round(lat) + 90) * COLS + (((Math.round(lon) % 360) + 360) % 360)] = v;
    if (v > 0) nonZero += 1;
    max = Math.max(max, v);
  }
  return { observed: d['Observation Time'] as string, forecast: d['Forecast Time'] as string, values, max, nonZero };
}

/** The chance of aurora at a place, percent: its cell's, longitude west as well as east. */
export function ovationAt(grid: OvationGrid, lat: number, lng: number): number {
  const row = Math.min(Math.max(Math.round(lat) + 90, 0), ROWS - 1);
  const col = ((Math.round(lng) % 360) + 360) % 360;
  return grid.values[row * COLS + col];
}

/** Where the aurora runs at one longitude: the band's middle, weighted by the chance, and its strongest; no latitude where there is none. */
export interface OvalPoint { lng: number; lat: number | null; peak: number }

/** The oval of one hemisphere, a point at each longitude 0 to 359. */
export function auroraOval(grid: OvationGrid, hemisphere: 'north' | 'south'): OvalPoint[] {
  const [from, to] = hemisphere === 'north' ? [1, 90] : [-90, -1];
  return Array.from({ length: COLS }, (_, lng) => {
    let weight = 0, sum = 0, peak = 0;
    for (let lat = from; lat <= to; lat++) {
      const v = grid.values[(lat + 90) * COLS + lng];
      weight += v;
      sum += v * lat;
      peak = Math.max(peak, v);
    }
    return { lng, lat: weight > 0 ? sum / weight : null, peak };
  });
}

/** The latest forecast, read; throws why when it cannot be. */
export async function fetchOvation(fetchImpl: typeof fetch = fetch): Promise<OvationGrid> {
  const res = await fetchImpl(OVATION_URL);
  if (!res.ok) throw new Error(`OVATION answered ${res.status}.`);
  return parseOvation(await res.json());
}
