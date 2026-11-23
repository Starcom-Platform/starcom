/**
 * How far back the inbox reads (plan 9.2). A gift wrap is dated up to two days
 * before it was sent (NIP-59), and the inbox read only the last three days, so
 * a message sent to someone offline for more than about a day fell outside
 * every later read, for good. Bundle parts too.
 *
 * It now reads from where this device last read to, less the two days a wrap
 * can be backdated, and never more than fourteen days back.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateSecretKey, nip19, type Filter } from 'nostr-tools';
import { startSealedInbox } from '../sealedInbox';
import nostrService from '../../nostrService';

const DAY = 24 * 60 * 60;
const T0 = Date.UTC(2026, 10, 2, 12, 0, 0); // 2 Nov 2026, 12:00Z

function installStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

/** A pool that records what was asked for, and lets a test say "that is everything stored". */
function fakePool() {
  const asked: Filter[] = [];
  let eose: (() => void) | undefined;
  const pool = {
    subscribeMany: (_relays: string[], filter: Filter, params: { oneose?: () => void }) => {
      asked.push(filter);
      eose = params.oneose;
      return { close: () => {} };
    },
  };
  return { pool: pool as never, asked, sentEverything: () => eose?.() };
}

const secondsAt = (ms: number) => Math.floor(ms / 1000);
const become = () => { nostrService.forgetIdentity(); return nostrService.importNsec(nip19.nsecEncode(generateSecretKey())); };

beforeEach(() => {
  installStorageShim();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  become();
});
afterEach(() => { vi.useRealTimers(); });

describe('how far back the sealed inbox reads', () => {
  it('on a device that has never read, reads the last fourteen days', () => {
    const { pool, asked } = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool });
    expect(asked[0].since).toBe(secondsAt(T0) - 14 * DAY);
  });

  it('after five days away, reads from where it last read, less the two days a wrap can be backdated', () => {
    const first = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: first.pool });
    first.sentEverything();

    vi.setSystemTime(T0 + 5 * DAY * 1000);
    const later = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: later.pool });
    // The three-day window read from Oct 31 12:00; a wrap sent on Nov 2 and dated Oct 31 06:00 was missed.
    expect(later.asked[0].since).toBe(secondsAt(T0) - 2 * DAY);
  });

  it('only counts a read as done once the relays have sent everything they hold', () => {
    const first = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: first.pool });
    // No "that is everything": the device went away mid-read.
    vi.setSystemTime(T0 + 1 * DAY * 1000);
    const later = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: later.pool });
    expect(later.asked[0].since).toBe(secondsAt(T0 + DAY * 1000) - 14 * DAY);
  });

  it('never reads more than fourteen days back, however long the device was away', () => {
    const first = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: first.pool });
    first.sentEverything();
    vi.setSystemTime(T0 + 40 * DAY * 1000);
    const later = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: later.pool });
    expect(later.asked[0].since).toBe(secondsAt(T0 + 40 * DAY * 1000) - 14 * DAY);
  });

  it('keeps where it read to for each key on the device', () => {
    const firstKey = generateSecretKey();
    nostrService.forgetIdentity();
    nostrService.importNsec(nip19.nsecEncode(firstKey));
    const first = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: first.pool });
    first.sentEverything();

    become(); // another key on the same device, which has never read
    vi.setSystemTime(T0 + 3 * DAY * 1000);
    const other = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: other.pool });
    expect(other.asked[0].since).toBe(secondsAt(T0 + 3 * DAY * 1000) - 14 * DAY);
    other.sentEverything();

    // Back to the first key: where it read to was not lost when the other key read.
    nostrService.forgetIdentity();
    nostrService.importNsec(nip19.nsecEncode(firstKey));
    vi.setSystemTime(T0 + 5 * DAY * 1000);
    const again = fakePool();
    startSealedInbox({}, { relays: ['wss://relay.example'], pool: again.pool });
    expect(again.asked[0].since).toBe(secondsAt(T0) - 2 * DAY);
  });
});
