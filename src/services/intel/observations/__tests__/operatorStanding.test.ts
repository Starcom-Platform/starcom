/**
 * An operator's Intel standing as NavCom derives it (D-MX: MX8, MX25, MX26):
 * two counts, never a ratio. Refined means cited in a report or package that
 * another key signed; the operator's own citation, and a forged one, refine
 * nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIntelStanding, type StandingSources } from '../operatorStanding';

const OPERATOR = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const obs = (n: number) => String(n).padStart(64, '0');
const observation = (id: string) => ({ id, kind: 1911, pubkey: OPERATOR, created_at: 1, tags: [], content: '{}', sig: 's' });
const citing = (id: string, pubkey: string, cites: string[], kind = 1) => ({
  id, kind, pubkey, created_at: 2, content: '', sig: 's',
  tags: cites.map((c) => ['e', c, 'wss://relay.example', 'cites']),
});

/** Relays answering by filter: the operator's observations by author, citing events by #e. */
const sources = (held: { observations: unknown[]; citing: unknown[] }, over: Partial<StandingSources> = {}): StandingSources & { asked: unknown[] } => {
  const asked: unknown[] = [];
  return {
    asked,
    relays: ['wss://read'],
    pool: {
      querySync: vi.fn(async (_relays: string[], filter: Record<string, unknown>) => {
        asked.push(filter);
        if (Array.isArray(filter.authors)) return held.observations;
        const wanted = new Set(filter['#e'] as string[]);
        return (held.citing as Array<{ tags: string[][] }>).filter((e) => e.tags.some((t) => wanted.has(t[1])));
      }),
    } as never,
    observationIds: (events) => events.map((e) => e.id),
    verify: () => true,
    ...over,
  };
};

describe('readIntelStanding', () => {
  it('counts what the operator submitted, and how much of it another key has cited', async () => {
    const s = sources({
      observations: [observation(obs(1)), observation(obs(2)), observation(obs(3))],
      citing: [citing('c1', OTHER, [obs(1)]), citing('c2', OTHER, [obs(1), obs(3)], 30079)],
    });
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 3, refined: 2 });
    expect(s.asked[0]).toEqual({ kinds: [1911], authors: [OPERATOR], limit: 500 });
    expect(s.asked[1]).toEqual({ kinds: [1, 30023, 30079], '#e': [obs(1), obs(2), obs(3)] });
  });

  it('counts no citation of their own, nor one whose signature fails', async () => {
    const s = sources(
      { observations: [observation(obs(4)), observation(obs(5))], citing: [citing('own', OPERATOR, [obs(4)]), citing('forged', OTHER, [obs(5)])] },
      { verify: (e) => e.id !== 'forged' },
    );
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 2, refined: 0 });
  });

  it('counts only what Starcom reads as an observation, and only citations of those', async () => {
    const s = sources(
      { observations: [observation(obs(6)), observation(obs(7))], citing: [citing('c3', OTHER, [obs(7), obs(8)])] },
      { observationIds: () => [obs(7)] },
    );
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 1, refined: 1 });
  });

  it('counts an observation two relays both hold once', async () => {
    const s = sources({ observations: [observation(obs(9))], citing: [citing('c4', OTHER, [obs(9)])] }, { relays: ['wss://one', 'wss://two'] });
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 1, refined: 1 });
  });

  it('asks about at most a hundred observations at once', async () => {
    const many = Array.from({ length: 250 }, (_, i) => observation(obs(100 + i)));
    const s = sources({ observations: many, citing: [] });
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 250, refined: 0 });
    expect(s.asked.slice(1).map((f) => (f as { '#e': string[] })['#e'].length)).toEqual([100, 100, 50]);
  });

  it('asks nothing more of an operator with no observations, and fails when no relay answers', async () => {
    const s = sources({ observations: [], citing: [] });
    expect(await readIntelStanding(OPERATOR, s)).toEqual({ submitted: 0, refined: 0 });
    expect(s.asked).toHaveLength(1);
    const down = sources({ observations: [], citing: [] }, { pool: { querySync: async () => { throw new Error('down'); } } as never });
    await expect(readIntelStanding(OPERATOR, down)).rejects.toThrow(/No relay answered/);
  });
});
