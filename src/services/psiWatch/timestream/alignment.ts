/**
 * The alignment lane's counts (decision D-PW, PW39, PW55, PW71): an Echo's returns stacked on their exact moments,
 * the events lane's set counted by day from 30 days before each to 30 after, beside the usual, the count any day of
 * the open record holds times the returns stacked. Only the returns whose whole sixty-one days lie inside the record are
 * stacked, so no day is short of returns, and none whose days touch the years Mecha Jono holds back for their sealed
 * tests (`withheld.ts`). Opened from the Echoes card; one lane at a time.
 */
import { useSyncExternalStore } from 'react';
import type { Echo } from './echoes';
import type { EventSet } from './eventSets';
import { openRecord, touchesWithheld } from './withheld';

const DAY_MS = 86_400_000;
export const ALIGN_DAYS = 30;

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

export interface Alignment {
  /** Events on each day from −days to +days, index 0 the farthest before. */
  counts: number[];
  /** The returns stacked. */
  returns: number;
  /** The count a day holds across the record, times the returns stacked. */
  usual: number;
}

/** The Echo's returns stacked on their exact moments, a day each side of each counted to `days`. */
export function alignCounts(echo: Pick<Echo, 'returns'>, set: EventSet, days = ALIGN_DAYS): Alignment {
  const counts = new Array<number>(2 * days + 1).fill(0);
  const reach = (days + 0.5) * DAY_MS;
  const stacked = (echo.returns ?? []).filter((ms) => ms - reach >= set.fromMs && ms + reach <= set.untilMs + DAY_MS
    && !touchesWithheld(set.id, ms - reach, ms + reach));
  for (const r of stacked) {
    for (let d = -days; d <= days; d++) {
      const from = r + (d - 0.5) * DAY_MS;
      counts[d + days] += firstAtOrAfter(set.ms, from + DAY_MS) - firstAtOrAfter(set.ms, from);
    }
  }
  const open = openRecord(set);
  const perDay = open.days > 0 ? open.events / open.days : 0;
  return { counts, returns: stacked.length, usual: perDay * stacked.length };
}

// Whether the alignment lane is open, for the Echo shown.
let open = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAligned = (): boolean => open;
export function setAligned(next: boolean): void { open = next; listeners.forEach((listener) => listener()); }
export const useAligned = (): boolean => useSyncExternalStore(subscribe, getAligned, getAligned);
