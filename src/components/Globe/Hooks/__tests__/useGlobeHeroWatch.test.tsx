/**
 * Hero Watch on the globe (decision D-HW, steps 3-4): its lifeboat stations drawn while Lifeboats is on,
 * sized by 2025's launches; relief while Relief is on, each country tinted whole with a package and a pill
 * counting its operations and organisations; the keys; the card's sources, crediting the RNLI, IFRC GO
 * and OCHA as their terms ask; and a card held until its records, outlines and pills are ready. Read
 * through a stand-in store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { FieldMission, HeroWatchItem, HeroWatchStatus, LifeboatStation, ReliefOperation, ReliefPresence, WeekSummary } from '../../../../services/heroWatch/heroWatch';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const reader = vi.hoisted(() => ({
  items: [] as HeroWatchItem[],
  // The same list each read, as the real store hands out: a new one each time re-renders forever.
  unread: [] as Array<{ kind: string; count: number }>,
  status: { loaded: true, error: null, at: Date.UTC(2026, 9, 10, 20) } as HeroWatchStatus,
  listeners: new Set<() => void>(),
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../../../services/heroWatch/heroWatch', () => ({
  heroWatchItems: () => reader.items,
  heroWatchStatus: () => reader.status,
  heroWatchUnread: () => reader.unread,
  subscribeHeroWatch: (listener: () => void) => { reader.listeners.add(listener); return () => reader.listeners.delete(listener); },
  startHeroWatch: () => { reader.start(); return reader.stop; },
}));
// The US states' outlines, served when the test says: a stand-in for the fetched file.
const states = vi.hoisted(() => {
  const NEW_MEXICO = { name: 'New Mexico', geometry: { type: 'Polygon' as const, coordinates: [[[-109, 31.3], [-103, 31.3], [-103, 37], [-109, 37], [-109, 31.3]]] } };
  let release: (() => void) | null = null;
  return {
    map: new Map([['us-nm', NEW_MEXICO]]),
    held: false,
    loads: 0,
    release: () => release?.(),
    load(this: { map: Map<string, unknown>; held: boolean; loads: number }) {
      this.loads += 1;
      return this.held ? new Promise((resolve) => { release = () => resolve(this.map); }) : Promise.resolve(this.map);
    },
  };
});
vi.mock('../../../../services/raverWatch/usStates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/raverWatch/usStates')>()),
  loadUsStates: () => states.load(),
}));
// jsdom has no 2D canvas to bake on: an atlas that is there, as it is in a browser.
vi.mock('../../heroWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../heroWatchSprites')>()),
  heroWatchAtlas: () => Promise.resolve(new THREE.Texture()),
  bakeHeroWatchPills: (labels: string[]) => Promise.resolve({
    texture: new THREE.Texture(),
    cells: new Map(labels.map((label) => [label, { u0: 0, v0: 0, u1: 1, v1: 1, widthPx: 90 }])),
  }),
}));

import { useGlobeHeroWatch, heroWatchReadiness, lifeboatAreasWithNone, lifeboatCoverage, RELIEF_FILL_TYPE, MISSION_OUTLINE_TYPE } from '../useGlobeHeroWatch';
import { HERO_WATCH_CELLS, HERO_WATCH_SPRITE_TYPE, HERO_WATCH_PILL_TYPE, lifeboatSizeScale } from '../../heroWatchSprites';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { CREDITS } from '../../../../features/globe/capture/sourceCredits';
import { DATA_SCALES } from '../../../../styles/tokens';
import { TERRITORY_FILLS_ORDER } from '../../../../geopolitical/theme/applyTerritoryLook';

const nowS = () => Math.floor(Date.now() / 1000);
const station = (over: Partial<LifeboatStation> = {}): LifeboatStation => ({
  id: `30023:pk:hero-watch-station-${Math.random()}`, pubkey: 'pk', d: 'hero-watch-station-1', eventId: 'e', createdAt: nowS() - 3_600,
  kind: 'station', section: 'Lifeboats', title: 'Dover lifeboat station: 76 launches in 2025', source: 'RNLI',
  validFrom: nowS() - 86_400, validUntil: nowS() + 300 * 86_400, jurisdiction: 'gb-eng', point: { lat: 51.118, lon: 1.311 },
  precision: 'venue', launches: 76, year: 2025, stationType: 'ALB', content: '', ...over,
});
const operation = (over: Partial<ReliefOperation> = {}): ReliefOperation => ({
  id: `30023:pk:hero-watch-appeal-${Math.random()}`, pubkey: 'pk', d: 'hero-watch-appeal-1', eventId: 'e', createdAt: nowS() - 3_600,
  kind: 'operation', section: 'Relief', title: 'Ethiopian Red Cross Society: Ethiopia Drought Response', source: 'IFRC GO',
  validFrom: nowS() - 86_400, validUntil: nowS() + 100 * 86_400, jurisdiction: 'et', appealType: 'DREF', amountChf: 749_972,
  peopleToReach: 50_000, content: '', ...over,
});
const presence = (over: Partial<ReliefPresence> = {}): ReliefPresence => ({
  id: `30023:pk:hero-watch-presence-${Math.random()}`, pubkey: 'pk', d: 'hero-watch-presence-et', eventId: 'e', createdAt: nowS() - 3_600,
  kind: 'presence', section: 'Relief', title: '144 organisations respond in Ethiopia, by OCHA\'s count', source: 'OCHA, via HDX',
  validFrom: nowS() - 86_400, validUntil: nowS() + 100 * 86_400, jurisdiction: 'et', organisations: 144, nationalNgos: 73,
  sectors: ['Protection'], periodStart: '2026-01-01', periodEnd: '2026-03-31', content: '', ...over,
});
const fieldMission = (over: Partial<FieldMission> = {}): FieldMission => ({
  id: `30079:pk:field-${Math.random()}`, pubkey: 'pk', d: 'starcom_mission_package_field-naloxone-NM', eventId: 'e', createdAt: nowS() - 3_600,
  kind: 'field_mission', section: 'FieldMissions', title: 'Carry naloxone in New Mexico: overdose deaths up 28.1% in a year',
  validFrom: nowS() - 86_400, validUntil: nowS() + 30 * 86_400, jurisdiction: 'us-nm', family: 'naloxone', state: 'open',
  description: 'MISSION: Put naloxone in more pockets.', objectives: [{ id: 'a', ask: 'Get naloxone.', effortMinutes: 30 }],
  limits: 'Work in pairs. Never confront anyone.', harmReduction: true, content: '', ...over,
});
const ETHIOPIA = { name: 'Ethiopia', geometry: { type: 'Polygon' as const, coordinates: [[[33, 3], [48, 3], [48, 15], [33, 15], [33, 3]]] } };
const USA = { name: 'United States of America', geometry: { type: 'Polygon' as const, coordinates: [[[-124, 25], [-67, 25], [-67, 49], [-124, 49], [-124, 25]]] } };
const TERRITORIES = {
  size: 2, at: () => null,
  byCode: (code: string) => ({ ET: ETHIOPIA, US: USA } as Record<string, typeof ETHIOPIA>)[code.toUpperCase()] ?? null,
  countries: () => [{ code: 'ET', name: 'Ethiopia' }, { code: 'US', name: 'United States of America' }],
} as unknown as TerritoryIndex;

const sprites = (scene: THREE.Scene) => {
  let found: THREE.Points | null = null;
  scene.traverse((o) => { if ((o as THREE.Points).isPoints && o.userData?.type === HERO_WATCH_SPRITE_TYPE) found = o as THREE.Points; });
  return found as THREE.Points | null;
};
const byType = (scene: THREE.Scene, type: string) => {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => { if (o.userData?.type === type) found = o; });
  return found as THREE.Object3D | null;
};
type Active = { Lifeboats: boolean; Relief?: boolean; FieldMissions?: boolean; RaverMissions?: boolean };
// Null for outlines not yet loaded: an undefined argument would take the default.
function mount(active: Active, window: { start: number; end: number } | null = null, territories: TerritoryIndex | null = TERRITORIES, featuredId: string | null = null) {
  const scene = new THREE.Scene();
  const hook = renderHook(
    (p: { active: Active; window: typeof window; territories: TerritoryIndex | null; featuredId?: string | null }) => useGlobeHeroWatch({
      scene, active: { Relief: false, FieldMissions: false, RaverMissions: false, ...p.active }, window: p.window, territories: p.territories ?? undefined,
      featuredId: p.featuredId ?? featuredId,
    }),
    { initialProps: { active, window, territories } },
  );
  return { scene, ...hook };
}

beforeEach(() => {
  states.held = false;
  states.loads = 0;
  reader.items = [];
  reader.status = { loaded: true, error: null, at: Date.UTC(2026, 9, 10, 20) };
  reader.start.mockClear();
  reader.stop.mockClear();
  resetLegendsForTest();
});

describe('Hero Watch\'s lifeboats on the globe', () => {
  it('draws each station standing, sized by its launches, and keys them', async () => {
    reader.items = [station(), station({ title: 'Tower lifeboat station: 439 launches in 2025', launches: 439, point: { lat: 51.508, lon: -0.077 } }),
      station({ title: 'Sheringham lifeboat station', launches: undefined, year: undefined, stationType: 'ILB', point: { lat: 52.946, lon: 1.203 } })];
    const { scene, result } = mount({ Lifeboats: true });
    expect(reader.start).toHaveBeenCalled();
    // The US states' outlines, a large file, are fetched only for field missions.
    expect(states.loads).toBe(0);
    await waitFor(() => expect(sprites(scene)).not.toBeNull());
    const sizes = Array.from((sprites(scene)!.geometry.getAttribute('pointSize') as THREE.BufferAttribute).array as Float32Array);
    expect(sizes).toHaveLength(3);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeCloseTo(lifeboatSizeScale(439) / lifeboatSizeScale(undefined), 3);
    // The busiest first, the uncounted last, so a small station on the same coast is drawn over a big one.
    expect(sizes[0]).toBe(Math.max(...sizes));
    expect(sizes[2]).toBe(Math.min(...sizes));
    // From far out the stations shrink (HW15); a package or a clipboard keeps its size.
    const far = new THREE.PerspectiveCamera(50, 1, 1, 100_000);
    far.position.set(0, 0, 290);
    far.updateMatrixWorld(true);
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1280, 720) } as unknown as THREE.WebGLRenderer;
    const points = sprites(scene)!;
    points.updateMatrixWorld(true);
    points.onBeforeRender(renderer, scene, far, points.geometry, points.material as THREE.Material, null as never);
    expect((points.material as THREE.ShaderMaterial).uniforms.sizeScale.value).toBeLessThan(0.5);
    const key = getLegends().find((l) => l.layer === 'Lifeboats')!;
    expect(key.when).toBe('launches in 2025');
    expect(key.sizeMeans).toMatch(/launches in 2025, the RNLI's count/);
    expect(key.swatches.map((s) => s.label)).toEqual(['an RNLI station, rimmed in rescue orange', 'its launches not counted, rimmed in grey']);
    expect(key.swatches[0].color).toBe(DATA_SCALES.heroWatch);
    expect(result.current.anyOn).toBe(true);
  });

  it('credits the RNLI on a card as its licence asks, and says the counts are 2025\'s', () => {
    reader.items = [station()];
    const { result } = mount({ Lifeboats: true });
    const [feed] = result.current.feeds;
    expect(feed).toMatchObject({ shortName: 'Lifeboats', layer: 'Lifeboats', name: 'Lifeboats from RNLI', credits: [CREDITS.rnliOpenData] });
    expect(CREDITS.rnliOpenData.text).toBe('Contains Open Data licensed under the GIS Open Data Licence');
    expect(feed.noteShort).toBe('Lifeboats: 2025\'s launches, not rescues now; not every RNLI station is published.');
  });

  it('says how many stations it draws, and which of the RNLI\'s areas have none, not "each RNLI station"', async () => {
    // As Mecha Jono published on 2026-10-10: England, Scotland, Northern Ireland and the Isle of Man only.
    reader.items = [station(), station({ jurisdiction: 'gb-sct' }), station({ jurisdiction: 'gb-nir' }), station({ jurisdiction: 'im' })];
    const { result } = mount({ Lifeboats: true });
    const [feed] = result.current.feeds;
    expect(feed.note).toMatch(/^Hero Watch: the 4 RNLI lifeboat stations published on The Record, each drawn at its place/);
    expect(feed.note).toContain('Not every RNLI station is published: none in Wales, Ireland or the Channel Islands.');
    expect(feed.noteShort).toBe('Lifeboats: 2025\'s launches, not rescues now; not every RNLI station is published.');
    await waitFor(() => expect(getLegends().find((l) => l.layer === 'Lifeboats')).toBeDefined());
    expect(getLegends().find((l) => l.layer === 'Lifeboats')!.shapeMeans)
      .toBe("a lifebuoy at each of the 4 RNLI stations published on The Record; none in Wales, Ireland or the Channel Islands; the RNLI's waters only: the UK, Ireland, the Isle of Man and the Channel Islands; no other lifeboat service is posted yet");
  });

  // Critique-2026-11-01, OR8: the key says the layer covers only the RNLI's waters, while that is so.
  it("says it covers the RNLI's waters only, until a station of another service is posted", () => {
    expect(lifeboatCoverage([station(), station({ jurisdiction: 'ie' })])).toMatch(/^the RNLI's waters only/);
    // A Dutch station (KNRM), once posted, takes the line away: the layer would no longer be the RNLI's alone.
    expect(lifeboatCoverage([station(), station({ jurisdiction: 'nl' })])).toBeNull();
    expect(lifeboatCoverage([])).toBeNull();
  });

  it('names Jersey or Guernsey alone when the other has stations, and claims nothing missing when every area has one', () => {
    const everywhere = ['gb-eng', 'gb-sct', 'gb-wls', 'gb-nir', 'im', 'ie', 'je', 'gg'];
    reader.items = everywhere.filter((j) => j !== 'je').map((jurisdiction) => station({ jurisdiction }));
    const some = mount({ Lifeboats: true });
    expect(some.result.current.feeds[0].note).toContain('none in Jersey.');
    reader.items = everywhere.map((jurisdiction) => station({ jurisdiction }));
    const all = mount({ Lifeboats: true });
    expect(all.result.current.feeds[0].note).not.toContain('Not every');
    expect(all.result.current.feeds[0].noteShort).toBe('Lifeboat launches are the RNLI\'s count for 2025, not rescues happening now.');
    reader.items = [station()];
    expect(mount({ Lifeboats: true }).result.current.feeds[0].note).toMatch(/^Hero Watch: the 1 RNLI lifeboat station published on The Record,/);
  });

  it('places a station with no jurisdiction by where it stands, as the Channel Islands\' four are published', () => {
    // Mecha Jono's sheet, 11 October: all 238 stations; the Channel Islands' carry a point and no jurisdiction.
    const jurisdictions = ['gb-eng', 'gb-sct', 'gb-wls', 'gb-nir', 'im', 'ie'];
    const jersey = station({ jurisdiction: undefined, point: { lat: 49.18, lon: -2.11 } });
    const guernsey = station({ jurisdiction: undefined, point: { lat: 49.45, lon: -2.53 } });
    const rest = jurisdictions.map((jurisdiction) => station({ jurisdiction }));
    expect(lifeboatAreasWithNone([...rest, jersey, guernsey])).toEqual([]);
    expect(lifeboatAreasWithNone([...rest, jersey])).toEqual(['Guernsey']);
    expect(lifeboatAreasWithNone([...rest, guernsey])).toEqual(['Jersey']);
    // Cherbourg is France, not the Channel Islands.
    expect(lifeboatAreasWithNone([...rest, station({ jurisdiction: undefined, point: { lat: 49.64, lon: -1.62 } })])).toEqual([]);
    // One with no jurisdiction elsewhere could be in any area: then no area is said to have none.
    expect(lifeboatAreasWithNone([station(), station({ jurisdiction: undefined, point: { lat: 53, lon: -9 } })])).toEqual([]);
    reader.items = [...rest, jersey, guernsey];
    const { result } = mount({ Lifeboats: true });
    expect(result.current.feeds[0].note).toMatch(/^Hero Watch: the 8 RNLI lifeboat stations published on The Record/);
    expect(result.current.feeds[0].note).not.toContain('Not every');
    expect(result.current.feeds[0].noteShort).toBe('Lifeboat launches are the RNLI\'s count for 2025, not rescues happening now.');
  });

  it('draws nothing past its end, and reads nothing while Lifeboats is off', async () => {
    reader.items = [station({ validFrom: nowS() - 400 * 86_400, validUntil: nowS() - 86_400 })];
    const { scene, rerender } = mount({ Lifeboats: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(sprites(scene)).toBeNull();
    reader.start.mockClear();
    rerender({ active: { Lifeboats: false }, window: null, territories: TERRITORIES });
    const off = mount({ Lifeboats: false });
    expect(reader.start).not.toHaveBeenCalled();
    expect(off.result.current.feeds).toEqual([]);
    expect(getLegends().find((l) => l.layer === 'Lifeboats')).toBeUndefined();
  });

  it('holds a card until its records are read, and not once they cannot be', () => {
    reader.status = { loaded: false, error: null, at: null };
    const { rerender } = mount({ Lifeboats: true });
    expect(heroWatchReadiness()).toEqual({ ready: false, why: 'Hero Watch was still being read from The Record' });
    reader.status = { loaded: false, error: 'The Record could not be read: connection failed', at: null };
    rerender({ active: { Lifeboats: true }, window: null, territories: TERRITORIES });
    expect(heroWatchReadiness()).toEqual({ ready: true });
    rerender({ active: { Lifeboats: false }, window: null, territories: TERRITORIES });
    expect(heroWatchReadiness()).toEqual({ ready: true });
  });
});

describe('Hero Watch\'s relief on the globe', () => {
  it('tints each country with relief whole, with a package at its middle and a pill counting both, and keys them', async () => {
    reader.items = [operation(), presence(), station()];
    const { scene, result } = mount({ Lifeboats: false, Relief: true });
    // A card waits while the pills' words are drawn, then goes.
    expect(heroWatchReadiness()).toEqual({ ready: false, why: 'Hero Watch\'s relief counts were still being drawn' });
    await waitFor(() => expect(byType(scene, HERO_WATCH_PILL_TYPE)).not.toBeNull());
    expect(heroWatchReadiness()).toEqual({ ready: true });
    const fills = byType(scene, RELIEF_FILL_TYPE)!;
    expect(fills.userData.countries).toEqual(['ET']);
    // Soft, yet orange, and over the countries' own fills, under the borders: a card's Quiet wash covered it.
    const fill = fills.children[0] as THREE.Mesh;
    expect((fill.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThanOrEqual(0.35);
    expect((fill.material as THREE.MeshBasicMaterial).opacity).toBeLessThanOrEqual(0.5);
    expect(fills.renderOrder).toBeGreaterThan(TERRITORY_FILLS_ORDER);
    expect(fills.renderOrder).toBeLessThan(100);
    expect((fill.material as THREE.MeshBasicMaterial).color.getHexString()).toBe(DATA_SCALES.heroWatch.slice(1).toLowerCase());
    // One package, no lifeboat: Lifeboats is off.
    const cells = Array.from((sprites(scene)!.geometry.getAttribute('atlasCell') as THREE.BufferAttribute).array);
    expect(cells).toEqual([HERO_WATCH_CELLS.indexOf('relief')]);
    const relief = sprites(scene)!;
    const far = new THREE.PerspectiveCamera(50, 1, 1, 100_000);
    far.position.set(0, 0, 290);
    far.updateMatrixWorld(true);
    relief.onBeforeRender({ getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1280, 720) } as unknown as THREE.WebGLRenderer, scene, far, relief.geometry, relief.material as THREE.Material, null as never);
    expect((relief.material as THREE.ShaderMaterial).uniforms.sizeScale.value).toBe(1);
    expect(sprites(scene)!.userData.tooltips).toEqual([expect.stringMatching(/^Ethiopia: 1 Red Cross and Red Crescent operation in IFRC GO: .*144 organisations at work by OCHA's count/)]);
    expect(byType(scene, HERO_WATCH_PILL_TYPE)!.userData.nameObstacleRects).toHaveLength(1);
    const key = getLegends().find((l) => l.layer === 'Relief')!;
    expect(key.badgeMeans).toBe('its pill: Red Cross and Red Crescent operations (IFRC GO) · organisations at work (OCHA\'s count)');
    expect(key.swatches[0].color).toBe(DATA_SCALES.heroWatch);
    const [feed] = result.current.feeds;
    expect(feed).toMatchObject({ shortName: 'Relief', credits: [CREDITS.ifrcGo, CREDITS.ochaHdx] });
    expect(feed.note).toMatch(/^Hero Watch: 1 country with relief, tinted whole/);
    expect(feed.note).toContain('used non-commercially');
    expect(feed.noteShort!.length).toBeLessThanOrEqual(90);
  });

  it('credits only the sources drawn, and says how many notes name no country drawn here', () => {
    reader.items = [presence(), operation({ jurisdiction: 'et-aa' })];
    const { result } = mount({ Lifeboats: false, Relief: true });
    const [feed] = result.current.feeds;
    expect(feed.credits).toEqual([CREDITS.ochaHdx]);
    expect(feed.note).toContain('1 relief note names no country drawn here, and is not drawn.');
  });

  it('holds a card until the countries are outlined, and draws nothing while Relief is off', async () => {
    reader.items = [operation()];
    const { scene, rerender, result } = mount({ Lifeboats: false, Relief: true }, null, null);
    expect(heroWatchReadiness()).toEqual({ ready: false, why: 'Hero Watch\'s relief countries were still being outlined' });
    rerender({ active: { Lifeboats: false, Relief: true }, window: null, territories: TERRITORIES });
    await waitFor(() => expect(heroWatchReadiness()).toEqual({ ready: true }));
    rerender({ active: { Lifeboats: false, Relief: false }, window: null, territories: TERRITORIES });
    await waitFor(() => expect(byType(scene, RELIEF_FILL_TYPE)).toBeNull());
    expect(byType(scene, HERO_WATCH_PILL_TYPE)).toBeNull();
    expect(result.current.feeds).toEqual([]);
    expect(getLegends().find((l) => l.layer === 'Relief')).toBeUndefined();
  });
});

describe('Hero Watch\'s field missions on the globe', () => {
  it('outlines each place with open missions, with a clipboard and a pill, never a mission without its limits', async () => {
    reader.items = [fieldMission(), fieldMission({ jurisdiction: 'us', title: 'Protect the older people around you', family: 'scam_shield', limits: 'Never ask for anyone\'s passwords.' }),
      fieldMission({ jurisdiction: undefined, family: 'public_comment' }), fieldMission({ state: 'closed', jurisdiction: 'us-nm' })];
    const { scene, result } = mount({ Lifeboats: false, FieldMissions: true });
    await waitFor(() => expect(byType(scene, HERO_WATCH_PILL_TYPE)).not.toBeNull());
    expect(states.loads).toBeGreaterThan(0);
    const outlines = byType(scene, MISSION_OUTLINE_TYPE)!;
    expect(outlines.userData.places).toEqual(['us-nm', 'US']);
    const line = outlines.children[0] as THREE.Line;
    expect((line.material as THREE.LineBasicMaterial).color.getHexString()).toBe(DATA_SCALES.heroWatch.slice(1).toLowerCase());
    const cells = Array.from((sprites(scene)!.geometry.getAttribute('atlasCell') as THREE.BufferAttribute).array);
    expect(cells).toEqual([HERO_WATCH_CELLS.indexOf('mission'), HERO_WATCH_CELLS.indexOf('mission')]);
    const tooltips = sprites(scene)!.userData.tooltips as string[];
    expect(tooltips[0]).toMatch(/^New Mexico: 1 open field mission\.\n.*\nIts limits: Work in pairs\. Never confront anyone\.$/s);
    expect(tooltips[1]).toContain('Its limits: Never ask for anyone\'s passwords.');
    expect(byType(scene, HERO_WATCH_PILL_TYPE)!.userData.nameObstacleRects).toHaveLength(2);
    const key = getLegends().find((l) => l.layer === 'Field missions')!;
    expect(key.badgeMeans).toBe('its pill: the place · its open missions');
    expect(key.swatches[0]).toMatchObject({ color: DATA_SCALES.heroWatch, shape: 'line' });
    const [feed] = result.current.feeds;
    expect(feed).toMatchObject({ shortName: 'Field missions', credits: [] });
    expect(feed.note).toMatch(/^Hero Watch: 2 open field missions in 2 places, each place outlined/);
    expect(feed.note).toContain('1 names no place drawn here, and is not drawn.');
    expect(feed.noteShort!.length).toBeLessThanOrEqual(90);
    expect(heroWatchReadiness()).toEqual({ ready: true });
    // Placed busiest first, so the one that waits where two would overlap is never the busiest.
    reader.items = [...reader.items, fieldMission({ jurisdiction: 'us', title: 'Refunds owed', family: 'refunds_owed' })];
    act(() => reader.listeners.forEach((listener) => listener()));
    await waitFor(() => expect(byType(scene, HERO_WATCH_PILL_TYPE)!.userData.labels).toEqual(['United States of America · 2 missions', 'New Mexico · 1 mission']));
  });

  it('holds a card while the states are outlined, and draws nothing while Field missions is off', async () => {
    states.held = true;
    reader.items = [fieldMission()];
    const { scene, rerender } = mount({ Lifeboats: false, FieldMissions: true });
    expect(heroWatchReadiness()).toEqual({ ready: false, why: 'Hero Watch\'s field mission states were still being outlined' });
    states.release();
    await waitFor(() => expect(byType(scene, MISSION_OUTLINE_TYPE)).not.toBeNull());
    await waitFor(() => expect(heroWatchReadiness()).toEqual({ ready: true }));
    rerender({ active: { Lifeboats: false, FieldMissions: false }, window: null, territories: TERRITORIES });
    await waitFor(() => expect(byType(scene, MISSION_OUTLINE_TYPE)).toBeNull());
    expect(getLegends().find((l) => l.layer === 'Field missions')).toBeUndefined();
  });
});

describe('Raver Watch\'s Raver missions (HW8)', () => {
  it('draws only the harm-reduction field missions, as Hero Watch draws them, and keys them as Raver missions', async () => {
    reader.items = [fieldMission(), fieldMission({ jurisdiction: 'us', title: 'Protect the older people around you', family: 'scam_shield', harmReduction: false }),
      fieldMission({ jurisdiction: undefined, title: 'Harm reduction this weekend', family: 'weekend_harm_reduction' })];
    const { scene, result } = mount({ Lifeboats: false, RaverMissions: true });
    expect(reader.start).toHaveBeenCalled();
    await waitFor(() => expect(byType(scene, HERO_WATCH_PILL_TYPE)).not.toBeNull());
    expect(byType(scene, MISSION_OUTLINE_TYPE)!.userData.places).toEqual(['us-nm']);
    expect(getLegends().find((l) => l.layer === 'Field missions')).toBeUndefined();
    const key = getLegends().find((l) => l.layer === 'Raver missions')!;
    expect(key).toMatchObject({ layerId: 'RaverMissions', shapeMeans: 'a clipboard at each state or country with open harm-reduction field missions, the place outlined' });
    const [feed] = result.current.feeds;
    expect(feed).toMatchObject({ shortName: 'Raver missions', credits: [] });
    expect(feed.note).toMatch(/^Raver Watch: 1 open harm-reduction field mission in 1 place, from Hero Watch/);
    expect(feed.note).toContain('1 names no place drawn here, and is not drawn.');
    expect(feed.noteShort!.length).toBeLessThanOrEqual(90);
  });

  it('draws every field mission once where both are on, keyed as Hero Watch\'s', async () => {
    reader.items = [fieldMission(), fieldMission({ jurisdiction: 'us', family: 'scam_shield', harmReduction: false })];
    const { scene, result } = mount({ Lifeboats: false, FieldMissions: true, RaverMissions: true });
    await waitFor(() => expect(byType(scene, MISSION_OUTLINE_TYPE)).not.toBeNull());
    expect(byType(scene, MISSION_OUTLINE_TYPE)!.userData.places).toEqual(['us-nm', 'US']);
    expect(result.current.feeds.map((f) => f.shortName)).toEqual(['Field missions']);
    expect(getLegends().find((l) => l.layer === 'Raver missions')).toBeUndefined();
  });
});

describe('what Hero Watch\'s panel is given', () => {
  const summary = (over: Partial<WeekSummary> = {}): WeekSummary => ({
    id: `30023:pk:hero-watch-2026-w41-${Math.random()}`, pubkey: 'pk', d: 'hero-watch-2026-w41', eventId: 'e', createdAt: nowS() - 3_600,
    kind: 'summary', title: 'Hero Watch, week 41', validFrom: nowS() - 86_400, validUntil: nowS() + 6 * 86_400, week: '2026-w41',
    content: 'This week: 76 lifeboat launches at Dover in the same seven days of 2025.', ...over,
  });

  it('gives the newest summary standing, and what is listed rather than drawn, while a section of its own is on', async () => {
    reader.items = [summary({ title: 'Older', createdAt: nowS() - 7_200 }), summary(), summary({ title: 'Past', validUntil: nowS() - 60 }),
      operation({ jurisdiction: 'et-aa' }), fieldMission({ jurisdiction: undefined, family: 'public_comment' }), fieldMission()];
    const { result } = mount({ Lifeboats: false, Relief: true, FieldMissions: true });
    expect(result.current.summary?.title).toBe('Hero Watch, week 41');
    expect(result.current.listed.relief.map((r) => r.jurisdiction)).toEqual(['et-aa']);
    // New Mexico's is drawn once the states' outlines are here; the public comments name no place.
    await waitFor(() => expect(result.current.listed.missions.map((m) => m.family)).toEqual(['public_comment']));
    expect(result.current.sectionsOn).toBe(true);
  });

  it('is not shown for Raver Watch\'s Raver missions alone, which Raver Watch\'s own panel sits beside', () => {
    reader.items = [summary()];
    expect(mount({ Lifeboats: false, RaverMissions: true }).result.current.sectionsOn).toBe(false);
    expect(mount({ Lifeboats: true }).result.current.sectionsOn).toBe(true);
  });
});

describe('Hero Watch on a card (step 7)', () => {
  it('lists what it draws to the share handle, and features the item a card is about', async () => {
    const mission = fieldMission({ id: `30079:${'a'.repeat(64)}:starcom_mission_package_field-naloxone-NM` });
    reader.items = [station(), operation(), mission, fieldMission({ id: 'unplaced', jurisdiction: undefined })];
    const { result } = mount({ Lifeboats: true, Relief: true, FieldMissions: true }, null, TERRITORIES, mission.id);
    await waitFor(() => expect(result.current.reports.map((r) => r.layer)).toEqual(['Lifeboats', 'Relief', 'FieldMissions']));
    expect(result.current.featured).toMatchObject({ id: mission.id, title: mission.title });
    expect(result.current.featured!.lines).toContain('Safety limits: Work in pairs. Never confront anyone.');
    // Why an address is not drawn, for one of its own; nothing for another layer's.
    expect(result.current.whyNotDrawn(mission.id)).toBeNull();
    expect(result.current.whyNotDrawn('unplaced')).toBe('"unplaced" is a Hero Watch field mission that names no place drawn here.');
    expect(result.current.whyNotDrawn('30023:x:someone-elses')).toBeUndefined();
  });

  it('says a section that is off, and features nothing it does not draw', () => {
    const mission = fieldMission({ id: 'm' });
    reader.items = [mission];
    const { result } = mount({ Lifeboats: true }, null, TERRITORIES, 'm');
    expect(result.current.featured).toBeNull();
    expect(result.current.whyNotDrawn('m')).toBe('"m" is a Hero Watch field mission, and Field missions is off: setLayer(\'FieldMissions\') or pinLayers([\'FieldMissions\']).');
  });
});

describe('the week\'s card (HW10)', () => {
  it('gives the week as drawn: its relief, its open missions placed, and its stations', async () => {
    reader.items = [operation(), presence(), fieldMission(), station()];
    const { result } = mount({ Lifeboats: true, Relief: true, FieldMissions: true });
    await waitFor(() => expect(result.current.missions).toHaveLength(1));
    const week = result.current.weekOf();
    expect(week).toMatchObject({ week: null, relief: 1, missions: 1, stations: 1 });
    expect(week.lines[0]).toBe('Relief: 1 operation and 144 organisations at work, in Ethiopia');
    expect(week.lines[2]).toBe('Field missions: 1 open in 1 place, each with its safety limits');
    // One point a section: relief, missions, stations.
    expect(week.points).toHaveLength(3);
  });
});

describe('Hero Watch this week as a playlist (HW13)', () => {
  it('offers its relief and open missions while Relief or Field missions is on, and says when its read is done', async () => {
    reader.items = [operation(), presence(), fieldMission()];
    const { result } = mount({ Lifeboats: false, Relief: true, FieldMissions: true });
    await waitFor(() => expect(result.current.missions).toHaveLength(1));
    const offer = result.current.tourCandidates()!;
    expect(offer.complete).toBe(true);
    expect(offer.candidates.map((c) => [c.rank, c.group])).toEqual([[0, 'region:ET'], [1, 'region:us-nm']]);
    expect(mount({ Lifeboats: true }).result.current.tourCandidates()).toBeNull();
    reader.status = { loaded: false, error: null, at: null };
    expect(mount({ Lifeboats: false, Relief: true }).result.current.tourCandidates()!.complete).toBe(false);
  });
});

