/**
 * The inbox reads again when a relay drops it (plan 0.3; the cohort audit of 2026-10-19). A tunnel restart, a
 * Wi-Fi drop or a laptop's sleep closed the read, nothing opened it again, and direct messages, team chat and
 * bundles stopped arriving until a reload. Now each relay is read on its own and read again after it closes,
 * sooner first and then once a minute; a read that reached the end starts the wait over. Nothing is read again
 * after the inbox is stopped, or after a relay refuses it outright.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { startSealedInbox, INBOX_RETRY_MS } from '../sealedInbox';
import nostrService from '../../nostrService';

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

/** As the app's pool says it: each relay's reason, with its address (relayPool.ts). */
type Reasons = Array<{ url: string; reason: string }>;
type Handlers = { oneose?: () => void; onclose?: (reasons: Reasons) => void };
/** A pool whose reads a test can close, as a relay does when its connection drops. */
function fakePool() {
  const reads: Array<{ relays: string[]; h: Handlers; closedByUs: boolean }> = [];
  const pool = {
    subscribeMany: (relays: string[], _filter: unknown, h: Handlers) => {
      const read = { relays, h, closedByUs: false };
      reads.push(read);
      return { close: () => { read.closedByUs = true; h.onclose?.([{ url: relays[0], reason: 'closed by caller' }]); } };
    },
  };
  const of = (relay: string) => reads.filter((r) => r.relays[0] === relay);
  return { pool: pool as never, reads, of, drop: (relay: string, reason = 'relay connection closed') => of(relay).at(-1)!.h.onclose?.([{ url: relay, reason }]) };
}

beforeEach(() => {
  installStorageShim();
  vi.useFakeTimers();
  nostrService.forgetIdentity();
  nostrService.importNsec(nip19.nsecEncode(generateSecretKey()));
});
afterEach(() => { vi.useRealTimers(); });

describe('the sealed inbox, when a relay drops it', () => {
  it('reads each relay on its own', () => {
    const f = fakePool();
    startSealedInbox({}, { relays: ['wss://a.example', 'wss://b.example'], pool: f.pool });
    expect(f.reads.map((r) => r.relays)).toEqual([['wss://a.example'], ['wss://b.example']]);
  });

  it('reads that relay again after a wait, and leaves the others as they are', () => {
    const f = fakePool();
    startSealedInbox({}, { relays: ['wss://a.example', 'wss://b.example'], pool: f.pool });
    f.drop('wss://a.example');
    vi.advanceTimersByTime(INBOX_RETRY_MS[0] - 1);
    expect(f.of('wss://a.example')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.of('wss://a.example')).toHaveLength(2);
    expect(f.of('wss://b.example')).toHaveLength(1);
  });

  it('waits longer each time it fails again, up to a minute, and never reads sooner', () => {
    const f = fakePool();
    startSealedInbox({}, { relays: ['wss://a.example'], pool: f.pool });
    for (let i = 0; i < INBOX_RETRY_MS.length + 1; i++) {
      const wait = INBOX_RETRY_MS[Math.min(i, INBOX_RETRY_MS.length - 1)];
      const before = f.of('wss://a.example').length;
      f.drop('wss://a.example');
      vi.advanceTimersByTime(wait - 1);
      expect(f.of('wss://a.example'), `drop ${i + 1}`).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(f.of('wss://a.example'), `drop ${i + 1}`).toHaveLength(before + 1);
    }
    expect(Math.max(...INBOX_RETRY_MS)).toBe(60_000);
  });

  it('starts the wait over after a read that reached the end', () => {
    const f = fakePool();
    startSealedInbox({}, { relays: ['wss://a.example'], pool: f.pool });
    for (const wait of INBOX_RETRY_MS.slice(0, 3)) { f.drop('wss://a.example'); vi.advanceTimersByTime(wait); }
    f.of('wss://a.example').at(-1)!.h.oneose?.();
    f.drop('wss://a.example');
    vi.advanceTimersByTime(INBOX_RETRY_MS[0]);
    expect(f.of('wss://a.example')).toHaveLength(5);
    // And the next failure after it is the second wait, not the fourth.
    f.drop('wss://a.example');
    vi.advanceTimersByTime(INBOX_RETRY_MS[1]);
    expect(f.of('wss://a.example')).toHaveLength(6);
  });

  it('reads nothing again after a relay refuses it outright', () => {
    const f = fakePool();
    startSealedInbox({}, { relays: ['wss://a.example', 'wss://b.example'], pool: f.pool });
    f.drop('wss://b.example', 'restricted: not a member');
    vi.advanceTimersByTime(10 * 60_000);
    expect(f.of('wss://b.example')).toHaveLength(1);
  });

  it('reads nothing again once stopped', () => {
    const f = fakePool();
    const stop = startSealedInbox({}, { relays: ['wss://a.example', 'wss://b.example'], pool: f.pool });
    f.drop('wss://a.example');
    stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(f.reads).toHaveLength(2);
  });
});
