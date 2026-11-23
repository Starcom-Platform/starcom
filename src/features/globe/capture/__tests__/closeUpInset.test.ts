/**
 * Close-ups (block I, item 4; decisions IM2, IM34–IM36): the globe stays at one
 * radius or more, as the locator, and an inset in the picture's corner draws
 * the item among its neighbours, for a public venue or a heat town only.
 *
 * Read from the kept notes of 3 October with the app's own reader, at the
 * golden shots' moments: the 9:16 night card's venue and the embed heat card's
 * town. From one globe radius San Francisco's venues that night are one cluster
 * of marks, and California's heat towns overlap on its coast.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { RaverWatchStore, type RaverWatchItem } from '../../../../services/raverWatch/raverWatch';
import { standsAt, isNews } from '../../../../services/raverWatch/raverWatchView';
import { usStatesFrom } from '../../../../services/raverWatch/usStates';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { RAVER_WATCH_LEVEL_LOOK } from '../../../../components/Globe/raverWatchSprites';
import {
  closeUpKind, closeUpRefusalFor, insetFor, layoutInset, kmBetween,
  VENUE_RADIUS_KM, INSET_SHARE, type CardInset,
} from '../closeUpInset';

const ROOT = resolve(__dirname, '../../../../..');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(ROOT, 'docs/missions/01-architecture-decisions/raver-watch/raver_watch_live_2026-10-03.json'), 'utf8'));
const STATES = usStatesFrom(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/us-states-50m.geojson'), 'utf8')));
// The territory index Raver Watch already loads (useTerritories), for the countries in view (IM37).
const TERRITORIES = buildTerritoryIndex(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features);

const store = new RaverWatchStore([MECHA]);
for (const event of LIVE.events) store.accept(event);
const ITEMS = store.items();
/** What the globe draws at a moment, as useGlobeRaverWatch draws it. */
const drawnAt = (atS: number) => ITEMS.filter((item) => standsAt(item, { atS, window: null }) && !isNews(item));
const byId = (id: string) => ITEMS.find((item) => item.id === id)!;

// The golden shots' subjects and moments (imaging/golden/shots.json).
const VENUE = byId(`31923:${MECHA}:raver-scene-event-19hz-110256691da4b2c6`);
const VENUE_AT = 1791003600;
const HEAT = byId(`30023:${MECHA}:raver-heat-risk-ca-los-angeles-2026-10-03`);
const HEAT_AT = 1791050400;

const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const STYLE = { padding: 44, caveatPx: 20 };
const ok = (inset: CardInset | { refused: string }): CardInset => {
  if ('refused' in inset) throw new Error(inset.refused);
  return inset;
};

describe('what may have a close-up (IM2, IM36)', () => {
  it('a scene event at a public venue, and a heat town in a US state', () => {
    expect(VENUE.precision).toBe('venue');
    expect(closeUpKind(VENUE)).toBe('venues');
    expect(HEAT.layer).toBe('HeatRisk');
    expect(closeUpKind(HEAT)).toBe('heat');
  });

  it('not a scene event placed only to its town: a close-up would claim more than its note does', () => {
    const town = ITEMS.find((item) => item.layer === 'SceneEvents' && item.precision === 'city' && item.point)!;
    expect(closeUpKind(town)).toEqual({ refused: expect.stringMatching(/placed only to its town, about 11 km/) });
  });

  it('not a heat note without a US state, whose outline the inset draws', () => {
    expect(closeUpKind({ ...HEAT, jurisdiction: undefined })).toEqual({ refused: expect.stringMatching(/US state/) });
    expect(closeUpKind({ ...HEAT, jurisdiction: 'de' })).toEqual({ refused: expect.stringMatching(/US state/) });
  });

  it('nothing else of Raver Watch\'s: an alert, an incident, scene news', () => {
    const alert = ITEMS.find((item) => item.layer === 'DrugCheckAlerts')!;
    expect(closeUpKind(alert)).toEqual({ refused: expect.stringMatching(/only for a public venue or a heat town/) });
    expect(closeUpKind({ ...VENUE, sceneNews: true })).toEqual({ refused: expect.stringMatching(/only for a public venue or a heat town/) });
  });

  it('never an Intel Report, whose place can be a filing address; nor a War & Conflict item', () => {
    expect(closeUpRefusalFor('IntelReports')).toMatch(/never for an Intel Report.*filing address/);
    expect(closeUpRefusalFor('WarConflict')).toMatch(/only for a public venue or a heat town/);
  });
});

