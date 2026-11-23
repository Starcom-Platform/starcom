/**
 * Reading the roster from the relays (decision D-RS, RS4, RS19): every public 30084 Roster Item, by anyone, the
 * newest at each address standing; a retraction there withdraws it; a kind this build does not know is counted,
 * not shown. One read however many ask.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BURST_MS } from '../../nostr/burst';
import type { Event } from 'nostr-tools';
import { rosterTemplate, type RosterItem } from '../rosterItem';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const base: RosterItem = { d: 'directive-1', kind: 'directive', title: 'Map the drug supply', limits: [], places: [], toward: [], counts: [], text: '' };
let n = 0;
const ev = (item: RosterItem, over: Partial<Event> = {}): Event => {
  const t = rosterTemplate(item);
  n += 1;
  return { id: n.toString(16).padStart(64, '0'), pubkey: A, created_at: 1_792_200_000, sig: 's'.repeat(128), ...t, ...over } as Event;
};

const load = async () => import('../rosterRead');

describe('RosterStore', () => {
  beforeEach(() => { vi.resetModules(); });

  it('marks the author of an item that says its key is an AI agent\'s (MX14)', async () => {
    const { RosterStore } = await load();
    const { isAgentKey, resetAgentKeys } = await import('../../identity/agentKeys');
    resetAgentKeys();
    const store = new RosterStore();
    store.accept(ev(base, { created_at: 100 }));
    expect(isAgentKey(A)).toBe(false);
    const tagged = ev({ ...base, d: 'directive-2' }, { created_at: 101 });
    tagged.tags = [...tagged.tags, ['agent', 'mecha_jono']];
    store.accept(tagged);
    expect(isAgentKey(A)).toBe(true);
    resetAgentKeys();
  });

  it('keeps the newest event at each address', async () => {
    const { RosterStore } = await load();
    const store = new RosterStore();
    store.accept(ev(base, { created_at: 100 }));
    store.accept(ev({ ...base, title: 'Map the drug supply, Bay Area' }, { created_at: 200 }));
    store.accept(ev({ ...base, title: 'An older edit' }, { created_at: 150 }));
    expect(store.items().map((i) => i.title)).toEqual(['Map the drug supply, Bay Area']);
  });

  it('withdraws an item retracted at its address, unless an edit follows', async () => {
    const { RosterStore } = await load();
    const store = new RosterStore();
    store.accept(ev(base, { created_at: 100 }));
    const retraction = ev(base, { created_at: 200 });
    retraction.tags = [...retraction.tags, ['t', 'retracted']];
    store.accept(retraction);
    expect(store.items()).toEqual([]);
    store.accept(ev(base, { created_at: 150 }));
    expect(store.items()).toEqual([]);
    store.accept(ev(base, { created_at: 300 }));
    expect(store.items()).toHaveLength(1);
  });

  it('keeps each author\'s items apart at the same d, and lists the newest first', async () => {
    const { RosterStore } = await load();
    const store = new RosterStore();
    store.accept(ev(base, { created_at: 100 }));
    store.accept(ev(base, { pubkey: B, created_at: 200 }));
    expect(store.items().map((i) => i.author)).toEqual([B, A]);
  });

  it('counts a kind it does not know, and what it refused', async () => {
    const { RosterStore } = await load();
    const store = new RosterStore();
    const unknown = ev(base);
    unknown.tags = unknown.tags.map((t) => (t[0] === 'roster' ? ['roster', 'crusade'] : t));
    expect(store.accept(unknown)).toEqual({ kept: false });
    const untitled = ev(base);
    untitled.tags = untitled.tags.filter((t) => t[0] !== 'title');
    store.accept(untitled);
    expect(store.unknownKinds()).toEqual([{ kind: 'crusade', count: 1 }]);
    expect(store.refused()).toBe(1);
  });
});

describe('startRosterRead', () => {
  beforeEach(() => { vi.resetModules(); });

  it('reads 30084 tagged starcom_roster from every relay, one read however many ask', async () => {
    const mod = await load();
    vi.useFakeTimers();
    type H = { onevent: (e: Event) => void; oneose: () => void; onclose: (r: { url: string; reason: string }[]) => void };
    const handlers: H[] = [];
    const close = vi.fn();
    const subscribeMany = vi.fn((_relays: string[], _filter: unknown, h: H) => { handlers.push(h); return { close }; });
    const stop = mod.startRosterRead({ pool: { subscribeMany } as never, relays: ['wss://one.example', 'wss://two.example'] });
    expect(subscribeMany.mock.calls.map((c) => [c[0], c[1]])).toEqual([[['wss://one.example', 'wss://two.example'], { kinds: [30084], '#t': ['starcom_roster'] }]]);
    handlers[0].onevent(ev(base));
    // A burst is gathered before it is told (burst.ts).
    expect(mod.rosterItems()).toHaveLength(0);
    vi.advanceTimersByTime(BURST_MS);
    expect(mod.rosterItems()).toHaveLength(1);
    expect(mod.rosterItems()).toBe(mod.rosterItems());
    const again = mod.startRosterRead({ pool: { subscribeMany } as never });
    expect(subscribeMany).toHaveBeenCalledTimes(1);
    stop();
    again();
    expect(close).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
