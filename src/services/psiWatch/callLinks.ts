/**
 * What fell in a call's window (decision D-PW, PW40, PW56, PW74; step 9c): once the window has closed, a call
 * expecting earthquakes links each M5.5+ in its Zone within the window, from USGS's ComCat (the FDSN event service,
 * public domain, the query Mecha Jono's comcat_m55 is built on), and a call expecting a storm links each storm, Kp 5
 * or more, within the window, from the Kp lane's record (measured values only; a storm's consecutive slots one storm).
 * Linked, never scored (PW36). Each other kind links as its live feed is wired (PW74). None of the years held back
 * for Mecha Jono's sealed tests is linked (`withheld.ts`).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { loadAreaShapes } from '../../features/globe/areas/areaShapes';
import { boundsOf, pointInGeometry, type PolygonGeometry } from '../geoint/pointInPolygon';
import { KP_BASES, KP_SLOT_MS, STORM_KP, type KpRecord } from './timestream/kp';
import { touchesWithheld } from './timestream/withheld';
import { windowMs, type CallText } from './calls';

export const QUAKE_MIN_MAG = 5.5;
const FDSN_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
/** The measured bases: a predicted or outlook value is not an event. */
const MEASURED = new Set<number>(['definitive', 'preliminary', 'observed', 'estimated'].map((b) => KP_BASES.indexOf(b as (typeof KP_BASES)[number])));

export interface LinkedQuake { id: string; ms: number; mag: number; lat: number; lon: number; place: string }
export interface LinkedStorm { fromMs: number; untilMs: number; kp: number }
export type QuakeLinks = { state: 'loading' } | { state: 'failed' } | { state: 'done'; quakes: LinkedQuake[] };

/** USGS's query for M5.5+ in a box over a span, oldest first. */
export function quakesUrl(fromMs: number, untilMs: number, [west, south, east, north]: [number, number, number, number]): string {
  const at = (ms: number) => new Date(ms).toISOString().replace('.000Z', '');
  const q = new URLSearchParams({
    format: 'geojson', starttime: at(fromMs), endtime: at(untilMs), minmagnitude: String(QUAKE_MIN_MAG), orderby: 'time-asc',
    minlatitude: String(south), maxlatitude: String(north), minlongitude: String(west), maxlongitude: String(east),
  });
  return `${FDSN_URL}?${q}`;
}

/** The quakes in a USGS GeoJSON answer; any feature it cannot read is left out. */
export function readQuakes(json: unknown): LinkedQuake[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((f) => {
    const { id, properties: p, geometry: g } = (f ?? {}) as { id?: unknown; properties?: { mag?: unknown; time?: unknown; place?: unknown }; geometry?: { coordinates?: unknown[] } };
    const [lon, lat] = (g?.coordinates ?? []) as number[];
    if (typeof id !== 'string' || typeof p?.mag !== 'number' || typeof p.time !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ id, ms: p.time, mag: p.mag, lat, lon, place: typeof p.place === 'string' ? p.place : '' }];
  });
}

/** The quakes inside a Zone and a span, M5.5 and up. */
export const quakesIn = (quakes: readonly LinkedQuake[], geometry: PolygonGeometry, fromMs: number, untilMs: number): LinkedQuake[] =>
  quakes.filter((q) => q.mag >= QUAKE_MIN_MAG && q.ms >= fromMs && q.ms <= untilMs && pointInGeometry(q.lat, q.lon, geometry));

/** The storms in a span: measured slots of Kp 5 or more, consecutive ones joined, each with its largest Kp. */
export function stormsIn(record: KpRecord, fromMs: number, untilMs: number): LinkedStorm[] {
  if (touchesWithheld('storms', fromMs, untilMs)) return [];
  const storms: LinkedStorm[] = [];
  const first = Math.max(0, Math.floor((fromMs - record.startMs) / KP_SLOT_MS));
  const last = Math.min(record.kp3.length - 1, Math.floor((untilMs - record.startMs) / KP_SLOT_MS));
  for (let i = first; i <= last; i++) {
    const kp = record.kp3[i] / 3;
    if (record.kp3[i] === 255 || kp < STORM_KP || !MEASURED.has(record.basis[i])) continue;
    const slotFrom = record.startMs + i * KP_SLOT_MS;
    const prev = storms[storms.length - 1];
    if (prev && prev.untilMs === slotFrom) { prev.untilMs = slotFrom + KP_SLOT_MS; prev.kp = Math.max(prev.kp, kp); } else storms.push({ fromMs: slotFrom, untilMs: slotFrom + KP_SLOT_MS, kp });
  }
  return storms;
}

// Each closed earthquake call's links, by its key, found once a visit.
const quakeLinks = new Map<string, QuakeLinks>();
const listeners = new Set<() => void>();
let version = 0;
const tell = () => { version += 1; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getVersion = () => version;

async function findQuakes(key: string, text: CallText): Promise<void> {
  quakeLinks.set(key, { state: 'loading' });
  tell();
  try {
    const { fromMs, untilMs } = windowMs(text);
    const outline = (await loadAreaShapes())?.get(text.place.zone);
    if (!outline) throw new Error('no such Zone');
    const answer = await fetch(quakesUrl(fromMs, untilMs, boundsOf(outline.geometry)));
    if (!answer.ok) throw new Error(`USGS answered ${answer.status}`);
    quakeLinks.set(key, { state: 'done', quakes: quakesIn(readQuakes(await answer.json()), outline.geometry, fromMs, untilMs) });
  } catch {
    // Tried again on the next visit.
    quakeLinks.set(key, { state: 'failed' });
  }
  tell();
}

/** The quakes linked to each of these calls whose window has closed and that expects earthquakes, found as needed. */
export function useQuakeLinks(calls: readonly { key: string; text: CallText }[], now: number, enabled: boolean): ReadonlyMap<string, QuakeLinks> {
  const wanted = useMemo(() => (enabled ? calls.filter((c) => c.text.expects.kind === 'quakes' && windowMs(c.text).untilMs < now
    && !touchesWithheld('quakes', windowMs(c.text).fromMs, windowMs(c.text).untilMs)) : []), [calls, now, enabled]);
  const wantedKey = wanted.map((c) => c.key).join('|');
  useEffect(() => {
    for (const c of wanted) if (!quakeLinks.has(c.key)) void findQuakes(c.key, c.text);
    // wantedKey stands for wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);
  const seen = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => new Map(wanted.flatMap((c) => { const links = quakeLinks.get(c.key); return links ? [[c.key, links] as const] : []; })),
    // seen stands for the store's changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wantedKey, seen]);
}

/** Test-only: forget every link found. */
export function resetCallLinksForTests(): void { quakeLinks.clear(); tell(); }
