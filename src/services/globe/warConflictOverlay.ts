/**
 * War & Conflict drawn over any mode, from the right rail's overlay toggle (owner, 1 Nov: "swap out the Conflict Zones
 * visualization toggle with War and Conflict"). Kept in this browser. Conflict Zones' overlay had that button; a
 * person who had it on starts with this one on instead, as the nearer thing they asked for, and Conflict Zones stays
 * a section of Geo Political.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'starcom:war-conflict-overlay';
/** The overlays' own record, where Conflict Zones' toggle was kept (VisualizationOverlayContext). */
const OLD_KEY = 'visualization-overlay-settings';

function read(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved === '1';
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as { conflictZonesOverlayEnabled?: boolean } | null;
    return old?.conflictZonesOverlayEnabled === true;
  } catch {
    return false;
  }
}

let on: boolean | null = null;
const listeners = new Set<() => void>();

export const warConflictOverlayOn = (): boolean => (on ??= read());

export function toggleWarConflictOverlay(): void {
  on = !warConflictOverlayOn();
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* kept for this page only */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useWarConflictOverlay = (): boolean => useSyncExternalStore(subscribe, warConflictOverlayOn, warConflictOverlayOn);

/** Test-only: forget what was read. */
export function resetWarConflictOverlayForTests(): void { on = null; }
