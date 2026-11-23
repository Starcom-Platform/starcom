/**
 * When each relay last answered, and the light check that keeps it fresh (BD11).
 *
 * The ingest stamped every connect and drop, so it knew when a relay's state
 * last changed and never when it last answered. A relay's light needs the
 * latter: an event or the end of what it holds is an answer; connecting is not.
 * After its first answer a healthy relay goes quiet, so once a minute the ingest
 * asks each connected relay for nothing (limit 0), and its answer is the check.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany() { return { close() {} }; }
    close() {}
  },
}));

import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = nostrStarcomIntelIngest as any;
const state = (url: string) => nostrStarcomIntelIngest.getRelayStatus().find((r) => r.url === url)!;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  nostrStarcomIntelIngest.stop();
  internals.active = false;
  internals.relayStatus.clear();
});

const fakePool = () => {
  const asked: Array<{ relays: string[]; filter: unknown; on: { oneose?: () => void }; closed: boolean }> = [];
  return {
    asked,
    subscribeMany(relays: string[], filter: unknown, on: { oneose?: () => void }) {
      const entry = { relays, filter, on, closed: false };
      asked.push(entry);
      return { close() { entry.closed = true; } };
    },
    close() {},
  };
};

describe('when a relay last answered', () => {
  it('is not stamped by connecting', () => {
    internals.markRelay('wss://a', true);
    expect(state('wss://a').connected).toBe(true);
    expect(state('wss://a').lastAnsweredAt).toBeUndefined();
  });

  it('is stamped by an answer', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 5, 12));
    internals.markAnswered('wss://a');
    expect(state('wss://a').lastAnsweredAt).toBe(Date.UTC(2026, 9, 5, 12));
    expect(state('wss://a').connected).toBe(true);
  });
});

describe('the light check', () => {
  it('asks each connected relay for nothing, and stamps the ones that answer', () => {
    const pool = fakePool();
    internals.active = true;
    internals.pool = pool;
    internals.markRelay('wss://a', true);
    internals.markRelay('wss://b', true);
    internals.markRelay('wss://down', false);
    internals.checkRelays();
    expect(pool.asked.map((a) => a.relays[0]).sort()).toEqual(['wss://a', 'wss://b']);
    expect(pool.asked[0].filter).toMatchObject({ limit: 0 });
    pool.asked.find((a) => a.relays[0] === 'wss://a')!.on.oneose!();
    expect(state('wss://a').lastAnsweredAt).toBeTypeOf('number');
    expect(pool.asked.find((a) => a.relays[0] === 'wss://a')!.closed).toBe(true);
  });

  it('marks a relay that does not answer within ten seconds, and closes the ask', () => {
    vi.useFakeTimers();
    const pool = fakePool();
    internals.active = true;
    internals.pool = pool;
    internals.markRelay('wss://slow', true);
    internals.checkRelays();
    vi.advanceTimersByTime(10_000);
    expect(state('wss://slow').lastCheckFailedAt).toBeTypeOf('number');
    expect(pool.asked[0].closed).toBe(true);
  });

  it('asks nothing while the page is hidden', () => {
    const pool = fakePool();
    internals.active = true;
    internals.pool = pool;
    internals.markRelay('wss://a', true);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      internals.checkRelays();
      expect(pool.asked).toHaveLength(0);
    } finally {
      hidden.mockRestore();
    }
  });
});
