/**
 * Close-ups (block I, item 4; decisions IM2, IM34–IM36).
 *
 * Every framing keeps the camera at one globe radius or more, and from there a
 * city's public venues that night are one cluster of marks, and a state's heat
 * towns overlap on its coast. So the globe stays the locator, and an inset in
 * the picture's corner away from the item draws the item among its neighbours,
 * with a scale bar:
 *
 *   - a public venue: the other public venues open the same night within
 *     25 km, one mark a venue, on a 1 km grid, the featured one ringed and
 *     named. No coastline: Starcom's own has 1 to 6 points across a city, too
 *     coarse to set venues against;
 *   - a heat town: the other heat towns of its state the same day, each at its
 *     level's colour, inside Starcom's own state lines (the file Raver Watch's
 *     state regions use, served by Starcom itself), with every other country
 *     in view outlined from the territory index Raver Watch already holds
 *     (IM37), so the land past a border does not read as sea.
 *
 * No map tiles, and nothing asked of anyone but Starcom. Only for these two: a
 * scene event placed only to its town would claim more than its note does,
 * and an Intel Report's place can be a filing address (IM2). Drawn only when a
 * shot asks for it (`card.inset`, IM36).
 *
 * Every decision is made here, as a layout of primitives; drawShareCard only
 * draws them.
 */
import type { RaverWatchItem } from '../../../services/raverWatch/raverWatch';
import { US_STATE_CODE, type UsStates } from '../../../services/raverWatch/usStates';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { pointInGeometry, type PolygonGeometry, type Ring } from '../../../services/geoint/pointInPolygon';
import { levelOf } from '../../../services/raverWatch/raverWatchView';
import { RAVER_WATCH_LEVEL_LOOK } from '../../../components/Globe/raverWatchSprites';
import { FEATURED_WEIGHT, GLYPH_EDGE_PX, shortenAtWord, type MeasureText } from './shareCardLayout';

/** How far from a public venue the inset looks for the night's others. */
export const VENUE_RADIUS_KM = 25;
/** The inset's side, as a share of the picture's shorter side (IM35). */
export const INSET_SHARE = 0.42;
/** A venue's inset spans at least this, so the 150 m it is placed to is under a tenth of it. */
const VENUE_MIN_KM = 2;
const VENUE_PAD_SHARE = 0.15;
const VENUE_PAD_MIN_KM = 0.5;
const STATE_PAD_SHARE = 0.04;
/** The grid a venue's inset asks for (IM34), and the closest its lines may be before a coarser one is drawn. */
const GRID_KM = 1;
const GRID_MIN_PX = 8;
const GRID_STEPS_KM = [1, 2, 5, 10, 20, 50];
/** A heat note applies for a day: two of one state differ by its time zones at most. */
const SAME_DAY_S = 6 * 3600;
/** Scale bar lengths, the longest under SCALE_SHARE of the map's width. */
const SCALE_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const SCALE_SHARE = 0.3;
const EARTH_KM = 6371.0088;
const KM_PER_DEGREE = (Math.PI / 180) * EARTH_KM;

export type CloseUpKind = 'venues' | 'heat';
export interface CloseUpRefusal { refused: string }

export interface InsetMark { id: string; lat: number; lon: number; color: string; cancelled: boolean }
export interface InsetOutline { name: string; geometry: PolygonGeometry; own: boolean }

/** What an inset draws, in degrees: decided from the items, before it is placed on a card. */
export interface CardInset {
  kind: CloseUpKind;
  /** The featured item, named for a venue. */
  featured: InsetMark & { label: string | null };
  /** Its neighbours, one mark a place. */
  others: InsetMark[];
  /** A heat town's state, filled, and the states and countries around it, outlined. None for a venue. */
  outlines: InsetOutline[];
  /** What the inset covers: square in kilometres. */
  bounds: { west: number; south: number; east: number; north: number };
  title: string;
  /** How far it looks: `within 25 km`, or the state. */
  within: string;
  /** How finely its marks are placed. */
  placedTo: string;
  /** The grid asked for, in kilometres, or none. */
  gridKm: number | null;
}

