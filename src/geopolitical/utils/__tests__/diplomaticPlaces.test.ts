/**
 * Places (decision D-DP, DP2, DP3, DP14): one per place GDELT states, a city, a state or a country
 * point, gathering every cooperative event GDELT put there. Diplomacy drew one mark per actor
 * country, at its centre, and never used the event's own place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatherPlaces } from '../diplomaticPlaces';
import { parseGdeltExport, type RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';
import { oneEventPerArticle } from '../../../services/geopolitical/gdeltArticles';
import { categorizeGdeltEvent } from '../../theme/diplomaticEventTheme';

const ev = (id: string, over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1.9,
  lat: 55.7522, lng: 37.6156, placeName: 'Moscow, Moskva, Russia', placePrecision: 'city',
  sourceUrl: `https://outlet-${id}.example/story`, dateAdded: '20261012100000', ...over,
});

describe('a place', () => {
  it('gathers the events GDELT put at one point, however it spelled the name', () => {
    const places = gatherPlaces([ev('a'), ev('b', { placeName: 'Moskva, Russia' }), ev('c', { lat: 50.45, lng: 30.52, placeName: 'Kyiv' })]);
    expect(places).toHaveLength(2);
    const moscow = places.find((p) => p.events.length === 2)!;
    expect(moscow).toMatchObject({ lat: 55.7522, lng: 37.6156, name: 'Moscow, Moskva, Russia', precision: 'city' });
  });

  it('is named as most of its events spell it', () => {
    const [place] = gatherPlaces([ev('a', { placeName: 'Moskva, Russia' }), ev('b'), ev('c')]);
    expect(place.name).toBe('Moscow, Moskva, Russia');
  });

  it('counts its events, its stories and the distinct outlets that told them', () => {
    const [place] = gatherPlaces([
      ev('a', { sourceUrl: 'https://tass.ru/1' }), ev('b', { sourceUrl: 'https://www.tass.ru/2' }),
      ev('c', { actor2ISO3: 'USA', sourceUrl: 'https://reuters.com/3' }),
    ]);
    expect(place).toMatchObject({ stories: 2, outlets: 2 });
    expect(place.events).toHaveLength(3);
  });

  it('says the kind of event most of its events are, and how many of each', () => {
    const [place] = gatherPlaces([ev('a'), ev('b'), ev('c', { eventCode: '073', eventRootCode: '07' })]);
    expect(place).toMatchObject({ dominantCategory: 'consult', dominantCount: 2 });
    expect(place.byCategory).toMatchObject({ consult: 2, aid: 1, agreement: 0 });
  });

  it('says when GDELT placed it only at a country', () => {
    const [place] = gatherPlaces([ev('a', { placePrecision: 'country', placeName: 'Russia', lat: 60, lng: 100 })]);
    expect(place.countryOnly).toBe(true);
    expect(gatherPlaces([ev('b')])[0].countryOnly).toBe(false);
  });

  it('leaves out an event outside the cooperative roots', () => {
    expect(gatherPlaces([ev('a', { eventCode: '145', eventRootCode: '14' })])).toEqual([]);
  });

  it('comes first when more outlets told its stories', () => {
    const places = gatherPlaces([
      ev('a', { lat: 1, lng: 1 }),
      ev('b', { lat: 2, lng: 2, sourceUrl: 'https://x.example/1' }), ev('c', { lat: 2, lng: 2, sourceUrl: 'https://y.example/2' }),
    ]);
    expect(places.map((p) => p.lat)).toEqual([2, 1]);
  });
});

describe('places in GDELT\'s own rows', () => {
  const real = oneEventPerArticle(parseGdeltExport(
    fs.readFileSync(path.join(__dirname, '../../../services/geopolitical/__tests__/fixtures/gdelt-20260911170000.export.sample.csv'), 'utf8'),
  )).filter((e) => categorizeGdeltEvent(e.eventRootCode, e.eventCode) !== null);

  it('hold every cooperative event exactly once', () => {
    const held = gatherPlaces(real).flatMap((p) => p.events.map((e) => e.id)).sort();
    expect(held).toEqual(real.map((e) => e.id).sort());
  });
});
