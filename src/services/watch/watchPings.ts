/**
 * Pings on what lands in a watched place (D-WL, WL2, WL3, WL6, WL7; OR33: nothing leaves the device).
 *
 * While Starcom is open, each kind a watch counts is read on its own schedule, whatever is drawn: USGS's day feed of
 * quakes every five minutes (its M2.5 feed when a watch counts from 2.5, else its M4.5 feed), GDACS's event list every
 * ten. A kind no watch counts is not read. A feed's first read only learns what is there. An item first read after a
 * watch was made, of the kind and the least it counts, lying in its place, pings once, however many watches name it,
 * and not at all when the M6+ quake ping told of it first (pingClaims.ts). An item first read under a watch's least
 * pings once it is revised over it (a magnitude raised, an alert raised).
 *
 * What The Record carries (step 2, WL10–WL12) is listened to while a watch counts it: new Intel Reports as the ingest
 * tells of them, War & Conflict's critical and actionable lines and Civil Unrest's days of unrest as their readers
 * hold them. Each reader sends what it had first, so a note is new when it was published after both the watch was
 * made and the watcher started. It lands in a place by its point, or, for a territory watch, by naming the territory.
 */
import { useSyncExternalStore } from 'react';
import type { NaturalEvent } from '../data-management/providers/GeoEventsDataProvider';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { ConflictItem, WarConflictSnapshot } from '../warConflict/warConflict';
import type { CivilUnrestItem } from '../civilUnrest/civilUnrest';
import { usgsQuakes } from '../quakes/quakeWindow';
import { gdacsEvents, GDACS_ALERT_RANK, GDACS_HAZARD_TYPES, GDACS_LIST_URL, type GdacsResponse } from '../gdacs/gdacsList';
import { claimPing } from '../pings/pingClaims';
import { HAZARD_FROM, placeHolds, watchName, type PlaceOutline, type Watch, type WatchKinds } from '../../features/watch/watchlist';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'watchPings' });

export const WATCH_QUAKE_FEEDS = {
  '2.5': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  '4.5': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
} as const;
export const WATCH_QUAKES_EVERY_MS = 5 * 60_000;
export const WATCH_HAZARDS_EVERY_MS = 10 * 60_000;

/** Something that can land in a place: a quake (its magnitude), or a GDACS hazard (its alert's rank). */
export interface EcoItem {
  id: string;
  kind: 'quake' | 'hazard';
  lat: number;
  lng: number;
  /** A quake's magnitude; a hazard's alert by its rank: 0 green, 1 orange, 2 red. */
  level: number;
  timeMs: number;
  /** As Eco Disasters reads it, for its note and its hover. */
  event: NaturalEvent;
}

/** A note The Record carries (WL10–WL12): placed by its point when it has one (NaN where not), and by the codes it names. */
export type RecordItem = {
  id: string;
  lat: number;
  lng: number;
  /** When it was published. */
  timeMs: number;
  title: string;
  /** The territories it names, lower case: a report about a country as a whole names it here. */
  jurisdictions: readonly string[];
} & ({ kind: 'intel'; report: IntelReportUI } | { kind: 'war'; conflict: ConflictItem } | { kind: 'unrest'; unrest: CivilUnrestItem });

export type WatchItem = EcoItem | RecordItem;

export const isRecordItem = (item: WatchItem): item is RecordItem => item.kind === 'intel' || item.kind === 'war' || item.kind === 'unrest';

export interface WatchPing {
  item: WatchItem;
  /** The watches it landed in, by id, name and place, the first first. */
  watches: Array<{ id: string; name: string; place: Watch['place'] }>;
  /** When it pinged. */
  atMs: number;
}

/** Whether an item is of a kind a watch counts, at its least or more. */
export function counts(kinds: WatchKinds, item: WatchItem): boolean {
  switch (item.kind) {
    case 'quake': return kinds.quakes !== null && item.level >= Number(kinds.quakes);
    case 'hazard': return kinds.hazards !== null && item.level >= HAZARD_FROM.indexOf(kinds.hazards);
    case 'intel': return kinds.intel;
    case 'war': return kinds.war;
    case 'unrest': return kinds.unrest;
  }
}

