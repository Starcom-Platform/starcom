/**
 * Mecha Jono's amount notes (CR2), read once a visit however many rows ask: the lead desk's and Grants' rows and
 * details all read what it holds. Nothing is held until the read answers; a read that fails is no amounts.
 */
import { useSyncExternalStore } from 'react';
import { NO_AMOUNTS, readAmountNotes, type AmountNotes } from './feeds/amountNotes';

let held: AmountNotes = NO_AMOUNTS;
let reading = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!reading) {
    reading = true;
    readAmountNotes().then((notes) => {
      held = notes;
      for (const heard of listeners) heard();
    }, () => { /* none: the board says none is listed here yet */ });
  }
  return () => { listeners.delete(listener); };
}

const now = () => held;

export function useAmountNotes(): AmountNotes {
  return useSyncExternalStore(subscribe, now, now);
}