const ONLY = 'A close-up is drawn only for a public venue or a heat town (IM2)';
const WHAT_IT_IS: Record<string, string> = {
  DrugCheckAlerts: 'a drug-check alert',
  SceneIncidents: 'a scene incident',
  RaverMissions: 'a Raver mission',
  HarmReductionSites: 'a harm-reduction site',
};

/** Whether a Raver Watch item may have a close-up, and which, or why not. */
export function closeUpKind(item: RaverWatchItem): CloseUpKind | CloseUpRefusal {
  if (item.sceneNews) return { refused: `${ONLY}: scene news is listed, never drawn.` };
  if (item.layer === 'SceneEvents') {
    if (item.precision === 'venue' && item.point) return 'venues';
    return { refused: `This scene event is placed only to its town, about 11 km: a close-up would claim more than its note does. ${ONLY}.` };
  }
  if (item.layer === 'HeatRisk') {
    if (!item.jurisdiction || !US_STATE_CODE.test(item.jurisdiction)) {
      return { refused: 'A heat town\'s close-up draws its US state\'s outline, and this note names no US state.' };
    }
    if (!item.point) return { refused: 'This HeatRisk note names no town to ring: a heat town\'s close-up draws the town among its state\'s.' };
    return 'heat';
  }
  return { refused: `${ONLY}: this is ${WHAT_IT_IS[item.layer] ?? 'not one'}.` };
}

/** Why an item from outside Raver Watch has no close-up. */
export function closeUpRefusalFor(layer: string): string {
  if (layer === 'IntelReports') {
    return 'A close-up is never for an Intel Report, whose place can be a filing address rather than where anything happened (IM2).';
  }
  return `${ONLY}: this is ${layer === 'WarConflict' ? 'a War & Conflict item' : 'not one'}.`;
}

/** The great-circle distance, in kilometres. */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const colourOf = (item: RaverWatchItem) => RAVER_WATCH_LEVEL_LOOK[levelOf(item)].color;
const placeKey = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;
const markOf = (item: RaverWatchItem): InsetMark => ({
  id: item.id, lat: item.point!.lat, lon: item.point!.lon, color: colourOf(item), cancelled: item.cancelled === true,
});
/** A scene event's own hours, or when its note applies. */
const hoursOf = (item: RaverWatchItem) => ({ start: item.start ?? item.validFrom, end: item.end ?? item.validUntil });

/**
 * A box around these points, square in kilometres, centred on them: padded by a
 * share of its side, at least `padMinKm`, and no smaller than `minKm`.
 */
function squareBounds(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  { padShare, padMinKm, minKm }: { padShare: number; padMinKm: number; minKm: number },
): CardInset['bounds'] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const widthKm = (Math.max(...lons) - Math.min(...lons)) * cos * KM_PER_DEGREE;
  const heightKm = (Math.max(...lats) - Math.min(...lats)) * KM_PER_DEGREE;
  const spread = Math.max(widthKm, heightKm);
  const half = Math.max(spread + 2 * Math.max(spread * padShare, padMinKm), minKm) / 2;
  return {
    west: lon0 - half / (KM_PER_DEGREE * cos),
    east: lon0 + half / (KM_PER_DEGREE * cos),
    south: lat0 - half / KM_PER_DEGREE,
    north: lat0 + half / KM_PER_DEGREE,
  };
}

const ringsOf = (geometry: PolygonGeometry): Ring[] => (geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat());

function boxOf(geometry: PolygonGeometry): CardInset['bounds'] {
  const points = ringsOf(geometry).flat();
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
}

const boxesMeet = (a: CardInset['bounds'], b: CardInset['bounds']) =>
  a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;