describe('a public venue among the night\'s others (IM34)', () => {
  const drawn = drawnAt(VENUE_AT);
  const inset = ok(insetFor(VENUE, drawn));

  it('is drawn on the globe at the shot\'s moment, with the week\'s other events', () => {
    expect(drawn).toContain(VENUE);
    expect(drawn.filter((item) => item.layer === 'SceneEvents').length).toBeGreaterThan(50);
  });

  it('names the featured venue, and draws the 9 other public venues open the same night within 25 km', () => {
    expect(inset.kind).toBe('venues');
    expect(inset.featured).toMatchObject({ id: VENUE.id, lat: 37.778, lon: -122.417, label: 'Bill Graham Civic Auditorium' });
    expect(VENUE_RADIUS_KM).toBe(25);
    expect(inset.others).toHaveLength(9);
    for (const mark of inset.others) {
      const item = byId(mark.id);
      expect(item.precision).toBe('venue');
      expect(kmBetween(mark, inset.featured)).toBeLessThanOrEqual(25);
      // The same night: its hours overlap the featured event's.
      expect(item.start! < VENUE.end! && item.end! > VENUE.start!, item.title).toBe(true);
      expect(mark.color).toBe(RAVER_WATCH_LEVEL_LOOK.info.color);
    }
  });

  it('leaves out the venues of other nights, one 68 km away the same night, and a second event at a venue drawn', () => {
    const sameNight = drawn.filter((item) => item.layer === 'SceneEvents' && item.precision === 'venue'
      && item.start! < VENUE.end! && item.end! > VENUE.start!);
    const far = sameNight.filter((item) => kmBetween({ lat: item.point!.lat, lon: item.point!.lon }, inset.featured) > 25);
    expect(far.map((item) => item.venue)).toContain('The Ritz');
    for (const item of far) expect(inset.others.map((m) => m.id)).not.toContain(item.id);
    const otherNights = drawn.filter((item) => item.layer === 'SceneEvents' && item.precision === 'venue'
      && !(item.start! < VENUE.end! && item.end! > VENUE.start!)
      && kmBetween({ lat: item.point!.lat, lon: item.point!.lon }, inset.featured) <= 25);
    expect(otherNights.length).toBe(5);
    for (const item of otherNights) expect(inset.others.map((m) => m.id)).not.toContain(item.id);
    // One mark a venue: two events at one venue are one place.
    const doubled = { ...byId(inset.others[0].id), id: 'another-event-same-venue' };
    expect(ok(insetFor(VENUE, [...drawn, doubled])).others).toHaveLength(9);
  });

  it('a city-precision scene event nearby is never among them: its point is its town\'s', () => {
    const town = { ...VENUE, id: 'town-event', precision: 'city' as const, point: { lat: 37.8, lon: -122.4 }, venue: undefined };
    expect(ok(insetFor(VENUE, [...drawn, town])).others.map((m) => m.id)).not.toContain('town-event');
  });

  it('covers them all, square in kilometres and no smaller than 2 km, on a 1 km grid', () => {
    const { west, south, east, north } = inset.bounds;
    for (const mark of [inset.featured, ...inset.others]) {
      expect(mark.lat).toBeGreaterThan(south);
      expect(mark.lat).toBeLessThan(north);
      expect(mark.lon).toBeGreaterThan(west);
      expect(mark.lon).toBeLessThan(east);
    }
    const midLat = (north + south) / 2;
    const widthKm = kmBetween({ lat: midLat, lon: west }, { lat: midLat, lon: east });
    const heightKm = kmBetween({ lat: south, lon: west }, { lat: north, lon: west });
    expect(widthKm / heightKm).toBeCloseTo(1, 1);
    expect(Math.min(widthKm, heightKm)).toBeGreaterThanOrEqual(2);
    expect(inset.gridKm).toBe(1);
    // A venue alone still spans 2 km: its 150 m is under a tenth of it.
    const alone = ok(insetFor(VENUE, [VENUE]));
    expect(alone.others).toHaveLength(0);
    expect(kmBetween({ lat: alone.bounds.south, lon: alone.bounds.west }, { lat: alone.bounds.north, lon: alone.bounds.west })).toBeCloseTo(2, 1);
  });

  it('says what it shows and how finely', () => {
    expect(inset.title).toBe('Public venues the same night');
    expect(inset.within).toBe('within 25 km');
    expect(inset.placedTo).toBe('about 150 m');
    expect(inset.outlines).toEqual([]);
  });

  it('a cancelled venue night is drawn as cancelled', () => {
    const called = { ...byId(inset.others[0].id), cancelled: true };
    const drawnWith = drawn.map((item) => (item.id === called.id ? called : item));
    expect(ok(insetFor(VENUE, drawnWith)).others.find((m) => m.id === called.id)?.cancelled).toBe(true);
  });

  it('a venue with a live night and a cancelled one is drawn live, whichever came first', () => {
    const live = byId(inset.others[0].id);
    const called = { ...live, id: 'called-off', cancelled: true };
    for (const order of [[called, ...drawn], [...drawn, called]]) {
      const mark = ok(insetFor(VENUE, order)).others.find((m) => m.lat === live.point!.lat && m.lon === live.point!.lon);
      expect(mark?.cancelled).toBe(false);
    }
  });

  it('another event at the featured venue is the featured mark, not a neighbour', () => {
    const sameVenue = { ...VENUE, id: 'second-room' };
    const with2 = ok(insetFor(VENUE, [...drawn, sameVenue]));
    expect(with2.others).toHaveLength(9);
    expect(with2.others.some((m) => m.lat === VENUE.point!.lat && m.lon === VENUE.point!.lon)).toBe(false);
  });
});

