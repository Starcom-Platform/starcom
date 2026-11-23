/**
 * The areas' shapes (BA18; plan block J, item 6), as the bake makes them from
 * the map's countries and the zones' drawn definitions: where each lies, and
 * where it does not.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  booleanClockwise, destination, lineString, pointToLineDistance, rhumbBearing,
} from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';
import { bakeAreas, type BakedAreas, type Territory } from '../areaBake';
import { AREAS, PARTS_OF, type AreaDef, type LngLat } from '../../../src/features/globe/areas/areaRegistry';
import { pointInGeometry, type PolygonGeometry } from '../../../src/services/geoint/pointInPolygon';
import { territoryCodeOf } from '../../../src/services/intel/coverage/territoryIndex';
import { labelOf } from '../../../src/geopolitical/zones/zsp';

const ROOT = resolve(__dirname, '../../..');
const SOURCE = 'public/geopolitical/world-territories-lod0.geojson';
const territories = (JSON.parse(readFileSync(resolve(ROOT, SOURCE), 'utf8')) as { features: Territory[] }).features;

let baked: BakedAreas;
beforeAll(() => { baked = bakeAreas(territories, SOURCE); });

const shape = (code: string) => {
  const found = baked.features.find((f) => f.properties.code === code);
  if (!found) throw new Error(`no ${code}`);
  return found.geometry;
};
const holds = (code: string, [lng, lat]: LngLat) => pointInGeometry(lat, lng, shape(code) as PolygonGeometry);
const defOf = <K extends AreaDef['from']>(code: string) => AREAS.find((a) => a.code === code) as Extract<AreaDef, { from: K }>;

const countryNamed = (code: string) => territories.find((t) => territoryCodeOf(t.properties)?.toLowerCase() === code);
/**
 * A point well inside a country's largest part: the middle of the widest run
 * of land along the parallel through the part's middle. Not a library's point
 * on the surface, which falls back to a vertex, on the edge, where inside and
 * outside cannot be told apart.
 */
const placeIn = (territory: Territory): LngLat => {
  const outers = territory.geometry.type === 'Polygon' ? [territory.geometry.coordinates[0]] : territory.geometry.coordinates.map((p) => p[0]);
  const area = (r: number[][]) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0));
  const ring = outers.sort((a, b) => area(b) - area(a))[0];
  const lats = ring.map(([, y]) => y);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2 + 1e-7;
  const crossings = ring.slice(1).flatMap(([x2, y2], i) => {
    const [x1, y1] = ring[i];
    return (y1 > lat) !== (y2 > lat) ? [x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)] : [];
  }).sort((a, b) => a - b);
  let best: LngLat = [crossings[0], lat];
  let widest = -1;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > widest) {
      widest = crossings[i + 1] - crossings[i];
      best = [(crossings[i] + crossings[i + 1]) / 2, lat];
    }
  }
  return best;
};

describe('the file Starcom serves', () => {
  it('is exactly what the bake makes now (npm run bake:areas when it is not)', () => {
    const served = readFileSync(resolve(ROOT, 'public/geopolitical/areas-lod0.geojson'), 'utf8');
    expect(served).toBe(`${JSON.stringify(baked)}\n`);
  });

  it('holds every area once, in the registry\'s order, by its code, kind and name', () => {
    expect(baked.features.map((f) => f.properties)).toEqual(AREAS.map(({ code, kind, name }) => ({ code, kind, name })));
  });

  it('winds outer rings anticlockwise and holes clockwise, as GeoJSON has it', () => {
    for (const { properties, geometry } of baked.features) {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const [outer, ...holes] of polygons) {
        expect(booleanClockwise(outer), properties.code).toBe(false);
        for (const hole of holes) expect(booleanClockwise(hole), `${properties.code} hole`).toBe(true);
      }
    }
  });
});

