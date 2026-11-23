/**
 * The shape of every area (decision BA18; plan block J, item 6), made from the
 * map's own countries and the zones' drawn definitions: each continent, union
 * or sphere merged into one outline, each zone widened, ringed or circled as
 * its definition says. Run by `npm run bake:areas`; a test runs it too, and
 * fails when the served file is not what it makes.
 *
 * Here rather than in the browser so the geometry library never ships to it.
 *
 * A zone drawn under the Zone and Sector Protocol is its document's own Zone
 * outline (public/geopolitical/zones/), refused when the document is not the
 * one the registry names by its hash.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  buffer, circle, difference, featureCollection, intersect, lineString, polygon, rewind, union,
} from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import {
  AREAS, CONTINENT_SPLITS, PARTS_OF, areaDefinitionsHash, type AreaDef, type AreaKind, type LngLat,
} from '../../src/features/globe/areas/areaRegistry';
import { territoryCodeOf } from '../../src/services/intel/coverage/territoryIndex';

export type Territory = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
type Shape = Feature<Polygon | MultiPolygon>;

export interface BakedArea {
  type: 'Feature';
  properties: { code: string; kind: AreaKind; name: string };
  geometry: Polygon | MultiPolygon;
}

export interface BakedAreas {
  type: 'FeatureCollection';
  definitionsHash: string;
  bakedFrom: string;
  features: BakedArea[];
}

function merged(parts: Shape[], code: string): Shape {
  if (parts.length === 0) throw new Error(`${code}: nothing to draw`);
  if (parts.length === 1) return parts[0];
  const result = union(featureCollection(parts));
  if (!result) throw new Error(`${code}: the union came back empty`);
  return result;
}

const ring = (points: readonly LngLat[]) => polygon([points.map(([lng, lat]) => [lng, lat])]);

/**
 * A band along lines, widthKm across. Each segment is widened on its own and
 * the pieces merged: the projection a buffer uses is centred on what it
 * widens, and one for a whole line set is centred far from most of it. The
 * Ring of Fire's would sit in the Gulf of Guinea, its arcs a fifth as wide as
 * they should be.
 */
function band(lines: ReadonlyArray<readonly LngLat[]>, widthKm: number, code: string): Shape {
  const pieces = lines.flatMap((line) => line.slice(1).map((end, i) => {
    const piece = buffer(lineString([[...line[i]], [...end]]), widthKm / 2, { units: 'kilometers', steps: 8 });
    if (!piece) throw new Error(`${code}: a segment could not be widened`);
    return piece as Shape;
  }));
  return merged(pieces, code);
}

// Three decimals: about 110 m, finer than the lod0 outlines the shapes are made from.
const rounded = (value: unknown): unknown => (Array.isArray(value)
  ? value.map(rounded)
  : typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);

const ZONES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/geopolitical/zones');
const readZoneFile = (file: string): string => fs.readFileSync(path.join(ZONES, file), 'utf8');

/**
 * A ZSP document's outline of a place, checked against the hash the registry gives it: a 1.0 Zone (its own document),
 * or a 2.0 Terra, Mare or Zone (its container's).
 */
function zoneOutline(area: Extract<AreaDef, { from: 'zsp' }>, readZone: (file: string) => string): Shape {
  const text = readZone(area.file);
  const sha256 = createHash('sha256').update(text).digest('hex');
  if (sha256 !== area.sha256) throw new Error(`${area.code}: ${area.file} is not the document the registry names (its sha256 is ${sha256})`);
  const doc = JSON.parse(text) as { zsp?: unknown; features?: Array<{ properties?: Record<string, unknown>; geometry?: Polygon | MultiPolygon }> };
  const whole = doc.zsp === '2.0';
  const zone = (doc.features ?? []).find((f) => f.properties?.id === area.code && (whole
    ? ['terra', 'mare', 'zone'].includes(String(f.properties?.level))
    : f.properties?.level === 'zone' && f.properties?.parent === null));
  if (!zone?.geometry) throw new Error(`${area.code}: ${area.file} holds no Zone of that id`);
  return { type: 'Feature', properties: {}, geometry: zone.geometry };
}