/**
 * Whether any of an outline is in view: one of its edges crosses the box, or
 * it holds the box whole. Boxes alone are not enough: Canada's reaches 41.7°N
 * at an island in Lake Erie, under California's.
 */
function inView(geometry: PolygonGeometry, bounds: CardInset['bounds']): boolean {
  if (!boxesMeet(boxOf(geometry), bounds)) return false;
  const box = { x: bounds.west, y: bounds.south, width: bounds.east - bounds.west, height: bounds.north - bounds.south };
  for (const ring of ringsOf(geometry)) {
    for (let i = 1; i < ring.length; i++) {
      if (clipped({ x: ring[i - 1][0], y: ring[i - 1][1] }, { x: ring[i][0], y: ring[i][1] }, box)) return true;
    }
  }
  return pointInGeometry((bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2, geometry);
}

/**
 * What a close-up of this item draws: its neighbours among the items drawn,
 * and, for a heat town, its state's outline. Or why it cannot be drawn.
 */
export function insetFor(
  featured: RaverWatchItem,
  drawn: readonly RaverWatchItem[],
  states?: UsStates,
  territories?: TerritoryIndex,
): CardInset | CloseUpRefusal {
  const kind = closeUpKind(featured);
  if (typeof kind !== 'string') return kind;
  return kind === 'venues' ? venuesInset(featured, drawn) : heatInset(featured, drawn, states, territories);
}

/** The public venues open the same night within 25 km, one mark a venue, a live night before a cancelled one. */
function venuesInset(featured: RaverWatchItem, drawn: readonly RaverWatchItem[]): CardInset {
  const at = { lat: featured.point!.lat, lon: featured.point!.lon };
  const night = hoursOf(featured);
  const byVenue = new Map<string, InsetMark>();
  for (const item of drawn) {
    if (item.id === featured.id || item.layer !== 'SceneEvents' || item.precision !== 'venue' || !item.point || item.sceneNews) continue;
    const hours = hoursOf(item);
    if (!(hours.start < night.end && hours.end > night.start)) continue;
    if (kmBetween(item.point, at) > VENUE_RADIUS_KM) continue;
    const key = placeKey(item.point);
    if (key === placeKey(at)) continue;
    const held = byVenue.get(key);
    if (!held || (held.cancelled && !item.cancelled)) byVenue.set(key, markOf(item));
  }
  const others = [...byVenue.values()];
  return {
    kind: 'venues',
    featured: { ...markOf(featured), label: featured.venue ?? null },
    others,
    outlines: [],
    bounds: squareBounds([at, ...others], { padShare: VENUE_PAD_SHARE, padMinKm: VENUE_PAD_MIN_KM, minKm: VENUE_MIN_KM }),
    title: 'Public venues the same night',
    within: `within ${VENUE_RADIUS_KM} km`,
    placedTo: 'about 150 m',
    gridKm: GRID_KM,
  };
}

/** How bad a heat note's day is: the NWS level, or its colour's when it states none. */
const riskOf = (item: RaverWatchItem) => item.heatRisk ?? (item.level === 'red' ? 3 : item.level === 'amber' ? 2 : 0);

/** The heat towns of the featured town's state the same day, each at its worst, inside the state's lines. */
function heatInset(
  featured: RaverWatchItem,
  drawn: readonly RaverWatchItem[],
  states: UsStates | undefined,
  territories: TerritoryIndex | undefined,
): CardInset | CloseUpRefusal {
  const code = featured.jurisdiction!;
  if (!states) return { refused: `The close-up needs the outline of ${code}, which could not be loaded from Starcom: try again.` };
  const own = states.get(code);
  if (!own) return { refused: `Starcom has no outline for ${code}, and a heat town's close-up draws its state.` };
  const byTown = new Map<string, RaverWatchItem>();
  for (const item of drawn) {
    if (item.layer !== 'HeatRisk' || item.jurisdiction !== code || !item.point) continue;
    if (Math.abs(item.validUntil - featured.validUntil) > SAME_DAY_S) continue;
    const key = placeKey(item.point);
    const held = byTown.get(key);
    if (!held || riskOf(item) > riskOf(held)) byTown.set(key, item);
  }
  // The featured town is the featured note's mark.
  byTown.delete(placeKey(featured.point!));
  const ownBox = boxOf(own.geometry);
  const bounds = squareBounds(
    [{ lat: ownBox.south, lon: ownBox.west }, { lat: ownBox.north, lon: ownBox.east }],
    { padShare: STATE_PAD_SHARE, padMinKm: 0, minKm: 0 },
  );
  const around = [...states.entries()]
    .filter(([other, state]) => other !== code && inView(state.geometry, bounds))
    .map(([, state]) => ({ name: state.name, geometry: state.geometry, own: false }));
  // Every other country in view (IM37); never the state's own, whose states are drawn finer.
  const country = code.slice(0, 2).toUpperCase();
  const countries = (territories?.countries() ?? [])
    .filter(({ code: other }) => other !== country)
    .flatMap(({ code: other }) => {
      const found = territories!.byCode(other);
      return found && inView(found.geometry, bounds) ? [{ name: found.name, geometry: found.geometry, own: false }] : [];
    });
  return {
    kind: 'heat',
    featured: { ...markOf(featured), label: null },
    others: [...byTown.values()].map(markOf),
    outlines: [{ name: own.name, geometry: own.geometry, own: true }, ...around, ...countries],
    bounds,
    title: `${own.name}: HeatRisk the same day`,
    within: own.name,
    placedTo: 'about 11 km',
    gridKm: null,
  };
}

// ── On the card ──────────────────────────────────────────────────────────────

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
export interface Segment { x1: number; y1: number; x2: number; y2: number }

export interface InsetLayoutInput {
  /** The picture's place on the card. */
  picture: Rect;
  /** The featured item's mark on the globe, in card pixels. */
  anchor: Point;
  /** What the inset must not cover: the featured item's label. */
  avoid: readonly Rect[];
  /** The picture's other marks, in card pixels: the inset covers as few as it can. */
  marks: readonly Point[];
  /** The country names drawn in the picture, in card pixels: between corners as good otherwise, the one over fewest. */
  names?: readonly Rect[];
  style: { padding: number; caveatPx: number };
  measure: MeasureText;
}

export interface InsetLayout {
  /** The inset's frame, in card pixels. */
  rect: Rect;
  /** Where its geography is drawn. */
  map: Rect;
  /** How many of the picture's marks it covers. */
  covers: number;
  /** Whether it lies over the featured item's label, when no corner could avoid it. */
  overLabel: boolean;
  pxPerKm: number;
  /** The grid drawn, in kilometres: the one asked for, or coarser when its lines would crowd. */
  gridKm: number | null;
  /** From the item's mark on the globe to the inset. */
  leader: { from: Point; to: Point };
  grid: Segment[];
  /** A heat town's state, filled. */
  fills: Point[][];
  /** Every state line, cut to the map. */
  strokes: Segment[];
  /** The neighbours, in the order of the inset's `others`. */
  marks: Array<Point & { radius: number; color: string; cancelled: boolean }>;
  featured: Point & { radius: number; ringRadius: number; color: string; cancelled: boolean };
  /** The featured venue's name beside its ring, over a box of the inset's ground. */
  label: { text: string; x: number; y: number; fontPx: number; box: Rect } | null;
  title: { text: string; x: number; y: number; fontPx: number };
  /** The bar, from (x, y) across `width`, and its length beside it. */
  scale: { x: number; y: number; width: number; text: string; fontPx: number; textX: number; textY: number };
  /** What it shows and how finely, wrapped at its separators. */
  note: { text: string; fontPx: number; lines: Array<{ text: string; x: number; y: number }> };
}

const contains = (r: Rect, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const meets = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const nearestOn = (r: Rect, p: Point): Point => ({
  x: Math.min(Math.max(p.x, r.x), r.x + r.width),
  y: Math.min(Math.max(p.y, r.y), r.y + r.height),
});

/** Text that fits a width: shortened at a word, with an ellipsis, when it does not. */
function fitted(text: string, fontPx: number, width: number, measure: MeasureText, weight?: number): string {
  let out = text;
  while (measure(out, fontPx, weight) > width && out.length > 2) out = shortenAtWord(out.replace(/…$/, ''), out.length - 2);
  return out;
}

/** Parts joined with ` · ` while they fit a line, never cut between them. */
function wrapped(parts: readonly string[], fontPx: number, width: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const last = lines[lines.length - 1];
    if (last !== undefined && measure(`${last} · ${part}`, fontPx) <= width) lines[lines.length - 1] = `${last} · ${part}`;
    else lines.push(fitted(part, fontPx, width, measure));
  }
  return lines;
}

/** Liang–Barsky: the part of a segment inside a rectangle, or null. */
function clipped(a: Point, b: Point, r: Rect): Segment | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.width - a.x], [-dy, a.y - r.y], [dy, r.y + r.height - a.y]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return { x1: a.x + t0 * dx, y1: a.y + t0 * dy, x2: a.x + t1 * dx, y2: a.y + t1 * dy };
}

