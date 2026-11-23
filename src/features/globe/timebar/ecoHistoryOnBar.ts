/**
 * Eco Disasters' captured history on the one time bar (critique-2026-11-01, OR4; plan C2). Eco's replay already follows
 * the shared time (decision D-E, step 8), so its floating player only repeated the bar; the globe now publishes the
 * snapshots' times and their span here, and the bar draws them as ticks with a step to the one before and after, as
 * the War & Conflict Brief's days are drawn (briefCalendar.ts).
 */

export interface EcoHistoryOnBar {
  /** The captured snapshots' times, ms, oldest first. */
  times: readonly number[];
  /** The span captured, in words ("3.2 days captured"). */
  spanLabel: string | null;
  stepToPrevious(): void;
  stepToNext(): void;
}

let current: EcoHistoryOnBar | null = null;
const listeners = new Set<() => void>();

/** Eco's history while Eco Disasters is drawn and has any, or null. */
export function publishEcoHistory(next: EcoHistoryOnBar | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

/** Stable between publishes, for useSyncExternalStore. */
export function getEcoHistory(): EcoHistoryOnBar | null {
  return current;
}

export function subscribeEcoHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