describe('a continent', () => {
  it('Europe stops at the Urals, and Asia has Siberia, where the map files all of Russia under Europe', () => {
    for (const city of [[37.6, 55.8], [56.2, 58.0], [20.5, 54.7]] as LngLat[]) { // Moscow, Perm, Kaliningrad
      expect(holds('continent:europe', city), String(city)).toBe(true);
      expect(holds('continent:asia', city), String(city)).toBe(false);
    }
    for (const city of [[65.5, 57.2], [82.9, 55.0], [129.7, 62.0]] as LngLat[]) { // Tyumen, Novosibirsk, Yakutsk
      expect(holds('continent:asia', city), String(city)).toBe(true);
      expect(holds('continent:europe', city), String(city)).toBe(false);
    }
  });

  it('France\'s overseas regions are each on their own continent, and in the European Union all the same', () => {
    for (const [code, continent] of [['gf', 'south-america'], ['gp', 'north-america'], ['mq', 'north-america'], ['re', 'africa'], ['yt', 'africa']]) {
      const at = placeIn(countryNamed(code)!);
      expect(holds(`continent:${continent}`, at), code).toBe(true);
      expect(holds('continent:europe', at), code).toBe(false);
      expect(holds('union:eu', at), code).toBe(true);
    }
  });

  it('French Guiana is in South America, and in the European Union all the same', () => {
    const guiana: LngLat = [-53.0, 4.0];
    expect(holds('continent:south-america', guiana)).toBe(true);
    expect(holds('continent:europe', guiana)).toBe(false);
    expect(holds('union:eu', guiana)).toBe(true);
    expect(holds('continent:europe', [2.35, 48.85])).toBe(true); // Paris
  });

  it('has the island states the map files under the open ocean', () => {
    for (const [code, continent] of [['sc', 'africa'], ['mu', 'africa'], ['re', 'africa'], ['mv', 'asia']]) {
      expect(holds(`continent:${continent}`, placeIn(countryNamed(code)!)), code).toBe(true);
    }
  });

  it('has every country the map files under it, and no other', () => {
    for (const area of AREAS.filter((a) => a.from === 'continent') as Array<Extract<AreaDef, { from: 'continent' }>>) {
      for (const territory of territories) {
        const code = territoryCodeOf(territory.properties)?.toLowerCase();
        if (code === 'ru') continue; // split, above
        const filed = territory.properties.CONTINENT === area.continent || (area.also ?? []).includes(code ?? '');
        expect(holds(area.code, placeIn(territory)), `${area.code}: ${String(territory.properties.ADMIN)}`).toBe(filed);
      }
    }
  });
});

describe('a union, sphere or zone of members', () => {
  const ofMembers = AREAS.filter((a) => a.from === 'members') as Array<Extract<AreaDef, { from: 'members' }>>;

  it('holds each member, and each territory the source counts in one', () => {
    for (const area of ofMembers) {
      for (const code of area.members) expect(holds(area.code, placeIn(countryNamed(code)!)), `${area.code}: ${code}`).toBe(true);
      for (const name of area.alsoNamed ?? []) {
        const territory = territories.find((t) => t.properties.ADMIN === name)!;
        expect(holds(area.code, placeIn(territory)), `${area.code}: ${name}`).toBe(true);
      }
    }
  });

  it('holds no other country: a suspended member, one that left, or a hole such as Switzerland in the EU', () => {
    for (const area of ofMembers) {
      // A member's parts the map draws apart are the member's (France's overseas regions).
      const named = new Set([...area.members.flatMap((code) => [code, ...(PARTS_OF[code] ?? [])]), ...(area.alsoNamed ?? [])]);
      for (const territory of territories) {
        const code = territoryCodeOf(territory.properties)?.toLowerCase();
        if (named.has(code ?? '') || named.has(String(territory.properties.ADMIN))) continue;
        expect(holds(area.code, placeIn(territory)), `${area.code}: ${String(territory.properties.ADMIN)}`).toBe(false);
      }
    }
    expect(holds('union:eu', [7.45, 46.95])).toBe(false); // Bern
    expect(holds('union:mercosur', [-66.9, 10.5])).toBe(false); // Caracas
  });
});

