/**
 * A case started from a Diplomacy event (decision D-DP, DP7): seeded with its story's articles (the same
 * two countries, kind and place), its countries and its CAMEO code, and saying what machine coding is.
 */
import { describe, expect, it } from 'vitest';
import { caseFromEvent } from '../diplomaticCase';
import type { RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';

const ev = (id: string, over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id, actor1ISO3: 'EGY', actor2ISO3: 'SAU', eventCode: '0871', eventRootCode: '08', goldsteinScale: 9,
  lat: 30.05, lng: 31.25, placeName: 'Cairo, Al Qahirah, Egypt', placePrecision: 'city',
  sourceUrl: `https://www.outlet-${id}.example/story`, dateAdded: '20261013181500', ...over,
});
const names = new Map([['EGY', 'Egypt'], ['SAU', 'Saudi Arabia']]);

describe('a case started from an event', () => {
  const events = [
    ev('a'), ev('b', { actor1ISO3: 'SAU', actor2ISO3: 'EGY', dateAdded: '20261013170000' }),
    ev('c', { eventCode: '042', eventRootCode: '04' }), // another kind: another story
    ev('d', { placeName: 'Riyadh, Saudi Arabia', lat: 24.69, lng: 46.72 }), // another place: another story
  ];
  const input = caseFromEvent(events[0], events, names);

  it('is named for the two countries and what CAMEO calls the event', () => {
    expect(input.title).toBe('Egypt and Saudi Arabia: Declare truce, ceasefire');
  });

  it('rests on its story\'s articles, each with when it was reported', () => {
    expect(input.sources).toEqual([
      { url: 'https://www.outlet-a.example/story', reportedAt: '2026-10-13T18:15:00.000Z' },
      { url: 'https://www.outlet-b.example/story', reportedAt: '2026-10-13T17:00:00.000Z' },
    ]);
  });

  it('says where and when, its Goldstein score, and what machine coding is', () => {
    expect(input.description).toBe('GDELT coded Egypt and Saudi Arabia as CAMEO 0871, “Declare truce, ceasefire”, at Cairo, Al Qahirah, Egypt,'
      + ' first reported 13 Oct 2026 17:00Z. Goldstein 9 scores the type of event. Machine-coded from the news: read the articles before relying on it.');
  });

  it('is tagged with Diplomacy, its CAMEO code and its countries', () => {
    expect(input.tags).toEqual(['diplomacy', 'cameo-0871', 'egy', 'sau']);
  });
});
