/**
 * The quakes for the window shown (D-EQ, EQ1, EQ2, EQ14): USGS's summary feed that covers it, and EMSC's event
 * service for the same span, merged. An EMSC quake within a minute and 100 km of a USGS one, its magnitude within one
 * of USGS's, is the same quake: kept once, as USGS gives it, named by both agencies. The rest of EMSC's stand on their
 * own, named by the agency EMSC took them from.
 *
 * Which feed: live, the last day of every quake, or the time bar's 7 d (the last week, every quake) or 30 d (the last
 * 30 days, magnitude 2.5 and over: all of them is about ten thousand); a paused window inside the last 30 days, the
 * smallest feed reaching back to its start. A window starting earlier is the history's (quakeHistory.ts; EQ3, EQ4).
 *
 * EMSC's terms (CC BY 4.0, credited; no bulk copying): read live for the window shown, never kept.
 */
import type { NaturalEvent } from '../GeoEventsService';
import { GeoEventsDataProvider, type USGSEarthquakeData } from '../data-management/providers/GeoEventsDataProvider';
import type { RangePresetId } from '../../features/globe/timebar/timebarRange';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const USGS_FEEDS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';
const EMSC_QUERY = 'https://www.seismicportal.eu/fdsnws/event/1/query';
/** At most this many of EMSC's quakes for a window: past it, the strongest (the query orders by magnitude). */
export const EMSC_LIMIT = 4000;

export type QuakeFeed = 'day' | 'week' | 'month';
export const QUAKE_FEEDS: Readonly<Record<QuakeFeed, { url: string; spanMs: number; minMagnitude: number; words: string }>> = {
  day: { url: `${USGS_FEEDS}/all_day.geojson`, spanMs: DAY_MS, minMagnitude: 0, words: 'every magnitude' },
  week: { url: `${USGS_FEEDS}/all_week.geojson`, spanMs: 7 * DAY_MS, minMagnitude: 0, words: 'every magnitude' },
  month: { url: `${USGS_FEEDS}/2.5_month.geojson`, spanMs: 30 * DAY_MS, minMagnitude: 2.5, words: 'magnitude 2.5 and over' },
};

export interface QuakeWindow {
  from: number;
  until: number;
  /** A live feed, or the baked history (quakeHistory.ts) for a window older than they reach. */
  feed: QuakeFeed | 'history';
  /** Whether it ends now and moves with the clock. */
  live: boolean;
}

/** The window the quakes follow: a live feed's, or the history's for one starting before the last 30 days. */
export function quakeWindowFor(options: { range: RangePresetId; paused: { start: number; end: number } | null; now: number }): QuakeWindow {
  const { range, paused, now } = options;
  if (paused) {
    const from = Math.min(paused.start, paused.end);
    const until = Math.max(paused.start, paused.end);
    const back = now - from;
    if (back > QUAKE_FEEDS.month.spanMs) return { from, until, feed: 'history', live: false };
    const feed: QuakeFeed = back <= QUAKE_FEEDS.day.spanMs ? 'day' : back <= QUAKE_FEEDS.week.spanMs ? 'week' : 'month';
    return { from, until, feed, live: false };
  }
  const feed: QuakeFeed = range === '7d' ? 'week' : range === '30d' ? 'month' : 'day';
  return { from: now - QUAKE_FEEDS[feed].spanMs, until: now, feed, live: true };
}

/** A replay through the history is read this many seconds of play at a time (EQ7). */
export const REPLAY_CHUNK_S = 3;

/**
 * What the quakes are read for while the time bar plays (EQ7, EQ17), in place of the window each step moves to: the
 * window each step moved to was read again twice a second, from USGS and EMSC alike. Inside the feeds' 30 days, once
 * for the whole play, from where it began less the decay to when it began; further back, from the history a few seconds
 * of play at a time, the next ones with it, so the next stretch is drawn before play reaches it. Each quake is shown
 * from its moment, as the play clock reaches it.
 */
