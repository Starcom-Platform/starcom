/**
 * The header's search finds records, and each opens where its link leads
 * (plan item 1.4, story S24); the applications it offers are the ones that
 * exist.
 */
import { describe, it, expect, vi } from 'vitest';
// The areas' shapes as Starcom serves them, for the view an area is flown to.
vi.mock('../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});

import { recordResults, appResults, areaResults, areaFocusFor, zoneResults, zoneFocusFor } from '../headerSearch';
import { zoneFrom, zoneIndexOf, type ZspZone } from '../../../geopolitical/zones/zsp';
import { readFileSync } from 'node:fs';
import { AREAS } from '../../../features/globe/areas/areaRegistry';
import { focusAltitude, SHOW_ON_GLOBE_MOVE } from '../../Globe/showOnGlobeMove';
import { APPLICATIONS, DESTINATIONS } from '../../Router/EnhancedApplicationRouter';
import { setLanguage } from '../../../i18n/app/i18n';
import uk from '../../../i18n/app/locales/uk';

describe('what the header search finds', () => {
  it('shows a record by its number and name, says what it is, and opens it where its link leads', () => {
    const navigate = vi.fn();
    const [c, m, r] = recordResults([
      { kind: 'case', id: 'intelcase-1', title: 'Night loading at berth 4', number: 'CASE-2026-77QX-B342', sample: false },
      { kind: 'mission', id: 'mission-1', title: 'Watch berth 4', number: 'MSN-2026-A3JV-998A', sample: false },
      { kind: 'report', id: 'intel-1', title: 'Berth 4 cranes at night', sample: true },
    ], navigate);
    expect(c).toMatchObject({ type: 'case', title: 'CASE-2026-77QX-B342 · Night loading at berth 4', description: 'Case' });
    expect(r).toMatchObject({ type: 'report', title: 'Berth 4 cranes at night', description: 'Intel report · sample' });
    c.action!();
    expect(navigate).toHaveBeenLastCalledWith('cases', undefined, { selectCaseId: 'intelcase-1' });
    m.action!();
    expect(navigate).toHaveBeenLastCalledWith('teamworkspace', undefined, { initialTab: 'missions', selectMissionId: 'mission-1' });
    r.action!();
    expect(navigate).toHaveBeenLastCalledWith('inteldashboard', undefined, { reportId: 'intel-1' });
  });

  it('offers the applications that exist, and no case nobody made', () => {
    const navigate = vi.fn();
    const apps = appResults(navigate);
    // Every destination the registry lists (plan item 4.6), each app once (K1).
    expect(apps.map((a) => a.title)).toEqual(DESTINATIONS.map((d) => d.label));
    expect(APPLICATIONS.every((app) => apps.some((a) => a.title === app.name))).toBe(true);
    apps.find((a) => a.title === 'Missions')!.action();
    expect(navigate).toHaveBeenCalledWith('teamworkspace');
    expect(JSON.stringify(apps)).not.toContain('Operation Firewall');
  });
});

// BA24: the header's search finds areas beside countries; picking one outlines it on the globe.
describe('areas in the header search', () => {
  it('every area, by its name, saying what kind it is, found by its code too', () => {
    const results = areaResults(vi.fn());
    expect(results.map((r) => r.title)).toEqual(AREAS.map((a) => a.name));
    const eu = results.find((r) => r.title === 'European Union')!;
    expect(eu).toMatchObject({ type: 'area', description: 'Union · outlines it on the globe' });
    expect(eu.keywords).toContain('union:eu');
    expect(eu.keywords).toContain(' eu');
  });

  it('picking one hands its code on', () => {
    const pick = vi.fn();
    areaResults(pick).find((r) => r.title === 'Sahel Zone')!.action!();
    expect(pick).toHaveBeenCalledWith('zone:sahel');
  });
});

describe('the view an area is flown to (BA24)', () => {
  it('its largest part, from far enough out to see it, nearer for a small one', async () => {
    const eu = (await areaFocusFor('union:eu', { width: 1400, height: 900 }))!;
    expect(eu.lat).toBeGreaterThan(40);
    expect(eu.lng).toBeGreaterThan(-5);
    expect(eu.lng).toBeLessThan(30);
    const asia = (await areaFocusFor('continent:asia', { width: 1400, height: 900 }))!;
    const triangle = (await areaFocusFor('zone:golden-triangle', { width: 1400, height: 900 }))!;
    expect(asia.altitude!).toBeGreaterThan(eu.altitude!);
    expect(triangle.altitude!).toBeLessThanOrEqual(eu.altitude!);
    expect(triangle.altitude!).toBeLessThan(asia.altitude!);
    for (const view of [eu, asia, triangle]) {
      expect(view.altitude!).toBeGreaterThanOrEqual(1);
      expect(view.altitude!).toBeLessThanOrEqual(4);
    }
  });

  it('none for an area no one defined', async () => {
    expect(await areaFocusFor('union:no-such-body', { width: 1400, height: 900 })).toBeNull();
  });

  it('the globe flies to the altitude asked, else to Show on Globe\'s', () => {
    expect(focusAltitude({ altitude: 3 })).toBe(3);
    expect(focusAltitude({})).toBe(SHOW_ON_GLOBE_MOVE.altitude);
  });
});

describe('Zones and their Sectors in the search (ZSP 1.0)', () => {
  const rift = zoneFrom(JSON.parse(readFileSync('src/geopolitical/zones/__tests__/zsp-1.0/east-african-rift.zsp.geojson', 'utf8'))) as ZspZone;
  const index = zoneIndexOf([rift]);

  it('finds the Zone and each Sector, a Sector by a landmark in it too, and opens what was picked', () => {
    const picked = vi.fn();
    const results = zoneResults(index, picked);
    expect(results.map((r) => r.title)).toEqual([rift.root.name, ...rift.sectors.map((s) => s.name)]);
    const kilimanjaro = results.filter((r) => (r.keywords ?? '').includes('Kilimanjaro'));
    expect(kilimanjaro.map((r) => r.title)).toEqual(['North Tanzanian Divergence']);
    expect(kilimanjaro[0].description).toBe('Sector of the East African Rift Zone · opens it on the globe');
    kilimanjaro[0].action!();
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: 'zone:east-african-rift/sector:north-tanzanian-divergence' }));
  });

  it('counts a Zone\'s Sectors in words, one Sector said as one (D-ML, L3)', () => {
    const [whole] = zoneResults(index, vi.fn());
    expect(whole.description).toBe(`Zone of ${rift.sectors.length} Sectors · opens it on the globe`);
    const [single] = zoneResults(zoneIndexOf([{ ...rift, sectors: rift.sectors.slice(0, 1) }]), vi.fn());
    expect(single.description).toBe('Zone of 1 Sector · opens it on the globe');
  });

  it('says what each result is in the language shown', async () => {
    await setLanguage('uk', false);
    try {
      const results = zoneResults(index, vi.fn(), uk.header);
      expect(results[0].description).toBe(`Зона з ${rift.sectors.length} секторами · відкриває на глобусі`);
      expect(results[1].description).toBe('Сектор зони East African Rift Zone · відкриває на глобусі');
      expect(areaResults(vi.fn(), uk.header)[0].description).toMatch(/ · обводить на глобусі$/);
    } finally {
      await setLanguage('en', false);
    }
  });

  it('flies to the middle of what was picked, never nearer than an area is flown to', () => {
    for (const place of [rift.root, rift.sectors[0]]) {
      const view = zoneFocusFor(place, { width: 1400, height: 900 })!;
      const [w, s, e, n] = place.bbox;
      expect(view.lat).toBeGreaterThan(s);
      expect(view.lat).toBeLessThan(n);
      expect(view.lng).toBeGreaterThan(w);
      expect(view.lng).toBeLessThan(e);
      expect(view.altitude!).toBeGreaterThanOrEqual(1);
    }
  });
});
