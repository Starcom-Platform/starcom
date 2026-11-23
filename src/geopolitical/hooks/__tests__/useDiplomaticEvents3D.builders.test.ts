/**
 * Diplomacy's marks and arcs, after aggregation.
 *
 * These builders drew one sphere per (event, country) and one arc per event: 4,170
 * spheres over 125 countries and 2,085 arcs over 326 pairs, from the shipped snapshot,
 * with a country's whole stack at its single centroid. So the tests that used to live
 * here — "one marker per actor per event", "one connection per real bilateral event" —
 * were pinning the defect. What matters now is that every country and every pair is
 * counted exactly once, and that the count is what sets a mark's size.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { batchedLines } from '../../geometry/lineBatches';
import { diplomaticEventColor, DIPLOMATIC_CONNECTION_COLOR, DIPLOMATIC_CONFLICT_COLOR } from '../../theme/diplomaticEventTheme';
import { markPxForCount, getScreenPointsMaterialOpacity } from '../../../components/Globe/screenPoints';
import type { RealGdeltEvent } from '../../../services/geopolitical/GDELTEventService';
import type { CountryCentroid } from '../../utils/countryCentroids';
import { buildEventMarkers, buildPlaceMarks, buildPlaceSprites, buildRelationArcs, diplomacyMarks } from '../useDiplomaticEvents3D';

function event(overrides: Partial<RealGdeltEvent> = {}): RealGdeltEvent {
  return {
    id: 'evt-1',
    actor1ISO3: 'USA',
    actor2ISO3: 'CHN',
    eventCode: '057', // a formal agreement signed
    eventRootCode: '05',
    goldsteinScale: 5,
    lat: 38.9,
    lng: -77.0,
    sourceUrl: 'https://example.com/article',
    dateAdded: '20260101120000',
    ...overrides
  };
}

const centroids = new Map<string, CountryCentroid>([
  ['USA', { lat: 40, lng: -100 }],
  ['CHN', { lat: 35, lng: 105 }],
  ['FRA', { lat: 47, lng: 2 }],
]);

const attr = (points: THREE.Points, name: string) => points.geometry.getAttribute(name) as THREE.BufferAttribute;

describe('buildEventMarkers', () => {
  it('draws one mark per country, not one per event, in a single object', () => {
    const marks = buildEventMarkers([event({ id: 'a' }), event({ id: 'b' })], centroids, 1)!;
    expect(marks).toBeInstanceOf(THREE.Points);
    // Two events, both USA-CHN: two countries, two marks — not four spheres.
    expect(attr(marks, 'position').count).toBe(2);
  });

  it('sizes a country\'s mark by how many events name it', () => {
    const events = [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c', actor2ISO3: 'FRA' })];
    const marks = buildEventMarkers(events, centroids, 1)!;
    const sizes = Array.from(attr(marks, 'pointSize').array);
    // USA is in all three, CHN in two, FRA in one.
    expect(sizes).toEqual([3, 2, 1].map((n) => Math.fround(markPxForCount(n))));
  });

  it('counts a country once for an event that names it twice', () => {
    const marks = buildEventMarkers([event({ actor1ISO3: 'FRA', actor2ISO3: 'FRA' })], centroids, 1)!;
    expect(attr(marks, 'position').count).toBe(1);
    expect(attr(marks, 'pointSize').getX(0)).toBe(Math.fround(markPxForCount(1)));
  });

  it('skips a country with no resolvable centroid, keeping the rest', () => {
    const marks = buildEventMarkers([event({ actor2ISO3: 'ZZZ' })], centroids, 1)!;
    expect(attr(marks, 'position').count).toBe(1);
  });

  it('draws nothing at all when no event resolves to a category', () => {
    // Root 14 is a protest: Conflict Zones', no cooperative category.
    expect(buildEventMarkers([event({ eventCode: '145', eventRootCode: '14' })], centroids, 1)).toBeNull();
  });

  it('colours a country by the category most of its events fall in', () => {
    const events = [
      event({ id: 'a', eventCode: '040', eventRootCode: '04' }), // a consultation
      event({ id: 'b', eventCode: '040', eventRootCode: '04' }), // a consultation
      event({ id: 'c' }), // a formal agreement signed
    ];
    const marks = buildEventMarkers(events, centroids, 1)!;
    const expected = new THREE.Color(diplomaticEventColor('consult'));
    expect([attr(marks, 'pointColor').getX(0), attr(marks, 'pointColor').getY(0), attr(marks, 'pointColor').getZ(0)])
      .toEqual(Array.from(new Float32Array([expected.r, expected.g, expected.b])));
  });

  it('applies the operator\'s marker size, clamped so a mark cannot vanish or blot', () => {
    const one = buildEventMarkers([event()], centroids, 1)!;
    const tiny = buildEventMarkers([event()], centroids, 0.01)!;
    const huge = buildEventMarkers([event()], centroids, 99)!;
    expect(attr(tiny, 'pointSize').getX(0)).toBeGreaterThan(attr(one, 'pointSize').getX(0) * 0.5);
    expect(attr(huge, 'pointSize').getX(0)).toBeLessThanOrEqual(attr(one, 'pointSize').getX(0) * 2);
  });

  it('says which countries it drew, for a probe or a test to read', () => {
    const marks = buildEventMarkers([event()], centroids, 1)!;
    expect(marks.userData).toMatchObject({ source: 'diplomatic-events' });
    // Busiest first, then alphabetical — so the same events always give the same order.
    expect(marks.userData.countries).toEqual(['CHN', 'USA']);
    const busier = buildEventMarkers([event({ id: 'a' }), event({ id: 'b', actor2ISO3: 'FRA' })], centroids, 1)!;
    expect(busier.userData.countries).toEqual(['USA', 'CHN', 'FRA']);
  });
});


describe('the key the card is given', () => {
  it('names only the categories that were drawn', () => {
    const marks = buildEventMarkers(
      [event({ id: 'a', eventRootCode: '04', eventCode: '040' })],
      centroids, 1,
    )!;
    const swatches = marks.userData.legendSwatches as Array<{ color: string; label: string }>;

    // One category drawn, one swatch — never the six the palette could produce.
    expect(swatches).toHaveLength(1);
    expect(swatches[0].label.length).toBeGreaterThan(0);
  });

  it('names a category once however many countries carry it', () => {
    const marks = buildEventMarkers([
      event({ id: 'a', eventRootCode: '04', eventCode: '040', actor1ISO3: 'USA', actor2ISO3: 'USA' }),
      event({ id: 'b', eventRootCode: '04', eventCode: '040', actor1ISO3: 'CHN', actor2ISO3: 'CHN' }),
    ], centroids, 1)!;

    expect(marks.userData.legendSwatches).toHaveLength(1);
  });

  // D-DP, DP4: in CAMEO's order, as the layers popup lists them, whichever country was drawn first.
  it('names the categories in CAMEO\'s order', () => {
    const marks = buildEventMarkers([
      event({ id: 'a', eventRootCode: '08', eventCode: '087', actor1ISO3: 'CHN', actor2ISO3: 'CHN' }),
      event({ id: 'b', eventRootCode: '03', eventCode: '036', actor1ISO3: 'USA', actor2ISO3: 'USA' }),
      event({ id: 'c', eventRootCode: '05', eventCode: '057', actor1ISO3: 'FRA', actor2ISO3: 'FRA' }),
    ], centroids, 1)!;
    expect((marks.userData.legendSwatches as Array<{ color: string }>).map((s) => s.color))
      .toEqual(['intent', 'agreement', 'yield'].map((c) => `#${diplomaticEventColor(c as 'intent').toString(16).padStart(6, '0')}`));
  });
});

/*
 * Diplomatic connections are SOLID arcs (decision D-F, clutter and legibility).
 *
 * ─── WHY, AND IT IS NOT AESTHETICS ─────────────────────────────────────────
 *
 * This app already means something by a dashed line. `materialTheme.ts` marks
 * disputed and line-of-control borders dashed and everything else solid, calling
 * it the standard cartographic convention — dashed is PROVISIONAL. A diplomatic
 * connection between two countries is not provisional, so drawing it dashed
 * borrowed a meaning it does not have and diluted the one that does.
 *
 * It also read badly. At dashSize 3 / gapSize 2 with linewidths of 0.8 to 3.2,
 * 326 pairs of dashed arcs fragmented into a speckled band around the globe's
 * limb — and the layer audit, which counts connected pixel components, reported
 * 824 "marks" with three quarters of them under 4x4 px. Those were dashes. The
 * layer's own country discs were legible all along.
 */
