/**
 * One event per article (decision D-DP, DP1). GDELT codes the news by machine, and one article can
 * be many rows: on 2026-10-13, 12,074 cooperative rows came from 2,751 articles, one of them 146
 * rows. Rows sharing an article, the same two countries and the same CAMEO code count once.
 */
import { describe, expect, it } from 'vitest';
import { oneEventPerArticle } from '../gdeltArticles';
import type { RealGdeltEvent } from '../gdeltEventExport';

const row = (id: string, over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1.9,
  lat: 55.75, lng: 37.62, sourceUrl: 'https://example.org/a', dateAdded: '20261012100000', ...over,
});

describe('one event per article', () => {
  it('counts rows of one article, one pair and one code once, saying how many rows it stood for', () => {
    const out = oneEventPerArticle([row('1'), row('2'), row('3', { actor1ISO3: 'UKR', actor2ISO3: 'RUS' })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: '1', rows: 3 });
  });

  it('keeps apart another code, another pair, or another article', () => {
    const out = oneEventPerArticle([
      row('1'), row('2', { eventCode: '043' }), row('3', { actor2ISO3: 'USA' }), row('4', { sourceUrl: 'https://example.org/b' }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['1', '2', '3', '4']);
    expect(out.every((e) => e.rows === 1)).toBe(true);
  });

  it('keeps the earliest row as the event, by when GDELT added it', () => {
    const out = oneEventPerArticle([row('late', { dateAdded: '20261012120000' }), row('early', { dateAdded: '20261012090000' })]);
    expect(out[0].id).toBe('early');
  });

  it('keeps the widest reporting GDELT counted among the rows', () => {
    const out = oneEventPerArticle([row('1', { sources: 1, articles: 2 }), row('2', { sources: 4, articles: 9 })]);
    expect(out[0]).toMatchObject({ sources: 4, articles: 9 });
  });
});