describe('a zone drawn from its definition', () => {
  /** Points either side of each segment's middle, nearer and farther than half the width. */
  const probes = (lines: ReadonlyArray<readonly LngLat[]>, halfKm: number) => lines.flatMap((line) => line.slice(1).flatMap((end, i) => {
    const start = line[i];
    const middle: LngLat = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const across = rhumbBearing([...start], [...end]) + 90;
    return [halfKm - 40, halfKm + 40].flatMap((km) => [across, across + 180].map((bearing) => {
      const [lng, lat] = destination([...middle], km, bearing, { units: 'kilometers' }).geometry.coordinates;
      return [lng, lat] as LngLat;
    }));
  }));

  /** The zones still drawn as bands: each moves to its ZSP document as that is built. */
  const banded = AREAS.filter((a) => a.from === 'lines').map((a) => a.code);

  it('a band is what lies within half its width of its lines, give or take 20 km, the length of the Pacific', () => {
    for (const code of banded) {
      const def = defOf<'lines'>(code);
      const lines = def.lines.map((line) => lineString(line.map(([lng, lat]) => [lng, lat])));
      const half = def.widthKm / 2;
      let checked = 0;
      for (const probe of probes(def.lines, half)) {
        const km = Math.min(...lines.map((line) => pointToLineDistance([...probe], line, { units: 'kilometers' })));
        if (Math.abs(km - half) < 20) continue;
        expect(holds(code, probe), `${code} at ${probe.map((v) => v.toFixed(2))}, ${km.toFixed(0)} km off`).toBe(km < half);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(def.lines.flat().length * 2);
    }
  });

  it('every point a band was drawn through is in it', () => {
    for (const code of banded) {
      for (const vertex of defOf<'lines'>(code).lines.flat()) expect(holds(code, vertex), `${code} ${vertex}`).toBe(true);
    }
  });

  // No area is a circle since the Golden Triangle became the Zones that cover it (ZR8); kept for the next one.
  it.skipIf(!AREAS.some((a) => a.from === 'circle'))('a circle reaches its radius from its centre, give or take 20 km, every way', () => {
    for (const { code, centre, radiusKm } of AREAS.filter((a): a is Extract<AreaDef, { from: 'circle' }> => a.from === 'circle')) {
      expect(holds(code, centre)).toBe(true);
      for (let bearing = 0; bearing < 360; bearing += 45) {
        for (const [km, within] of [[radiusKm - 20, true], [radiusKm + 20, false]] as const) {
          const [lng, lat] = destination([...centre], km, bearing, { units: 'kilometers' }).geometry.coordinates;
          expect(holds(code, [lng, lat]), `${code} ${bearing}° at ${km} km`).toBe(within);
        }
      }
    }
  });

  it('a Zone holds what lies inside it', () => {
    // Retired (ZR8), the Sahel is the Zones its place is made of: Niamey's and Agadez's, not Algiers's or Cairo's.
    expect(holds('zone:sahel', [2.1, 13.5])).toBe(true); // Niamey
    expect(holds('zone:sahel', [8.0, 17.0])).toBe(true); // Agadez
    expect(holds('zone:sahel', [3.1, 36.8])).toBe(false); // Algiers
    expect(holds('zone:sahel', [31.2, 30.0])).toBe(false); // Cairo
    expect(holds('zone:sahel', [36.8, -1.3])).toBe(false); // Nairobi
    // Kept (ZR8), the Caucasus is a 2.0 Zone of its own, between the steppe and the Armenian Highlands.
    expect(holds('zone:caucasus', [44.8, 41.7])).toBe(true); // Tbilisi
    expect(holds('zone:caucasus', [39.7, 47.2])).toBe(false); // Rostov-on-Don
  });
});

describe('a band\'s pieces', () => {
  // Every zone once drawn as a band is now its ZSP document's outline (2026-10-12); kept for the next band.
  it.skipIf(!AREAS.some((a) => a.from === 'lines'))('meet where its lines do, and break where they were broken at the date line', () => {
    const parts = (code: string) => {
      const g = shape(code) as Polygon | MultiPolygon;
      return g.type === 'Polygon' ? 1 : g.coordinates.length;
    };
    // The Izu-Bonin arc meets Japan's, and the Sunda arc the Moluccas': six lines, four pieces.
    expect(parts('zone:ring-of-fire')).toBe(4);
    expect(parts('zone:east-african-rift')).toBe(2);
  });
});

describe('a zone drawn under the Zone and Sector Protocol', () => {
  const zsp = AREAS.filter((a): a is Extract<AreaDef, { from: 'zsp' }> => a.from === 'zsp');
  const docOf = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../public/geopolitical/zones', file), 'utf8')) as {
    features: Array<{ properties: { id: string; level: string; parent?: string; label?: { lat: number; lon: number } }; geometry: PolygonGeometry }>;
  };

  it('holds the label point of every one of its Sectors', () => {
    expect(zsp.length).toBeGreaterThan(0);
    for (const area of zsp) {
      const doc = docOf(area.file);
      expect(doc.features.some((f) => f.properties.id === area.code && ['terra', 'mare', 'zone'].includes(f.properties.level)), area.code).toBe(true);
      // A Zone's Sectors are its children; a Terra's or a Mare's, every Sector its document holds.
      const sectors = doc.features.filter((x) => x.properties.level === 'sector' && (area.kind !== 'zone' || x.properties.parent === area.code));
      if (area.kind === 'zone') expect(sectors.length, area.code).toBeGreaterThan(0);
      for (const f of sectors) {
        // Its label point, or the one the reader finds when it has none (zsp.ts).
        const at = f.properties.label ?? labelOf(f.geometry);
        expect(holds(area.code, [at.lon, at.lat]), `${area.code}: ${f.properties.id}`).toBe(true);
      }
    }
  });

  it('is refused when the document is not the one the registry names', () => {
    const tampered = (file: string) => readFileSync(resolve(__dirname, '../../../public/geopolitical/zones', file), 'utf8').replace('"zsp"', ' "zsp"');
    expect(() => bakeAreas(territories, SOURCE, tampered)).toThrow(/is not the document the registry names/);
  });
});

