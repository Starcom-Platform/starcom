/**
 * The amounts programmes publish, through Mecha Jono's notes (critique C12, CR2): a reward programme's counts by
 * "up to" amount, never a name; Grants.gov's ceilings and floors by opportunity number. Only Mecha Jono's keys;
 * the newest note at an address stands; a retraction withdraws it.
 */
import { describe, expect, it } from 'vitest';
import type { Event } from 'nostr-tools';
import { amountsFrom, readAwardAmountsNote, readRewardAmountsNote, readAmountNotes } from '../amountNotes';

const MJ = 'a'.repeat(64);
const note = (tags: string[][], over: Partial<Event> = {}): Event => ({
  id: 'e', pubkey: MJ, created_at: 1_792_000_000, kind: 30023, content: 'For people', sig: '', tags, ...over,
} as Event);
const fbi = (over: Partial<Event> = {}, extra: string[][] = []) => note([
  ['d', 'reward-amounts-fbi'], ['t', 'reward_amounts'], ['programme', 'fbi'], ['notices', '1264'], ['stated', '312'], ['as_of', '2026-10-16'],
  // In no order, as a publisher may write them.
  ['up_to', '25000', '40'], ['up_to', '5000000', '1'], ['up_to', '10000', '182'], ...extra,
], over);
const awards = (over: Partial<Event> = {}) => note([
  ['d', 'award-amounts-grants-gov'], ['t', 'award_amounts'], ['as_of', '2026-10-16'],
  ['award', 'AC-08-20-2026', '500000', '50000'], ['award', 'NSF-26-501', '', '10000'], ['award', 'X-1', '', ''],
], over);

describe('readRewardAmountsNote', () => {
  it("reads a programme's counts by amount, most stated first", () => {
    expect(readRewardAmountsNote(fbi(), [MJ])).toEqual({
      programme: 'fbi', notices: 1264, stated: 312, asOf: '2026-10-16',
      upTo: [{ usd: 10_000, notices: 182 }, { usd: 25_000, notices: 40 }, { usd: 5_000_000, notices: 1 }],
    });
  });

  it('reads only its publishers, and refuses a note missing what it needs', () => {
    expect(readRewardAmountsNote(fbi({ pubkey: 'b'.repeat(64) }), [MJ])).toBeNull();
    expect(readRewardAmountsNote(note([['d', 'x'], ['t', 'reward_amounts'], ['programme', 'fbi'], ['notices', '1'], ['stated', '1'], ['as_of', '2026-10-16']]), [MJ])).toBeNull();
    expect(readRewardAmountsNote(fbi({}, [['t', 'retracted']]), [MJ])).toBe('retracted');
  });
});

describe('readAwardAmountsNote', () => {
  it('reads each opportunity\'s ceiling and floor, leaving out one that states neither', () => {
    const read = readAwardAmountsNote(awards(), [MJ]);
    expect(read).not.toBe('retracted');
    expect(read && read !== 'retracted' ? [...read.awards] : null).toEqual([
      ['AC-08-20-2026', { ceiling: 500_000, floor: 50_000 }],
      ['NSF-26-501', { floor: 10_000 }],
    ]);
  });
});

describe('amountsFrom', () => {
  it('lets the newest note at an address stand, and a retraction withdraw it', () => {
    const older = fbi({ created_at: 1 });
    const newer = fbi({ created_at: 2 }, [['t', 'retracted']]);
    expect(amountsFrom([older, newer], [MJ]).rewards.size).toBe(0);
    expect(amountsFrom([older, awards()], [MJ]).rewards.get('fbi')?.stated).toBe(312);
    expect(amountsFrom([awards()], [MJ]).awardsAsOf).toBe('2026-10-16');
  });
});

describe('readAmountNotes', () => {
  it("asks The Record for Mecha Jono's two kinds of note, and is no amounts when none arrives", async () => {
    const asked: unknown[] = [];
    const pool = {
      subscribeMany: (_relays: string[], filter: unknown, params: { oneose?: () => void }) => {
        asked.push(filter);
        queueMicrotask(() => params.oneose?.());
        return { close: () => {} };
      },
    };
    const notes = await readAmountNotes({ pool: pool as never, relays: ['wss://record.test'], waitMs: 200 });
    expect(asked[0]).toMatchObject({ kinds: [30023], '#t': ['reward_amounts', 'award_amounts'] });
    expect(notes.rewards.size).toBe(0);
    expect(notes.awards.size).toBe(0);
  });
});
