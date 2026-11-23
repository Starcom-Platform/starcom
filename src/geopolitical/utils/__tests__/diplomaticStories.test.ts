/**
 * Stories, and how many outlets told each (decision D-DP, DP9). GDELT makes a new event for each
 * article and keeps no count that grows as others report it: of 388 events, 4 were mentioned again
 * under the same id. So corroboration is found by gathering events into stories, the same two
 * countries, kind of event and place, and counting the distinct outlets that told it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatherStories, outletOf, storyOutlets, placeKeyOf } from '../diplomaticStories';
import { parseGdeltExport, type RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';
import { oneEventPerArticle } from '../../../services/geopolitical/gdeltArticles';
import { categorizeGdeltEvent } from '../../theme/diplomaticEventTheme';

const ev = (id: string, over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1.9,
  lat: 55.7522, lng: 37.6156, placeName: 'Moscow, Moskva, Russia', placePrecision: 'city',
  sourceUrl: `https://www.outlet-${id}.example/story`, dateAdded: '20261012100000', ...over,
});

describe('an outlet', () => {
  it('is the site an article is on, without www., m. or amp.', () => {
    expect(outletOf('https://www.reuters.com/world/x')).toBe('reuters.com');
    expect(outletOf('https://m.dw.com/en/y')).toBe('dw.com');
    expect(outletOf('https://amp.theguardian.com/z')).toBe('theguardian.com');
    expect(outletOf('https://news.example.co.uk/a')).toBe('news.example.co.uk');
  });

  it('is a citation as written, where GDELT has one instead of a link', () => {
    expect(outletOf('BBC Monitoring')).toBe('BBC Monitoring');
  });

  it('is unknown for nothing', () => {
    expect(outletOf('')).toBeNull();
    expect(outletOf('   ')).toBeNull();
  });
});

describe('a place', () => {
  it('is where GDELT put it, however the name is spelled', () => {
    expect(placeKeyOf(ev('1'))).toBe(placeKeyOf(ev('2', { placeName: 'Moskva, Russia' })));
  });

  it('is another place at another point, or at a country rather than a city', () => {
    expect(placeKeyOf(ev('1'))).not.toBe(placeKeyOf(ev('2', { lat: 50.45, lng: 30.52 })));
    expect(placeKeyOf(ev('1'))).not.toBe(placeKeyOf(ev('2', { placePrecision: 'country' })));
  });
});

describe('stories', () => {
  it('gather one pair, either way round, one kind of event and one place', () => {
    const stories = gatherStories([ev('a'), ev('b', { actor1ISO3: 'UKR', actor2ISO3: 'RUS' }), ev('c', { eventCode: '046' })]);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ pair: ['RUS', 'UKR'], category: 'consult', place: 'Moscow, Moskva, Russia' });
    expect(stories[0].events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('keep apart another kind of event, another pair, another place', () => {
    const stories = gatherStories([
      ev('a'), ev('b', { eventCode: '057', eventRootCode: '05' }), ev('c', { actor2ISO3: 'USA' }), ev('d', { lat: 50.45, lng: 30.52 }),
    ]);
    expect(stories).toHaveLength(4);
  });

  it('count each outlet once, however many of its articles told it', () => {
    const [story] = gatherStories([
      ev('a', { sourceUrl: 'https://www.tass.ru/1' }), ev('b', { sourceUrl: 'https://tass.ru/2' }), ev('c', { sourceUrl: 'https://kyivindependent.com/3' }),
    ]);
    expect(story.outlets).toEqual(['kyivindependent.com', 'tass.ru']);
  });

  it('give every event its story\'s outlets', () => {
    const outlets = storyOutlets([ev('a'), ev('b'), ev('c', { eventCode: '057', eventRootCode: '05' })]);
    expect(outlets.get('a')).toBe(2);
    expect(outlets.get('b')).toBe(2);
    expect(outlets.get('c')).toBe(1);
  });

  it('count an article with no outlet named as one outlet, never none', () => {
    expect(storyOutlets([ev('a', { sourceUrl: '' })]).get('a')).toBe(1);
  });

  it('leave out an event outside the cooperative roots', () => {
    expect(gatherStories([ev('a', { eventCode: '145', eventRootCode: '14' })])).toEqual([]);
  });
});

describe('stories in GDELT\'s own rows', () => {
  const real = oneEventPerArticle(parseGdeltExport(
    fs.readFileSync(path.join(__dirname, '../../../services/geopolitical/__tests__/fixtures/gdelt-20260911170000.export.sample.csv'), 'utf8'),
  )).filter((e) => categorizeGdeltEvent(e.eventRootCode, e.eventCode) !== null);

  it('hold every cooperative event exactly once', () => {
    const stories = gatherStories(real);
    const held = stories.flatMap((s) => s.events.map((e) => e.id)).sort();
    expect(held).toEqual(real.map((e) => e.id).sort());
    for (const story of stories) expect(story.outlets.length).toBeLessThanOrEqual(story.events.length);
  });
});