/**
 * Every line material under an object, however the batches are nested.
 *
 * buildConnectionLines returns a group holding a LineSegments2, and each caller
 * adds that group to one of its own — so the materials are two levels down, not
 * one.
 */
const lineMaterials = (root: THREE.Object3D): LineMaterial[] => {
  const out: LineMaterial[] = [];
  root.traverse((o) => {
    const material = (o as LineSegments2).material as LineMaterial | undefined;
    if (material && typeof (material as { dashed?: boolean }).dashed === 'boolean') out.push(material);
  });
  return out;
};

describe('the connection arcs', () => {
  it('draws them solid, because dashed means provisional here', () => {
    const group = buildRelationArcs('USA', [{ counterpart: 'CHN', cooperation: 3, conflict: 1 }, { counterpart: 'FRA', cooperation: 1, conflict: 0 }], centroids, 1);
    const materials = lineMaterials(group);

    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) expect(material.dashed).toBe(false);
  });
});

/*
 * Diplomacy's country marks honour the style chosen for them
 * (decision D-F, step 6.3). Its arcs are lines and are not affected — and its
 * glow is not on offer, because this builder calls buildScreenPoints directly
 * and would draw the bloom with no mark inside it.
 */
describe('the style chosen for the country marks', () => {
  const defines = (points: THREE.Points) =>
    (points.material as THREE.ShaderMaterial).defines ?? {};

  it('draws discs when nothing was chosen', () => {
    const d = defines(buildEventMarkers([event()], centroids, 1)!);

    expect(d).not.toHaveProperty('STYLE_RING');
    expect(d).not.toHaveProperty('STYLE_GLOW');
  });

  it('draws rings when rings were chosen', () => {
    expect(defines(buildEventMarkers([event()], centroids, 1, 'ring')))
      .toHaveProperty('STYLE_RING');
  });
});

