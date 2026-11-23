/**
 * A psi mission's window on the time bar (decision D-PW, PW92): while a psi mission is open, its card or its row
 * chosen in the Lists' Missions tab, the time bar, or in Psi Watch the Timestream, shades its window from start to end
 * with the peak marked, and the axis reaches it. One shows at a time, the last opened; each holder clears only its
 * own, so closing a card leaves the row chosen under it marked.
 */
import { useSyncExternalStore } from 'react';

export interface MissionWindowMark {
  /** The mission's address. */
  key: string;
  title: string;
  fromMs: number;
  peakMs: number;
  untilMs: number;
}

/** Every holder's mark, the newest last: the one shown. */
let held: Array<{ holder: string; mark: MissionWindowMark }> = [];
let shown: MissionWindowMark | null = null;
const listeners = new Set<() => void>();

function settle(): void {
  const next = held.length ? held[held.length - 1].mark : null;
  if (next === shown) return;
  shown = next;
  listeners.forEach((listener) => listener());
}

/** Marks a mission's window for `holder` (a card, a list row), over any other. */
export function markMissionWindow(holder: string, mark: MissionWindowMark): void {
  held = [...held.filter((h) => h.holder !== holder), { holder, mark }];
  settle();
}

/** Clears `holder`'s mark; another holder's still open shows again. */
export function clearMissionWindow(holder: string): void {
  held = held.filter((h) => h.holder !== holder);
  settle();
}

export const missionWindowMark = (): MissionWindowMark | null => shown;

export function useMissionWindowMark(): MissionWindowMark | null {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, missionWindowMark, missionWindowMark);
}

export function resetMissionWindowMarkForTests(): void {
  held = [];
  shown = null;
}
