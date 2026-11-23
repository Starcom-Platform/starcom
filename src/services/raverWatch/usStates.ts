/**
 * The US state outlines, for a Raver Watch item about a state (`us-tx`),
 * decision RW4.
 *
 * The territory index holds countries only, on purpose: widening a state's
 * alert to its whole country would claim more than the publisher did. So the
 * states are a file of their own, `us-states-50m.geojson`, cut from Natural
 * Earth's public-domain admin-1 set by scripts/build-us-states.mjs and served
 * by Starcom. It is fetched only when an item names a state, once per session.
 */
import type { PolygonGeometry } from '../geoint/pointInPolygon';

/** A US state as Raver Watch names it: `us-` and its two-letter code, in lower case. */
export const US_STATE_CODE = /^us-[a-z]{2}$/;

export interface RegionOutline {
  name: string;
  geometry: PolygonGeometry;
}

/** The states, by code. */
export type UsStates = ReadonlyMap<string, RegionOutline>;

/** The states in the served file, by code. */
export function usStatesFrom(geojson: { features?: Array<{ properties?: { code?: unknown; name?: unknown }; geometry?: PolygonGeometry }> }): UsStates {
  const states = new Map<string, RegionOutline>();
  for (const feature of geojson.features ?? []) {
    const { code, name } = feature.properties ?? {};
    if (typeof code !== 'string' || !US_STATE_CODE.test(code) || typeof name !== 'string' || !feature.geometry) continue;
    states.set(code, { name, geometry: feature.geometry });
  }
  return states;
}

let loading: Promise<UsStates | undefined> | null = null;

/** The states, fetched once. Undefined when they could not be; the next caller tries again. */
export function loadUsStates(): Promise<UsStates | undefined> {
  loading ??= fetch('/geopolitical/us-states-50m.geojson', { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((geojson) => usStatesFrom(geojson))
    .catch(() => {
      loading = null;
      return undefined;
    });
  return loading;
}

/** Test-only: forget the fetched states. */
export function resetUsStatesForTests(): void {
  loading = null;
}
