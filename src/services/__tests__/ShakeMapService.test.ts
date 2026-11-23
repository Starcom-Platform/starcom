/**
 * USGS's ShakeMap contours (D-EQ, EQ11), in the shapes USGS serves them (read 3 Nov 2026: a quake's detail names the
 * preferred ShakeMap's cont_mmi.json; that holds a MultiLineString for each half step of MMI).
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contourUrlOf, fetchShakeContours, mmiRoman, mmiWords, resetShakeMapsForTests, shakeContoursOf } from '../ShakeMapService';

const CONT = 'https://earthquake.usgs.gov/pdl/products/urn:usgs-product:us:shakemap:us7000tv4i:1/contents/download/cont_mmi.json';
const detail = (url: string, weight = 233) => ({
  properties: { products: { shakemap: [{ source: 'us', preferredWeight: weight, contents: { 'download/cont_mmi.json': { url } } }] } },
});
const line = (value: number, runs: number[][][]) => ({ type: 'Feature', properties: { value, units: 'mmi' }, geometry: { type: 'MultiLineString', coordinates: runs } });
const RUN = [[-75.1, 3.2], [-75.0, 3.3], [-74.9, 3.2]];

describe("a quake's ShakeMap", () => {
  it('is found in its detail: the preferred ShakeMap, and only on USGS', () => {
    expect(contourUrlOf(detail(CONT))).toBe(CONT);
    const two = { properties: { products: { shakemap: [detail('https://earthquake.usgs.gov/a.json', 1).properties.products.shakemap[0], detail(CONT, 500).properties.products.shakemap[0]] } } };
    expect(contourUrlOf(two)).toBe(CONT);
    expect(contourUrlOf(detail('https://example.com/cont_mmi.json'))).toBeNull();
    expect(contourUrlOf(detail('http://earthquake.usgs.gov/cont_mmi.json'))).toBeNull();
    expect(contourUrlOf({ properties: { products: {} } })).toBeNull();
  });

  it('keeps the whole steps of shaking from II up, lowest first', () => {
    const contours = shakeContoursOf({ features: [line(3.5, [RUN]), line(5, [RUN]), line(1.5, [RUN]), line(3, [RUN, RUN]), line(4.5, [RUN])] });
    expect(contours.map((c) => c.mmi)).toEqual([3, 5]);
    expect(contours[0].lines).toHaveLength(2);
    expect(contours[0].lines[0][0]).toEqual([-75.1, 3.2]);
  });

  it('keeps the strongest line where USGS drew no whole step from II', () => {
    expect(shakeContoursOf({ features: [line(1.5, [RUN]), line(2.5, [RUN])] }).map((c) => c.mmi)).toEqual([2.5]);
    expect(shakeContoursOf({ features: [] })).toEqual([]);
    expect(shakeContoursOf(null)).toEqual([]);
  });

  it('drops points that are not places, and runs too short to draw', () => {
    const contours = shakeContoursOf({ features: [line(4, [[[-75, 3], [Number.NaN, 3], [-74, 95], [-74.5, 3.5]], [[-75, 3]]])] });
    expect(contours[0].lines).toEqual([[[-75, 3], [-74.5, 3.5]]]);
  });

  it('says its intensity as USGS does', () => {
    expect([mmiRoman(2), mmiRoman(6), mmiRoman(12)]).toEqual(['II', 'VI', 'X']);
    expect([mmiWords(3), mmiWords(4), mmiWords(6), mmiWords(8), mmiWords(10)]).toEqual(['weak', 'light', 'strong', 'severe', 'extreme']);
  });
});

describe('reading ShakeMaps', () => {
  afterEach(() => resetShakeMapsForTests());
  const DETAIL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us7000tv4i.geojson';
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it('reads the detail, then its contours, once for each quake', async () => {
    const fetcher = vi.fn(async (url: string) => ok(url === DETAIL ? detail(CONT) : { features: [line(4, [RUN])] }));
    const first = await fetchShakeContours(DETAIL, fetcher);
    const again = await fetchShakeContours(DETAIL, fetcher);
    expect(first?.map((c) => c.mmi)).toEqual([4]);
    expect(again).toBe(first);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([DETAIL, CONT]);
  });

  it('gives null on a failure and asks again next time; reads nothing off USGS', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    expect(await fetchShakeContours(DETAIL, failing)).toBeNull();
    expect(await fetchShakeContours(DETAIL, failing)).toBeNull();
    expect(failing).toHaveBeenCalledTimes(2);
    const never = vi.fn();
    expect(await fetchShakeContours('https://example.com/detail.geojson', never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
