/**
 * Which listed items are in an area (BA21): those whose place is inside its
 * outline, the place as listed, so a caller can check the answer against the
 * list. A report about a territory or an area stands at its middle, so one
 * naming the area is in it by construction; one about Russia as a whole
 * stands in Siberia, so it is in Asia.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reportsInArea } from '../shareAreas';
import { areaShapesFrom } from '../../areas/areaShapes';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { regionPlace } from '../regionPlace';
import type { ShareReportInfo } from '../shareReports';

const ROOT = resolve(__dirname, '../../../../..');
const read = (file: string) => JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical', file), 'utf8'));
const AREAS = areaShapesFrom(read('areas-lod0.geojson'));
const TERRITORIES = buildTerritoryIndex(read('world-territories-lod0.geojson').features);
const shape = (code: string) => AREAS.get(code)!;

const at = (id: string, lat: number, lng: number): ShareReportInfo => ({
  id, layer: 'IntelReports', title: id, variant: 'raw', variantMeans: 'not assessed', author: 'npub1abcdef…wxyz', time: null,
  precisionM: null, lat, lng, sharesPlaceWith: 0,
});
const standing = (id: string, region: Parameters<typeof regionPlace>[0]) => {
  const place = regionPlace(region)!;
  return at(id, place.lat, place.lng);
};

describe('the items in an area (BA21)', () => {
  it('a point inside its outline, and none in a hole or outside', () => {
    const listed = [at('paris', 48.9, 2.4), at('bern', 47.0, 7.4), at('oslo', 59.9, 10.8), at('guiana', 4.0, -53.0)];
    expect(reportsInArea(listed, shape('union:eu')).map((r) => r.id)).toEqual(['paris', 'guiana']);
    expect(reportsInArea(listed, shape('continent:europe')).map((r) => r.id)).toEqual(['paris', 'bern', 'oslo']);
  });

  it('a report about a territory, where it stands: France in the EU, Russia as a whole in Asia', () => {
    const france = standing('france', TERRITORIES.byCode('fr')!);
    const russia = standing('russia', TERRITORIES.byCode('ru')!);
    expect(reportsInArea([france, russia], shape('union:eu')).map((r) => r.id)).toEqual(['france']);
    expect(reportsInArea([france, russia], shape('continent:asia')).map((r) => r.id)).toEqual(['russia']);
    expect(reportsInArea([france, russia], shape('continent:europe')).map((r) => r.id)).toEqual(['france']);
  });

  it('a report naming an area is in it, wherever its middle falls', () => {
    for (const code of ['zone:sahel', 'zone:ring-of-fire', 'continent:antarctica', 'sphere:francophonie', 'union:eu']) {
      expect(reportsInArea([standing(code, shape(code))], shape(code)), code).toHaveLength(1);
    }
  });

  it('keeps the list\'s order', () => {
    const listed = [at('b', 50.1, 8.7), at('a', 52.5, 13.4), at('c', 40.4, -3.7)];
    expect(reportsInArea(listed, shape('union:eu')).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
});