/*
 * D-DP step 3 (DP2, DP9, DP13, DP14): a mark at each place GDELT states, sized by the distinct outlets
 * that told its stories; a place told by one outlet smaller and dimmer, never hidden; a place GDELT put
 * only at a country a hollow ring, dashed under the Ring style, where every mark is a ring.
 */
describe('buildPlaceMarks', () => {
  const at = (id: string, over: Partial<RealGdeltEvent> = {}) =>
    event({ id, eventCode: '042', eventRootCode: '04', placeName: 'Moscow, Moskva, Russia', placePrecision: 'city', lat: 55.75, lng: 37.62, sourceUrl: `https://${id}.example/1`, ...over });
  const marksIn = (group: THREE.Group) => group.children.filter((c): c is THREE.Points => c instanceof THREE.Points);
  const byTier = (group: THREE.Group, tier: string, placedAt = 'point') =>
    marksIn(group).find((p) => p.userData.tier === tier && p.userData.placedAt === placedAt)!;

  it('draws one mark per place, at the place', () => {
    const group = buildPlaceMarks([at('a'), at('b'), at('c', { lat: 50.45, lng: 30.52, placeName: 'Kyiv' })], 1)!;
    expect(marksIn(group).reduce((n, p) => n + attr(p, 'position').count, 0)).toBe(2);
    expect(group.userData.places).toEqual(['Moscow, Moskva, Russia', 'Kyiv']);
  });

  it('draws a place told by one outlet smaller and dimmer, and keeps it', () => {
    const group = buildPlaceMarks([at('a'), at('b'), at('c', { lat: 50.45, lng: 30.52, placeName: 'Kyiv' })], 1)!;
    const told = byTier(group, 'told');
    const once = byTier(group, 'once');
    expect(attr(told, 'pointSize').getX(0)).toBeGreaterThan(attr(once, 'pointSize').getX(0));
    expect(getScreenPointsMaterialOpacity(once.material as THREE.Material)).toBeLessThan(getScreenPointsMaterialOpacity(told.material as THREE.Material));
  });

  it('draws a place GDELT put only at a country as a hollow ring, dashed where every mark is a ring', () => {
    const events = [at('a'), at('b', { placePrecision: 'country', placeName: 'Russia', lat: 60, lng: 100 })];
    const disc = buildPlaceMarks(events, 1, 'disc')!;
    expect((byTier(disc, 'once', 'country').material as THREE.ShaderMaterial).defines).toHaveProperty('STYLE_RING');
    expect((byTier(disc, 'once', 'point').material as THREE.ShaderMaterial).defines).not.toHaveProperty('STYLE_RING');
    const ring = buildPlaceMarks(events, 1, 'ring')!;
    expect((byTier(ring, 'once', 'country').material as THREE.ShaderMaterial).defines).toHaveProperty('STYLE_DASHED_RING');
    expect((byTier(ring, 'once', 'point').material as THREE.ShaderMaterial).defines).toHaveProperty('STYLE_RING');
  });

  it('says in its hover where, how many reports, how many outlets, and of what kind', () => {
    const group = buildPlaceMarks([at('a'), at('b'), at('c', { eventCode: '073', eventRootCode: '07' })], 1)!;
    expect(byTier(group, 'told').userData.tooltips[0])
      .toBe('Moscow, Moskva, Russia: 3 reports, told by 3 outlets; 2 of them consultations (calls, visits, meetings)');
  });

  it('says in its hover when GDELT put them only at the country', () => {
    const group = buildPlaceMarks([at('a', { placePrecision: 'country', placeName: 'Russia', lat: 60, lng: 100 })], 1)!;
    expect(byTier(group, 'once', 'country').userData.tooltips[0]).toMatch(/\)\. GDELT placed them only at the country\.$/);
  });

  it('gives the key the kinds drawn in CAMEO\'s order, and what a ring and a dim mark mean', () => {
    const group = buildPlaceMarks([
      at('a', { eventCode: '087', eventRootCode: '08' }),
      at('b', { eventCode: '036', eventRootCode: '03', lat: 1, lng: 1, placePrecision: 'country' }),
    ], 1, 'disc')!;
    const labels = (group.userData.legendSwatches as Array<{ label: string; shape?: string }>);
    expect(labels.map((s) => s.label)).toEqual([
      'intent to cooperate, said and not yet done', 'yielding (easing, releasing, de-escalating)',
      'placed only at a country, not a city', 'told by one outlet: smaller and dimmer',
    ]);
    expect(labels[2].shape).toBe('ring');
  });

  it('draws nothing when no event is cooperative', () => {
    expect(buildPlaceMarks([at('a', { eventCode: '145', eventRootCode: '14' })], 1)).toBeNull();
  });
});