/** Whether an item lies in a watch's place: by its point, or, for a territory watch, by naming the territory (WL10). */
export function lands(place: Watch['place'], item: WatchItem, outline: PlaceOutline): boolean {
  if (placeHolds(place, item.lat, item.lng, outline)) return true;
  return isRecordItem(item) && place.kind === 'territory' && item.jurisdictions.includes(place.code);
}

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : NaN);
const codes = (...named: Array<string | undefined | readonly string[]>): string[] =>
  [...new Set(named.flat().filter((c): c is string => typeof c === 'string' && !!c.trim()).map((c) => c.trim().toLowerCase()))];

/** New Intel Reports as items (WL10): every one, placed by its point and by the territories it names. */
export function intelItems(reports: readonly IntelReportUI[]): RecordItem[] {
  return reports.flatMap((report) => {
    const t = report.createdAt instanceof Date ? report.createdAt.getTime() : Date.parse(String(report.createdAt));
    if (!Number.isFinite(t)) return [];
    return [{ id: report.id, kind: 'intel' as const, lat: finite(report.latitude), lng: finite(report.longitude), timeMs: t,
      title: report.title, jurisdictions: codes(report.jurisdictions ?? []), report }];
  });
}

/** War & Conflict's lines as items (WL11): its critical and actionable ones, never its context, never a war's own note. */
export function warItems(snapshot: Pick<WarConflictSnapshot, 'items'>): RecordItem[] {
  return snapshot.items.filter((c) => c.role === 'critical' || c.role === 'actionable').map((conflict) => ({
    id: conflict.id, kind: 'war' as const, lat: finite(conflict.point?.lat), lng: finite(conflict.point?.lon), timeMs: conflict.reportedAt * 1000,
    title: conflict.title, jurisdictions: codes(conflict.jurisdiction), conflict,
  }));
}

/** Civil Unrest's days of unrest as items (WL12): never a surge in reporting. */
export function unrestItems(items: readonly CivilUnrestItem[]): RecordItem[] {
  return items.filter((u) => u.section === 'CivilUnrest').map((unrest) => ({
    id: unrest.id, kind: 'unrest' as const, lat: finite(unrest.point?.lat), lng: finite(unrest.point?.lon), timeMs: unrest.publishedAt * 1000,
    title: unrest.title, jurisdictions: codes(unrest.jurisdiction), unrest,
  }));
}

/** The quake feed the watches need: the M2.5 feed when one counts from 2.5, the M4.5 feed for any other, or none. */
export function quakeFeedFor(list: readonly Watch[]): string | null {
  const from = list.map((w) => w.kinds.quakes).filter((q) => q !== null);
  if (!from.length) return null;
  return from.some((q) => q === '2.5') ? WATCH_QUAKE_FEEDS['2.5'] : WATCH_QUAKE_FEEDS['4.5'];
}

export const hazardsWatched = (list: readonly Watch[]): boolean => list.some((w) => w.kinds.hazards !== null);

/** A feed's quakes as items. */
export function quakeItems(events: readonly NaturalEvent[]): WatchItem[] {
  return events.flatMap((event) => {
    const t = event.timestamp ? Date.parse(event.timestamp) : NaN;
    if (typeof event.magnitude !== 'number' || !Number.isFinite(t)) return [];
    return [{ id: String(event.id), kind: 'quake' as const, lat: event.lat, lng: event.lng, level: event.magnitude, timeMs: t, event }];
  });
}

/** GDACS's hazards as items, each ranked by its alert. */
export function hazardItems(response: GdacsResponse): WatchItem[] {
  return gdacsEvents(response.features ?? [], GDACS_HAZARD_TYPES).flatMap((event) => {
    const rank = GDACS_ALERT_RANK[event.status as keyof typeof GDACS_ALERT_RANK];
    const t = event.timestamp ? Date.parse(event.timestamp) : NaN;
    if (rank === undefined || !Number.isFinite(t)) return [];
    return [{ id: String(event.id), kind: 'hazard' as const, lat: event.lat, lng: event.lng, level: rank, timeMs: t, event }];
  });
}

