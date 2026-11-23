/**
 * A ping on a new strong quake, in the app only (D-EQ, EQ9, EQ19, EQ20; OR33: nothing leaves the device).
 *
 * Whenever Starcom is open, USGS's M4.5+ day feed is read every five minutes, Eco Disasters on or off. A quake that
 * arrives after the page opened, of the magnitude the person set or more (M6 until they choose, M5, M7 or off, kept in
 * this browser), pings: a notice that opens it in the inspector, a pulsing ring at it until it is opened, a count on Eco
 * Disasters' rail button, the alert sound if sound is on. The quakes in the first read are already known: they never
 * ping. The day feed, not the hour's: a quake posted over an hour after it happened is still caught. A quake a watch
 * told of first (D-WL) is not told again.
 */
import { useSyncExternalStore } from 'react';
import type { NaturalEvent } from '../GeoEventsService';
import { usgsQuakes } from './quakeWindow';
import { claimPing } from '../pings/pingClaims';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'quakePings' });

export const PING_FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
export const PING_EVERY_MS = 5 * 60_000;

export const PING_FROM_CHOICES = ['off', '5', '6', '7'] as const;
export type PingFrom = (typeof PING_FROM_CHOICES)[number];
export const DEFAULT_PING_FROM: PingFrom = '6';

// ── The person's setting (EQ19) ──────────────────────────────────────────────
const SETTING_KEY = 'starcom:quake-ping';
let from: PingFrom | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

function readFrom(): PingFrom {
  try {
    const kept = localStorage.getItem(SETTING_KEY);
    return (PING_FROM_CHOICES as readonly string[]).includes(kept ?? '') ? kept as PingFrom : DEFAULT_PING_FROM;
  } catch { return DEFAULT_PING_FROM; }
}

/** The least magnitude that pings, or off. */
export function quakePingFrom(): PingFrom {
  from ??= readFrom();
  return from;
}

export function setQuakePingFrom(next: PingFrom): void {
  from = next;
  try { localStorage.setItem(SETTING_KEY, next); } catch { /* kept for this page only */ }
  tell();
}

export function subscribeQuakePings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useQuakePingFrom(): PingFrom {
  return useSyncExternalStore(subscribeQuakePings, quakePingFrom, () => DEFAULT_PING_FROM);
}

// ── The pings (EQ20) ─────────────────────────────────────────────────────────
export interface QuakePing {
  id: string;
  lat: number;
  lng: number;
  magnitude: number;
  /** Where, as USGS names it: "80 km SW of Lata, Solomon Islands". */
  place: string;
  timeMs: number;
  /** The quake as read, for its note. */
  event: NaturalEvent;
}

const NO_PINGS: readonly QuakePing[] = [];
let pings: readonly QuakePing[] = NO_PINGS;

/** The pings not yet opened, newest first. */
export function quakePings(): readonly QuakePing[] {
  return pings;
}

export function useQuakePings(): readonly QuakePing[] {
  return useSyncExternalStore(subscribeQuakePings, quakePings, () => NO_PINGS);
}

/** A ping is opened: its ring and its count go. */
export function clearQuakePing(id: string): void {
  if (!pings.some((p) => p.id === id)) return;
  pings = pings.filter((p) => p.id !== id);
  tell();
}

/** Where USGS's title names the place: "M 6.4 - 80 km SW of Lata, Solomon Islands" is "80 km SW of Lata, …". */
export function placeOf(event: NaturalEvent): string {
  const title = event.description?.trim() ?? '';
  return title.replace(/^M\s*-?[\d.]+\s*-\s*/i, '') || `${event.lat.toFixed(1)}, ${event.lng.toFixed(1)}`;
}

/** How long ago, in the notice's words. */
export function agoWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** The notice's words: "M6.4, 80 km SW of Lata, Solomon Islands, 3 min ago". */
export function pingWords(ping: QuakePing, nowMs: number): string {
  return `M${ping.magnitude.toFixed(1)}, ${ping.place}, ${agoWords(nowMs - ping.timeMs)}`;
}

/**
 * Which of a read's quakes ping: those not in the first read, not pinged already, of the magnitude set or more. A quake
 * first read under it pings once it is revised over it. Pure: the watcher keeps what was known and pinged.
 */
export function newPings(
  read: readonly NaturalEvent[],
  known: { seenFirst: ReadonlySet<string>; pinged: ReadonlySet<string> },
  setting: PingFrom,
): QuakePing[] {
  if (setting === 'off') return [];
  const least = Number(setting);
  const found: QuakePing[] = [];
  for (const event of read) {
    const id = String(event.id);
    const t = event.timestamp ? Date.parse(event.timestamp) : NaN;
    if (known.seenFirst.has(id) || known.pinged.has(id)) continue;
    if (typeof event.magnitude !== 'number' || !(event.magnitude >= least) || !Number.isFinite(t)) continue;
    found.push({ id, lat: event.lat, lng: event.lng, magnitude: event.magnitude, place: placeOf(event), timeMs: t, event });
  }
  return found.sort((a, b) => b.timeMs - a.timeMs);
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Reads the feed now and every five minutes, until stopped; each new ping is kept and told to `onPing`. The first read
 * only learns what is already there.
 */
export function watchQuakePings(options: { onPing: (ping: QuakePing) => void; fetcher?: Fetcher; everyMs?: number }): () => void {
  const fetcher = options.fetcher ?? fetch;
  const seenFirst = new Set<string>();
  const pinged = new Set<string>();
  let first = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  const once = async () => {
    try {
      const response = await fetcher(PING_FEED_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`USGS answered ${response.status}`);
      const read = usgsQuakes(await response.json());
      if (stopped) return;
      if (first) {
        read.forEach((event) => seenFirst.add(String(event.id)));
        first = false;
      } else {
        const fresh = newPings(read, { seenFirst, pinged }, quakePingFrom());
        fresh.forEach((ping) => pinged.add(ping.id));
        // A watch may have told of it first (D-WL, WL2): one ping for one item.
        const found = fresh.filter((ping) => claimPing(ping.id));
        if (found.length) {
          pings = [...found, ...pings.filter((p) => !found.some((f) => f.id === p.id))];
          tell();
          found.forEach((ping) => options.onPing(ping));
        }
      }
    } catch (e) {
      if (!stopped) log.warn('USGS\'s M4.5+ feed could not be read for pings', { error: String(e) });
    } finally {
      if (!stopped) timer = setTimeout(() => { void once(); }, options.everyMs ?? PING_EVERY_MS);
    }
  };
  void once();
  return () => {
    stopped = true;
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}

export function resetQuakePingsForTests(): void {
  from = null;
  pings = NO_PINGS;
}