export function replayQuakeWindow(options: {
  startMs: number; atMs: number; decayMs: number; msPerSecond: number; now: number;
}): QuakeWindow {
  const { startMs, atMs, decayMs, msPerSecond, now } = options;
  const from = startMs - decayMs;
  const back = now - from;
  if (back <= QUAKE_FEEDS.month.spanMs) {
    const feed: QuakeFeed = back <= QUAKE_FEEDS.day.spanMs ? 'day' : back <= QUAKE_FEEDS.week.spanMs ? 'week' : 'month';
    return { from, until: now, feed, live: false };
  }
  const chunk = REPLAY_CHUNK_S * msPerSecond;
  const k = Math.max(0, Math.floor((atMs - startMs) / chunk));
  return { from: startMs + k * chunk - decayMs, until: Math.min(now, startMs + (k + 2) * chunk), feed: 'history', live: false };
}

/** The window in words, for the key: "the last 7 days, every magnitude". */
export function quakeWindowWords(window: QuakeWindow): string {
  if (window.feed === 'history') return "the window chosen, magnitude 5 and over from USGS's catalogue, with NOAA's significant quakes";
  const span = window.feed === 'day' ? 'day' : window.feed === 'week' ? '7 days' : '30 days';
  const when = window.live ? `the last ${span}` : 'the window chosen';
  return `${when}, ${QUAKE_FEEDS[window.feed].words}`;
}

/** USGS's quakes from a summary feed, each named by its network ("USGS (ci)"). */
export function usgsQuakes(feed: unknown): NaturalEvent[] {
  const data = feed as USGSEarthquakeData | null;
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return [];
  const byId = new Map(data.features.map((f) => [String(f.id), f.properties?.net]));
  return new GeoEventsDataProvider().transformUSGSToNaturalEvents(data).map((event) => {
    const net = byId.get(String(event.id));
    return { ...event, reportedBy: [typeof net === 'string' && net ? `USGS (${net})` : 'USGS'] };
  });
}

interface EmscFeature {
  id?: string;
  properties?: { unid?: string; time?: string; lat?: number; lon?: number; depth?: number; mag?: number; magtype?: string; auth?: string; flynn_region?: string };
}