/* D-DP, DP2: where it happened by default; who was involved, each country at its centre, on the switch. */
describe('diplomacyMarks', () => {
  const at = (id: string) => event({ id, eventCode: '042', eventRootCode: '04', placeName: 'Moscow', placePrecision: 'city', lat: 55.75, lng: 37.62 });

  it('stands the marks where it happened, by default', () => {
    const { object, legend } = diplomacyMarks([at('a')], centroids, { markerSize: 1, placeBy: 'event' }, 'disc');
    expect(object?.userData.places).toEqual(['Moscow']);
    expect(legend?.sizeMeans).toBe('outlets that told its stories');
  });

  it('stands them at each country involved, on the switch', () => {
    const { object, legend } = diplomacyMarks([at('a')], centroids, { markerSize: 1, placeBy: 'actors' }, 'disc');
    expect(object?.userData.countries).toEqual(expect.arrayContaining(['USA', 'CHN']));
    expect(legend?.sizeMeans).toBe('events in that country');
  });

  it('draws nothing and keys nothing with no cooperative event', () => {
    expect(diplomacyMarks([], centroids, { markerSize: 1, placeBy: 'event' }, 'disc')).toEqual({ object: null, legend: null });
  });
});

/* D-DP, DP12: up close, each place is its kind's glyph on a mark of its colour. */
describe('buildPlaceSprites', () => {
  const marksIn = (group: THREE.Group) => group.children.filter((c): c is THREE.Points => c instanceof THREE.Points);
  const at = (id: string, over: Partial<RealGdeltEvent> = {}) =>
    event({ id, eventCode: '042', eventRootCode: '04', placeName: 'Moscow', placePrecision: 'city', lat: 55.75, lng: 37.62, sourceUrl: `https://${id}.example/1`, ...over });
  const atlas = new THREE.Texture();

  it('draws one glyph per place, in its kind\'s column, with the same hover as its disc', () => {
    const events = [at('a'), at('b'), at('c', { eventCode: '073', eventRootCode: '07', lat: 50.45, lng: 30.52, placeName: 'Kyiv' })];
    const sprites = buildPlaceSprites(events, 1, 'disc', atlas)!;
    expect(sprites.userData.type).toBe('diplomacySprites');
    expect(Array.from(attr(sprites, 'atlasCell').array)).toEqual([1, 5]);
    expect(sprites.userData.tooltips).toEqual(marksIn(buildPlaceMarks(events, 1, 'disc')!).flatMap((p) => p.userData.tooltips).reverse());
  });

  it('backs a country-only place with a ring, dashed under the Ring style, and dims a place told once', () => {
    const events = [at('a'), at('b'), at('c', { placePrecision: 'country', placeName: 'Russia', lat: 60, lng: 100 })];
    expect(Array.from(attr(buildPlaceSprites(events, 1, 'disc', atlas)!, 'atlasRow').array)).toEqual([0, 1]);
    expect(Array.from(attr(buildPlaceSprites(events, 1, 'ring', atlas)!, 'atlasRow').array)).toEqual([1, 2]);
    const opacity = Array.from(attr(buildPlaceSprites(events, 1, 'disc', atlas)!, 'markOpacity').array);
    expect(opacity[1]).toBeLessThan(opacity[0]);
  });

  it('is large enough to read a glyph even for a place told once', () => {
    const sprites = buildPlaceSprites([at('a')], 1, 'disc', atlas)!;
    expect(attr(sprites, 'pointSize').getX(0)).toBeGreaterThanOrEqual(18);
  });

  it('is what diplomacyMarks draws up close, and the key draws each kind as its glyph in its colour', () => {
    const { object, legend } = diplomacyMarks([at('a')], centroids, { markerSize: 1, placeBy: 'event' }, 'disc', atlas);
    expect(object?.userData.type).toBe('diplomacySprites');
    expect(legend?.swatches[0]).toMatchObject({ color: '#00d4ff', symbol: 'diplomacy:consult' });
    expect(legend?.emblems).toBeUndefined();
  });

  it('draws the kinds as plain colours in the key from afar, where the marks are discs', () => {
    const { legend } = diplomacyMarks([at('a')], centroids, { markerSize: 1, placeBy: 'event' }, 'disc');
    expect(legend?.swatches[0]).not.toHaveProperty('symbol');
  });
});

