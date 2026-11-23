/**
 * The quakes of a window older than the live feeds (D-EQ, EQ3, EQ4, EQ15): USGS's catalogue of magnitude 5 and over
 * since 1900, baked a decade a file (scripts/quakes/bake-history.ts), and NOAA NCEI's atlas of significant quakes from
 * 2150 BC with their deaths, damage and tsunamis (scripts/quakes/bake-atlas.ts). Only the decades a window touches are
 * read, each once. A window reaching past the bake's last moment reads that part from USGS's event service. An atlas
 * quake that is one of USGS's (within a minute, 100 km and one magnitude) is folded into it, its NOAA record kept.
 */
import type { NaturalEvent } from '../GeoEventsService';
import { historicalUtc, yearWords } from '../../features/globe/timebar/timebarRange';
import { usgsQuakes } from './quakeWindow';

export const HISTORY_FIRST_YEAR = 1900;
const HISTORY_URL = (decade: number) => `/data/quakes/history/m5-${decade}.json`;
export const ATLAS_URL = '/data/quakes/atlas.json';
const USGS_QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/** What NOAA's atlas says of a quake beside its place and magnitude. */
export interface AtlasRecord {
  ncei: number;
  /** Deaths, the quake's and what it caused, as NCEI counts them; null where it gives only their order. */
  deaths: number | null;
  /** NCEI's order of deaths where no count is known: 1 under 50, 2 51–100, 3 101–1,000, 4 over 1,000. */
  deathsOrder: number | null;
  damageMillions: number | null;
  tsunami: boolean;
  intensity: number | null;
}

/** A quake read from the history, with the date as precisely as its record gives it. */
export type HistoricalQuake = NaturalEvent & { atlas?: AtlasRecord; dateWords?: string };