/** Every area's shape, from the map's countries (world-territories-lod0) and the Zones' documents. */
export function bakeAreas(
  territories: readonly Territory[], bakedFrom: string, readZone: (file: string) => string = readZoneFile,
  /** The areas to bake: the registry's, unless a test names others. */
  areas: readonly AreaDef[] = AREAS,
): BakedAreas {
  // Read as the territory index reads them, first wins, so an area's member is the country a report's code resolves to.
  const byCode = new Map<string, Territory>();
  const byName = new Map<string, Territory>();
  for (const territory of territories) {
    const code = territoryCodeOf(territory.properties)?.toLowerCase();
    if (code && !byCode.has(code)) byCode.set(code, territory);
    const name = territory.properties.ADMIN;
    if (typeof name === 'string' && !byName.has(name)) byName.set(name, territory);
  }
  const memberOf = (area: string, code: string): Territory => {
    const territory = byCode.get(code);
    if (!territory) throw new Error(`${area}: no territory for ${code}`);
    return territory;
  };

  /** A country's land on a continent: all of it, unless a split gives part of it to another (CONTINENT_SPLITS). */
  const onContinent = (territory: Territory, continent: string): Shape | null => {
    const code = territoryCodeOf(territory.properties)?.toLowerCase();
    const split = CONTINENT_SPLITS.find((s) => s.country === code);
    if (!split) return territory.properties.CONTINENT === continent ? territory : null;
    const pair = featureCollection<Polygon | MultiPolygon>([territory, ring(split.within)]);
    if (continent === split.inside) return intersect(pair);
    if (continent === split.outside) return difference(pair);
    return null;
  };

  const shapeOf = (area: AreaDef): Shape => {
    switch (area.from) {
      case 'continent': {
        const land = territories.flatMap((t) => onContinent(t, area.continent) ?? []);
        const islands = (area.also ?? []).map((code) => memberOf(area.code, code));
        return merged([...land, ...islands], area.code);
      }
      case 'members': {
        const named = (area.alsoNamed ?? []).map((name) => {
          const territory = byName.get(name);
          if (!territory) throw new Error(`${area.code}: no territory named ${name}`);
          return territory;
        });
        // A member's parts the map draws apart are the member's (PARTS_OF): France's overseas regions.
        const members = area.members.flatMap((code) => [code, ...(PARTS_OF[code] ?? [])]);
        return merged([...members.map((code) => memberOf(area.code, code)), ...named], area.code);
      }
      case 'lines':
        return band(area.lines, area.widthKm, area.code);
      case 'ring':
        return ring(area.ring);
      case 'circle':
        return circle([...area.centre], area.radiusKm, { steps: 72, units: 'kilometers' });
      case 'zsp':
        return zoneOutline(area, readZone);
      case 'covered': {
        // A retired Zone: the Zones that now cover its place, as one outline (zoneAreas.ts).
        const covering = area.coveredBy.map((code) => {
          const found = areas.find((a) => a.code === code);
          if (!found || found.from === 'covered') throw new Error(`${area.code}: ${code} is not an area it can be drawn from`);
          return shapeOf(found);
        });
        return merged(covering, area.code);
      }
    }
  };

  const features = areas.map((area): BakedArea => {
    // Outer rings anticlockwise, holes clockwise, as GeoJSON has it.
    const { geometry } = rewind(shapeOf(area)) as Shape;
    return {
      type: 'Feature',
      properties: { code: area.code, kind: area.kind, name: area.name },
      geometry: { type: geometry.type, coordinates: rounded(geometry.coordinates) } as Polygon | MultiPolygon,
    };
  });
  return { type: 'FeatureCollection', definitionsHash: areaDefinitionsHash(), bakedFrom, features };
}
