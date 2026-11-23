import { useMemo } from 'react';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import { readRecurrenceWindow, stateAt, type RecurrenceWindow } from './recurrence';
import { rlshKitSamplesOn } from './rlshKit';
import { standingAt, useRlshItems, type RlshHeld } from './useRlshItems';
import type { WindowState } from '../../psiWatch/windowProfile';

/** The calendar's default range (kit 5.1): the next 14 days and the last 7, about the cursor. */
export const RANGE_AHEAD_DAYS = 14;
export const RANGE_BACK_DAYS = 7;
const DAY_S = 86_400;

export interface ShownWindow {
  window: RecurrenceWindow;
  state: WindowState;
}

/** Each window as it stood at the cursor, its state held to it, in the order of `from`. */
export function windowsAt(held: RlshHeld, cursorS: number): ShownWindow[] {
  return standingAt(held.notes.recurrence_window, cursorS)
    .map(readRecurrenceWindow)
    .filter((w): w is RecurrenceWindow => w !== null)
    .map((window) => ({ window, state: stateAt(window, cursorS) }))
    .sort((a, b) => a.window.window.from - b.window.window.from);
}

/** Whether a window touches the default range about the cursor. */
export const inDefaultRange = (w: RecurrenceWindow, cursorS: number): boolean =>
  w.window.until >= cursorS - RANGE_BACK_DAYS * DAY_S && w.window.from <= cursorS + RANGE_AHEAD_DAYS * DAY_S;

/**
 * The Safety windows (decision D-RR, RR1): the live windows from The Record while the sub-mode is on, and the kit's
 * samples with ?rlsh=kit (RR3), each as it stood at the shared cursor.
 */
export function useSafetyWindows(active: boolean): { windows: ShownWindow[]; cursorS: number } {
  const held = useRlshItems(active && rlshKitSamplesOn(), active);
  const temporal = useTemporalStateOptional();
  const cursorS = Math.floor((temporal?.currentTime ?? Date.now()) / 1000);
  // The cursor by the minute: the states and weights move as it does, no finer.
  const minute = Math.floor(cursorS / 60);
  const windows = useMemo(() => (active ? windowsAt(held, minute * 60) : []), [active, held, minute]);
  return { windows, cursorS: minute * 60 };
}