describe('a heat town among its state\'s the same day (IM34)', () => {
  const drawn = drawnAt(HEAT_AT);
  const inset = ok(insetFor(HEAT, drawn, STATES));

  it('draws California\'s 12 other heat towns of the same day, each at its level\'s colour', () => {
    expect(inset.kind).toBe('heat');
    expect(inset.featured).toMatchObject({ id: HEAT.id, lat: 34.1, lon: -118.2, color: RAVER_WATCH_LEVEL_LOOK.red.color });
    expect(inset.others).toHaveLength(12);
    const colours = inset.others.map((m) => m.color);
    expect(colours.filter((c) => c === RAVER_WATCH_LEVEL_LOOK.red.color)).toHaveLength(6);
    expect(colours.filter((c) => c === RAVER_WATCH_LEVEL_LOOK.amber.color)).toHaveLength(6);
  });

  it('not the other days the globe draws at that moment, nor another state\'s towns', () => {
    const inState = drawn.filter((item) => item.layer === 'HeatRisk' && item.jurisdiction === 'us-ca');
    expect(inState.length).toBe(40);
    expect(new Set(inState.map((item) => item.validUntil)).size).toBe(7);
    for (const mark of inset.others) {
      const item: RaverWatchItem = byId(mark.id);
      expect(item.jurisdiction).toBe('us-ca');
      expect(Math.abs(item.validUntil - HEAT.validUntil)).toBeLessThanOrEqual(6 * 3600);
    }
  });

  it('a town with two notes the same day is drawn at the worse', () => {
    const amber = byId(inset.others.find((m) => m.color === RAVER_WATCH_LEVEL_LOOK.amber.color)!.id);
    const worse = { ...amber, id: 'worse-note', level: 'red' as const, heatRisk: 3 };
    for (const order of [[...drawn, worse], [worse, ...drawn]]) {
      const mark = ok(insetFor(HEAT, order, STATES)).others.find((m) => m.lat === amber.point!.lat && m.lon === amber.point!.lon);
      expect(mark?.color).toBe(RAVER_WATCH_LEVEL_LOOK.red.color);
    }
  });

  it('inside Starcom\'s own state lines: California filled, its neighbours outlined', () => {
    const own = inset.outlines.filter((o) => o.own);
    expect(own.map((o) => o.name)).toEqual(['California']);
    const neighbours = inset.outlines.filter((o) => !o.own).map((o) => o.name);
    expect(neighbours).toEqual(expect.arrayContaining(['Nevada', 'Arizona', 'Oregon']));
    expect(neighbours).not.toContain('Texas');
    const { west, south, east, north } = inset.bounds;
    expect(west).toBeLessThan(-124.4);
    expect(east).toBeGreaterThan(-114.1);
    expect(south).toBeLessThan(32.5);
    expect(north).toBeGreaterThan(42);
  });

  it('says what it shows and how finely, with no grid', () => {
    expect(inset.title).toBe('California: HeatRisk the same day');
    expect(inset.within).toBe('California');
    expect(inset.placedTo).toBe('about 11 km');
    expect(inset.gridKm).toBeNull();
  });

  it('with every other country in view outlined (IM37), never the one its states draw', () => {
    const withCountries = ok(insetFor(HEAT, drawn, STATES, TERRITORIES));
    const countries = withCountries.outlines.filter((o) => !o.own && !STATES.has(`us-${o.name}`));
    expect(withCountries.outlines.map((o) => o.name)).toContain('Mexico');
    expect(withCountries.outlines.map((o) => o.name)).not.toContain('United States of America');
    expect(withCountries.outlines.filter((o) => o.own).map((o) => o.name)).toEqual(['California']);
    expect(countries.length).toBeGreaterThan(0);
    // Far countries are not drawn.
    expect(withCountries.outlines.map((o) => o.name)).not.toContain('Canada');
    // Without the index, the states alone, as before.
    expect(inset.outlines.map((o) => o.name)).not.toContain('Mexico');
  });

  it('is refused when its state\'s outline could not be loaded', () => {
    expect(insetFor(HEAT, drawn, undefined)).toEqual({ refused: expect.stringMatching(/outline of us-ca, which could not be loaded/) });
    expect(insetFor({ ...HEAT, jurisdiction: 'us-zz' }, drawn, STATES)).toEqual({ refused: expect.stringMatching(/no outline for us-zz/) });
  });
});

