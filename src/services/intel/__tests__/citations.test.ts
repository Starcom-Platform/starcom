/**
 * What a report rests on, and how it goes out (D-MX: MX3, MX19, MX22, MX24).
 */
import { describe, it, expect } from 'vitest';
import { citationsOf, packageCitations, citeTags, citationsFromTags } from '../citations';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const ONE = 'wss://one.example';
const TWO = 'wss://two.example';

describe('citations', () => {
  it('reads an event id, and its relay only when that is a relay', () => {
    const read = (value: unknown) => citationsOf([{ cites: [value] }]);
    expect(read({ eventId: A, relay: ONE })).toStrictEqual([{ eventId: A, relay: ONE }]);
    expect(read({ eventId: A, relay: 'https://one.example' })).toStrictEqual([{ eventId: A }]);
    expect(read({ eventId: 'A'.repeat(64) })).toEqual([]);
    expect(read({ eventId: A.slice(1) })).toEqual([]);
    expect(read('a string')).toEqual([]);
    expect(read(null)).toEqual([]);
  });

  it('gathers each event once, in the order first cited, with the first relay given for it', () => {
    expect(citationsOf([
      { cites: [{ eventId: B }, { eventId: A, relay: ONE }] },
      { cites: [{ eventId: B, relay: TWO }, { eventId: A, relay: TWO }, { eventId: 'not one' }] },
      { cites: 'not a list' },
      {},
    ])).toStrictEqual([{ eventId: B, relay: TWO }, { eventId: A, relay: ONE }]);
  });

  it('tags each as rev 11 writes it, the relay empty when none is known', () => {
    expect(citeTags([{ eventId: A, relay: ONE }, { eventId: B }, { eventId: A, relay: TWO }]))
      .toStrictEqual([['e', A, ONE, 'cites'], ['e', B, '', 'cites']]);
  });
});

describe("a received event's citations (MX23)", () => {
  it('reads each cites tag back, as it was written', () => {
    expect(citationsFromTags(citeTags([{ eventId: A, relay: ONE }, { eventId: B }]))).toStrictEqual([{ eventId: A, relay: ONE }, { eventId: B }]);
  });

  it('reads only e tags marked cites, and only what is a citation in them', () => {
    expect(citationsFromTags([
      ['e', A, ONE, 'reply'],
      ['e', B, ONE],
      ['p', C, ONE, 'cites'],
      ['e', 'not an id', ONE, 'cites'],
      ['e', C, 'https://not.a.relay', 'cites'],
      'not a tag',
    ])).toStrictEqual([{ eventId: C }]);
  });

  it('reads nothing from what is not a list of tags', () => {
    expect(citationsFromTags(undefined)).toEqual([]);
    expect(citationsFromTags({ e: A })).toEqual([]);
  });
});

describe('what a package cites of its linked reports (MX24)', () => {
  const reports = [
    { visibility: 'public' as const, cites: [{ eventId: A, relay: ONE }] },
    { visibility: 'limited' as const, cites: [{ eventId: B }] },
    { visibility: 'private' as const, cites: [{ eventId: C }] },
    { cites: [{ eventId: C, relay: TWO }] },
    { visibility: 'private' as const },
  ];

  it('a Public package cites only what Public reports rest on, and says how many were held back', () => {
    expect(packageCitations(reports, 'public')).toStrictEqual({ cites: [{ eventId: A, relay: ONE }], heldBack: 3 });
  });

  it('a Limited package cites what Public and Limited reports rest on', () => {
    expect(packageCitations(reports, 'limited')).toStrictEqual({ cites: [{ eventId: A, relay: ONE }, { eventId: B }], heldBack: 2 });
  });

  it('a report nobody has decided goes nowhere, its citations with it, and a package going nowhere cites nothing', () => {
    expect(packageCitations([{ cites: [{ eventId: C }] }], 'private')).toStrictEqual({ cites: [], heldBack: 1 });
    expect(packageCitations([{ visibility: 'public', cites: [{ eventId: A }] }], undefined)).toStrictEqual({ cites: [], heldBack: 1 });
  });
});
