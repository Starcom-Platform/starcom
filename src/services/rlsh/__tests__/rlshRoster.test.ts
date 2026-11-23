/**
 * The RLSH list (D-RF, RF6): one card to a key, the newest standing; a deletion withdraws every version up to it; a
 * card no longer labelled for Starcom, or refused, is not shown in place of an older one; listed by alias.
 */
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { RlshCardStore, RLSH_FILTERS } from '../rlshRoster';
import { RLSH_LABEL } from '../rlshCard';

const pk = (c: string) => c.repeat(64);
let n = 0;
const card = (pubkey: string, callsign: string, at: number, tags: string[][] = [['l', RLSH_LABEL]]): Event => ({
  id: `id${++n}`, sig: '', kind: 10911, pubkey, created_at: at, tags, content: JSON.stringify({ callsign, region: 'earth' }),
});
const deletion = (pubkey: string, at: number): Event => ({
  id: `id${++n}`, sig: '', kind: 5, pubkey, created_at: at, tags: [['a', `10911:${pubkey}:`], ['k', '10911']], content: '',
});
const names = (s: RlshCardStore) => s.list().map((c) => c.callsign);

describe('RlshCardStore', () => {
  it('lists cards by alias, the newest card of each key standing', () => {
    const s = new RlshCardStore();
    s.accept(card(pk('b'), 'zephyr', 10));
    s.accept(card(pk('a'), 'Atlas Watch', 10));
    s.accept(card(pk('b'), 'Beacon', 20));
    s.accept(card(pk('b'), 'Older', 15));
    expect(names(s)).toEqual(['Atlas Watch', 'Beacon']);
  });

  it('withdraws a card its own key deleted, until a newer card', () => {
    const s = new RlshCardStore();
    s.accept(card(pk('a'), 'Atlas Watch', 10));
    expect(s.accept(deletion(pk('a'), 12))).toBe(true);
    expect(names(s)).toEqual([]);
    s.accept(card(pk('a'), 'Atlas Again', 20));
    expect(names(s)).toEqual(['Atlas Again']);
  });

  it('withdraws a card whose deletion arrives first', () => {
    const s = new RlshCardStore();
    s.accept(deletion(pk('a'), 12));
    s.accept(card(pk('a'), 'Atlas Watch', 10));
    expect(names(s)).toEqual([]);
  });

  it('ignores a deletion of another key\'s card', () => {
    const s = new RlshCardStore();
    s.accept(card(pk('a'), 'Atlas Watch', 10));
    const forged = { ...deletion(pk('b'), 12), tags: [['a', `10911:${pk('a')}:`]] };
    expect(s.accept(forged)).toBe(false);
    expect(names(s)).toEqual(['Atlas Watch']);
  });

  it('shows no older card in place of a newer one no longer labelled, or refused', () => {
    const s = new RlshCardStore();
    s.accept(card(pk('a'), 'Atlas Watch', 10));
    s.accept(card(pk('a'), 'Atlas Watch', 20, []));
    expect(names(s)).toEqual([]);
    s.accept(card(pk('c'), 'Cove', 10));
    s.accept({ ...card(pk('c'), 'Cove', 20), content: JSON.stringify({ callsign: 'Cove', team: 'Blue' }) });
    expect(names(s)).toEqual([]);
  });

  it('asks the relays for Starcom\'s cards and for deletions of cards', () => {
    expect(RLSH_FILTERS).toEqual([{ kinds: [10911], '#l': [RLSH_LABEL] }, { kinds: [5], '#k': ['10911'] }]);
  });
});
