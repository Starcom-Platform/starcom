/**
 * Whether a layer takes the country a person selects (decision D-DP, DP16). A country selected —
 * clicked on the globe or found by search — opens its popup, a modal over a dimmed globe. While
 * Diplomacy is drawn the country is its: arcs to its counterparts on the globe and its events in the
 * docked drawer, which the popup's backdrop would hide. A layer that takes it holds it for as long as
 * it is drawn; the popup opens for nobody else's.
 */
import { useSyncExternalStore } from 'react';

let takers = 0;
const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };

/** Take the selected country for as long as the layer is drawn; the returned function gives it back. */
export function takeCountryPanel(): () => void {
  takers += 1;
  changed();
  let given = false;
  return () => {
    if (given) return;
    given = true;
    takers -= 1;
    changed();
  };
}

/** Whether a layer has taken the selected country, so the popup does not open. */
export function useCountryPanelTaken(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => takers > 0,
    () => false,
  );
}
