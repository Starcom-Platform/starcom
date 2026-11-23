/**
 * Conflict's marks, after aggregation.
 *
 * buildWarEventMarkers drew one sphere per (event, country): 2,968 events made 5,936
 * spheres over 130 countries from the shipped snapshot, a country's whole stack at its
 * single centroid, so the tests that used to live here — "one marker per actor per
 * event" — were pinning the defect. And the displacement marks, already one per
 * country, were spheres in scene units: 1.8 units across, which is a couple of pixels
 * on a card.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { warEventColor, HUMANITARIAN_CRISIS_COLOR, displacementToMarkerScale } from '../../theme/conflictZonesTheme';
import { markPxForCount } from '../../../components/Globe/screenPoints';
import type { RealGdeltEvent } from '../../../services/geopolitical/GDELTEventService';
import type { CountryDisplacement } from '../../../services/geopolitical/UNHCRDisplacementService';
import type { CountryCentroid } from '../../utils/countryCentroids';
import {
  buildWarEventMarkers, buildHumanitarianCrisisMarkers, conflictZoneLegends,
  CONFLICT_ZONE_LEGEND_ID, CONFLICT_DISPLACEMENT_LEGEND_ID,
} from '../useConflictZones3D';

function warEvent(overrides: Partial<RealGdeltEvent> = {}): RealGdeltEvent {
  return {
    id: 'war-1',
    actor1ISO3: 'IRN',
    actor2ISO3: 'PAK',
    eventCode: '193',
    eventRootCode: '19', // Fight — real conflict root code
    goldsteinScale: -9.5,
    lat: 30.0,
    lng: 65.0,
    sourceUrl: 'https://example.com/article',
    dateAdded: '20260101120000',
    ...overrides
  };
}

function displacement(overrides: Partial<CountryDisplacement> = {}): CountryDisplacement {
  return {
    countryISO3: 'SDN',
    countryName: 'Sudan',
    idps: 11559970,
    refugees: 0,
    asylumSeekers: 0,
    total: 11559970,
    year: 2024,
    ...overrides
  };
}

const centroids = new Map<string, CountryCentroid>([
  ['IRN', { lat: 32, lng: 53 }],
  ['PAK', { lat: 30, lng: 70 }],
  ['SDN', { lat: 15, lng: 30 }],
  ['SYR', { lat: 35, lng: 38 }],
]);

const attr = (points: THREE.Points, name: string) => points.geometry.getAttribute(name) as THREE.BufferAttribute;

describe('buildWarEventMarkers', () => {
  it('draws one mark per country, not one per event, in a single object', () => {
    const marks = buildWarEventMarkers([warEvent({ id: 'a' }), warEvent({ id: 'b' })], centroids, 1)!;
    expect(marks).toBeInstanceOf(THREE.Points);
    expect(attr(marks, 'position').count).toBe(2);
  });

  it('sizes a country\'s mark by how many war events name it', () => {
    const events = [warEvent({ id: 'a' }), warEvent({ id: 'b' }), warEvent({ id: 'c', actor2ISO3: 'SYR' })];
    const marks = buildWarEventMarkers(events, centroids, 1)!;
    expect(Array.from(attr(marks, 'pointSize').array)).toEqual([3, 2, 1].map((n) => Math.fround(markPxForCount(n))));
  });

  it('colours a country by the mean Goldstein of its events, not the last one read', () => {
    const mixed = [warEvent({ id: 'a', goldsteinScale: -10 }), warEvent({ id: 'b', goldsteinScale: 0 })];
    const marks = buildWarEventMarkers(mixed, centroids, 1)!;
    const expected = new THREE.Color(warEventColor(-5));
    expect([attr(marks, 'pointColor').getX(0), attr(marks, 'pointColor').getY(0), attr(marks, 'pointColor').getZ(0)])
      .toEqual(Array.from(new Float32Array([expected.r, expected.g, expected.b])));
  });

  it('reads events with no Goldstein at all as the mild end, not the severe end', () => {
    const marks = buildWarEventMarkers([warEvent({ goldsteinScale: null as unknown as number })], centroids, 1)!;
    const mild = new THREE.Color(warEventColor(0));
    expect(attr(marks, 'pointColor').getX(0)).toBeCloseTo(mild.r, 5);
  });

  it('skips a country with no resolvable centroid, and draws nothing when none resolve', () => {
    expect(attr(buildWarEventMarkers([warEvent({ actor2ISO3: 'ZZZ' })], centroids, 1)!, 'position').count).toBe(1);
    expect(buildWarEventMarkers([warEvent({ actor1ISO3: 'ZZZ', actor2ISO3: 'YYY' })], centroids, 1)).toBeNull();
  });

  it('says which countries it drew', () => {
    const marks = buildWarEventMarkers([warEvent()], centroids, 1)!;
    expect(marks.userData).toMatchObject({ source: 'conflict-war-event' });
    expect(marks.userData.countries).toEqual(['IRN', 'PAK']);
  });
});

describe('what a click on a Conflict Zones mark opens (C5)', () => {
  it('opens each country\'s own events, beside its hover', () => {
    const marks = buildWarEventMarkers([warEvent(), warEvent({ id: 'war-2', actor2ISO3: 'IRN' })], centroids, 1)!;
    const opens = marks.userData.opens as Array<{ heading: string; notes: Array<{ id: string }> }>;
    expect(opens.map((set) => set.heading)).toEqual(['Conflict Zones · IRN', 'Conflict Zones · PAK']);
    expect(opens[0].notes.map((n) => n.id).sort()).toEqual(['war-1', 'war-2']);
    expect(opens[1].notes.map((n) => n.id)).toEqual(['war-1']);
  });

  it('opens each country\'s displacement figures', () => {
    const marks = buildHumanitarianCrisisMarkers([displacement()], centroids, 1)!;
    expect((marks.userData.opens as Array<{ heading: string }>).map((set) => set.heading)).toEqual(['Conflict Zones · Sudan']);
  });
});

describe('buildHumanitarianCrisisMarkers', () => {
  it('draws one mark per country with displacement, in a single object', () => {
    const marks = buildHumanitarianCrisisMarkers(
      [displacement(), displacement({ countryISO3: 'SYR', total: 7000000 })], centroids, 1,
    )!;
    expect(attr(marks, 'position').count).toBe(2);
    expect(marks.userData.countries).toEqual(['SDN', 'SYR']);
  });

  it('keeps the magnitude scale it always had, in pixels a card can show', () => {
    const marks = buildHumanitarianCrisisMarkers(
      [displacement({ total: 11559970 }), displacement({ countryISO3: 'SYR', total: 1000 })], centroids, 1,
    )!;
    const sizes = Array.from(attr(marks, 'pointSize').array);
    // Bigger displacement, bigger mark — and nothing below what the audit can see.
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(Math.min(...sizes) * 0.87).toBeGreaterThanOrEqual(4);
    expect(displacementToMarkerScale(11559970)).toBeGreaterThan(displacementToMarkerScale(1000));
  });

  it('uses the humanitarian colour', () => {
    const marks = buildHumanitarianCrisisMarkers([displacement()], centroids, 1)!;
    const expected = new THREE.Color(HUMANITARIAN_CRISIS_COLOR);
    expect([attr(marks, 'pointColor').getX(0), attr(marks, 'pointColor').getY(0), attr(marks, 'pointColor').getZ(0)])
      .toEqual(Array.from(new Float32Array([expected.r, expected.g, expected.b])));
  });

  it('skips a country with no resolvable centroid, and draws nothing when none resolve', () => {
    expect(buildHumanitarianCrisisMarkers([displacement({ countryISO3: 'ZZZ' })], centroids, 1)).toBeNull();
  });
});

describe('the key the card is given', () => {
  it('names the two ends of the ramp that were actually drawn, not the ramp itself', () => {
    // Mild and severe events, on countries with centroids. The extremes of the DRAWN
    // set: a legend quoting the ramp's own -10..+10 would claim a severity no mark
    // here has.
    const events = [
      warEvent({ id: 'a', goldsteinScale: -9.5, actor1ISO3: 'IRN', actor2ISO3: 'IRN' }),
      warEvent({ id: 'b', goldsteinScale: 1.9, actor1ISO3: 'SYR', actor2ISO3: 'SYR' }),
    ];
    const marks = buildWarEventMarkers(events, centroids, 1)!;
    const swatches = marks.userData.legendSwatches as Array<{ color: string; label: string }>;

    expect(swatches.map((s) => s.label)).toEqual([
      'Goldstein -9.5 (most severe here)',
      'Goldstein 1.9 (mildest here)',
    ]);
    expect(swatches[0].color).toBe(`#${warEventColor(-9.5).toString(16).padStart(6, '0')}`);
    expect(swatches[1].color).toBe(`#${warEventColor(1.9).toString(16).padStart(6, '0')}`);
  });

  it('offers one end, not two identical ones, when every mark scores the same', () => {
    const marks = buildWarEventMarkers([warEvent({ goldsteinScale: -4 })], centroids, 1)!;
    expect(marks.userData.legendSwatches).toHaveLength(1);
  });

  it('says what the displacement mark measures', () => {
    const marks = buildHumanitarianCrisisMarkers([displacement()], centroids, 1)!;
    expect(marks.userData.legendSwatches).toEqual([
      { color: `#${HUMANITARIAN_CRISIS_COLOR.toString(16).padStart(6, '0')}`, label: 'people displaced (UNHCR)' },
    ]);
  });
});

/*
 * Two datasets, two vocabularies (decision D-F, clutter and legibility).
 *
 * ─── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * Both sub-layers drew discs, and one legend key covered both:
 *
 *   size: events in that country, or people displaced
 *   colour: mean Goldstein severity, where the mark is a conflict mark
 *
 * Two different quantities in one channel, with colour applying to only one of
 * them. A 14 px disc meant either forty events or eighty thousand people and
 * nothing on screen said which. That ambiguity was the solid finding of the
 * layer audit — the data path was never the problem, and the two builders were
 * always separate.
 */
