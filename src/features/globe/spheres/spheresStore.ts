/**
 * The Spheres layer's state, as the Zones layer's is (zonesStore.ts): whether it
 * is on, which Spheres are under the pointer, and which is open in the panel.
 *
 * Spheres overlap, so the pointer can be over several at once (Canada: the
 * Anglosphere and the Francophonie); the hover holds them all. On or off is kept
 * in this browser, off until a person turns it on.
 */
import { useSyncExternalStore } from 'react';

export interface SphereHover {
  /** Every Sphere under the pointer, the most specific (fewest members) first. */
  codes: string[];
  x: number;
  y: number;
}

export interface SpheresState {
  on: boolean;
  hovered: SphereHover | null;
  selected: string | null;
  /** The other Spheres where the open one was clicked, offered beside it. */
  also: string[];
}

const KEY = 'starcom-spheres-layer';
type Listener = () => void;

const readOn = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

let state: SpheresState = { on: readOn(), hovered: null, selected: null, also: [] };
const listeners = new Set<Listener>();

function set(next: Partial<SpheresState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getSpheresState(): SpheresState {
  return state;
}

export function subscribeSpheres(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setSpheresOn(on: boolean): void {
  if (state.on === on) return;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Kept for this visit only.
  }
  set(on ? { on } : { on, hovered: null, selected: null, also: [] });
}

export function toggleSpheres(): void {
  setSpheresOn(!state.on);
}

const same = (a: SphereHover | null, b: SphereHover | null): boolean =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.codes.length === b.codes.length && a.codes.every((c, i) => c === b.codes[i]));

export function setSphereHover(hovered: SphereHover | null): void {
  if (!same(state.hovered, hovered)) set({ hovered });
}

/** Open a Sphere in the panel, turning the layer on to show it, with the others at that place; null closes it. */
export function selectSphere(code: string | null, also: string[] = []): void {
  if (code) setSpheresOn(true);
  const others = code ? also.filter((c) => c !== code) : [];
  if (state.selected !== code || state.also.join() !== others.join()) set({ selected: code, also: others });
}

/** All of it, the hover included: for the hover chip. */
export function useSpheresState(): SpheresState {
  return useSyncExternalStore(subscribeSpheres, getSpheresState, getSpheresState);
}

/** One value of it, re-rendering only when that value changes (the hover moves many times a second). */
export function useSpheresValue<T extends string | boolean | null>(pick: (s: SpheresState) => T): T {
  return useSyncExternalStore(subscribeSpheres, () => pick(state), () => pick(state));
}

/** Test-only: off, nothing hovered or open, nobody listening. */
export function resetSpheresStoreForTests(): void {
  state = { on: false, hovered: null, selected: null, also: [] };
  listeners.clear();
}
