/**
 * IntelWeb's Map (decision D-IW, IW2, IW13, step 6), in an equirectangular frame: longitude across,
 * latitude down.
 *
 * - A note with a point at its point.
 * - A country's hub at the country's middle: it is the country.
 * - A note stating only a country (a region counted as its country) gathered around that country's
 *   hub, at the country's middle, and marked so: no note is given a point it did not state, which is
 *   why the intake never places one at a centroid.
 * - A note stating neither, or a country with no known middle, in a strip of its own below the map.
 *
 * Notes and countries only: tags and stubs have no place. Pure, for the engine to draw toward.
 */
import type { IntelNode } from './IntelGraph';

export const MAP_WIDTH = 1440;
export const MAP_HEIGHT = 720;
/** How far below the map the strip of notes stating no place runs, and how far apart they stand. */
const STRIP_Y = MAP_HEIGHT + 60;
const STRIP_STEP = 22;

export type MapPlaceKind = 'point' | 'country' | 'gathered' | 'unplaced';

export interface MapLayout {
  places: Map<string, { x: number; y: number }>;
  kinds: Map<string, MapPlaceKind>;
  /** Where the strip of notes stating no place runs. */
  stripY: number;
}

export const project = (lat: number, lng: number): { x: number; y: number } =>
  ({ x: ((lng + 180) / 360) * MAP_WIDTH, y: ((90 - lat) / 180) * MAP_HEIGHT });

const pointOf = (n: IntelNode): [number, number] | null => {
  const c = n.metadata?.coordinates;
  return Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
};
const countryOf = (n: IntelNode): string | null => {
  const stated = Array.isArray(n.metadata?.jurisdictions) ? n.metadata.jurisdictions as unknown[] : [];
  for (const j of stated) {
    const code = typeof j === 'string' ? j.trim().toLowerCase().split('-')[0] : '';
    if (/^[a-z]{2}$/.test(code)) return code;
  }
  return null;
};

export function mapLayout(nodes: readonly IntelNode[], centreOf: (iso2: string) => { lat: number; lng: number } | null): MapLayout {
  const places = new Map<string, { x: number; y: number }>();
  const kinds = new Map<string, MapPlaceKind>();
  let strip = 0;
  for (const n of nodes) {
    if (n.type === 'country') {
      const key = typeof n.metadata?.key === 'string' ? n.metadata.key.toLowerCase() : '';
      const centre = /^[a-z]{2}$/.test(key) ? centreOf(key) : null;
      if (centre) { places.set(n.id, project(centre.lat, centre.lng)); kinds.set(n.id, 'country'); }
      continue;
    }
    if (n.type !== 'report') continue;
    const point = pointOf(n);
    if (point) { places.set(n.id, project(point[0], point[1])); kinds.set(n.id, 'point'); continue; }
    const country = countryOf(n);
    const centre = country ? centreOf(country) : null;
    if (centre) { places.set(n.id, project(centre.lat, centre.lng)); kinds.set(n.id, 'gathered'); continue; }
    places.set(n.id, { x: 20 + STRIP_STEP * strip++, y: STRIP_Y });
    kinds.set(n.id, 'unplaced');
  }
  return { places, kinds, stripY: STRIP_Y };
}
