/**
 * Counting events by country and by pair. The layers drew one sphere per (event,
 * country) at a country's single centroid — 4,170 and 5,936 of them over 125 and 130
 * countries, stacked on each other, so a country with one event looked exactly like a
 * country with ninety. These are the counts that replace the stack.
 */
import { describe, it, expect } from 'vitest';
import { tallyEventsByCountry, tallyEventsByPair, bucketPairsByCount } from '../eventAggregation';

interface Event { id: string; a: string | null; b: string | null; kind?: string; goldstein?: number | null }

const read = {
  actors: (e: Event) => [e.a, e.b],
  category: (e: Event) => e.kind ?? null,
  goldstein: (e: Event) => e.goldstein,
};

const event = (id: string, a: string | null, b: string | null, kind?: string, goldstein?: number | null): Event =>
  ({ id, a, b, kind, goldstein });

describe('tallyEventsByCountry', () => {
  it('counts every event that names a country, whichever side it is on', () => {
    const tallies = tallyEventsByCountry([
      event('1', 'USA', 'CHN'), event('2', 'CHN', 'USA'), event('3', 'CHN', 'RUS'),
    ], read);
    expect(tallies.map((t) => [t.countryCode, t.count])).toEqual([['CHN', 3], ['USA', 2], ['RUS', 1]]);
  });

  it('counts an event naming one country twice as one event about it', () => {
    // GDELT does emit these: both actors resolved to the same country.
    const [tally] = tallyEventsByCountry([event('1', 'FRA', 'FRA')], read);
    expect(tally).toMatchObject({ countryCode: 'FRA', count: 1 });
  });

  it('ignores an actor it has no country for, without losing the event', () => {
    const tallies = tallyEventsByCountry([event('1', 'USA', null), event('2', null, null)], read);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]).toMatchObject({ countryCode: 'USA', count: 1 });
  });

  it('names the category most of a country\'s events fall in, and how many that is', () => {
    const [tally] = tallyEventsByCountry([
      event('1', 'DEU', 'FRA', 'cooperation'), event('2', 'DEU', 'ITA', 'cooperation'), event('3', 'DEU', 'POL', 'conflict'),
    ], read);
    expect(tally).toMatchObject({ countryCode: 'DEU', count: 3, dominantCategory: 'cooperation', dominantCount: 2 });
  });

  it('breaks a category tie the same way every time, so the same events give the same answer', () => {
    const forwards = tallyEventsByCountry([event('1', 'DEU', 'A', 'zeta'), event('2', 'DEU', 'B', 'alpha')], read);
    const backwards = tallyEventsByCountry([event('2', 'DEU', 'B', 'alpha'), event('1', 'DEU', 'A', 'zeta')], read);
    expect(forwards[0].dominantCategory).toBe('alpha');
    expect(backwards[0].dominantCategory).toBe('alpha');
  });

  it('averages Goldstein where events carry it, and says null where none do', () => {
    const [withScores] = tallyEventsByCountry([
      event('1', 'IND', 'PAK', 'conflict', -6), event('2', 'IND', 'NPL', 'cooperation', 4),
    ], read);
    expect(withScores.meanGoldstein).toBeCloseTo(-1, 9);
    const [withNone] = tallyEventsByCountry([event('3', 'BRA', 'ARG', 'cooperation', null)], read);
    expect(withNone.meanGoldstein).toBeNull();
  });

  it('keeps the events themselves, for whatever wants to read them', () => {
    const [tally] = tallyEventsByCountry([event('1', 'USA', 'CHN'), event('2', 'USA', 'RUS')], read);
    expect(tally.events.map((e) => e.id)).toEqual(['1', '2']);
  });
});

describe('tallyEventsByPair', () => {
  it('merges a pair whichever way round the actors came', () => {
    const pairs = tallyEventsByPair([event('1', 'USA', 'CHN'), event('2', 'CHN', 'USA')], read);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: 'CHN', b: 'USA', count: 2 });
  });

  it('leaves out an event with only one country: it is no pair', () => {
    expect(tallyEventsByPair([event('1', 'USA', null), event('2', 'FRA', 'FRA')], read)).toEqual([]);
  });

  it('orders by how many events a pair carries', () => {
    const pairs = tallyEventsByPair([
      event('1', 'A', 'B'), event('2', 'A', 'B'), event('3', 'C', 'D'),
    ], read);
    expect(pairs.map((p) => [p.a, p.b, p.count])).toEqual([['A', 'B', 2], ['C', 'D', 1]]);
  });
});

describe('bucketPairsByCount', () => {
  it('splits on the snapshot\'s real shape — median 4 events a pair — and drops an empty weight', () => {
    const pairs = tallyEventsByPair([
      event('1', 'A', 'B'),
      event('2', 'C', 'D'), event('3', 'C', 'D'), event('4', 'C', 'D'),
    ], read);
    const buckets = bucketPairsByCount(pairs);
    expect(buckets.map((b) => [b.weight, b.pairs.length])).toEqual([['faint', 1], ['plain', 1]]);
  });

  it('puts every pair in exactly one weight', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => ({ a: 'A', b: `B${i}`, count: i + 1, events: [] }));
    const buckets = bucketPairsByCount(pairs);
    expect(buckets.flatMap((b) => b.pairs).length).toBe(pairs.length);
    expect(buckets.find((b) => b.weight === 'faint')!.pairs.map((p) => p.count)).toEqual([1, 2]);
    expect(buckets.find((b) => b.weight === 'plain')!.pairs.map((p) => p.count)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(buckets.find((b) => b.weight === 'bold')!.pairs.map((p) => p.count)).toEqual([10, 11, 12]);
  });
});
