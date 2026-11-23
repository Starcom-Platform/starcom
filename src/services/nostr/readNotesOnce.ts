/**
 * The events a filter matches, as many as arrive before the read is complete (every page, readComplete.ts)
 * or the wait runs out: for a reader that wants an answer now, not a subscription. Mecha Jono's notes
 * that stand in for a source the browser cannot read are read this way (energyProduction.ts,
 * sanctionsChanges.ts); a reader falls back when they are not there in time.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { readComplete } from './readComplete';

export function readNotesOnce(
  pool: Pick<SimplePool, 'subscribeMany'>,
  relays: string[],
  filter: Filter,
  waitMs: number,
): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    let done = false;
    let read: { close(): void } | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      read?.close();
      resolve(events);
    };
    const timer = setTimeout(finish, waitMs);
    read = readComplete(pool, relays, [filter], {
      onevent: (event) => events.push(event),
      oncomplete: finish,
      onfail: finish,
    });
    // Answered before readComplete returned: close what it opened.
    if (done) read.close();
  });
}