/* D-DP, DP8: a click picks a place by its mark's index, so each object keeps its places' keys in order. */
describe('the places behind the marks', () => {
  const at = (id: string, over: Partial<RealGdeltEvent> = {}) =>
    event({ id, eventCode: '042', eventRootCode: '04', placeName: 'Moscow', placePrecision: 'city', lat: 55.75, lng: 37.62, sourceUrl: `https://${id}.example/1`, ...over });
  const events = [at('a'), at('b'), at('c', { lat: 50.45, lng: 30.52, placeName: 'Kyiv' }), at('d', { placePrecision: 'country', placeName: 'Russia', lat: 60, lng: 100 })];

  it('are kept on each disc object, in the order of its marks', () => {
    const group = buildPlaceMarks(events, 1)!;
    for (const points of group.children as THREE.Points[]) {
      const keys = points.userData.placeKeys as string[];
      expect(keys).toHaveLength(points.geometry.getAttribute('position').count);
      keys.forEach((key, i) => expect(points.userData.tooltips[i]).toContain(key.includes('60.0000') ? 'Russia' : key.includes('50.4500') ? 'Kyiv' : 'Moscow'));
    }
  });

  it('are kept on the glyphs, in the order of their marks', () => {
    const sprites = buildPlaceSprites(events, 1, 'disc', new THREE.Texture())!;
    const keys = sprites.userData.placeKeys as string[];
    expect(keys).toHaveLength(3);
    expect(sprites.userData.tooltips[keys.findIndex((k) => k.includes('50.4500'))]).toContain('Kyiv');
  });
});

