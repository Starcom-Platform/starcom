/**
 * Side by side (decision D-PW, PW63, PW73): whether the globe is split, the Psi layers at now on the left and at the
 * cursor on the right. For this visit only: a page opens whole.
 */
import { useSyncExternalStore } from 'react';

let split = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const getSplit = (): boolean => split;
export function setSplit(next: boolean): void {
  if (split === next) return;
  split = next;
  listeners.forEach((listener) => listener());
}
export const useSplit = (): boolean => useSyncExternalStore(subscribe, getSplit, getSplit);