describe('telling the two conflict datasets apart', () => {
  const defines = (marks: THREE.Points) =>
    (marks.material as THREE.ShaderMaterial).defines ?? {};

  it('draws armed conflict as discs', () => {
    const marks = buildWarEventMarkers([warEvent()], centroids, 1)!;

    expect(defines(marks)).not.toHaveProperty('STYLE_RING');
    expect(defines(marks)).not.toHaveProperty('STYLE_GLOW');
  });

  /*
   * Shape, so a reader who cannot rely on colour over a varied globe can still
   * tell a displacement mark from a conflict mark — the same rule the Intel
   * Report variants follow.
   */
  it('draws displacement as rings', () => {
    const marks = buildHumanitarianCrisisMarkers([displacement()], centroids, 1)!;

    expect(defines(marks)).toHaveProperty('STYLE_RING');
  });
});

describe('the legend the two sub-layers publish', () => {
  const swatch = (label: string) => ({ color: '#fff', label });

  it('gives each dataset its own entry, under its own id', () => {
    const entries = conflictZoneLegends([swatch('Goldstein -8.0')], [swatch('people displaced')]);

    expect(entries.map((e) => e.layerId))
      .toEqual([CONFLICT_ZONE_LEGEND_ID, CONFLICT_DISPLACEMENT_LEGEND_ID]);
  });

  /*
   * The defect, stated as a test: neither entry may describe size as two things.
   */
  it('never says size means one thing or another', () => {
    for (const entry of conflictZoneLegends([swatch('a')], [swatch('b')])) {
      expect(entry.sizeMeans).toBeTruthy();
      expect(entry.sizeMeans).not.toMatch(/ or /);
    }
  });

  it('says which shape each entry describes', () => {
    const [conflict, displacement] = conflictZoneLegends([swatch('a')], [swatch('b')]);

    expect(conflict.shapeMeans).toBe('disc');
    expect(displacement.shapeMeans).toBe('ring');
  });

  /*
   * Colour is a real channel on the conflict marks and carries nothing on the
   * displacement marks, which are one colour. Saying otherwise on the second
   * entry would invent an encoding.
   */
  it('claims a colour meaning only where colour means something', () => {
    const [conflict, displacement] = conflictZoneLegends([swatch('a')], [swatch('b')]);

    expect(conflict.colorMeans).toMatch(/Goldstein/);
    expect(displacement.colorMeans).toBeUndefined();
  });

  /*
   * A legend may only describe what was actually drawn. The old single entry
   * mentioned displacement whether or not that sub-layer was on.
   */
  it('publishes nothing for a dataset that drew nothing', () => {
    expect(conflictZoneLegends([swatch('a')], []).map((e) => e.layerId))
      .toEqual([CONFLICT_ZONE_LEGEND_ID]);
    expect(conflictZoneLegends([], [swatch('b')]).map((e) => e.layerId))
      .toEqual([CONFLICT_DISPLACEMENT_LEGEND_ID]);
    expect(conflictZoneLegends([], [])).toEqual([]);
  });

  it('carries each dataset its own swatches and not the other one\'s', () => {
    const [conflict, displacement] = conflictZoneLegends([swatch('goldstein')], [swatch('displaced')]);

    expect(conflict.swatches.map((s) => s.label)).toEqual(['goldstein']);
    expect(displacement.swatches.map((s) => s.label)).toEqual(['displaced']);
  });
});
