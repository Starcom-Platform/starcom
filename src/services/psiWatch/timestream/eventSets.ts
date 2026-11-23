/**
 * The history Psi Watch reads (decision D-PW, PW46): Mecha Jono's event set, baked by `scripts/psi/bake-events.ts`,
 * one file a set. UCDP's one-day conflict events as episodes, USGS ComCat's earthquakes of M5.5 and up (declustered),
 * GFZ's geomagnetic storms (Kp 5 or more, consecutive days one storm); each with its moment, and its place and ZSP 2.0
 * Zone where it has one. The events lane counts them through time (PW42, PW51): by day to two months, by week to
 * three years, by year beyond; outside a set's record it draws nothing.
 */
import type { TimeView } from './timeView';

export type EventSetId = 'conflict' | 'quakes' | 'storms';
export const EVENT_SETS: readonly EventSetId[] = ['conflict', 'quakes', 'storms'];
export const eventSetUrl = (id: EventSetId): string => `/data/psi-events-${id}.json`;

const DAY_MS = 86_400_000;

/** A baked set as served. */
export interface EventSetFile {
  set: EventSetId;
  kind: string;
  time: string;
  licence: string;
  credit: string;
  laterEvents: string;
  source: { file: string; sha256: string };
  rows: number;
  /** The first and last day the set records, ms. */
  fromMs: number;
  untilMs: number;
  /** The Zones the rows name, by index. */
  zones: string[];
  /** Each event's moment as a step from the one before: days for conflict and storms, seconds for earthquakes. */
  t: number[];
  /** Places in hundredths of a degree, and each one's Zone (an index into `zones`, −1 for none). */
  lat?: number[];
  lon?: number[];
  zone?: number[];
  /** Conflict: UCDP's place precision (1 exact .. 5 a region), its kind of violence (1–3) and its episode's events. */
  precision?: number[];
  violence?: number[];
  events?: number[];
  /** Earthquakes: magnitude in tenths, depth in km. */
  magnitude?: number[];
  depth?: number[];
  /** Storms: their days and largest Kp, in thirds. */
  days?: number[];
  maxKp?: number[];
}

export interface EventSet {
  id: EventSetId;
  /** Each event's moment, ms, in time order. */
  ms: Float64Array;
  fromMs: number;
  untilMs: number;
  /** Its place, degrees, and its Zone's index; null for a set with no places. */
  lat: Float32Array | null;
  lon: Float32Array | null;
  zone: Int16Array | null;
  zones: readonly string[];
  licence: string;
  credit: string;
}

/** A served set read into arrays, or null where it does not hold together. */
export function readEventSet(file: EventSetFile): EventSet | null {
  if (!file || !EVENT_SETS.includes(file.set) || !Array.isArray(file.t) || file.t.length !== file.rows) return null;
  const unit = file.set === 'quakes' ? 1000 : DAY_MS;
  const ms = new Float64Array(file.rows);
  let at = 0;
  for (let i = 0; i < file.rows; i++) { at += file.t[i]; ms[i] = at * unit; }
  const placed = Array.isArray(file.lat) && Array.isArray(file.lon) && file.lat.length === file.rows && file.lon.length === file.rows;
  return {
    id: file.set, ms, fromMs: file.fromMs, untilMs: file.untilMs,
    lat: placed ? Float32Array.from(file.lat!, (v) => v / 100) : null,
    lon: placed ? Float32Array.from(file.lon!, (v) => v / 100) : null,
    zone: placed && Array.isArray(file.zone) && file.zone.length === file.rows ? Int16Array.from(file.zone) : null,
    zones: file.zones ?? [], licence: file.licence, credit: file.credit,
  };
}

/** How the lane counts: by day to two months, by week to three years, by year beyond (PW51). */
export type EventBucket = 'day' | 'week' | 'year';
export const bucketFor = (spanMs: number): EventBucket => (spanMs <= 61 * DAY_MS ? 'day' : spanMs <= 3 * 365.25 * DAY_MS ? 'week' : 'year');

/** Where the bucket holding a moment starts: its UTC day, its week from Monday, its year. */
export function bucketStart(ms: number, bucket: EventBucket): number {
  const d = new Date(ms);
  if (bucket === 'year') return Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return bucket === 'day' ? day : day - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}
const bucketAfter = (start: number, bucket: EventBucket): number => {
  if (bucket === 'year') return Date.UTC(new Date(start).getUTCFullYear() + 1, 0, 1);
  return start + (bucket === 'day' ? DAY_MS : 7 * DAY_MS);
};

/** The first index whose moment is at or after a moment. */
function firstAtOrAfter(ms: Float64Array, at: number): number {
  let lo = 0;
  let hi = ms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] < at) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export interface EventBar { fromMs: number; untilMs: number; count: number }

/** The view's buckets inside the set's record, each with how many of its events fall in it. */
export function eventBars(set: EventSet, view: TimeView, bucket: EventBucket = bucketFor(view.spanMs)): EventBar[] {
  const bars: EventBar[] = [];
  const end = Math.min(view.startMs + view.spanMs, set.untilMs + DAY_MS);
  for (let from = bucketStart(Math.max(view.startMs, set.fromMs), bucket); from < end; from = bucketAfter(from, bucket)) {
    const until = bucketAfter(from, bucket);
    if (until <= set.fromMs) continue;
    bars.push({ fromMs: from, untilMs: until, count: firstAtOrAfter(set.ms, until) - firstAtOrAfter(set.ms, from) });
  }
  return bars;
}
