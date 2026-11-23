/**
 * Where an item about a whole region stands (contract v8, v10, v26, v29): the
 * middle of the region's largest part, and how far the region reaches from it.
 *
 * The middle was the part's centroid, and where the centroid falls outside the
 * part, its first vertex: a point on the border, which is no middle. Norway,
 * Croatia and Vietnam, each curved round its centroid, stood on an edge, as did
 * Antarctica and the Ring of Fire. Such a part now stands at the middle of its
 * widest run of land along the parallel through its middle.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { regionPlace } from '../regionPlace';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { pointInGeometry } from '../../../../services/geoint/pointInPolygon';
import { representativePoint } from '../../../../services/geoint/representativePoint';
import { areaShapesFrom } from '../../areas/areaShapes';

const ROOT = resolve(__dirname, '../../../../..');
const read = (file: string) => JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical', file), 'utf8'));
const TERRITORIES = buildTerritoryIndex(read('world-territories-lod0.geojson').features);
const AREAS = areaShapesFrom(read('areas-lod0.geojson'));
const country = (code: string) => TERRITORIES.byCode(code)!;

describe('a region whose middle falls outside it', () => {
  it('stands inside it: Norway, Croatia, Vietnam and Antarctica', () => {
    for (const code of ['no', 'hr', 'vn', 'aq']) {
      const region = country(code);
      const place = regionPlace(region)!;
      expect(pointInGeometry(place.lat, place.lng, region.geometry), `${code} at ${place.lat},${place.lng}`).toBe(true);
    }
  });

  it('a band stands on it, not at the end of one of its arcs', () => {
    const ring = AREAS.get('zone:ring-of-fire')!;
    const place = regionPlace(ring)!;
    expect(pointInGeometry(place.lat, place.lng, ring.geometry)).toBe(true);
    // Not Sumatra's tip, the first vertex of the arc it was placed on before.
    expect(Math.abs(place.lat - 5.7) + Math.abs(place.lng - 93.7)).toBeGreaterThan(5);
  });

  it('Antarctica stands well inside, in the bulk of East Antarctica, not on its peninsula', () => {
    const place = regionPlace(country('aq'))!;
    expect(place.lat).toBeLessThan(-70);
    expect(place.lng).toBeGreaterThan(0);
    expect(place.lng).toBeLessThan(160);
  });

  it('Norway stands at its narrow middle, and reaches its ends from there', () => {
    const place = regionPlace(country('no'))!;
    expect(place.lat).toBeGreaterThan(62);
    expect(place.lat).toBeLessThan(67);
    // From the middle to the North Cape or the south coast: some 700 to 1,000 km.
    expect(place.precisionM).toBeGreaterThan(600_000);
    expect(place.precisionM).toBeLessThan(1_100_000);
  });
});

describe('a region whose middle is inside it', () => {
  it('stands at its centroid, at 0.1°, as before', () => {
    for (const code of ['fr', 'de', 'us', 'br']) {
      const region = country(code);
      const outers = region.geometry.type === 'Polygon' ? [region.geometry.coordinates[0]] : region.geometry.coordinates.map((p) => p[0]);
      const area = (r: number[][]) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0));
      const largest = [...outers].sort((a, b) => area(b as number[][]) - area(a as number[][]))[0] as number[][];
      const { point, how } = representativePoint({ kind: 'polygon', rings: [largest.map(([lon, lat]) => ({ lat, lon }))] });
      expect(how, code).toBe('polygon-centroid');
      expect(regionPlace(region), code).toMatchObject({ lat: Math.round(point.lat * 10) / 10, lng: Math.round(point.lon * 10) / 10 });
    }
  });
});
