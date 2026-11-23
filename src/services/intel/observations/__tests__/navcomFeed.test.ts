/**
 * Gathering NavCom's raw intel (D-MX, MX3): kind 1911 from each relay read,
 * each event once, the first relay it came from remembered for a citation, and
 * a failure said as one when no relay answers.
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchNavcomEvents, fetchNavcomEventsById, relayOf } from '../navcomFeed';

const NOW = Date.UTC(2026, 9, 6, 12);
const event = (id: string) => ({ id, kind: 1911, pubkey: 'a'.repeat(64), created_at: NOW / 1000 - 60, content: '{}', tags: [], sig: 's' });

describe('fetchNavcomEvents', () => {
  it('asks each relay for kind 1911 over the last 90 days (NavCom drops uncited ones then), and keeps each event once, from the first relay it came from', async () => {
    const querySync = vi.fn(async (relays: string[]) => (relays[0] === 'wss://one' ? [event('e1'), event('e2')] : [event('e2'), event('e3')]));
    const events = await fetchNavcomEvents({ relays: ['wss://one', 'wss://two'], pool: { querySync } as never, now: () => NOW });
    expect(events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(querySync.mock.calls[0][1]).toEqual({ kinds: [1911], since: NOW / 1000 - 90 * 86_400, limit: 500 });
    expect(relayOf('e2')).toBe('wss://one');
    expect(relayOf('e3')).toBe('wss://two');
  });

  it('keeps the first relay an event ever came from as its hint, read after read', async () => {
    const reversed = vi.fn(async (relays: string[]) => (relays[0] === 'wss://three' ? [event('e5')] : [event('e5')]));
    await fetchNavcomEvents({ relays: ['wss://three', 'wss://four'], pool: { querySync: reversed } as never, now: () => NOW });
    await fetchNavcomEvents({ relays: ['wss://four', 'wss://three'], pool: { querySync: reversed } as never, now: () => NOW });
    expect(relayOf('e5')).toBe('wss://three');
  });

  it('reads on when one relay fails, and fails only when none answers', async () => {
    const querySync = vi.fn(async (relays: string[]) => {
      if (relays[0] === 'wss://down') throw new Error('unreachable');
      return [event('e4')];
    });
    expect((await fetchNavcomEvents({ relays: ['wss://down', 'wss://up'], pool: { querySync } as never, now: () => NOW })).map((e) => e.id)).toEqual(['e4']);
    await expect(fetchNavcomEvents({ relays: ['wss://down'], pool: { querySync } as never, now: () => NOW })).rejects.toThrow(/No relay answered/);
  });
});

describe('fetchNavcomEventsById (MX23)', () => {
  it('asks only the relays it is given, for those ids of kind 1911, and keeps each once, with its relay', async () => {
    const querySync = vi.fn(async () => [event('e6'), event('e6')]);
    const events = await fetchNavcomEventsById({ ids: ['e6', 'e7'], relays: ['wss://read'], pool: { querySync } as never });
    expect(events.map((e) => e.id)).toEqual(['e6']);
    expect(querySync.mock.calls.map((c) => c[0])).toEqual([['wss://read']]);
    expect(querySync.mock.calls[0][1]).toEqual({ ids: ['e6', 'e7'], kinds: [1911] });
    expect(relayOf('e6')).toBe('wss://read');
  });

  it('asks nothing for no ids, and fails when no relay answers', async () => {
    const querySync = vi.fn(async () => { throw new Error('unreachable'); });
    expect(await fetchNavcomEventsById({ ids: [], relays: ['wss://read'], pool: { querySync } as never })).toEqual([]);
    expect(querySync).not.toHaveBeenCalled();
    await expect(fetchNavcomEventsById({ ids: ['e8'], relays: ['wss://read'], pool: { querySync } as never })).rejects.toThrow(/No relay answered/);
  });
});