/*
 * D-DP, DP5: arcs only for a selected country, to its counterparts: cooperation and conflict in two
 * colours, conflict nearer the surface so both read where a pair has both, width by reports.
 */
describe('buildRelationArcs', () => {

  it('draws cooperation and conflict to each counterpart, in their two colours', () => {
    const group = buildRelationArcs('USA', [
      { counterpart: 'CHN', cooperation: 12, conflict: 1 },
      { counterpart: 'FRA', cooperation: 1, conflict: 0 },
    ], centroids, 0.4);
    const kinds = group.children.map((child) => child.userData.kind);
    expect(new Set(kinds)).toEqual(new Set(['cooperation', 'conflict']));
    const colourOf = (kind: string) => batchedLines(group.children.find((c) => c.userData.kind === kind))[0].color;
    expect(colourOf('cooperation')).toBe(DIPLOMATIC_CONNECTION_COLOR);
    expect(colourOf('conflict')).toBe(DIPLOMATIC_CONFLICT_COLOR);
  });

  // At the default connection opacity, 40%, the faintest read as nothing on the build (0.2).
  it('draws even the faintest at about half opacity, at the default setting', () => {
    const group = buildRelationArcs('USA', [{ counterpart: 'FRA', cooperation: 1, conflict: 1 }], centroids, 0.4);
    const materials = group.children.flatMap((c) => c.children).map((batch) => (batch as LineSegments2).material as LineMaterial);
    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) expect(material.opacity).toBeGreaterThanOrEqual(0.5);
  });

  it('draws conflict nearer the surface, so a pair with both reads as two', () => {
    const group = buildRelationArcs('USA', [{ counterpart: 'CHN', cooperation: 1, conflict: 1 }], centroids, 0.4);
    const height = (kind: string) => group.children.find((c) => c.userData.kind === kind)!.userData.arcHeight as number;
    expect(height('conflict')).toBeLessThan(height('cooperation'));
  });

  it('draws a pair with more reports thicker', () => {
    const group = buildRelationArcs('USA', [
      { counterpart: 'CHN', cooperation: 12, conflict: 0 },
      { counterpart: 'FRA', cooperation: 1, conflict: 0 },
    ], centroids, 0.4);
    const widths = group.children.filter((c) => c.userData.kind === 'cooperation').map((c) => c.userData.weight);
    expect(new Set(widths)).toEqual(new Set(['bold', 'faint']));
  });

  it('draws nothing for a country with no counterparts, or none it can place', () => {
    expect(buildRelationArcs('USA', [], centroids, 0.4).children).toHaveLength(0);
    expect(buildRelationArcs('USA', [{ counterpart: 'ZZZ', cooperation: 3, conflict: 0 }], centroids, 0.4).children).toHaveLength(0);
  });
});
