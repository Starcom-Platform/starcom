/**
 * Reads everything a set of filters matches, and keeps reading what arrives after.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * A relay caps what one filter returns. The Record returns the newest 500
 * events per filter, whatever `limit` asks (measured 2026-10-03), and says
 * nothing of what it left out: the end of stored events looks the same either
 * way. Raver Watch was read with one filter over both its kinds, and once
 * Mecha Jono listed 558 venue nights, The Record sent 460 of them and 40 of
 * their 92 notes: every drug-check alert, a critical one among them, and 51
 * heat towns were never drawn, and the feed said it was loaded.
 *
 * So each filter is read on its own, and read again before its oldest event
 * (`until`, inclusive in NIP-01) until a page brings nothing new. Only then is
 * the read complete. NIP-01 cannot page within one second: more events in one
 * second than the cap are read as far as the cap, and the read ends.
 *
 * Each filter's first subscription stays open for what is published later;
 * each later page closes once it is in.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';

/**
 * How long a page may take to say it has sent everything.
 *
 * nostr-tools ends a read it has waited 4.4 seconds for as if the relay had
 * said it was done (`baseEoseTimeout`), and nothing tells the two apart. On the
 * built app read through a proxy, The Record took longer than that to send 500
 * venue nights: the page had counted none, so the read stopped there and said
 * it was complete (2026-10-03). A slow connection does the same. nostr-tools
 * takes `maxWait` for this wait, and for the wait for a connection when that is
 * shorter: an unreachable relay is reported after 29 seconds rather than 4.4.
 */
export const READ_WAIT_MS = 30_000;

export type CloseReasons = Array<{ url: string; reason: string }>;

export interface CompleteReadHandlers {
  onevent(event: Event): void;
  /** Every filter's last page is in: everything they match was read. Called once. */
  oncomplete(): void;
  /** A page closed before it was sent whole, and not by us: the read is not complete, and never will be. */
  onfail(reasons: CloseReasons): void;
}

export function readComplete(
  pool: Pick<SimplePool, 'subscribeMany'>,
  relays: string[],
  filters: Filter[],
  handlers: CompleteReadHandlers,
): { close(): void } {
  const open = new Set<{ close(): void }>();
  let closing = false;
  let failed = false;
  let reading = filters.length;

  const fail = (reasons: CloseReasons) => {
    if (closing || failed) return;
    failed = true;
    handlers.onfail(reasons);
  };

  const readFilter = (filter: Filter) => {
    const seen = new Set<string>();
    let oldest = Infinity;
    /** Whether the event is new to this filter's read. */
    const take = (event: Event): boolean => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (event.created_at < oldest) oldest = event.created_at;
      handlers.onevent(event);
      return true;
    };
    const finished = () => {
      reading -= 1;
      if (reading === 0 && !failed && !closing) handlers.oncomplete();
    };
    /** The page before the oldest, when the last brought anything new. */
    const nextPage = (broughtNew: number) => {
      if (closing || failed) return;
      if (broughtNew === 0) { finished(); return; }
      let fresh = 0;
      let answered = false;
      const page: { close(): void } = pool.subscribeMany(relays, { ...filter, until: oldest }, {
        maxWait: READ_WAIT_MS,
        onevent: (event: Event) => { if (take(event)) fresh += 1; },
        oneose: () => {
          answered = true;
          open.delete(page);
          page.close();
          nextPage(fresh);
        },
        onclose: (reasons: CloseReasons) => {
          open.delete(page);
          if (!answered) fail(reasons);
        },
      });
      open.add(page);
    };

    let firstPage = 0;
    let answered = false;
    const live = pool.subscribeMany(relays, filter, {
      maxWait: READ_WAIT_MS,
      onevent: (event: Event) => { if (take(event) && !answered) firstPage += 1; },
      oneose: () => {
        answered = true;
        nextPage(firstPage);
      },
      onclose: (reasons: CloseReasons) => {
        // Closed before it said it had sent everything, and not by us: it was not read.
        if (!answered) fail(reasons);
      },
    });
    open.add(live);
  };

  for (const filter of filters) readFilter(filter);

  return {
    close: () => {
      closing = true;
      for (const sub of [...open]) sub.close();
      open.clear();
    },
  };
}
