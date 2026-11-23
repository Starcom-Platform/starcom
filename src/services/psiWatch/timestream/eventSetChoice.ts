/**
 * The set the events lane shows (decision D-PW, PW46, PW69), shared with the globe, which draws an Echo's events from
 * the same set; the earthquakes at first, the lightest to fetch, and the choice kept in this browser.
 */
import { useSyncExternalStore } from 'react';
import { EVENT_SETS, type EventSetId } from './eventSets';

const KEY = 'starcom:psi-timestream-event-set';
const DEFAULT: EventSetId = 'quakes';

let chosen: EventSetId = (() => {
  try { const saved = localStorage.getItem(KEY); return EVENT_SETS.includes(saved as EventSetId) ? saved as EventSetId : DEFAULT; } catch { return DEFAULT; }
})();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const getEventSetChoice = (): EventSetId => chosen;
export function setEventSetChoice(next: EventSetId): void {
  chosen = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}
export const useEventSetChoice = (): EventSetId => useSyncExternalStore(subscribe, getEventSetChoice, getEventSetChoice);