const regionName = (region: string) => region.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** EMSC's quakes from its event service's GeoJSON, each named by the agency EMSC took it from ("EMSC (CSN)"). */
export function emscQuakes(feed: unknown): NaturalEvent[] {
  const features = (feed as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: NaturalEvent[] = [];
  for (const f of features as EmscFeature[]) {
    const p = f?.properties;
    if (!p) continue;
    const { lat, lon, mag, depth } = p;
    const t = typeof p.time === 'string' ? Date.parse(p.time) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat as number) > 90 || !Number.isFinite(t)) continue;
    const unid = p.unid ?? f.id;
    if (!unid) continue;
    const magnitude = Number.isFinite(mag) ? (mag as number) : undefined;
    out.push({
      id: `emsc:${unid}`,
      lat: lat as number,
      lng: lon as number,
      type: 'earthquake',
      ...(magnitude !== undefined ? { magnitude } : {}),
      timestamp: new Date(t).toISOString(),
      description: `M ${magnitude !== undefined ? magnitude.toFixed(1) : '?'} - ${p.flynn_region ? regionName(p.flynn_region) : 'a place EMSC did not name'}`,
      source: 'EMSC',
      ...(Number.isFinite(depth) ? { depthKm: Math.abs(depth as number) } : {}),
      reportedBy: [p.auth ? `EMSC (${p.auth})` : 'EMSC'],
      sourceUrl: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(String(unid))}`,
    });
  }
  return out;
}

const EARTH_RADIUS_KM = 6371;
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The same quake reported twice: within a minute, within 100 km, and magnitudes within one. */
export const SAME_QUAKE = { seconds: 60, km: 100, magnitude: 1 } as const;

/**
 * USGS's quakes and EMSC's, as one list: each EMSC quake that is a USGS one folded into it, its agency added to
 * `reportedBy`; the others kept. USGS's own are never dropped.
 */
export function mergeQuakes(usgs: readonly NaturalEvent[], emsc: readonly NaturalEvent[]): NaturalEvent[] {
  const timeOf = (e: NaturalEvent) => (e.timestamp ? Date.parse(e.timestamp) : NaN);
  const merged = usgs.map((e) => ({ ...e, reportedBy: [...(e.reportedBy ?? ['USGS'])] }));
  const sorted = merged.map((e, i) => ({ t: timeOf(e), i })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const windowMs = SAME_QUAKE.seconds * 1000;
  const firstAtOrAfter = (t: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].t < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const out: NaturalEvent[] = [];
  for (const quake of emsc) {
    const t = timeOf(quake);
    let same: NaturalEvent | null = null;
    if (Number.isFinite(t)) {
      for (let k = firstAtOrAfter(t - windowMs); k < sorted.length && sorted[k].t <= t + windowMs; k += 1) {
        const candidate = merged[sorted[k].i];
        const closeMagnitude = typeof candidate.magnitude !== 'number' || typeof quake.magnitude !== 'number'
          || Math.abs(candidate.magnitude - quake.magnitude) <= SAME_QUAKE.magnitude;
        if (closeMagnitude && kmBetween(candidate, quake) <= SAME_QUAKE.km) { same = candidate; break; }
      }
    }
    if (same) {
      for (const agency of quake.reportedBy ?? []) if (!same.reportedBy?.includes(agency)) same.reportedBy?.push(agency);
    } else {
      out.push(quake);
    }
  }
  return [...merged, ...out];
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function readJson(fetcher: Fetcher, url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** EMSC's query for a window: its span, the feed's least magnitude, the strongest first when it has more. */
export function emscQueryUrl(window: QuakeWindow & { feed: QuakeFeed }): string {
  const params = new URLSearchParams({
    format: 'json',
    starttime: new Date(window.from).toISOString().slice(0, 19),
    endtime: new Date(window.until).toISOString().slice(0, 19),
    limit: String(EMSC_LIMIT),
    orderby: 'magnitude',
  });
  if (QUAKE_FEEDS[window.feed].minMagnitude > 0) params.set('minmag', String(QUAKE_FEEDS[window.feed].minMagnitude));
  return `${EMSC_QUERY}?${params.toString()}`;
}

export interface QuakeWindowRead {
  quakes: NaturalEvent[];
  /** Whether EMSC's could be read; USGS's alone stand when not. */
  emscRead: boolean;
  /** How many of EMSC's were folded into USGS's, and how many added. */
  folded: number;
  added: number;
}

/**
 * The window's quakes from both: USGS's feed and EMSC's query, read together. USGS's failing fails the read; EMSC's
 * failing leaves USGS's, said so. Only the quakes inside the window are kept.
 */
export async function readQuakeWindow(window: QuakeWindow & { feed: QuakeFeed }, options: { fetcher?: Fetcher; signal?: AbortSignal } = {}): Promise<QuakeWindowRead> {
  const fetcher = options.fetcher ?? fetch;
  const [usgsFeed, emscFeed] = await Promise.all([
    readJson(fetcher, QUAKE_FEEDS[window.feed].url, options.signal),
    readJson(fetcher, emscQueryUrl(window), options.signal).catch(() => null),
  ]);
  const inside = (e: NaturalEvent) => {
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    return Number.isFinite(t) && t >= window.from && t <= window.until;
  };
  const usgs = usgsQuakes(usgsFeed).filter(inside);
  const emsc = emscFeed ? emscQuakes(emscFeed).filter(inside) : [];
  const quakes = mergeQuakes(usgs, emsc);
  return { quakes, emscRead: emscFeed !== null, folded: usgs.length + emsc.length - quakes.length, added: quakes.length - usgs.length };
}
