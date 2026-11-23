/**
 * A relay that caps what one filter returns, as The Record was measured to on
 * 2026-10-03: the newest `cap` (500) events per filter, whatever `limit` asks,
 * then EOSE; `until` inclusive; a subscription without `until` stays open and
 * hears what is published after; closing one tells its owner, as nostr-tools
 * does. For tests of reads that must not lose what lies past the cap.
 */
import { vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';

export type Reasons = Array<{ url: string; reason: string }>;
export type RelayHandlers = { onevent: (e: Event) => void; oneose?: () => void; onclose?: (reasons: Reasons) => void };

export const tagValues = (event: Event, name: string) => event.tags.filter((t) => t[0] === name).map((t) => t[1]);

export function matchesFilter(event: Event, filter: Filter): boolean {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.until !== undefined && event.created_at > filter.until) return false;
  if (filter.since !== undefined && event.created_at < filter.since) return false;
  return Object.entries(filter)
    .filter(([key]) => key.startsWith('#'))
    .every(([key, values]) => (values as string[]).some((v) => tagValues(event, key.slice(1)).includes(v)));
}

export function cappedRelay(events: Event[], options: { cap?: number; failPages?: boolean; url?: string } = {}) {
  const cap = options.cap ?? 500;
  const url = options.url ?? 'wss://record.example';
  const subs: Array<{ filter: Filter; h: RelayHandlers; closed: boolean }> = [];
  const subscribeMany = vi.fn((_relays: string[], filter: Filter, h: RelayHandlers) => {
    const sub = { filter, h, closed: false };
    subs.push(sub);
    queueMicrotask(() => {
      if (sub.closed) return;
      if (options.failPages && filter.until !== undefined) { h.onclose?.([{ url, reason: 'connection lost' }]); return; }
      const page = events.filter((e) => matchesFilter(e, filter)).sort((a, b) => b.created_at - a.created_at).slice(0, cap);
      for (const e of page) if (!sub.closed) h.onevent(e);
      if (!sub.closed) h.oneose?.();
    });
    // As nostr-tools does: closing a subscription tells its owner, "closed by caller".
    return { close: () => { if (sub.closed) return; sub.closed = true; h.onclose?.([{ url, reason: 'closed by caller' }]); } };
  });
  const publish = (e: Event) => {
    events.push(e);
    for (const s of subs) if (!s.closed && s.filter.until === undefined && matchesFilter(e, s.filter)) s.h.onevent(e);
  };
  return { pool: { subscribeMany } as never, subscribeMany, subs, publish };
}

/** Lets every queued page answer. */
export const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