const scaleText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

/**
 * Where the inset sits in the picture and everything it draws (IM35): a square
 * in the corner that keeps clear of the item and its label, covers the fewest
 * of the picture's marks, and lies farthest from the item, in that order; ties
 * go bottom-left, bottom-right, top-left, top-right, as insets usually sit.
 */
export function layoutInset(inset: CardInset, input: InsetLayoutInput): InsetLayout {
  const { picture, anchor, style, measure } = input;
  const side = Math.round(INSET_SHARE * Math.min(picture.width, picture.height));
  const margin = Math.round(style.padding / 2);
  const left = picture.x + margin;
  const right = picture.x + picture.width - margin - side;
  const top = picture.y + margin;
  const bottom = picture.y + picture.height - margin - side;
  const corners = [{ x: left, y: bottom }, { x: right, y: bottom }, { x: left, y: top }, { x: right, y: top }]
    .map((corner) => {
      const rect = { ...corner, width: side, height: side };
      const clear = { x: rect.x - GLYPH_EDGE_PX, y: rect.y - GLYPH_EDGE_PX, width: side + 2 * GLYPH_EDGE_PX, height: side + 2 * GLYPH_EDGE_PX };
      const near = nearestOn(rect, anchor);
      return {
        rect,
        onItem: contains(clear, anchor),
        overLabel: input.avoid.some((box) => meets(box, rect)),
        covers: input.marks.filter((mark) => contains(rect, mark)).length,
        names: (input.names ?? []).filter((name) => meets(name, rect)).length,
        distance: Math.hypot(near.x - anchor.x, near.y - anchor.y),
      };
    });
  const chosen = [...corners].sort((a, b) => Number(a.onItem) - Number(b.onItem)
    || Number(a.overLabel) - Number(b.overLabel)
    || a.covers - b.covers
    || a.names - b.names
    || b.distance - a.distance)[0];
  const rect = chosen.rect;

  // Inside it: the title, the map, the scale bar, and the note, in type no larger
  // than the card's caveats and smaller in a small inset, so its map keeps the room.
  const pad = Math.max(8, Math.round(side * 0.035));
  const titlePx = Math.min(style.caveatPx, Math.max(11, Math.round(side * 0.06)));
  const smallPx = Math.max(10, Math.round(titlePx * 0.85));
  const gap = Math.round(smallPx * 0.4);
  const inner = { x: rect.x + pad, y: rect.y + pad, width: side - 2 * pad, height: side - 2 * pad };
  const { west, south, east, north } = inset.bounds;
  const lat0 = (north + south) / 2;
  const lon0 = (east + west) / 2;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const widthKm = (east - west) * cos * KM_PER_DEGREE;
  const heightKm = (north - south) * KM_PER_DEGREE;
  const noteParts = (gridKm: number | null) => (inset.kind === 'venues'
    ? [inset.within, `placed to ${inset.placedTo}`, ...(gridKm !== null ? [`${gridKm} km grid`] : [])]
    : [`towns placed to ${inset.placedTo}`]);
  const mapFor = (noteLines: number): Rect => {
    const y = inner.y + titlePx + gap;
    return { x: inner.x, y, width: inner.width, height: inner.height - titlePx - smallPx * (1 + noteLines) - gap * (2 + noteLines) };
  };
  // The grid is said in the note, and the note's lines take the map's height: settled in two passes at most.
  let gridKm = inset.gridKm;
  let noteLines = wrapped(noteParts(gridKm), smallPx, inner.width, measure);
  let map = mapFor(noteLines.length);
  let pxPerKm = Math.min(map.width / widthKm, map.height / heightKm);
  for (let pass = 0; pass < 2 && inset.gridKm !== null; pass++) {
    const step = GRID_STEPS_KM.find((km) => km >= inset.gridKm! && km * pxPerKm >= GRID_MIN_PX) ?? GRID_STEPS_KM[GRID_STEPS_KM.length - 1];
    if (step === gridKm) break;
    gridKm = step;
    noteLines = wrapped(noteParts(gridKm), smallPx, inner.width, measure);
    map = mapFor(noteLines.length);
    pxPerKm = Math.min(map.width / widthKm, map.height / heightKm);
  }

  const cx = map.x + map.width / 2;
  const cy = map.y + map.height / 2;
  const project = (lat: number, lon: number): Point => ({
    x: cx + (lon - lon0) * cos * KM_PER_DEGREE * pxPerKm,
    y: cy - (lat - lat0) * KM_PER_DEGREE * pxPerKm,
  });

  const grid: Segment[] = [];
  if (gridKm !== null) {
    const step = gridKm * pxPerKm;
    for (let k = -Math.floor(map.width / 2 / step); cx + k * step <= map.x + map.width; k++) {
      const x = cx + k * step;
      if (x >= map.x) grid.push({ x1: x, y1: map.y, x2: x, y2: map.y + map.height });
    }
    for (let k = -Math.floor(map.height / 2 / step); cy + k * step <= map.y + map.height; k++) {
      const y = cy + k * step;
      if (y >= map.y) grid.push({ x1: map.x, y1: y, x2: map.x + map.width, y2: y });
    }
  }

  const fills: Point[][] = [];
  const strokes: Segment[] = [];
  for (const outline of inset.outlines) {
    for (const ring of ringsOf(outline.geometry)) {
      const points = ring.map(([lon, lat]) => project(lat, lon));
      if (outline.own) fills.push(points);
      for (let i = 1; i < points.length; i++) {
        const segment = clipped(points[i - 1], points[i], map);
        if (segment) strokes.push(segment);
      }
    }
  }

  const radius = Math.max(3, Math.round(side * 0.011));
  const marks = inset.others.map((mark) => ({ ...project(mark.lat, mark.lon), radius, color: mark.color, cancelled: mark.cancelled }));
  const featuredRadius = Math.round(radius * 1.6);
  const featured = {
    ...project(inset.featured.lat, inset.featured.lon),
    radius: featuredRadius,
    ringRadius: featuredRadius + Math.max(3, Math.round(side * 0.009)),
    color: inset.featured.color,
    cancelled: inset.featured.cancelled,
  };

  /*
   * The venue's name by its ring, over a box of the inset's ground: right, left,
   * above or below, each slid away from the ring past any dot it touches (at
   * its edge as much as its centre) while it stays in the map; then the one
   * touching the fewest, in that order. Shortened at a word only when no side
   * holds it whole.
   */
  let label: InsetLayout['label'] = null;
  if (inset.featured.label) {
    const boxPad = 4;
    const reach = featured.ringRadius + boxPad;
    const boxHeight = smallPx + 2 * boxPad;
    const touching = (box: Rect) => marks.filter((m) => m.x + m.radius >= box.x && m.x - m.radius <= box.x + box.width
      && m.y + m.radius >= box.y && m.y - m.radius <= box.y + box.height);
    const inMap = (box: Rect) => box.x >= map.x && box.x + box.width <= map.x + map.width
      && box.y >= map.y && box.y + box.height <= map.y + map.height;
    const slid = (start: Rect, away: 'right' | 'left' | 'up' | 'down'): Rect => {
      let box = start;
      for (let step = 0; step < 8; step++) {
        const hit = touching(box);
        if (!hit.length) break;
        const next = away === 'right' ? { ...box, x: Math.max(...hit.map((m) => m.x + m.radius + 2)) }
          : away === 'left' ? { ...box, x: Math.min(...hit.map((m) => m.x - m.radius - 2)) - box.width }
            : away === 'up' ? { ...box, y: Math.min(...hit.map((m) => m.y - m.radius - 2)) - box.height }
              : { ...box, y: Math.max(...hit.map((m) => m.y + m.radius + 2)) };
        if (!inMap(next)) break;
        box = next;
      }
      return box;
    };
    const placeFor = (text: string) => {
      const width = measure(text, smallPx, FEATURED_WEIGHT) + 2 * boxPad;
      const centred = Math.min(Math.max(featured.x - width / 2, map.x), map.x + map.width - width);
      const at = (x: number, y: number) => ({ x, y, width, height: boxHeight });
      return [
        slid(at(featured.x + reach, featured.y - boxHeight / 2), 'right'),
        slid(at(featured.x - reach - width, featured.y - boxHeight / 2), 'left'),
        slid(at(centred, featured.y - reach - boxHeight), 'up'),
        slid(at(centred, featured.y + reach), 'down'),
      ].filter(inMap)
        .sort((a, b) => touching(a).length - touching(b).length)[0];
    };
    let text = inset.featured.label;
    let box = placeFor(text);
    if (!box) {
      text = fitted(text, smallPx, map.width - 2 * boxPad, measure, FEATURED_WEIGHT);
      box = placeFor(text) ?? { x: map.x, y: map.y, width: measure(text, smallPx, FEATURED_WEIGHT) + 2 * boxPad, height: boxHeight };
    }
    label = { text, x: box.x + boxPad, y: box.y + boxPad, fontPx: smallPx, box };
  }

  const km = [...SCALE_KM].reverse().find((length) => length * pxPerKm <= map.width * SCALE_SHARE) ?? SCALE_KM[0];
  const scaleY = map.y + map.height + gap;
  const scaleWidth = km * pxPerKm;
  const notesY = scaleY + smallPx + gap;
  const near = nearestOn(rect, anchor);
  const toward = Math.hypot(near.x - anchor.x, near.y - anchor.y) || 1;
  return {
    rect,
    map,
    covers: chosen.covers,
    overLabel: chosen.overLabel,
    pxPerKm,
    gridKm,
    leader: {
      from: { x: anchor.x + ((near.x - anchor.x) / toward) * GLYPH_EDGE_PX, y: anchor.y + ((near.y - anchor.y) / toward) * GLYPH_EDGE_PX },
      to: near,
    },
    grid,
    fills,
    strokes,
    marks,
    featured,
    label,
    title: { text: fitted(inset.title, titlePx, inner.width, measure), x: inner.x, y: inner.y, fontPx: titlePx },
    scale: {
      x: inner.x, y: scaleY + smallPx / 2, width: scaleWidth, text: scaleText(km), fontPx: smallPx,
      textX: inner.x + scaleWidth + gap, textY: scaleY,
    },
    note: {
      text: noteParts(gridKm).join(' · '),
      fontPx: smallPx,
      lines: noteLines.map((text, i) => ({ text, x: inner.x, y: notesY + i * (smallPx + gap) })),
    },
  };
}
