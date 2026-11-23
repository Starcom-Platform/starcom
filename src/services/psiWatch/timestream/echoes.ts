/**
 * The Echo shown (decision D-PW, PW39, PW47, PW53, PW69): a window's sky event, the window's own span about its
 * exact moment, and every past return of its kind; one at a time, shared by the drawer and the globe. Each return
 * gathers the events lane's set within that span about it, its count drawn beside the usual, the count any span that
 * long holds across the set's record. A return can be isolated; the places draw in a chosen look.
 */
import { useSyncExternalStore } from 'react';
import type { PsiSkyEvent } from '../psiEvents';
import type { EventSet } from './eventSets';
import { openRecord, touchesWithheld } from './withheld';

const DAY_MS = 86_400_000;
const LOOK_KEY = 'starcom:psi-echo-look';

export type EchoLook = 'dots' | 'heat' | 'zones';
export const ECHO_LOOKS: readonly EchoLook[] = ['dots', 'heat', 'zones'];

export interface Echo {
  /** The window echoed: its address and title, and its sky event. */
  address: string;
  title: string;
  event: PsiSkyEvent;
  /** How long the window opens before its exact moment and stays open after, ms. */
  beforeMs: number;
  afterMs: number;
  /** Its kind's returns, oldest first; null while they are being found. */
  returns: number[] | null;
  /** The one return isolated, ms, or null for all. */
  isolated: number | null;
}

let echo: Echo | null = null;
let look: EchoLook = (() => {
  try { const saved = localStorage.getItem(LOOK_KEY); return ECHO_LOOKS.includes(saved as EchoLook) ? saved as EchoLook : 'dots'; } catch { return 'dots'; }
})();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const getEcho = (): Echo | null => echo;
export function setEcho(next: Echo | null): void { echo = next; emit(); }
/** Changes the Echo shown, if it is still the one asked about. */
export function updateEcho(address: string, change: Partial<Pick<Echo, 'returns' | 'isolated'>>): void {
  if (!echo || echo.address !== address) return;
  echo = { ...echo, ...change };
  emit();
}
export const useEcho = (): Echo | null => useSyncExternalStore(subscribe, getEcho, getEcho);

export const getEchoLook = (): EchoLook => look;
export function setEchoLook(next: EchoLook): void {
  look = next;
  try { localStorage.setItem(LOOK_KEY, next); } catch { /* storage unavailable */ }
  emit();
}
export const useEchoLook = (): EchoLook => useSyncExternalStore(subscribe, getEchoLook, getEchoLook);

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

/** One return's gathering: its moment, the events' index range [from, until) in the set, its age's rank (0 the newest). */
export interface EchoReturn { ms: number; from: number; until: number; count: number; rank: number }

/**
 * Each return inside the set's record with the events its span holds, oldest first; none whose span touches the
 * years Mecha Jono holds back for their sealed tests (`withheld.ts`).
 */
export function echoReturns(e: Pick<Echo, 'returns' | 'beforeMs' | 'afterMs'>, set: EventSet): EchoReturn[] {
  const inside = (e.returns ?? []).filter((ms) => ms - e.beforeMs >= set.fromMs && ms + e.afterMs <= set.untilMs + DAY_MS
    && !touchesWithheld(set.id, ms - e.beforeMs, ms + e.afterMs));
  return inside.map((ms, i) => {
    const from = firstAtOrAfter(set.ms, ms - e.beforeMs);
    const until = firstAtOrAfter(set.ms, ms + e.afterMs);
    return { ms, from, until, count: until - from, rank: inside.length - 1 - i };
  });
}

/** The count any span this long holds across the set's open record, its withheld years left out: the usual (PW53). */
export function usualCount(set: EventSet, spanMs: number): number {
  const open = openRecord(set);
  return open.days > 0 ? (open.events * spanMs) / (open.days * DAY_MS) : 0;
}
