/**
 * A selected country's relations (decision D-DP, DP5, DP16): its counterparts in the span shown, how
 * many cooperative events it shares with each (CAMEO 03–08, this layer's) and how many conflict events
 * (14–20, the same snapshot's), the most reported first.
 */
import { describe, expect, it } from 'vitest';
import { countryRelations } from '../diplomaticRelations';
import type { RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';

const ev = (id: string, a: string, b: string, root: string): RealGdeltEvent => ({
  id, actor1ISO3: a, actor2ISO3: b, eventCode: `${root}0`, eventRootCode: root, goldsteinScale: 0,
  lat: 0, lng: 0, sourceUrl: `https://${id}.example`, dateAdded: '20261013090000',
});

describe('a country\'s relations', () => {
  const cooperation = [ev('1', 'RUS', 'UKR', '04'), ev('2', 'UKR', 'RUS', '04'), ev('3', 'RUS', 'CHN', '05'), ev('4', 'USA', 'CHN', '04')];
  const conflict = [ev('5', 'RUS', 'UKR', '19'), ev('6', 'GBR', 'RUS', '17')];

  it('counts each counterpart\'s cooperation and conflict, either way round, the most reported first', () => {
    expect(countryRelations('RUS', cooperation, conflict)).toEqual([
      { counterpart: 'UKR', cooperation: 2, conflict: 1 },
      { counterpart: 'CHN', cooperation: 1, conflict: 0 },
      { counterpart: 'GBR', cooperation: 0, conflict: 1 },
    ]);
  });

  it('leaves out events the country is not in', () => {
    expect(countryRelations('USA', cooperation, conflict)).toEqual([{ counterpart: 'CHN', cooperation: 1, conflict: 0 }]);
  });

  it('is nothing for a country with no events', () => {
    expect(countryRelations('FRA', cooperation, conflict)).toEqual([]);
  });
});
