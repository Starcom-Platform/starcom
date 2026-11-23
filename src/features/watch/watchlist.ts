/**
 * Watchlists (D-WL, docs/missions/01-architecture-decisions/watchlists.md; OR33: in the app only).
 *
 * A watch names a place, with the kinds that count there (WL1): a territory Starcom draws (a country by its two
 * letters, a US state, any area by its code: a Zone, a continent, a union) or a circle around a point, and for each
 * kind the least that counts (quakes from a magnitude, GDACS's hazards from an alert level), or nothing of it. Kept in
 * this browser until removed (WL5), at most twenty; never in a card, a clip or the share handle.
 */
import { useSyncExternalStore } from 'react';
import { boundsOf, pointInGeometry, type PolygonGeometry } from '../../services/geoint/pointInPolygon';
import { haversineDistanceKm } from '../../utils/geoDistance';

export const WATCH_MAX = 20;
/** The least magnitude a watch counts, as USGS's feeds are cut: from 2.5 needs its 2.5 day feed. */
export const QUAKE_FROM = ['2.5', '4.5', '5', '6', '7'] as const;
export type QuakeFrom = (typeof QUAKE_FROM)[number];
/** GDACS's alert levels, least first. */
export const HAZARD_FROM = ['green', 'orange', 'red'] as const;
export type HazardFrom = (typeof HAZARD_FROM)[number];

export type WatchPlace =
  /** A country (its two letters), a US state ("us-tx"), or an area by its code ("zone:…", "continent:asia"); lower case. */
  | { kind: 'territory'; code: string; name: string }
  /** So many km around a point. */
  | { kind: 'circle'; lat: number; lng: number; km: number; name: string };

/** What counts in a watch's place: each natural kind from its least, or null for none of it; each kind The Record carries on or off (WL10–WL13). */
export interface WatchKinds {
  quakes: QuakeFrom | null;
  hazards: HazardFrom | null;
  /** New Intel Reports placed there (WL10). */
  intel: boolean;
  /** War & Conflict's critical and actionable lines (WL11). */
  war: boolean;
  /** Civil Unrest's days of unrest (WL12). */
  unrest: boolean;
}

export interface Watch {
  id: string;
  place: WatchPlace;
  kinds: WatchKinds;
  /** When it was made: only what is first read after counts (WL6). */
  madeMs: number;
}

/** A circle's radius, km: 300 until changed to 100 or 1000 in the Watchlist (WL9). */
export const CIRCLE_KM = [100, 300, 1000] as const;
export const DEFAULT_CIRCLE_KM = 300;

/** A new watch's kinds until the person chooses (WL13): quakes of M4.5 and more, hazards of an orange alert and more, and every kind The Record carries. */
export const DEFAULT_KINDS: WatchKinds = { quakes: '4.5', hazards: 'orange', intel: true, war: true, unrest: true };

const KEY = 'starcom:watchlist';
const NONE: readonly Watch[] = [];
let list: readonly Watch[] | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const isFinite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A kept watch as it was written, or null for anything else: a hand-edited or older entry is passed over. */
export function watchFrom(value: unknown): Watch | null {
  const w = value as Partial<Watch> | null;
  if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !isFinite(w.madeMs)) return null;
  const p = w.place as Partial<WatchPlace> & Record<string, unknown> | undefined;
  let place: WatchPlace | null = null;
  if (p?.kind === 'territory' && typeof p.code === 'string' && typeof p.name === 'string') {
    place = { kind: 'territory', code: p.code, name: p.name };
  } else if (p?.kind === 'circle' && isFinite(p.lat) && isFinite(p.lng) && isFinite(p.km) && p.km > 0 && typeof p.name === 'string') {
    place = { kind: 'circle', lat: p.lat, lng: p.lng, km: p.km, name: p.name };
  }
  if (!place) return null;
  const k = (w.kinds ?? {}) as Partial<Record<keyof WatchKinds, unknown>>;
  const quakes = (QUAKE_FROM as readonly unknown[]).includes(k.quakes) ? k.quakes as QuakeFrom : null;
  const hazards = (HAZARD_FROM as readonly unknown[]).includes(k.hazards) ? k.hazards as HazardFrom : null;
  // A watch kept before The Record's kinds were watched (step 1) counts them, as a new one does (WL13).
  const on = (v: unknown) => v !== false;
  return { id: w.id, place, kinds: { quakes, hazards, intel: on(k.intel), war: on(k.war), unrest: on(k.unrest) }, madeMs: w.madeMs };
}

