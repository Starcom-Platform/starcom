/**
 * Reading follows the cap (BA6; plan block J, item 2).
 *
 * The intake asked each relay for the newest 200 reports of the past year and
 * held 200, so a cap above 200 could draw nothing more. Raised, it pages back
 * past the oldest it holds, as Raver Watch reads The Record (which sends 500 a
 * filter, whatever `limit` asks), until it holds enough, a page brings nothing
 * new, or nothing is left. What it reads back is older than all it held, so it
 * is held behind it: a page that overshoots drops its own oldest, never the
 * newest reports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Ev = { id: string; pubkey: string; created_at: number; kind: number; sig: string; tags: string[][]; content: string };
type Sub = { filter: Record<string, unknown>; closed: boolean; maxWait?: number };
const relay = vi.hoisted(() => ({ events: [] as Ev[], subs: [] as Sub[], cap: 500, failPages: false }));

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  const matches = (e: Ev, f: Record<string, unknown>) => {
    if (Array.isArray(f.kinds) && !(f.kinds as number[]).includes(e.kind)) return false;
    if (typeof f.until === 'number' && e.created_at > f.until) return false;
    if (typeof f.since === 'number' && e.created_at < f.since) return false;
    const tags = f['#t'] as string[] | undefined;
    return !tags || e.tags.some((t) => t[0] === 't' && tags.includes(t[1]));
  };
  return {
    ...actual,
    SimplePool: class {
      subscribeMany(_relays: string[], filter: Record<string, unknown>, h: {
        onevent: (e: Ev) => void; oneose?: () => void; onclose?: (r: string[]) => void; maxWait?: number;
      }) {
        const sub: Sub = { filter, closed: false, maxWait: h.maxWait };
        relay.subs.push(sub);
        queueMicrotask(() => {
          if (sub.closed) return;
          if (relay.failPages && filter.until !== undefined) { h.onclose?.(['connection lost']); return; }
          const limit = typeof filter.limit === 'number' ? filter.limit : Infinity;
          const page = relay.events.filter((e) => matches(e, filter))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, Math.min(relay.cap, limit));
          for (const e of page) if (!sub.closed) h.onevent(e);
          if (!sub.closed) h.oneose?.();
        });
        return { close: () => { if (sub.closed) return; sub.closed = true; h.onclose?.(['closed by caller']); } };
      }
      close() {}
    },
  };
});

import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;
/** n reports, an hour apart going back from now: the newest first. */
const reports = (n: number): Ev[] => Array.from({ length: n }, (_, i) => ({
  id: `r${String(i).padStart(5, '0')}`,
  pubkey: 'a'.repeat(64),
  created_at: NOW - i * HOUR,
  kind: 1,
  sig: '',
  tags: [['t', 'starcom_intel'], ['g', '9q8yy']],
  content: `Report ${i}: something that happened somewhere.`,
}));
const settle = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
const held = (ingest: NostrStarcomIntelIngest) => (ingest as unknown as { reportIds: string[] }).reportIds;
const pages = () => relay.subs.filter((s) => s.filter.until !== undefined);

let ingest: NostrStarcomIntelIngest;
beforeEach(() => {
  relay.events = reports(1200);
  relay.subs = [];
  relay.cap = 500;
  relay.failPages = false;
  ingest = new NostrStarcomIntelIngest({ relays: ['wss://record.example'], enableRelaySearch: false });
});
afterEach(() => ingest.stop());

describe('the intake, at the cap it always had', () => {
  it('holds the newest 200, and reads no further', async () => {
    await ingest.start();
    await settle();
    expect(held(ingest)).toHaveLength(200);
    expect(pages()).toHaveLength(0);
  });
});

describe('a relay holding fewer than 200', () => {
  it('reads no further at the cap the intake always had', async () => {
    relay.events = reports(50);
    await ingest.start();
    await settle();
    expect(held(ingest)).toHaveLength(50);
    expect(pages()).toHaveLength(0);
  });
});

describe('a cap raised above 200 (BA6)', () => {
  it('pages back past the oldest it holds until it holds that many, the newest of them', async () => {
    await ingest.start();
    await settle();
    ingest.setHoldCap(500);
    await settle();
    const ids = held(ingest);
    expect(ids).toHaveLength(500);
    // The newest 500, none older.
    const kept = new Set(ids.map((id) => id.split('#')[0]));
    expect(kept.has('r00000')).toBe(true);
    expect(kept.has('r00499')).toBe(true);
    expect(kept.has('r00500')).toBe(false);
  });

  it('pages with the intake\'s own filter, each page before the oldest it has, closed at its end, waiting as long as a long page takes', async () => {
    await ingest.start();
    await settle();
    ingest.setHoldCap(500);
    await settle();
    expect(pages().length).toBeGreaterThan(0);
    const first = pages()[0];
    expect(first.filter).toMatchObject({ kinds: [1, 30023], '#t': expect.arrayContaining(['starcom_intel']) });
    expect(first.filter.until).toBe(NOW - 199 * HOUR);
    expect(typeof first.filter.since).toBe('number');
    for (const page of pages()) expect(page.closed).toBe(true);
    for (const page of pages()) expect(page.maxWait).toBe(30_000);
  });

  it('unlimited, reads everything of its window, page by page, and stops when a page brings nothing new', async () => {
    await ingest.start();
    await settle();
    ingest.setHoldCap(Infinity);
    await settle();
    expect(held(ingest)).toHaveLength(1200);
    // 200 live, then pages of up to 500 past the oldest (each repeats its boundary
    // report, `until` being inclusive), and the one that brings nothing new ends it.
    expect(pages()).toHaveLength(4);
  });

  it('a page that overshoots drops its own oldest, never the newest reports', async () => {
    await ingest.start();
    await settle();
    ingest.setHoldCap(300);
    await settle();
    const kept = new Set(held(ingest).map((id) => id.split('#')[0]));
    expect(held(ingest)).toHaveLength(300);
    expect(kept.has('r00000')).toBe(true);
    expect(kept.has('r00299')).toBe(true);
    expect(kept.has('r00300')).toBe(false);
  });

  it('reads back when started with a cap already raised, once its live read has answered', async () => {
    ingest.setHoldCap(500);
    await ingest.start();
    await settle();
    expect(held(ingest)).toHaveLength(500);
  });

  it('stops quietly when a page fails, keeping what it holds', async () => {
    relay.failPages = true;
    await ingest.start();
    await settle();
    ingest.setHoldCap(500);
    await settle();
    expect(held(ingest)).toHaveLength(200);
  });

  it('lowered again, reads nothing more', async () => {
    await ingest.start();
    await settle();
    ingest.setHoldCap(500);
    await settle();
    const before = relay.subs.length;
    ingest.setHoldCap(200);
    await settle();
    expect(relay.subs.length).toBe(before);
  });
});