/** What the watcher keeps between reads. */
export interface Known {
  /** Items in a feed's first read: never pinged. */
  seenFirst: Set<string>;
  /** Items pinged already, here or by the quake ping. */
  pinged: Set<string>;
  /** When each item was first read. */
  firstReadMs: Map<string, number>;
  /** When the watcher started: a Record note published before it was in the reader's first answer, not new. */
  startedMs: number;
}

export const newKnown = (startedMs = 0): Known => ({ seenFirst: new Set(), pinged: new Set(), firstReadMs: new Map(), startedMs });

/**
 * Which of a read's items ping, and in which watches: those first read after the watch was made, of a kind and least
 * it counts, in its place. Records when each item was first read. Pure but for `known`.
 */
export function newWatchPings(
  read: readonly WatchItem[], known: Known, list: readonly Watch[], outline: PlaceOutline, nowMs: number,
): WatchPing[] {
  const found: WatchPing[] = [];
  for (const item of read) {
    if (known.seenFirst.has(item.id) || known.pinged.has(item.id)) continue;
    if (!known.firstReadMs.has(item.id)) known.firstReadMs.set(item.id, nowMs);
    const firstRead = known.firstReadMs.get(item.id) as number;
    // A feed's item is new by when it was first read; a Record note by when it was published (each reader sends its backlog first).
    const isNew = (w: Watch) => (isRecordItem(item) ? item.timeMs > Math.max(w.madeMs, known.startedMs) : firstRead > w.madeMs);
    const hits = list.filter((w) => isNew(w) && counts(w.kinds, item) && lands(w.place, item, outline));
    if (hits.length) found.push({ item, watches: hits.map((w) => ({ id: w.id, name: watchName(w.place), place: w.place })), atMs: nowMs });
  }
  return found.sort((a, b) => b.item.timeMs - a.item.timeMs);
}

// ── The pings, kept for this page ───────────────────────────────────────────
const NO_PINGS: readonly WatchPing[] = [];
/** Not yet opened, newest first. */
let pending: readonly WatchPing[] = NO_PINGS;
/** Everything that landed this session, newest first, at most LANDED_MAX: the Watchlist's "what has landed". */
let landed: readonly WatchPing[] = NO_PINGS;
export const LANDED_MAX = 100;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

export const watchPings = (): readonly WatchPing[] => pending;
export const landedPings = (): readonly WatchPing[] => landed;

export function subscribeWatchPings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useWatchPings = (): readonly WatchPing[] => useSyncExternalStore(subscribeWatchPings, watchPings, () => NO_PINGS);
export const useLandedPings = (): readonly WatchPing[] => useSyncExternalStore(subscribeWatchPings, landedPings, () => NO_PINGS);

/** A ping is opened: its ring and its count go; what landed stays listed. */
export function clearWatchPing(id: string): void {
  if (!pending.some((p) => p.item.id === id)) return;
  pending = pending.filter((p) => p.item.id !== id);
  tell();
}