function read(): readonly Watch[] {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? kept.map(watchFrom).filter((w): w is Watch => w !== null).slice(0, WATCH_MAX) : NONE;
  } catch { return NONE; }
}

function write(next: readonly Watch[]): void {
  list = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this page only */ }
  tell();
}

/** The watches, oldest first. */
export function watches(): readonly Watch[] {
  list ??= read();
  return list;
}

export function subscribeWatches(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWatches(): readonly Watch[] {
  return useSyncExternalStore(subscribeWatches, watches, () => NONE);
}

/** Two places are one watch's when they name the same territory, or the same circle. */
const samePlace = (a: WatchPlace, b: WatchPlace): boolean => (a.kind === 'territory' && b.kind === 'territory'
  ? a.code === b.code
  : a.kind === 'circle' && b.kind === 'circle' && a.lat === b.lat && a.lng === b.lng && a.km === b.km);

export type AddWatch = { watch: Watch; added: boolean } | { refused: 'full' };

/** Watches a place; a place already watched is that watch, as it was. Refused past twenty. */
export function addWatch(place: WatchPlace, kinds: WatchKinds = DEFAULT_KINDS, nowMs = Date.now()): AddWatch {
  const all = watches();
  const already = all.find((w) => samePlace(w.place, place));
  if (already) return { watch: already, added: false };
  if (all.length >= WATCH_MAX) return { refused: 'full' };
  const watch: Watch = { id: `w${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`, place, kinds: { ...kinds }, madeMs: nowMs };
  write([...all, watch]);
  return { watch, added: true };
}

/** What a watch counts, changed; what was first read before stays unpinged for it. */
export function setWatchKinds(id: string, kinds: WatchKinds): void {
  if (!watches().some((w) => w.id === id)) return;
  write(watches().map((w) => (w.id === id ? { ...w, kinds: { ...kinds } } : w)));
}

/** A circle's radius, changed (WL9); refused where another watch already has that circle. */
export function setWatchRadius(id: string, km: number): void {
  const watch = watches().find((w) => w.id === id);
  if (!watch || watch.place.kind !== 'circle' || !(km > 0)) return;
  const place: WatchPlace = { ...watch.place, km };
  if (watches().some((w) => w.id !== id && samePlace(w.place, place))) return;
  write(watches().map((w) => (w.id === id ? { ...w, place } : w)));
}

export function removeWatch(id: string): void {
  if (!watches().some((w) => w.id === id)) return;
  write(watches().filter((w) => w.id !== id));
}

/** A watch's name, as its notice and the list say it. */
export function watchName(place: WatchPlace): string {
  return place.kind === 'circle' ? `${place.km} km around ${place.name}` : place.name;
}

/** A territory's outline by its code, as territoryResolver finds one; null where none is drawn. */
export type PlaceOutline = (code: string) => { geometry: PolygonGeometry } | null;

const boxes = new WeakMap<object, [number, number, number, number]>();

/**
 * Whether a point lies in a watch's place: within the circle, or inside the territory's outline. A territory whose
 * outline is not to hand holds nothing, so a watch never pings on a guess.
 */
export function placeHolds(place: WatchPlace, lat: number, lng: number, outline: PlaceOutline): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (place.kind === 'circle') return haversineDistanceKm(place.lat, place.lng, lat, lng) <= place.km;
  const shape = outline(place.code);
  if (!shape) return false;
  let box = boxes.get(shape.geometry);
  if (!box) { box = boundsOf(shape.geometry); boxes.set(shape.geometry, box); }
  if (lng < box[0] || lat < box[1] || lng > box[2] || lat > box[3]) return false;
  return pointInGeometry(lat, lng, shape.geometry);
}

export function resetWatchesForTests(): void {
  list = null;
  listeners.clear();
}
