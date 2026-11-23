/**
 * The Zones layer's state, in one module as the lit area's is (litArea.ts): whether
 * it is on, which place is under the pointer, and which is open in the panel.
 * Read by the globe's layer, the rail's button, the panel, the hover and the
 * header's search, none of which share a parent nearer than the app.
 *
 * On or off is kept in this browser. The layer starts off, as every overlay
 * added since the first does, so nobody finds a new layer on that they did not
 * turn on.
 */
import { useSyncExternalStore } from 'react';

export interface ZoneHover {
  id: string;
  /** Where the pointer is, in the viewport's pixels. */
  x: number;
  y: number;
  /** The places of other Zones under the pointer too: Zones overlap (the Ring of Fire crosses the Dry Corridor). */
  also?: string[];
}

export interface ZonesState {
  on: boolean;
  hovered: ZoneHover | null;
  /** The Zone or Sector open in the panel. */
  selected: string | null;
}

const KEY = 'starcom-zones-layer';
type Listener = () => void;

const readOn = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

let state: ZonesState = { on: readOn(), hovered: null, selected: null };
const listeners = new Set<Listener>();

function set(next: Partial<ZonesState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getZonesState(): ZonesState {
  return state;
}

export function subscribeZones(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setZonesOn(on: boolean): void {
  if (state.on === on) return;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Kept for this visit only.
  }
  // Off, nothing of the layer stays: no hover, no panel.
  set(on ? { on } : { on, hovered: null, selected: null });
}

export function toggleZones(): void {
  setZonesOn(!state.on);
}

export function setZoneHover(hovered: ZoneHover | null): void {
  const was = state.hovered;
  if (was === hovered || (was && hovered && was.id === hovered.id && was.x === hovered.x && was.y === hovered.y
    && (was.also ?? []).join() === (hovered.also ?? []).join())) return;
  set({ hovered });
}

/** Open a place in the panel, turning the layer on to show it; null closes the panel. */
export function selectZonePlace(id: string | null): void {
  if (id) setZonesOn(true);
  if (state.selected !== id) set({ selected: id });
}

/** All of it, the hover included: for the hover chip, which moves with the pointer. */
export function useZonesState(): ZonesState {
  return useSyncExternalStore(subscribeZones, getZonesState, getZonesState);
}

/**
 * One value of it, re-rendering only when that value changes. The hover moves many
 * times a second, and the globe, the rail and the panel must not render again for it.
 */
export function useZonesValue<T extends string | boolean | null>(pick: (s: ZonesState) => T): T {
  return useSyncExternalStore(subscribeZones, () => pick(state), () => pick(state));
}

/** Test-only: off, nothing hovered or open, nobody listening. */
export function resetZonesStoreForTests(): void {
  state = { on: false, hovered: null, selected: null };
  listeners.clear();
}