function keep(found: readonly WatchPing[]): void {
  const ids = new Set(found.map((p) => p.item.id));
  pending = [...found, ...pending.filter((p) => !ids.has(p.item.id))];
  landed = [...found, ...landed.filter((p) => !ids.has(p.item.id))].slice(0, LANDED_MAX);
  tell();
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface WatchWatcherOptions {
  /** The watches now (watchlist.ts). */
  list: () => readonly Watch[];
  /** Told when the watches change, to start or stop a kind's reads. */
  subscribe: (listener: () => void) => () => void;
  /** The territories' outlines, once to hand. */
  outline: () => Promise<PlaceOutline>;
  onPing: (ping: WatchPing) => void;
  /** What The Record carries, each listened to while a watch counts it (WL10–WL12). */
  record?: { intel?: RecordSource<IntelReportUI>; war?: RecordSource<Pick<WarConflictSnapshot, 'items'>>; unrest?: RecordSource<readonly CivilUnrestItem[]> };
  fetcher?: Fetcher;
  quakesEveryMs?: number;
  hazardsEveryMs?: number;
  now?: () => number;
}

/** A source of what The Record carries: told of what it holds now and whenever that changes, held open while told. */
export interface RecordSource<T> {
  /** Starts a shared reader and returns its stop; absent where the source reads anyway (the Intel ingest). */
  start?: () => () => void;
  /** Tells of what it holds, now and on each change; returns its leave. */
  subscribe: (told: (held: T) => void) => () => void;
}

/** Reads what the watches need, each kind on its own schedule, until stopped. */
export function watchWatchlist(options: WatchWatcherOptions): () => void {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const known = newKnown(now());
  const learned = new Set<string>();
  const controller = new AbortController();
  let stopped = false;
  const loops: Array<{ run: () => void; stop: () => void }> = [];

  /** What a read found new, claimed once and kept and told. */
  const tellNew = async (read: readonly WatchItem[]) => {
    const outline = await options.outline();
    if (stopped) return;
    const found = newWatchPings(read, known, options.list(), outline, now());
    found.forEach((ping) => known.pinged.add(ping.item.id));
    // The M6+ quake ping may have told of it first: one ping for one item.
    const told = found.filter((ping) => claimPing(ping.item.id));
    if (told.length) {
      keep(told);
      told.forEach((ping) => options.onPing(ping));
    }
  };

  const loop = (name: string, everyMs: number, urlFor: (list: readonly Watch[]) => string | null, itemsOf: (json: unknown) => WatchItem[]) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    const once = async () => {
      if (running || stopped) return;
      if (timer) { clearTimeout(timer); timer = null; }
      const url = urlFor(options.list());
      if (!url) return; // started again when a watch counts this kind
      running = true;
      try {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${name} answered ${response.status}`);
        const read = itemsOf(await response.json());
        if (stopped) return;
        if (!learned.has(url)) {
          learned.add(url);
          read.forEach((item) => known.seenFirst.add(item.id));
        } else {
          await tellNew(read);
        }
      } catch (e) {
        if (!stopped) log.warn(`${name} could not be read for watches`, { error: String(e) });
      } finally {
        running = false;
        if (!stopped && urlFor(options.list())) timer = setTimeout(() => { void once(); }, everyMs);
      }
    };
    loops.push({ run: () => { if (!timer && !running) void once(); }, stop: () => { if (timer) clearTimeout(timer); } });
  };

  loop('USGS', options.quakesEveryMs ?? WATCH_QUAKES_EVERY_MS, quakeFeedFor, (json) => quakeItems(usgsQuakes(json as Parameters<typeof usgsQuakes>[0])));
  loop('GDACS', options.hazardsEveryMs ?? WATCH_HAZARDS_EVERY_MS, (list) => (hazardsWatched(list) ? GDACS_LIST_URL : null), (json) => hazardItems(json as GdacsResponse));

  /** A kind The Record carries: listened to while a watch counts it, let go when none does. */
  const listen = <T>(kind: 'intel' | 'war' | 'unrest', source: RecordSource<T> | undefined, itemsOf: (held: T) => RecordItem[]) => {
    if (!source) return;
    let on: (() => void) | null = null;
    const sync = () => {
      const wanted = !stopped && options.list().some((w) => w.kinds[kind]);
      if (wanted && !on) {
        const stopReader = source.start?.();
        const leave = source.subscribe((held) => { void tellNew(itemsOf(held)).catch((e) => log.warn(`${kind} could not be read for watches`, { error: String(e) })); });
        on = () => { leave(); stopReader?.(); };
      } else if (!wanted && on) {
        on();
        on = null;
      }
    };
    loops.push({ run: sync, stop: () => { if (on) { on(); on = null; } } });
  };
  listen('intel', options.record?.intel, (report) => intelItems([report]));
  listen('war', options.record?.war, (snapshot) => warItems(snapshot));
  listen('unrest', options.record?.unrest, (items) => unrestItems(items));

  loops.forEach((l) => l.run());
  // A kind a watch now counts is read from then on.
  const leave = options.subscribe(() => loops.forEach((l) => l.run()));
  return () => {
    stopped = true;
    leave();
    controller.abort();
    loops.forEach((l) => l.stop());
  };
}

/** Test-only: keep pings as the watcher keeps what it finds. */
export function keepForTests(found: readonly WatchPing[]): void {
  keep(found);
}

export function resetWatchPingsForTests(): void {
  pending = NO_PINGS;
  landed = NO_PINGS;
  listeners.clear();
}
