/**
 * Reading everything a filter matches from a relay that caps what one filter
 * returns. The relay here behaves as The Record was measured to on 2026-10-03:
 * the newest 500 events per filter, whatever `limit` asks; `until` inclusive.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { readComplete, READ_WAIT_MS } from '../readComplete';
import { cappedRelay, settle, type Reasons, type RelayHandlers } from './cappedRelay';

const RELAYS = ['wss://record.example'];
const T0 = 1_791_000_000;

function ev(n: number, kind = 30023, createdAt = T0 - n): Event {
  return { id: n.toString(16).padStart(64, '0'), kind, created_at: createdAt, pubkey: 'a'.repeat(64), tags: [], content: '', sig: '' } as Event;
}

function reader() {
  const log: string[] = [];
  const seen: Event[] = [];
  const handlers = {
    onevent: vi.fn((e: Event) => { seen.push(e); log.push('event'); }),
    oncomplete: vi.fn(() => { log.push('complete'); }),
    onfail: vi.fn((reasons: Reasons) => { log.push(`fail:${reasons.map((r) => r.reason).join()}`); }),
  };
  return { handlers, seen, log };
}

describe('readComplete', () => {
  it('reads past the cap on what one filter returns, a page before its oldest at a time', async () => {
    const relay = cappedRelay(Array.from({ length: 1200 }, (_, n) => ev(n)));
    const { handlers, seen } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(new Set(seen.map((e) => e.id)).size).toBe(1200);
    expect(handlers.oncomplete).toHaveBeenCalledTimes(1);
    // The second page asks before the first page's oldest.
    expect(relay.subscribeMany.mock.calls[1][1]).toEqual({ kinds: [30023], until: T0 - 499 });
  });

  it('reads each filter on its own, so one kind cannot crowd out another', async () => {
    // As The Record held Raver Watch: 600 venue nights newer than 92 alerts and heat towns.
    const nights = Array.from({ length: 600 }, (_, n) => ev(n, 31923));
    const notes = Array.from({ length: 92 }, (_, n) => ev(1000 + n, 30023));
    const relay = cappedRelay([...nights, ...notes]);
    const { handlers, seen } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }, { kinds: [31923] }], handlers);
    await settle();
    expect(seen.filter((e) => e.kind === 30023)).toHaveLength(92);
    expect(seen.filter((e) => e.kind === 31923)).toHaveLength(600);
  });

  it('is complete only when every filter\'s last page is in', async () => {
    const relay = cappedRelay([...Array.from({ length: 700 }, (_, n) => ev(n, 31923)), ev(5000, 30023)]);
    const { handlers, log } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }, { kinds: [31923] }], handlers);
    await settle();
    expect(log.filter((l) => l === 'event')).toHaveLength(701);
    expect(log.indexOf('complete')).toBe(log.length - 1);
    expect(handlers.oncomplete).toHaveBeenCalledTimes(1);
  });

  it('stops when a page brings nothing new, rather than asking for the same second for ever', async () => {
    // More events in one second than the cap: NIP-01 cannot page within a second, so the read ends.
    const relay = cappedRelay(Array.from({ length: 600 }, (_, n) => ev(n, 30023, T0)));
    const { handlers } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(handlers.oncomplete).toHaveBeenCalledTimes(1);
    expect(relay.subscribeMany).toHaveBeenCalledTimes(2);
  });

  it('waits for each page\'s end of stored events far longer than nostr-tools\' 4.4 seconds', async () => {
    // nostr-tools ends a read it has waited 4.4 s for as if the relay had said it was done:
    // 500 venue nights took longer, the page counted nothing, and the read stopped there.
    const relay = cappedRelay(Array.from({ length: 1200 }, (_, n) => ev(n)));
    const { handlers } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(relay.subscribeMany.mock.calls.length).toBe(4);
    for (const [, , params] of relay.subscribeMany.mock.calls) expect(params).toMatchObject({ maxWait: READ_WAIT_MS });
    expect(READ_WAIT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('completes at once when the relay holds nothing', async () => {
    const relay = cappedRelay([]);
    const { handlers } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(handlers.oncomplete).toHaveBeenCalledTimes(1);
    expect(relay.subscribeMany).toHaveBeenCalledTimes(1);
  });

  it('keeps reading what arrives after, and closes each page once it is in', async () => {
    const relay = cappedRelay(Array.from({ length: 600 }, (_, n) => ev(n)));
    const { handlers, seen } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(relay.subs.filter((s) => s.filter.until !== undefined).every((s) => s.closed)).toBe(true);
    expect(relay.subs.find((s) => s.filter.until === undefined)!.closed).toBe(false);
    relay.publish(ev(9999, 30023, T0 + 60));
    expect(seen.at(-1)!.id).toBe(ev(9999).id);
  });

  it('fails when a page closes before it was sent whole, says so once, and is never complete', async () => {
    const relay = cappedRelay([...Array.from({ length: 600 }, (_, n) => ev(n)), ...Array.from({ length: 600 }, (_, n) => ev(1000 + n, 31923))], { failPages: true });
    const { handlers, log } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }, { kinds: [31923] }], handlers);
    await settle();
    expect(log.at(-1)).toBe('fail:connection lost');
    expect(handlers.onfail).toHaveBeenCalledTimes(1);
    expect(handlers.oncomplete).not.toHaveBeenCalled();
  });

  it('fails when the first read closes before it answers', async () => {
    const subscribeMany = vi.fn((_r: string[], _f: Filter, h: RelayHandlers) => {
      queueMicrotask(() => h.onclose?.([{ url: RELAYS[0], reason: 'connection failed' }]));
      return { close: vi.fn() };
    });
    const { handlers } = reader();
    readComplete({ subscribeMany } as never, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(handlers.onfail).toHaveBeenCalledWith([{ url: RELAYS[0], reason: 'connection failed' }]);
  });

  it('closes everything it opened when closed, and says nothing after', async () => {
    const relay = cappedRelay(Array.from({ length: 1200 }, (_, n) => ev(n)));
    const { handlers } = reader();
    const read = readComplete(relay.pool, RELAYS, [{ kinds: [30023] }, { kinds: [31923] }], handlers);
    // The first pages are in and the second page is asked for; close before it answers.
    await Promise.resolve();
    read.close();
    await settle();
    expect(relay.subs.every((s) => s.closed)).toBe(true);
    expect(handlers.oncomplete).not.toHaveBeenCalled();
    expect(handlers.onfail).not.toHaveBeenCalled();
  });

  it('takes an event once, though two pages send it', async () => {
    const relay = cappedRelay(Array.from({ length: 700 }, (_, n) => ev(n, 30023, T0 - Math.floor(n / 2))));
    const { handlers, seen } = reader();
    readComplete(relay.pool, RELAYS, [{ kinds: [30023] }], handlers);
    await settle();
    expect(seen).toHaveLength(700);
    expect(new Set(seen.map((e) => e.id)).size).toBe(700);
  });
});