interface HistoryDecadeFile {
  decade: number; from: number; until: number; credit: string;
  ids: string[]; t: number[]; lat: number[]; lng: number[]; depth: number[]; mag: number[];
}
interface AtlasFile {
  credit: string; ids: number[]; year: number[]; month: (number | null)[]; day: (number | null)[]; clock: (number | null)[];
  place: string[]; lat: number[]; lng: number[]; depth: (number | null)[]; mag: (number | null)[]; intensity: (number | null)[];
  deaths: (number | null)[]; deathsOrder: (number | null)[]; damageM: (number | null)[]; tsunami: boolean[];
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const decades = new Map<number, Promise<HistoryDecadeFile | null>>();
let atlasRead: Promise<AtlasFile | null> | null = null;

async function readJson<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  try {
    const response = await fetcher(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

function decadeFile(decade: number, fetcher: Fetcher): Promise<HistoryDecadeFile | null> {
  let read = decades.get(decade);
  if (!read) {
    read = readJson<HistoryDecadeFile>(fetcher, HISTORY_URL(decade)).then((file) => { if (!file) decades.delete(decade); return file; });
    decades.set(decade, read);
  }
  return read;
}

function atlasFile(fetcher: Fetcher): Promise<AtlasFile | null> {
  atlasRead ??= readJson<AtlasFile>(fetcher, ATLAS_URL).then((file) => { if (!file) atlasRead = null; return file; });
  return atlasRead;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An atlas quake's moment and its date in words, as precisely as NCEI gives it. NCEI's -2150 is 2150 BC. */
export function atlasMoment(year: number, month: number | null, day: number | null, clock: number | null): { t: number; words: string } {
  const astronomical = year < 0 ? year + 1 : year;
  const m = month ? month - 1 : 0;
  const t = historicalUtc(astronomical, m, day ?? 1) + (clock ?? 0) * 1000;
  const yearText = yearWords(astronomical);
  if (!month) return { t, words: yearText };
  if (!day) return { t, words: `${MONTHS[m]} ${yearText}` };
  if (clock === null) return { t, words: `${day} ${MONTHS[m]} ${yearText}` };
  const hh = String(Math.floor(clock / 3600)).padStart(2, '0');
  const mm = String(Math.floor((clock % 3600) / 60)).padStart(2, '0');
  return { t, words: `${day} ${MONTHS[m]} ${yearText} ${hh}:${mm}Z` };
}

/** The decades a window touches, from 1900 on. */
export function decadesOf(from: number, until: number): number[] {
  const first = Math.max(HISTORY_FIRST_YEAR, Math.floor(new Date(from).getUTCFullYear() / 10) * 10);
  const last = Math.floor(new Date(until).getUTCFullYear() / 10) * 10;
  const out: number[] = [];
  for (let d = first; d <= last; d += 10) out.push(d);
  return out;
}

const SAME = { ms: 60_000, km: 100, magnitude: 1 };
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The catalogue's quakes of a decade file inside a window. */
export function catalogueQuakes(file: HistoryDecadeFile, from: number, until: number): HistoricalQuake[] {
  const out: HistoricalQuake[] = [];
  for (let i = 0; i < file.ids.length; i += 1) {
    const t = file.t[i] * 1000;
    if (t < from || t > until) continue;
    out.push({
      id: file.ids[i],
      lat: file.lat[i],
      lng: file.lng[i],
      type: 'earthquake',
      magnitude: file.mag[i],
      timestamp: new Date(t).toISOString(),
      description: `M ${file.mag[i].toFixed(1)} quake, from USGS's catalogue`,
      source: 'USGS',
      ...(file.depth[i] >= 0 ? { depthKm: file.depth[i] } : {}),
      reportedBy: ["USGS's catalogue"],
      sourceUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${file.ids[i]}`,
    });
  }
  return out;
}

/** The atlas's quakes inside a window. */
export function atlasQuakes(file: AtlasFile, from: number, until: number): HistoricalQuake[] {
  const out: HistoricalQuake[] = [];
  for (let i = 0; i < file.ids.length; i += 1) {
    const { t, words } = atlasMoment(file.year[i], file.month[i], file.day[i], file.clock[i]);
    if (t < from || t > until) continue;
    const mag = file.mag[i];
    out.push({
      id: `ncei:${file.ids[i]}`,
      lat: file.lat[i],
      lng: file.lng[i],
      type: 'earthquake',
      ...(mag !== null ? { magnitude: mag } : {}),
      timestamp: new Date(t).toISOString(),
      dateWords: words,
      description: `${mag !== null ? `M ${mag.toFixed(1)}` : 'A significant quake'} - ${file.place[i]}`,
      source: 'NOAA NCEI',
      ...(file.depth[i] !== null ? { depthKm: file.depth[i] as number } : {}),
      reportedBy: ["NOAA NCEI's significant quakes"],
      sourceUrl: `https://www.ngdc.noaa.gov/hazel/view/hazards/earthquake/event-more-info/${file.ids[i]}`,
      atlas: {
        ncei: file.ids[i],
        deaths: file.deaths[i],
        deathsOrder: file.deathsOrder[i],
        damageMillions: file.damageM[i],
        tsunami: file.tsunami[i],
        intensity: file.intensity[i],
      },
    });
  }
  return out;
}

/** The catalogue's and the atlas's together: an atlas quake that is one of USGS's folded into it, its record kept. */
export function foldAtlas(catalogue: readonly HistoricalQuake[], atlas: readonly HistoricalQuake[]): HistoricalQuake[] {
  const merged = catalogue.map((q) => ({ ...q, reportedBy: [...(q.reportedBy ?? [])] }));
  const byTime = merged.map((q, i) => ({ t: Date.parse(q.timestamp as string), i })).sort((a, b) => a.t - b.t);
  const out: HistoricalQuake[] = [];
  for (const quake of atlas) {
    const t = Date.parse(quake.timestamp as string);
    let lo = 0;
    let hi = byTime.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (byTime[mid].t < t - SAME.ms) lo = mid + 1; else hi = mid; }
    let same: HistoricalQuake | null = null;
    for (let k = lo; k < byTime.length && byTime[k].t <= t + SAME.ms; k += 1) {
      const c = merged[byTime[k].i];
      const closeMagnitude = typeof quake.magnitude !== 'number' || typeof c.magnitude !== 'number' || Math.abs(c.magnitude - quake.magnitude) <= SAME.magnitude;
      if (closeMagnitude && kmBetween(c, quake) <= SAME.km) { same = c; break; }
    }
    if (same) {
      same.atlas = quake.atlas;
      same.description = `${same.description?.split(',')[0]} - ${quake.description?.split(' - ').slice(1).join(' - ')}`;
      same.reportedBy?.push(...(quake.reportedBy ?? []));
    } else {
      out.push(quake);
    }
  }
  return [...merged, ...out];
}

export interface HistoryRead {
  quakes: HistoricalQuake[];
  /** Whether the atlas was read, and how many of its quakes are in the window. */
  atlasRead: boolean;
  atlasCount: number;
}

/** A window's quakes from the history: the decades it touches, the atlas, and USGS's service past the bake. */
export async function readHistoryWindow(window: { from: number; until: number }, options: { fetcher?: Fetcher; now?: number } = {}): Promise<HistoryRead> {
  const fetcher = options.fetcher ?? fetch;
  const files = await Promise.all(decadesOf(window.from, window.until).map((d) => decadeFile(d, fetcher)));
  const atlas = await atlasFile(fetcher);
  const catalogue = files.flatMap((file) => (file ? catalogueQuakes(file, window.from, window.until) : []));
  // Past the bake's last moment, USGS's own service, magnitude 5 and over, as the files hold.
  const baked = files.reduce((latest, file) => Math.max(latest, file ? file.until * 1000 : 0), 0);
  if (baked && window.until > baked) {
    const params = new URLSearchParams({
      format: 'geojson', minmagnitude: '5', orderby: 'time-asc',
      starttime: new Date(Math.max(window.from, baked)).toISOString().slice(0, 19),
      endtime: new Date(window.until).toISOString().slice(0, 19),
    });
    const recent = await readJson<unknown>(fetcher, `${USGS_QUERY}?${params.toString()}`);
    if (recent) catalogue.push(...usgsQuakes(recent));
  }
  const inAtlas = atlas ? atlasQuakes(atlas, window.from, window.until) : [];
  return { quakes: foldAtlas(catalogue, inAtlas), atlasRead: atlas !== null, atlasCount: inAtlas.length };
}

/** Test-only. */
export function resetHistoryForTests(): void {
  decades.clear();
  atlasRead = null;
}
