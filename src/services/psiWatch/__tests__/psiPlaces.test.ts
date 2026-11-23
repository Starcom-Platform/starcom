/**
 * Psi Watch's places at a moment (decision D-PW, step 5, PW32–PW33), from the kit's own fixtures: an alert while it
 * holds, a window as strongly as its curve stands, a tested place always; a retired 1.0 Zone as the Zones that now
 * hold it, and a first Zone's Sector, which has no outline now, counted but not drawn.
 *
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PolygonGeometry } from '../../geoint/pointInPolygon';
import type { AreaShapes } from '../../../features/globe/areas/areaShapes';
import { loadPsiKit, type KitFixture } from '../kitFixtures';
import { psiPlacesAt, WINDOW_SHOWN_FROM, type PsiPlaceLayer } from '../psiPlaces';

const SQUARE: PolygonGeometry = { type: 'Polygon', coordinates: [[[0, 10], [20, 10], [20, 20], [0, 20], [0, 10]]] };
const SHAPES: AreaShapes = new Map([['zone:sahel', { name: 'Sahel Zone', geometry: SQUARE }]]);
const ALL = new Set<PsiPlaceLayer>(['PsiRifts', 'PsiWindows', 'PsiZones']);
// The kit's alert holds from 26 Oct 13:00Z to 28 Oct 01:00Z; its window peaks at 1 Nov 20:28:27Z.
const ALERT_FROM = 1793019600;
const ALERT_UNTIL = 1793149200;
const WINDOW_EXACT = 1793564907;

let fixtures: KitFixture[];
beforeAll(async () => { fixtures = await loadPsiKit({ samples: true }); });

describe('psiPlacesAt', () => {
  it('draws an alert while it holds, and not before or after', () => {
    const at = (t: number) => psiPlacesAt(fixtures, t, SHAPES, new Set(['PsiRifts'])).places;
    expect(at(ALERT_FROM - 1)).toEqual([]);
    expect(at(ALERT_UNTIL + 1)).toEqual([]);
    const [alert] = at(ALERT_FROM + 3600);
    expect(alert).toMatchObject({ layer: 'PsiRifts', code: 'zone:sahel', name: 'Sahel Zone', until: ALERT_UNTIL });
  });

  it('says a retired 1.0 Zone is drawn as the Zones that now hold it (ZR28)', () => {
    const [alert] = psiPlacesAt(fixtures, ALERT_FROM, SHAPES, new Set(['PsiRifts'])).places;
    expect(alert.retiredInto).toBe(6);
  });

  it("draws a window as strongly as its curve stands at the cursor, and nothing outside it", () => {
    const at = (t: number) => psiPlacesAt(fixtures, t, SHAPES, new Set(['PsiWindows'])).places;
    expect(at(WINDOW_EXACT)[0].weight).toBeCloseTo(1, 2);
    const earlier = at(WINDOW_EXACT - 3 * 3600)[0];
    expect(earlier.weight).toBeGreaterThan(WINDOW_SHOWN_FROM);
    expect(earlier.weight).toBeLessThan(at(WINDOW_EXACT)[0].weight!);
    expect(at(ALERT_FROM)).toEqual([]);
  });

  it('draws where a registered test looked, its result as published; a first Zone\'s Sector is counted, not drawn', () => {
    const { places, unmatched } = psiPlacesAt(fixtures, ALERT_FROM, SHAPES, new Set(['PsiZones']));
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ layer: 'PsiZones', code: 'zone:sahel', result: { registration: 'PSI-9001', rr: 1.04, p: 0.38 } });
    expect(unmatched).toEqual([{ layer: 'PsiZones', code: 'zone:sahel/sector:nile-butana-barka' }]);
  });

  it('draws nothing for a layer that is off, and counts every place while the outlines are still loading', () => {
    expect(psiPlacesAt(fixtures, ALERT_FROM, SHAPES, new Set()).places).toEqual([]);
    const loading = psiPlacesAt(fixtures, ALERT_FROM + 3600, undefined, ALL);
    expect(loading.places).toEqual([]);
    expect(loading.unmatched.map((u) => u.layer).sort()).toEqual(['PsiRifts', 'PsiZones', 'PsiZones']);
  });

  it('lights what touches a brushed span and dims what the cursor holds outside it (PW50)', () => {
    // The cursor at the window's exact moment; a span over the alert, days before.
    const span = { from: ALERT_FROM, until: ALERT_FROM + 3600 };
    const { places } = psiPlacesAt(fixtures, WINDOW_EXACT, SHAPES, ALL, span);
    const alert = places.find((p) => p.layer === 'PsiRifts')!;
    const window = places.find((p) => p.layer === 'PsiWindows')!;
    expect(alert.dim).toBeUndefined();
    expect(window.dim).toBe(true);
    // A span over the window: the window lit at its strongest there, its peak.
    const lit = psiPlacesAt(fixtures, ALERT_FROM, SHAPES, ALL, { from: WINDOW_EXACT - 600, until: WINDOW_EXACT + 600 }).places;
    expect(lit.find((p) => p.layer === 'PsiWindows')!.weight).toBeCloseTo(1, 6);
    expect(lit.find((p) => p.layer === 'PsiRifts')?.dim).toBe(true);
  });
});
