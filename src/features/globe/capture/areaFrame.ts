/**
 * Framing a card to an area (BA22; plan block J, item 6b): its largest part,
 * each other part that fits with it, and what is left outside the frame.
 *
 * An area can be too spread out for one card: the EU has French Guiana, the
 * Anglosphere Australia and New Zealand. A part fits when one view holds it
 * with the largest part from no more than half as far again as the largest
 * part needs on its own. Fitting anything that one view could hold would pull
 * French Guiana into an EU card and draw Europe a third the size; the card
 * says what is outside instead, as a reader would name it.
 *
 * The largest part is ranked as regionPlace ranks it, so the card points at
 * the place the area is listed as standing.
 */
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import { pointInGeometry } from '../../../services/geoint/pointInPolygon';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import type { AreaShapes } from '../areas/areaShapes';
import type { AreaDef } from '../areas/areaRegistry';
import { listInWords } from '../../../utils/listInWords';
import { nameInText } from '../../../utils/nameInText';
import { regionMiddle, regionPlace } from './regionPlace';
import { altitudeToFit, requiredAltitude, SHARE_ALTITUDE_CEILING, SHARE_ALTITUDE_FLOOR, type FitView } from './shareReports';

type Ring = number[][];
type LatLng = { lat: number; lng: number };

export interface AreaFrame {
  /** Where the camera looks, and from how far, in globe radii. */
  centre: LatLng;
  altitude: number;
  /** Where the card points: the middle of the largest part, where the area is listed as standing. */
  position: LatLng;
  /** Each part outside the frame, largest first: its middle, and points on its edge. Empty when all of it is in. */
  outside: Array<{ middle: LatLng; edge: LatLng[] }>;
}

/** How much further out than its largest part needs a card may go to hold another part. */
const ZOOM_OUT_ALLOWED = 1.5;
/** At most this many of a part's vertices are fitted: enough to hold its outline. */
const MAX_POINTS = 240;
/** Points on a part's edge kept to name where it is: a coastal band's middle is at sea, its inland edge is not. */
const EDGE_POINTS = 24;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** A ring's area in square degrees: enough to say which part is largest. */
export const ringArea = (ring: Ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + (x * ny - nx * y);
}, 0) / 2);

const sampled = (ring: Ring): LatLng[] => {
  const step = Math.max(1, Math.ceil(ring.length / MAX_POINTS));
  return ring.filter((_, i) => i % step === 0).map(([lng, lat]) => ({ lat, lng }));
};

/**
 * The middle of the smallest cap of the sphere holding these points, near
 * enough (Bădoiu and Clarkson's iteration): the centre that needs the camera
 * least far out.
 */
function capCentre(points: readonly LatLng[]): LatLng | null {
  const vectors = points.map(({ lat, lng }) => [
    Math.cos(toRad(lat)) * Math.cos(toRad(lng)), Math.cos(toRad(lat)) * Math.sin(toRad(lng)), Math.sin(toRad(lat)),
  ]);
  const unit = (v: number[]) => { const n = Math.hypot(v[0], v[1], v[2]); return n < 1e-9 ? null : v.map((x) => x / n); };
  let c = unit(vectors.reduce((sum, v) => [sum[0] + v[0], sum[1] + v[1], sum[2] + v[2]], [0, 0, 0]));
  if (!c) return null;
  for (let i = 1; i <= 60; i++) {
    let far = vectors[0];
    let nearest = Infinity;
    for (const v of vectors) {
      const dot = v[0] * c[0] + v[1] * c[1] + v[2] * c[2];
      if (dot < nearest) { nearest = dot; far = v; }
    }
    const next: number[] | null = unit(c.map((x, k) => x + (far[k] - x) / (i + 1)));
    if (!next) break;
    c = next;
  }
  return { lat: toDeg(Math.asin(Math.max(-1, Math.min(1, c[2])))), lng: toDeg(Math.atan2(c[1], c[0])) };
}

/** The altitude these points need from their cap's middle, unclamped, and that middle. */
function needed(points: readonly LatLng[], view: FitView): { centre: LatLng; altitude: number } | null {
  const centre = capCentre(points);
  return centre ? { centre, altitude: requiredAltitude(points, centre, view) } : null;
}

const asRegion = (ring: Ring): RegionOutline => ({ name: '', geometry: { type: 'Polygon', coordinates: [ring as [number, number][]] } });

/** Each part's outer ring, largest first. */
export function partsOf(geometry: PolygonGeometry): Ring[] {
  return (geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]))
    .filter((ring) => Array.isArray(ring) && ring.length >= 3)
    .map((ring) => ring as Ring)
    .sort((a, b) => ringArea(b) - ringArea(a));
}

/** The frame of an area for a card of this view, or null when even its largest part is too large for one card. */
export function frameForArea(area: RegionOutline, view: FitView): AreaFrame | null {
  return frameForParts(partsOf(area.geometry), view);
}

/**
 * The frame of these parts, built round the first: each other part, in order, is
 * held while the frame need go no further out than `zoomOut` times what the first
 * needs (1.5 for an area). Null when the first is too large for one card.
 */
