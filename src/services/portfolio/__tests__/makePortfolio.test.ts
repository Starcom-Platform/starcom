/**
 * Where a portfolio reads published work (decision D-EX, EX28, EX30): the public relays, never the team's
 * internal ones; and a read that ends early, by a relay failing or by the time limit, is said, never
 * passed off as whole.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { publicRelays, publishedFilters, readPublished } from '../makePortfolio';

describe('publicRelays', () => {
  it('is the publish and read relays, each once, without the internal ones', () => {
    expect(publicRelays({
      publish: [['wss://relay.damus.io', 'wss://record.cosmiccodex.app/'], ['wss://nos.lol']],
      read: ['wss://record.cosmiccodex.app', 'wss://crew.cosmiccodex.app'],
      internal: ['wss://crew.cosmiccodex.app/'],
    })).toEqual(['wss://relay.damus.io', 'wss://record.cosmiccodex.app/', 'wss://nos.lol']);
  });
});

describe('publishedFilters', () => {
  it('asks for Starcom\'s kinds by this key alone, reports only when tagged as Starcom intel', () => {
    const filters = publishedFilters('a'.repeat(64));
    expect(filters.every((f) => f.authors?.[0] === 'a'.repeat(64))).toBe(true);
    expect(filters.map((f) => f.kinds?.[0])).toEqual([30023, 30082, 30083, 30079, 1111, 1985]);
    expect(filters[0]['#t']).toEqual(['starcom_intel']);
  });
});

describe('readPublished', () => {
  const event = { id: 'e1' } as never;

  it('is whole when every filter is read, and closes the read', async () => {
    const close = vi.fn();
    const result = await readPublished('k', ['wss://r'], ((_p, _r, _f, h) => { h.onevent(event); queueMicrotask(() => h.oncomplete()); return { close }; }) as never, {} as never, 1000);
    expect(result).toEqual({ events: [event], complete: true, relays: ['wss://r'] });
    expect(close).toHaveBeenCalled();
  });

  it('says a relay failed, keeping what arrived', async () => {
    const result = await readPublished('k', ['wss://r'], ((_p, _r, _f, h) => { h.onevent(event); queueMicrotask(() => h.onfail([{ url: 'wss://r', reason: 'closed' }])); return { close() {} }; }) as never, {} as never, 1000);
    expect(result).toEqual({ events: [event], complete: false, relays: ['wss://r'], note: 'wss://r: closed' });
  });

  it('ends at the time limit and says so', async () => {
    const result = await readPublished('k', ['wss://r'], (() => ({ close() {} })) as never, {} as never, 20);
    expect(result).toMatchObject({ complete: false, note: 'the relays had not sent everything after 0.02 s' });
  });
});
