/**
 * Hero Watch's relief by country (decision D-HW, step 4; HW4): Red Cross and Red Crescent operations
 * from IFRC GO and OCHA's count of organisations at work, gathered per country from the live notes of
 * 10 October 2026; the pill a country carries; and what its hover says, naming no organisation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { readHeroWatchNote, type HeroWatchItem, type ReliefOperation, type ReliefPresence } from '../heroWatch';
import { describeRelief, reliefByCountry, reliefPill, type ReliefCountry } from '../heroWatchRelief';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/hero-watch/hero_watch_live_2026-10-10.json'), 'utf8'));
const read = (prefix: string) => readHeroWatchNote(LIVE.find((e) => e.tags.some((t) => t[0] === 'd' && t[1].startsWith(prefix)))!) as HeroWatchItem;
const appeal = () => read('hero-watch-appeal-') as ReliefOperation;
const presence = () => read('hero-watch-presence-') as ReliefPresence;
const COUNTRIES: Record<string, string> = { ET: 'Ethiopia', SD: 'Sudan' };
const countryOf = (code: string) => (code.length === 2 && COUNTRIES[code.toUpperCase()] ? { name: COUNTRIES[code.toUpperCase()] } : null);

describe('relief by country', () => {
  it('gathers an operation and a count of organisations under their country, and nothing else', () => {
    const { countries, unplaced } = reliefByCountry([appeal(), presence(), read('hero-watch-station-'), read('hero-watch-2026-w41')], countryOf);
    expect(unplaced).toEqual([]);
    expect(countries).toHaveLength(1);
    expect(countries[0]).toMatchObject({ code: 'ET', name: 'Ethiopia' });
    expect(countries[0].operations.map((o) => o.amountChf)).toEqual([749972]);
    expect(countries[0].presence?.organisations).toBe(144);
  });

  it('claims no more than the note: a subdivision is never widened to its country, and is counted as not drawn', () => {
    const { countries, unplaced } = reliefByCountry([{ ...appeal(), jurisdiction: 'et-aa' }, { ...presence(), jurisdiction: undefined }, { ...appeal(), id: 'x', jurisdiction: 'zz' }], countryOf);
    expect(countries).toEqual([]);
    expect(unplaced).toHaveLength(3);
  });

  it('keeps the newest count of organisations where a country has two, and every operation', () => {
    const older = { ...presence(), id: 'older', createdAt: presence().createdAt - 86_400, organisations: 90 };
    const second = { ...appeal(), id: 'second', amountChf: 120_000 };
    const [ethiopia] = reliefByCountry([older, presence(), appeal(), second], countryOf).countries;
    expect(ethiopia.presence?.organisations).toBe(144);
    expect(ethiopia.operations).toHaveLength(2);
  });
});

describe('a country\'s pill', () => {
  const country = (ops: number, orgs: number | null): ReliefCountry => ({
    code: 'ET', name: 'Ethiopia',
    operations: Array.from({ length: ops }, (_, i) => ({ ...appeal(), id: `op${i}` })),
    presence: orgs === null ? null : { ...presence(), organisations: orgs },
  });

  it('names the country, and counts its operations and organisations, in words short enough for a globe', () => {
    expect(reliefPill(country(1, 144))).toBe('Ethiopia · 1 op · 144 orgs');
    expect(reliefPill(country(3, 1))).toBe('Ethiopia · 3 ops · 1 org');
    expect(reliefPill(country(0, 144))).toBe('Ethiopia · 144 orgs');
    expect(reliefPill(country(2, null))).toBe('Ethiopia · 2 ops');
  });
});

describe('what a country\'s hover says', () => {
  it('names the operation, its sum, its reach and its end, and counts organisations without naming one', () => {
    const [ethiopia] = reliefByCountry([appeal(), presence()], countryOf).countries;
    expect(describeRelief(ethiopia)).toBe(
      'Ethiopia: 1 Red Cross and Red Crescent operation in IFRC GO: Ethiopian Red Cross Society, Ethiopia Drought Response '
      + '(DREF, CHF 749,972, to reach 50,000 people, until 31 Mar 2027). '
      + '144 organisations at work by OCHA\'s count, January to March 2026, 73 of them national NGOs.',
    );
  });

  it('names the last day an operation covers: an end at midnight is the day before\'s close', () => {
    const ending = (end: number): ReliefCountry => ({ code: 'ET', name: 'Ethiopia', presence: null, operations: [{ ...appeal(), end }] });
    expect(describeRelief(ending(Date.UTC(2027, 3, 1) / 1000))).toContain('until 31 Mar 2027)');
    expect(describeRelief(ending(Date.UTC(2027, 3, 1, 12) / 1000))).toContain('until 1 Apr 2027)');
  });

  it('lists the two largest operations and counts the rest', () => {
    const op = (id: string, amountChf: number, title: string) => ({ ...appeal(), id, amountChf, title });
    const sudan: ReliefCountry = {
      code: 'SD', name: 'Sudan', presence: null,
      operations: [op('a', 100, 'Sudanese Red Crescent: Floods'), op('b', 900, 'Sudanese Red Crescent: Cholera'), op('c', 500, 'Sudanese Red Crescent: Displacement')],
    };
    const said = describeRelief(sudan);
    expect(said).toMatch(/^Sudan: 3 Red Cross and Red Crescent operations in IFRC GO: Sudanese Red Crescent, Cholera \(DREF, CHF 900,/);
    expect(said).toContain('; Sudanese Red Crescent, Displacement (DREF, CHF 500,');
    expect(said).toContain('; and 1 more.');
    expect(said).not.toContain('Floods');
  });

  it('says only what a note carries: no sum, reach or end when it has none, and a period across two years', () => {
    const bare: ReliefCountry = {
      code: 'ET', name: 'Ethiopia',
      operations: [{ ...appeal(), amountChf: undefined, peopleToReach: undefined, end: undefined, appealType: undefined }],
      presence: { ...presence(), nationalNgos: undefined, periodStart: '2025-12-01', periodEnd: '2026-02-28' },
    };
    expect(describeRelief(bare)).toBe(
      'Ethiopia: 1 Red Cross and Red Crescent operation in IFRC GO: Ethiopian Red Cross Society, Ethiopia Drought Response. '
      + '144 organisations at work by OCHA\'s count, December 2025 to February 2026.',
    );
  });
});
