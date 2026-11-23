/**
 * Finding what a report or package cites (D-MX, MX23): what was already read,
 * without asking; the rest, asked once of the relays this node reads; null for
 * what none holds. Observations are built by the adapter, with invented
 * vocabulary members.
 */
import { describe, it, expect, vi } from 'vitest';
import { createNavcomAdapter, NAVCOM_OBSERVATION_KIND, type NavcomRawEvent } from '../adapters/navcomAdapter';
import { lookUpCited } from '../citedObservations';

const SEEN = 1788264000;
const raw = (id: string): NavcomRawEvent => ({
  id, kind: NAVCOM_OBSERVATION_KIND, pubkey: 'a'.repeat(64), created_at: SEEN + 60, sig: 'f'.repeat(128),
  tags: [['g', 'st-louis'], ['d', 'anchor-one']],
  content: JSON.stringify({ anchor: 'anchor-one', observed_at: SEEN, tags: ['alpha_one'], method: 'saw', callsign: 'Kestrel', precision: 'area', area: '9yzg' }),
});
const observe = (...events: NavcomRawEvent[]) =>
  createNavcomAdapter({ verifySignature: () => true, vocabulary: () => null }).toObservations(events).observations;
const id = (c: string) => c.repeat(64);

describe('lookUpCited', () => {
  it('finds what was already read without asking anyone', async () => {
    const read = vi.fn();
    const rows = await lookUpCited([id('1')], { known: () => observe(raw(id('1'))), read });
    expect(rows.get(id('1'))?.seen).toEqual(['alpha_one']);
    expect(read).not.toHaveBeenCalled();
  });

  it('asks the relays it reads for only what was not read, and has nothing for what none holds', async () => {
    const read = vi.fn(async () => observe(raw(id('3'))));
    const rows = await lookUpCited([id('2'), id('3'), id('4')], { known: () => observe(raw(id('2'))), read });
    expect(read).toHaveBeenCalledWith([id('3'), id('4')]);
    expect(rows.get(id('3'))?.eventId).toBe(id('3'));
    expect(rows.get(id('4'))).toBeNull();
  });

  it('keeps what it found, and asks again for what it did not, since a relay may have it by then', async () => {
    const first = vi.fn(async () => observe(raw(id('5'))));
    await lookUpCited([id('5'), id('6')], { known: () => [], read: first });
    const again = vi.fn(async () => []);
    const rows = await lookUpCited([id('5'), id('6')], { known: () => [], read: again });
    expect(again).toHaveBeenCalledWith([id('6')]);
    expect(rows.get(id('5'))?.eventId).toBe(id('5'));
  });

  it('rejects when no relay answers', async () => {
    await expect(lookUpCited([id('7')], { known: () => [], read: async () => { throw new Error('No relay answered for kind 1911'); } })).rejects.toThrow(/No relay answered/);
  });
});