/* ZSP 2.0 (decision D-ZR): a Terra's or a Zone's outline is its container document's, and a retired id is drawn as
   the Zones that now cover it (zoneAreas.ts). */
describe('a partition\'s areas', () => {
  it('bakes a 2.0 Zone from its container\'s document, and a retired Zone as the Zones that cover it', async () => {
    const { testPartition } = await import('../../../src/geopolitical/zones/__tests__/testPartition');
    const { zoneAreasFrom } = await import('../../../src/features/globe/areas/zoneAreas');
    const { manifest, files } = testPartition();
    const { zones, retired } = zoneAreasFrom(manifest, (file) => JSON.parse(files[file]));
    const partition = bakeAreas(territories, SOURCE, (file) => files[file], [...zones, ...retired]);
    const outline = (code: string) => partition.features.find((f) => f.properties.code === code)!.geometry as PolygonGeometry;
    const inside = (code: string, [lng, lat]: LngLat) => pointInGeometry(lat, lng, outline(code));
    expect(partition.features.map((f) => f.properties.code)).toEqual([...zones, ...retired].map((a) => a.code));
    expect(inside('zone:borea-west', [-90, 45])).toBe(true);
    expect(inside('zone:borea-west', [90, 45])).toBe(false);
    // The Sahel, retired, covered by both of Terra Borea's Zones.
    expect(inside('zone:sahel', [-90, 45])).toBe(true);
    expect(inside('zone:sahel', [90, 45])).toBe(true);
    expect(inside('zone:sahel', [90, -45])).toBe(false);
  });
});