export function frameForParts(rings: readonly Ring[], view: FitView, zoomOut = ZOOM_OUT_ALLOWED): AreaFrame | null {
  if (!rings.length) return null;

  const main = needed(sampled(rings[0]), view);
  if (!main || main.altitude > SHARE_ALTITUDE_CEILING) return null;
  const allowed = Math.min(SHARE_ALTITUDE_CEILING, Math.max(SHARE_ALTITUDE_FLOOR, main.altitude) * zoomOut);

  // Once through, largest first: more parts only widen the cap, so a part that did not fit never will.
  let held: LatLng[] = sampled(rings[0]);
  const inFrame = new Set<number>([0]);
  rings.forEach((ring, i) => {
    if (inFrame.has(i)) return;
    const tried = [...held, ...sampled(ring)];
    const fit = needed(tried, view);
    if (fit && fit.altitude <= allowed) {
      held = tried;
      inFrame.add(i);
    }
  });

  const frame = needed(held, view);
  const position = regionPlace(asRegion(rings[0]));
  if (!frame || !position) return null;
  return {
    centre: { lat: frame.centre.lat, lng: frame.centre.lng },
    altitude: altitudeToFit(held, frame.centre, view),
    position: { lat: position.lat, lng: position.lng },
    outside: rings.flatMap((ring, i) => {
      const middle = inFrame.has(i) ? null : regionMiddle(asRegion(ring));
      return middle ? [{ middle, edge: sampled(ring).filter((_, k, all) => k % Math.max(1, Math.ceil(all.length / EDGE_POINTS)) === 0) }] : [];
    }),
  };
}

/** Whether a point is in the picture a card of this view makes from the frame. */
export function frameShows(frame: AreaFrame, view: FitView, point: LatLng): boolean {
  return requiredAltitude([point], frame.centre, view) <= frame.altitude + 1e-9;
}

/** What names what is outside a frame: the area's own definition, the countries, the continents. */
export interface OutsideNamer {
  area: AreaDef;
  territories?: TerritoryIndex;
  /** The areas' shapes, of which the continents name a drawn zone's parts. */
  shapes?: AreaShapes;
}

const MOST_NAMED = 4;

/**
 * What is outside the frame, in words (BA22), or null when nothing is:
 * members out of view by name ("Australia and New Zealand"), or past four by
 * count; a piece of a country otherwise in view as part of it ("part of
 * France", for French Guiana); a continent's outlying parts by the countries
 * there; a drawn zone's parts by their continents.
 */
export function outsideInWords(frame: AreaFrame, view: FitView, { area, territories, shapes }: OutsideNamer): string | null {
  if (!frame.outside.length) return null;
  const shown = (point: LatLng | null) => point !== null && frameShows(frame, view, point);
  const continentAt = (point: LatLng) => [...(shapes ?? new Map()).entries()]
    .find(([code, shape]) => code.startsWith('continent:') && pointInGeometry(point.lat, point.lng, shape.geometry))?.[1].name ?? null;

  if (territories && (area.from === 'members' || area.from === 'continent')) {
    const codeOf = new Map(territories.countries().map(({ code, name }) => [name, code.toLowerCase()]));
    const middleOf = (code: string | undefined) => {
      const country = code ? territories.byCode(code) : null;
      return country ? regionMiddle(country) : null;
    };
    const names: string[] = [];
    if (area.from === 'members') {
      const out = area.members.filter((code) => { const m = middleOf(code); return m !== null && !shown(m); });
      if (out.length > MOST_NAMED) {
        const where = [...new Set(out.flatMap((code) => { const m = middleOf(code); return m ? [continentAt(m) ?? []].flat() : []; }))];
        return `Outside the frame: ${out.length} of its ${area.members.length} members${where.length ? `, in ${listInWords(where)}` : ''}.`;
      }
      for (const code of out) names.push(nameInText(territories.byCode(code)!.name));
    }
    for (const { middle: point } of frame.outside) {
      const name = territories.at(point.lat, point.lng);
      if (!name) continue;
      const phrase = shown(middleOf(codeOf.get(name))) ? `part of ${nameInText(name)}` : nameInText(name);
      if (!names.includes(phrase)) names.push(phrase);
    }
    if (names.length) {
      const said = names.length > MOST_NAMED ? [...names.slice(0, MOST_NAMED - 1), `${names.length - MOST_NAMED + 1} more`] : names;
      return `Outside the frame: ${listInWords(said)}.`;
    }
  }

  // A drawn zone, or nothing named: the continents its parts reach, by their middles and their edges.
  const reached = frame.outside.map(({ middle, edge }) => [...new Set([middle, ...edge].flatMap((point) => [continentAt(point) ?? []].flat()))]);
  const where = [...new Set(reached.flat())];
  const atSea = reached.some((continents) => continents.length === 0);
  const parts = frame.outside.length === 1 ? 'its part' : 'its parts';
  if (!where.length) return `Outside the frame: ${parts} at sea.`;
  return `Outside the frame: ${parts} in ${listInWords(where)}${atSea ? ', and at sea' : ''}.`;
}
