/**
 * The authority's warnings for an adventure's places (decision D-RS, RS34): the NWS's active warnings for each US
 * state it names, quoted as the NWS issued them; a place outside the US is said to be watched by no authority here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWarnings, forgetWarnings, nwsCallOff, stateOf, warningsOf } from '../adventureWarnings';

const feature = (over: Record<string, unknown>) => ({
  properties: {
    event: 'Winter Storm Warning', status: 'Actual', messageType: 'Alert', areaDesc: 'Cook; Lake', senderName: 'NWS Duluth MN',
    ends: '2026-10-17T13:00:00-05:00', expires: '2026-10-17T06:00:00-05:00', ...over,
  },
});

describe('stateOf', () => {
  it('reads a US state from a place code, and nothing else', () => {
    expect(stateOf('us-mn')).toBe('MN');
    expect(stateOf('us')).toBeNull();
    expect(stateOf('de')).toBeNull();
    expect(stateOf('us-mn-hennepin')).toBeNull();
  });
});

describe('warningsOf', () => {
  it('keeps warnings, as the NWS issued them, until when, in UTC', () => {
    const read = warningsOf({ features: [
      feature({}),
      feature({ event: 'Winter Weather Advisory' }),
      feature({ event: 'Flood Watch' }),
      feature({ event: 'Flood Warning', status: 'Test' }),
      feature({ event: 'Flood Warning', messageType: 'Cancel' }),
      feature({ event: 'Red Flag Warning', ends: null, expires: '2026-10-17T20:00:00-05:00', areaDesc: 'Rock' }),
    ] }, 'MN');
    expect(read).toEqual([
      { event: 'Winter Storm Warning', area: 'Cook; Lake', until: '2026-10-17T18:00:00.000Z', sender: 'NWS Duluth MN', state: 'MN' },
      { event: 'Red Flag Warning', area: 'Rock', until: '2026-10-18T01:00:00.000Z', sender: 'NWS Duluth MN', state: 'MN' },
    ]);
  });

  it('reads nothing from what is not the NWS\'s shape', () => {
    expect(warningsOf(null, 'MN')).toEqual([]);
    expect(warningsOf({ features: 'x' }, 'MN')).toEqual([]);
    expect(warningsOf({ features: [{}, { properties: { event: 7 } }] }, 'MN')).toEqual([]);
  });
});

describe('fetchWarnings', () => {
  beforeEach(() => forgetWarnings());

  it('asks the NWS for each state once, and says which it could not read', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('area=TX')) return new Response('nope', { status: 503 });
      return new Response(JSON.stringify({ features: [feature({})] }), { status: 200 });
    });
    const first = await fetchWarnings(['MN', 'TX'], fetcher, 1_000);
    expect(fetcher).toHaveBeenCalledWith('https://api.weather.gov/alerts/active?area=MN', expect.objectContaining({ headers: { Accept: 'application/geo+json' } }));
    expect(first.warnings.map((w) => w.state)).toEqual(['MN']);
    expect(first.failed).toEqual(['TX']);
    // Read again within five minutes: kept, not asked again; one that failed is asked again.
    await fetchWarnings(['MN', 'TX'], fetcher, 2_000);
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('area=MN'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('area=TX'))).toHaveLength(2);
    await fetchWarnings(['MN'], fetcher, 1_000 + 5 * 60_000);
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('area=MN'))).toHaveLength(2);
  });

  it('says a state failed when the request throws', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    expect(await fetchWarnings(['MN'], fetcher, 1)).toEqual({ warnings: [], failed: ['MN'] });
  });
});

describe('nwsCallOff (RS40)', () => {
  const w = (event: string, state: string, area = 'Cook; Lake') => ({ event, area, until: '2026-10-17T18:00:00.000Z', sender: 'NWS Duluth MN', state });

  it('off where warned: a warning calls it off in its areas, and the state stands elsewhere', () => {
    const watch = nwsCallOff(['us-mn'], [w('Flood Warning', 'MN')], []);
    expect(watch.everywhere).toBeNull();
    expect(watch.states).toEqual([{ state: 'MN', severe: [], local: [w('Flood Warning', 'MN')], read: true }]);
  });

  it('a tornado, hurricane, blizzard, or extreme cold or heat warning calls the whole state off, quoted', () => {
    for (const event of ['Tornado Warning', 'Hurricane Warning', 'Blizzard Warning', 'Extreme Cold Warning', 'Extreme Heat Warning']) {
      expect(nwsCallOff(['us-mn'], [w(event, 'MN')], []).everywhere).toBe(`the NWS: ${event} for Minnesota, until 2026-10-17 18:00 Z`);
    }
    // Their former names, while any office still issues them.
    expect(nwsCallOff(['us-mn'], [w('Wind Chill Warning', 'MN')], []).everywhere).toMatch(/Wind Chill Warning/);
    expect(nwsCallOff(['us-mn'], [w('Excessive Heat Warning', 'MN')], []).everywhere).toMatch(/Excessive Heat Warning/);
  });

  it('calls it off everywhere only when every place it names is called off', () => {
    expect(nwsCallOff(['us-mn', 'us-wi'], [w('Blizzard Warning', 'MN')], []).everywhere).toBeNull();
    expect(nwsCallOff(['us-mn', 'us-wi'], [w('Blizzard Warning', 'MN'), w('Blizzard Warning', 'WI')], []).everywhere)
      .toBe('the NWS: Blizzard Warning for Minnesota, until 2026-10-17 18:00 Z; Blizzard Warning for Wisconsin, until 2026-10-17 18:00 Z');
    expect(nwsCallOff(['us-mn', 'ca'], [w('Blizzard Warning', 'MN')], []).everywhere).toBeNull();
  });

  it('says which places no authority is read for here, and which states could not be read', () => {
    const watch = nwsCallOff(['us-mn', 'ca', 'us-tx'], [], ['TX']);
    expect(watch.outsideUS).toEqual(['ca']);
    expect(watch.states.map((s) => [s.state, s.read])).toEqual([['MN', true], ['TX', false]]);
  });
});
