/**
 * A live read of one relay, kept alive (2026-10-12).
 *
 * Measured on the live site: five of six relays' live reads closed "connection
 * timed out" 12 s after load while their sockets opened at 8-13 s; each close
 * marked its relay down and nothing asked again, so the coverage strip read 0-1
 * of 6 relays a minute in and those relays' new reports never arrived.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany() { return { close() {} }; }
    close() {}
  },
}));

import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = nostrStarcomIntelIngest as any;
const state = (url: string) => nostrStarcomIntelIngest.getRelayStatus().find((r) => r.url === url);

type Handlers = { oneose?: () => void; onclose?: (reasons: Array<{ url: string; reason: string }>) => void; maxWait?: number };

const fakePool = () => {
  const asked: Array<{ relays: string[]; on: Handlers; closed: boolean }> = [];
  return {
    asked,
    subscribeMany(relays: string[], _filter: unknown, on: Handlers) {
      const entry = { relays, on, closed: false };
      asked.push(entry);
      return {
        close(reason = 'closed by caller') {
          entry.closed = true;
          on.onclose?.([{ url: relays[0], reason }]);
        },
      };
    },
    close() {},
  };
};

const RELAY = 'wss://relay.example';
let pool: ReturnType<typeof fakePool>;

beforeEach(() => {
  vi.useFakeTimers();
  pool = fakePool();
  internals.active = true;
  internals.pool = pool;
});

afterEach(() => {
  vi.useRealTimers();
  internals.active = false;
  internals.pool = null;
  internals.relayStatus.clear();
  internals.storedReads = new Map();
  internals.readingBack.clear();
});

const live = () => internals.subscribeWithPool(RELAY, { kinds: [30023] }, 'tag') as { unsub: () => void };
const lose = (i: number, reason = 'connection timed out') => pool.asked[i].on.onclose!([{ url: RELAY, reason }]);

describe('a live read', () => {
  it('waits as long as a complete read for its relay to connect', () => {
    live();
    expect(pool.asked[0].on.maxWait).toBe(30_000);
  });

  it('marks its relay down when the connection is lost, and asks again after 5 s, then 15 s', () => {
    live();
    internals.markRelay(RELAY, true);
    lose(0);
    expect(state(RELAY)?.connected).toBe(false);
    expect(pool.asked).toHaveLength(1);
    vi.advanceTimersByTime(4_999);
    expect(pool.asked).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(pool.asked).toHaveLength(2);
    lose(1, 'relay connection closed');
    vi.advanceTimersByTime(14_999);
    expect(pool.asked).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(pool.asked).toHaveLength(3);
  });

  it('is up again once the relay answers, and its next loss waits 5 s again', () => {
    live();
    lose(0);
    vi.advanceTimersByTime(5_000);
    pool.asked[1].on.oneose!();
    expect(state(RELAY)?.connected).toBe(true);
    lose(1);
    vi.advanceTimersByTime(5_000);
    expect(pool.asked).toHaveLength(3);
  });

  it('changes nothing when the app closes it itself', () => {
    const sub = live();
    internals.markRelay(RELAY, true);
    sub.unsub();
    expect(pool.asked[0].closed).toBe(true);
    expect(state(RELAY)?.connected).toBe(true);
    vi.advanceTimersByTime(600_000);
    expect(pool.asked).toHaveLength(1);
  });

  it('cancels a pending ask when the app closes it', () => {
    const sub = live();
    lose(0);
    sub.unsub();
    vi.advanceTimersByTime(600_000);
    expect(pool.asked).toHaveLength(1);
  });

  it('leaves a relay that refuses the filter up, and does not ask it again', () => {
    live();
    internals.markRelay(RELAY, true);
    lose(0, 'error: search filter not supported');
    expect(state(RELAY)?.connected).toBe(true);
    vi.advanceTimersByTime(600_000);
    expect(pool.asked).toHaveLength(1);
  });

  it('does not ask again once the ingest has stopped', () => {
    live();
    internals.active = false;
    lose(0);
    vi.advanceTimersByTime(600_000);
    expect(pool.asked).toHaveLength(1);
  });
});

/*
 * Whether a relay is still sending what it holds (plan H3): a capture waits on it before the camera moves, where
 * it had waited only for each relay's first note.
 */
describe('what a relay holds, read', () => {
  it("is reading from its first read's opening until the end of what it holds, and ended after", () => {
    internals.markRelay(RELAY, true);
    live();
    expect(state(RELAY)?.storedRead).toBe('reading');
    pool.asked[0].on.oneose!();
    expect(state(RELAY)?.storedRead).toBe('ended');
  });

  it("is reading until every one of its relay's first reads has ended", () => {
    internals.markRelay(RELAY, true);
    live();
    internals.subscribeWithPool(RELAY, { kinds: [30023] }, 'search');
    pool.asked[0].on.oneose!();
    expect(state(RELAY)?.storedRead).toBe('reading');
    pool.asked[1].on.oneose!();
    expect(state(RELAY)?.storedRead).toBe('ended');
  });

  it('has ended with a read closed before its end, and a read asked again after a drop is not waited on', () => {
    internals.markRelay(RELAY, true);
    live();
    lose(0);
    expect(state(RELAY)?.storedRead).toBe('ended');
    vi.advanceTimersByTime(5_000);
    expect(pool.asked).toHaveLength(2);
    expect(state(RELAY)?.storedRead).toBe('ended');
  });

  it('is reading again while it pages back', () => {
    internals.markRelay(RELAY, true);
    live();
    pool.asked[0].on.oneose!();
    internals.readingBack.add(RELAY);
    expect(state(RELAY)?.storedRead).toBe('reading');
  });

  it('says nothing before any read has begun', () => {
    internals.markRelay(RELAY, true);
    expect(state(RELAY)).not.toHaveProperty('storedRead');
  });
});
