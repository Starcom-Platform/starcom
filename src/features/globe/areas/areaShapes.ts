/**
 * The areas' shapes (BA18), baked by `npm run bake:areas` and fetched only
 * once a report names an area, once per session, as the US states are.
 *
 * Asked for by the hash of the definitions this build holds. The service
 * worker once kept whatever it fetched from /geopolitical/ for good, so under
 * one address a returning browser drew an area as it was first fetched, after
 * its members or its edges had changed. It now checks each kept file once per
 * build; the hash still names the shapes a build's definitions expect.
 */
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { areaByCode, areaDefinitionsHash } from './areaRegistry';

/** Each area's outline, by its code, under the name this build gives it. */
export type AreaShapes = ReadonlyMap<string, RegionOutline>;

export const areaShapesUrl = (): string => `/geopolitical/areas-lod0.geojson?v=${areaDefinitionsHash()}`;

const isShape = (geometry: unknown): geometry is PolygonGeometry => {
  const type = (geometry as { type?: unknown } | null | undefined)?.type;
  return (type === 'Polygon' || type === 'MultiPolygon') && Array.isArray((geometry as { coordinates?: unknown }).coordinates);
};

/** The areas in the served file that this build defines; any other is passed over. */
export function areaShapesFrom(geojson: { features?: Array<{ properties?: { code?: unknown }; geometry?: unknown }> }): AreaShapes {
  const shapes = new Map<string, RegionOutline>();
  for (const feature of geojson.features ?? []) {
    const { code } = feature.properties ?? {};
    const area = typeof code === 'string' ? areaByCode(code) : null;
    if (!area || !isShape(feature.geometry)) continue;
    shapes.set(area.code, { name: area.name, geometry: feature.geometry });
  }
  return shapes;
}

let loading: Promise<AreaShapes | undefined> | null = null;

/** The shapes, fetched once. Undefined when they could not be; the next caller tries again. */
export function loadAreaShapes(): Promise<AreaShapes | undefined> {
  loading ??= fetch(areaShapesUrl(), { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((geojson) => areaShapesFrom(geojson))
    .catch(() => {
      loading = null;
      return undefined;
    });
  return loading;
}

/** Test-only: forget the fetched shapes. */
export function resetAreaShapesForTests(): void {
  loading = null;
}
