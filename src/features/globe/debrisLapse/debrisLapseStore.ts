/**
 * The debris spread's lapse (D-GV GV2, step 6): whether Satellites can play it, the moment it draws while it plays,
 * and how the control beside the globe reaches the layer that draws it.
 *
 * The lapse is the layer's own picture of the past, said as modelled beside it. It never moves the app's one shared
 * time window (decision D-E): every other layer stays at the moment a person chose.
 */

export interface DebrisLapseState {
  /** Whether Satellites draws debris whose spread can be played. */
  available: boolean;
  /** The moment drawn while the lapse plays, in ms since the epoch; null while it does not. */
  atMs: number | null;
}

export interface DebrisLapseController {
  play(): void;
  stop(): void;
}

let state: DebrisLapseState = { available: false, atMs: null };
let controller: DebrisLapseController | null = null;
const listeners = new Set<() => void>();

const set = (next: DebrisLapseState) => {
  if (next.available === state.available && next.atMs === state.atMs) return;
  state = next;
  for (const listener of listeners) listener();
};

/** The layer that can play the lapse, or null when it no longer can. */
export function registerDebrisLapse(next: DebrisLapseController | null): void {
  controller = next;
  set({ available: next !== null, atMs: null });
}

/** The moment the lapse draws now, or null when it has stopped. */
export function setDebrisLapseAt(atMs: number | null): void {
  set({ ...state, atMs });
}

export function playDebrisLapse(): void {
  controller?.play();
}

export function stopDebrisLapse(): void {
  controller?.stop();
}

export function getDebrisLapse(): DebrisLapseState {
  return state;
}

export function subscribeDebrisLapse(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