describe('where the inset sits, and what it draws (IM35)', () => {
  // The 9:16's picture: 1080 wide under its title band.
  const picture = { x: 0, y: 190, width: 1080, height: 1178 };
  const anchor = { x: 540, y: 779 };
  const label = { x: 560, y: 700, width: 420, height: 40 };
  const venues = ok(insetFor(VENUE, drawnAt(VENUE_AT)));
  const at = (overrides: Partial<Parameters<typeof layoutInset>[1]> = {}) => layoutInset(venues, {
    picture, anchor, avoid: [label], marks: [], style: STYLE, measure, ...overrides,
  });

  it('a square of 0.42 of the picture\'s shorter side, inside it, clear of the item and its label', () => {
    const layout = at();
    expect(INSET_SHARE).toBe(0.42);
    expect(layout.rect.width).toBe(Math.round(0.42 * 1080));
    expect(layout.rect.height).toBe(layout.rect.width);
    expect(layout.rect.x).toBeGreaterThanOrEqual(picture.x + STYLE.padding / 2);
    expect(layout.rect.y).toBeGreaterThanOrEqual(picture.y + STYLE.padding / 2);
    expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(picture.x + picture.width - STYLE.padding / 2);
    expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(picture.y + picture.height - STYLE.padding / 2);
    const inside = (p: { x: number; y: number }) => p.x >= layout.rect.x && p.x <= layout.rect.x + layout.rect.width
      && p.y >= layout.rect.y && p.y <= layout.rect.y + layout.rect.height;
    expect(inside(anchor)).toBe(false);
    const overlaps = !(label.x + label.width < layout.rect.x || label.x > layout.rect.x + layout.rect.width
      || label.y + label.height < layout.rect.y || label.y > layout.rect.y + layout.rect.height);
    expect(overlaps).toBe(false);
    expect(layout.overLabel).toBe(false);
  });

  it('in the corner that covers fewest of the picture\'s marks, then the one farthest from the item', () => {
    // Marks crowd the two left corners: a right corner, and with the item nearer the top, the bottom one.
    const crowded = [
      { x: 60, y: 260 }, { x: 120, y: 300 }, { x: 80, y: 1300 }, { x: 200, y: 1250 }, { x: 150, y: 1100 },
    ];
    const layout = at({ marks: crowded, anchor: { x: 540, y: 500 }, avoid: [] });
    expect(layout.rect.x).toBeGreaterThan(picture.width / 2);
    expect(layout.rect.y).toBeGreaterThan(picture.y + picture.height / 2);
    expect(layout.covers).toBe(0);
    // Every corner covered: the fewest, and said.
    const everywhere = [
      { x: 100, y: 300 }, { x: 980, y: 300 }, { x: 100, y: 1300 }, { x: 980, y: 1300 }, { x: 1000, y: 1250 },
    ];
    expect(at({ marks: everywhere, avoid: [] }).covers).toBe(1);
  });

  it('over the fewest country names where marks and the item do not decide, and as before without names', () => {
    const free = { anchor: { x: 540, y: 500 }, avoid: [] };
    const before = at(free);
    expect(at({ ...free, names: [] }).rect).toEqual(before.rect);
    const meets = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const name = { x: before.rect.x + 10, y: before.rect.y + 10, width: 80, height: 16 };
    const moved = at({ ...free, names: [name] });
    expect(meets(name, moved.rect)).toBe(false);
    // A mark weighs more than any number of names.
    const others = [{ x: 980, y: 1300 }, { x: 100, y: 300 }, { x: 980, y: 300 }];
    expect(at({ ...free, marks: others, names: [name, name, name] }).rect).toEqual(before.rect);
    // A name more than the distance from the item: the nearer corner, clear of it, over the farther.
    const offCentre = { anchor: { x: 400, y: 500 }, avoid: [] };
    const far = at(offCentre);
    const overFar = { x: far.rect.x + 10, y: far.rect.y + 10, width: 80, height: 16 };
    const near = at({ ...offCentre, names: [overFar] });
    expect(meets(overFar, near.rect)).toBe(false);
    expect(near.rect.y).toBe(far.rect.y);
  });

  it('never over the item, nor its label, while a corner is clear of them', () => {
    // The item in the bottom-left corner, and its label in the bottom-right: a top corner.
    const low = { x: 120, y: 1250 };
    const lowLabel = { x: 700, y: 1200, width: 300, height: 40 };
    const layout = at({ anchor: low, avoid: [lowLabel] });
    expect(layout.rect.y).toBeLessThan(picture.y + picture.height / 2);
    const inside = (p: { x: number; y: number }) => p.x >= layout.rect.x && p.x <= layout.rect.x + layout.rect.width
      && p.y >= layout.rect.y && p.y <= layout.rect.y + layout.rect.height;
    expect(inside(low)).toBe(false);
    expect(layout.overLabel).toBe(false);
    // Over a label only when no corner is clear of it, and said.
    const everywhere = [
      { x: 30, y: 210, width: 1020, height: 40 },
      { x: 30, y: 1320, width: 1020, height: 40 },
    ];
    expect(at({ avoid: everywhere }).overLabel).toBe(true);
  });

  it('never over the item, even where the item\'s own corner covers fewest marks', () => {
    const low = { x: 120, y: 1250 };
    // A mark in every corner but the item's.
    const marks = [{ x: 980, y: 1300 }, { x: 100, y: 300 }, { x: 980, y: 300 }];
    const layout = at({ anchor: low, avoid: [], marks });
    const inside = (p: { x: number; y: number }) => p.x >= layout.rect.x && p.x <= layout.rect.x + layout.rect.width
      && p.y >= layout.rect.y && p.y <= layout.rect.y + layout.rect.height;
    expect(inside(low)).toBe(false);
    expect(layout.covers).toBe(1);
  });

  it('never over the label, even in the corner farthest from the item', () => {
    // The item near the top: the bottom corners are farthest, and the label lies in the bottom-left one.
    const label_ = { x: 60, y: 1100, width: 240, height: 40 };
    const layout = at({ anchor: { x: 540, y: 300 }, avoid: [label_] });
    expect(layout.rect.y).toBeGreaterThan(picture.y + picture.height / 2);
    expect(layout.rect.x).toBeGreaterThan(picture.width / 2);
    expect(layout.overLabel).toBe(false);
  });

  it('keeps the name off a dot its box would touch, though the dot\'s centre is outside it', () => {
    const bounds = { west: -0.03, south: -0.03, east: 0.03, north: 0.03 };
    // A short name, which fits on the right of its ring, where it goes when nothing is in the way.
    const lone: CardInset = { ...venues, featured: { ...venues.featured, lat: 0, lon: 0, label: 'The Midway' }, others: [], bounds };
    const first = layoutInset(lone, { picture, anchor, avoid: [label], marks: [], style: STYLE, measure });
    expect(first.label!.box.x).toBeGreaterThan(first.featured.x);
    // A dot just short of where the name would start on the right: its edge under the box, its centre not.
    const kmPerDegree = (Math.PI / 180) * 6371.0088;
    const dx = first.featured.ringRadius + 4 - 2;
    const dot = { id: 'near', lat: 0, lon: dx / (first.pxPerKm * kmPerDegree), color: '#c77dff', cancelled: false };
    const layout = layoutInset({ ...lone, others: [dot] }, { picture, anchor, avoid: [label], marks: [], style: STYLE, measure });
    const [mark] = layout.marks;
    expect(mark.x).toBeCloseTo(layout.featured.x + dx, 3);
    const box = layout.label!.box;
    const touches = mark.x + mark.radius >= box.x && mark.x - mark.radius <= box.x + box.width
      && mark.y + mark.radius >= box.y && mark.y - mark.radius <= box.y + box.height;
    expect(touches).toBe(false);
  });

  it('with dots by its ring on every side, the name slides past them rather than cover one', () => {
    const bounds = { west: -0.03, south: -0.03, east: 0.03, north: 0.03 };
    const lone: CardInset = { ...venues, featured: { ...venues.featured, lat: 0, lon: 0, label: 'The Midway' }, others: [], bounds };
    const first = layoutInset(lone, { picture, anchor, avoid: [label], marks: [], style: STYLE, measure });
    const degreesFor = (px: number) => px / (first.pxPerKm * ((Math.PI / 180) * 6371.0088));
    const near = first.featured.ringRadius + 6;
    const dot = (id: string, dxPx: number, dyPx: number) => ({ id, lat: degreesFor(-dyPx), lon: degreesFor(dxPx), color: '#c77dff', cancelled: false });
    const layout = layoutInset({ ...lone, others: [dot('e', near, 0), dot('w', -near, 0), dot('n', 0, -near), dot('s', 0, near)] }, {
      picture, anchor, avoid: [label], marks: [], style: STYLE, measure,
    });
    const box = layout.label!.box;
    for (const mark of layout.marks) {
      const touches = mark.x + mark.radius >= box.x && mark.x - mark.radius <= box.x + box.width
        && mark.y + mark.radius >= box.y && mark.y - mark.radius <= box.y + box.height;
      expect(touches).toBe(false);
    }
    // Still on the right of its ring, past the dot there.
    expect(box.x).toBeGreaterThan(layout.marks[0].x);
    expect(box.y).toBeLessThan(layout.featured.y);
    expect(box.y + box.height).toBeGreaterThan(layout.featured.y);
  });

  it('a name too long for either side of its ring goes above or below it, inside the map, before it is shortened', () => {
    const long = { ...venues, featured: { ...venues.featured, label: 'Bill Graham Civic Auditorium and its Annex' } };
    const layout = layoutInset(long, { picture, anchor, avoid: [label], marks: [], style: STYLE, measure });
    const box = layout.label!.box;
    expect(layout.label!.text).toBe('Bill Graham Civic Auditorium and its Annex');
    expect(box.x).toBeGreaterThanOrEqual(layout.map.x);
    expect(box.x + box.width).toBeLessThanOrEqual(layout.map.x + layout.map.width);
    expect(box.y).toBeGreaterThanOrEqual(layout.map.y);
    expect(box.y + box.height).toBeLessThanOrEqual(layout.map.y + layout.map.height);
    // Above or below the ring, not beside it.
    const besideRing = box.y < layout.featured.y && box.y + box.height > layout.featured.y;
    expect(besideRing).toBe(false);
  });

  it('draws every mark inside its map, at one scale across and down', () => {
    const layout = at();
    const { map } = layout;
    for (const mark of [...layout.marks, layout.featured]) {
      expect(mark.x).toBeGreaterThan(map.x);
      expect(mark.x).toBeLessThan(map.x + map.width);
      expect(mark.y).toBeGreaterThan(map.y);
      expect(mark.y).toBeLessThan(map.y + map.height);
    }
    // Two venues' distance on the inset, over their distance on the ground: the scale, whichever way they lie.
    const [a, b] = [venues.others[0], venues.others[1]];
    const [pa, pb] = [layout.marks[0], layout.marks[1]];
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y) / kmBetween(a, b)).toBeCloseTo(layout.pxPerKm, -1);
    expect(Math.abs(Math.hypot(pa.x - pb.x, pa.y - pb.y) / kmBetween(a, b) / layout.pxPerKm - 1)).toBeLessThan(0.01);
    expect(layout.featured.ringRadius).toBeGreaterThan(layout.featured.radius);
  });

  it('a 1 km grid, and a scale bar of a round length under a third of the map', () => {
    const layout = at();
    expect(layout.gridKm).toBe(1);
    const xs = [...new Set(layout.grid.filter((s) => s.x1 === s.x2).map((s) => s.x1))].sort((p, q) => p - q);
    expect(xs.length).toBeGreaterThan(2);
    expect(xs[1] - xs[0]).toBeCloseTo(layout.pxPerKm, 5);
    for (const s of layout.grid) {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        expect(x).toBeGreaterThanOrEqual(layout.map.x - 0.001);
        expect(x).toBeLessThanOrEqual(layout.map.x + layout.map.width + 0.001);
        expect(y).toBeGreaterThanOrEqual(layout.map.y - 0.001);
        expect(y).toBeLessThanOrEqual(layout.map.y + layout.map.height + 0.001);
      }
    }
    const km = Number.parseFloat(layout.scale.text) / (layout.scale.text.endsWith(' m') ? 1000 : 1);
    expect([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]).toContain(km);
    expect(layout.scale.width).toBeCloseTo(km * layout.pxPerKm, 5);
    expect(layout.scale.width).toBeLessThanOrEqual(layout.map.width / 3);
    expect(layout.scale.width).toBeGreaterThan(layout.map.width / 12);
  });

  it('a coarser grid when 1 km squares would be under 8 px, and says which', () => {
    // The featured venue with a same-night venue 24 km away, on a small square card's picture.
    const far = { ...byId(venues.others[0].id), id: 'far-venue', point: { lat: VENUE.point!.lat + 0.2, lon: VENUE.point!.lon + 0.1 } };
    const wide = ok(insetFor(VENUE, [VENUE, far]));
    const layout = layoutInset(wide, { picture: { x: 0, y: 140, width: 1080, height: 486 }, anchor: { x: 540, y: 383 }, avoid: [], marks: [], style: STYLE, measure });
    expect(layout.pxPerKm).toBeLessThan(8);
    expect(layout.gridKm).toBeGreaterThan(1);
    expect(layout.gridKm! * layout.pxPerKm).toBeGreaterThanOrEqual(8);
    expect(layout.note.text).toContain(`${layout.gridKm} km grid`);
    // Too long for the small inset in one line: wrapped at its separators, never cut.
    expect(layout.note.lines.length).toBeGreaterThan(1);
    expect(layout.note.lines.map((l) => l.text).join(' · ')).toBe(layout.note.text);
    for (const line of layout.note.lines) {
      expect(line.x + measure(line.text, layout.note.fontPx)).toBeLessThanOrEqual(layout.rect.x + layout.rect.width);
    }
  });

  it('names the featured venue beside its ring, the title and note fitting the inset', () => {
    const layout = at();
    expect(layout.label?.text).toBe('Bill Graham Civic Auditorium');
    expect(layout.title.text).toBe('Public venues the same night');
    expect(layout.note.text).toBe('within 25 km · placed to about 150 m · 1 km grid');
    expect(layout.note.lines.map((l) => l.text)).toEqual([layout.note.text]);
    for (const line of [layout.title, ...layout.note.lines.map((l) => ({ ...l, fontPx: layout.note.fontPx })), layout.label!]) {
      expect(line.x).toBeGreaterThanOrEqual(layout.rect.x);
      expect(line.x + measure(line.text, line.fontPx)).toBeLessThanOrEqual(layout.rect.x + layout.rect.width);
    }
    const tiny = layoutInset({ ...venues, title: 'Public venues the same night, and a great deal more besides that will not fit' }, {
      picture, anchor, avoid: [label], marks: [], style: STYLE, measure,
    });
    expect(tiny.title.text.endsWith('…')).toBe(true);
    expect(tiny.title.x + measure(tiny.title.text, tiny.title.fontPx)).toBeLessThanOrEqual(tiny.rect.x + tiny.rect.width);
  });

  it('a leader from the item\'s mark on the globe to the inset', () => {
    const layout = at();
    const { from, to } = layout.leader;
    // From the glyph's edge, not its centre: 18 px out, toward the inset.
    expect(Math.hypot(from.x - anchor.x, from.y - anchor.y)).toBeCloseTo(18, 5);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThan(Math.hypot(to.x - anchor.x, to.y - anchor.y));
    const onEdge = (to.x === layout.rect.x || to.x === layout.rect.x + layout.rect.width)
      || (to.y === layout.rect.y || to.y === layout.rect.y + layout.rect.height);
    expect(onEdge).toBe(true);
  });

  it('a heat inset: the state filled and every line clipped to the map, no grid', () => {
    const heat = ok(insetFor(HEAT, drawnAt(HEAT_AT), STATES));
    const layout = layoutInset(heat, { picture: { x: 0, y: 0, width: 800, height: 800 }, anchor: { x: 400, y: 400 }, avoid: [], marks: [], style: STYLE, measure });
    expect(layout.grid).toEqual([]);
    expect(layout.gridKm).toBeNull();
    // California's own rings filled, and no other state's.
    const california = STATES.get('us-ca')!.geometry;
    const rings = california.type === 'Polygon' ? california.coordinates.length : california.coordinates.flat().length;
    expect(layout.fills).toHaveLength(rings);
    expect(layout.strokes.length).toBeGreaterThan(100);
    const { map } = layout;
    for (const s of layout.strokes) {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        expect(x).toBeGreaterThanOrEqual(map.x - 0.001);
        expect(x).toBeLessThanOrEqual(map.x + map.width + 0.001);
        expect(y).toBeGreaterThanOrEqual(map.y - 0.001);
        expect(y).toBeLessThanOrEqual(map.y + map.height + 0.001);
      }
    }
    expect(layout.label).toBeNull();
    expect(layout.note.text).toBe('towns placed to about 11 km');
    // California is about 1,240 km long: a 200 km bar.
    expect(layout.scale.text).toBe('200 km');
  });
});
