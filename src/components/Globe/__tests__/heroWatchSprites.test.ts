/**
 * Hero Watch's marks (decision D-HW, HW4, HW5, HW9): a lifebuoy at each station, in rescue orange,
 * sized by 2025's launches on one fixed scale, a station the RNLI does not count drawn apart from one
 * with few launches; and what a hover says. A tent at a country with relief, and its pill: a quad at a
 * fixed size on screen, right of the tent, that the country names keep clear of.
 */
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../../../symbols/uiSymbols';
import * as THREE from 'three';
import {
  buildHeroWatchPills, declutterPills, heroWatchAtlasRows, lifeboatMark, lifeboatScaleAt, lifeboatSizeScale, missionMark, pillWidthPx, reliefMark, stationTypeInWords,
  LIFEBOAT_DOT_PX, LIFEBOAT_DOT_SCALE, LIFEBOAT_FULL_PX,
  HERO_WATCH_CELLS, HERO_WATCH_LAYOUT, HERO_WATCH_SPRITE_TYPE, PILL_HEIGHT_PX, PILL_OFFSET_PX, HERO_WATCH_PILL_TYPE, type PillAtlas,
} from '../heroWatchSprites';
import { REPORT_SPRITE_PX } from '../Hooks/useGlobeIntelSprites';
import { DATA_SCALES } from '../../../styles/tokens';
import type { LifeboatStation } from '../../../services/heroWatch/heroWatch';

const station = (over: Partial<LifeboatStation> = {}): LifeboatStation => ({
  id: '30023:pk:hero-watch-station-5113', pubkey: 'pk', d: 'hero-watch-station-5113', eventId: 'e', createdAt: 1, kind: 'station',
  section: 'Lifeboats', title: 'Dover lifeboat station: 76 launches in 2025', source: 'RNLI', validFrom: 1, validUntil: 2,
  jurisdiction: 'gb-eng', point: { lat: 51.118, lon: 1.311 }, precision: 'venue', launches: 76, year: 2025, stationType: 'ALB', content: '', ...over,
});

describe('a lifeboat station\'s size', () => {
  it('grows with its launches on one fixed scale, so a card compares across views', () => {
    expect(lifeboatSizeScale(1)).toBeLessThan(lifeboatSizeScale(24));
    expect(lifeboatSizeScale(24)).toBeLessThan(lifeboatSizeScale(100));
    // A report's own size at a hundred launches: 118 stations line one coast.
    expect(lifeboatSizeScale(100)).toBeCloseTo(1, 6);
    // Area, not width, follows the count: four times the launches, twice the width over the base.
    expect((lifeboatSizeScale(100) - 0.4) / (lifeboatSizeScale(25) - 0.4)).toBeCloseTo(2, 6);
    // The busiest, Tower's 439, held to a cap so it does not swallow the Thames.
    expect(lifeboatSizeScale(439)).toBe(1.1);
    expect(lifeboatSizeScale(undefined)).toBe(0.4);
  });
});

describe('a lifeboat seen from far out (HW15)', () => {
  it('is whole close up, shrinks as the camera rises, and is a dot from Europe height, never gone', () => {
    expect(lifeboatScaleAt(LIFEBOAT_FULL_PX)).toBe(1);
    expect(lifeboatScaleAt(4000)).toBe(1);
    expect(lifeboatScaleAt(LIFEBOAT_DOT_PX)).toBe(LIFEBOAT_DOT_SCALE);
    expect(lifeboatScaleAt(100)).toBe(LIFEBOAT_DOT_SCALE);
    expect(lifeboatScaleAt((LIFEBOAT_FULL_PX + LIFEBOAT_DOT_PX) / 2)).toBeCloseTo((1 + LIFEBOAT_DOT_SCALE) / 2, 6);
    // From Europe height (the Earth's radius on screen near 480 px), Tower's 439 launches are a dot a third of its size.
    expect(lifeboatScaleAt(480)).toBeLessThan(0.5);
    expect(LIFEBOAT_DOT_SCALE).toBeGreaterThan(0);
  });
});

describe('a lifeboat mark', () => {
  it('is a lifebuoy sized by its launches, and says them, in 2025, on hover', () => {
    const mark = lifeboatMark(station(), new THREE.Vector3(1, 2, 3));
    expect(mark.cell).toBe(HERO_WATCH_CELLS.indexOf('lifeboat'));
    expect(mark.sizePx).toBeCloseTo(REPORT_SPRITE_PX * lifeboatSizeScale(76), 9);
    expect(mark.tooltip).toBe('Dover lifeboat station (all-weather lifeboat): 76 launches in 2025, the RNLI\'s count.');
  });

  it('names every kind of station the RNLI lists: all-weather, inshore, both, and hovercraft', () => {
    expect(stationTypeInWords('ALB')).toBe('all-weather lifeboat');
    expect(stationTypeInWords('ILB')).toBe('inshore lifeboat');
    expect(stationTypeInWords('ALB/ILB')).toBe('all-weather and inshore lifeboats');
    expect(stationTypeInWords('HOV')).toBe('hovercraft');
    expect(stationTypeInWords('XYZ')).toBeNull();
    expect(lifeboatMark(station({ stationType: 'HOV', title: 'Hunstanton lifeboat station' }), new THREE.Vector3()).tooltip).toMatch(/^Hunstanton lifeboat station \(hovercraft\):/);
  });

  it('draws a station the RNLI does not count apart, and says so, never as none', () => {
    const mark = lifeboatMark(station({ title: 'Sheringham lifeboat station', launches: undefined, year: undefined, stationType: 'ILB' }), new THREE.Vector3());
    expect(mark.cell).toBe(HERO_WATCH_CELLS.indexOf('lifeboat-uncounted'));
    expect(mark.sizePx).toBeCloseTo(REPORT_SPRITE_PX * 0.4, 9);
    expect(mark.tooltip).toBe('Sheringham lifeboat station (inshore lifeboat): its launches are not counted in the RNLI\'s records.');
  });
});

describe('a relief mark', () => {
  it('is a tent at a report\'s size, saying what its hover is given', () => {
    const mark = reliefMark(new THREE.Vector3(1, 2, 3), 'Ethiopia: 1 Red Cross and Red Crescent operation …');
    expect(mark.cell).toBe(HERO_WATCH_CELLS.indexOf('relief'));
    expect(mark.sizePx).toBe(REPORT_SPRITE_PX);
    expect(mark.tooltip).toBe('Ethiopia: 1 Red Cross and Red Crescent operation …');
  });
});

describe('a field missions mark', () => {
  it('is a clipboard at a report\'s size, saying what its hover is given', () => {
    const mark = missionMark(new THREE.Vector3(1, 2, 3), 'New Mexico: 1 open field mission.');
    expect(mark.cell).toBe(HERO_WATCH_CELLS.indexOf('mission'));
    expect(mark.sizePx).toBe(REPORT_SPRITE_PX);
    expect(mark.tooltip).toBe('New Mexico: 1 open field mission.');
  });
});

describe('a pill', () => {
  const atlas = (): PillAtlas => ({
    texture: new THREE.Texture(),
    cells: new Map([['1 op · 144 orgs', { u0: 0, v0: 0, u1: 0.75, v1: 0.5, widthPx: 96 }], ['2 ops', { u0: 0, v0: 0.5, u1: 0.4, v1: 1, widthPx: 48 }]]),
  });

  it('is as wide as its words and their padding', () => {
    expect(pillWidthPx(80.2)).toBe(81 + 14);
  });

  it('is a quad right of the tent, a fixed size on screen, its words from the atlas, top to bottom', () => {
    const mesh = buildHeroWatchPills([{ position: new THREE.Vector3(10, 20, 30), label: '1 op · 144 orgs' }], atlas())!;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const at = Array.from(geometry.getAttribute('position').array);
    expect(at).toEqual([10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30]);
    const half = PILL_HEIGHT_PX / 2;
    expect(Array.from(geometry.getAttribute('corner').array)).toEqual([
      PILL_OFFSET_PX, -half, PILL_OFFSET_PX + 96, -half, PILL_OFFSET_PX + 96, half, PILL_OFFSET_PX, half,
    ]);
    // The atlas is not flipped: its top row is v0, so a pill's top corners take v0.
    expect(Array.from(geometry.getAttribute('uv').array)).toEqual([0, 0.5, 0.75, 0.5, 0.75, 0, 0, 0]);
    expect(Array.from(geometry.getIndex()!.array)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(PILL_OFFSET_PX).toBeGreaterThan(REPORT_SPRITE_PX / 2);
  });

  it('is kept clear of by the country names, is never picked, and skips a pill its atlas lacks', () => {
    const mesh = buildHeroWatchPills([
      { position: new THREE.Vector3(1, 2, 3), label: '2 ops' },
      { position: new THREE.Vector3(4, 5, 6), label: 'not baked' },
    ], atlas())!;
    expect(mesh.userData).toMatchObject({
      type: HERO_WATCH_PILL_TYPE,
      nameObstacleRects: [{ at: [1, 2, 3], offsetXPx: PILL_OFFSET_PX, widthPx: 48, heightPx: PILL_HEIGHT_PX }],
    });
    expect(mesh.geometry.getAttribute('position').count).toBe(4);
    // Never a pick target: a hit on the words must not stand in for the tent's hover.
    expect(mesh.raycast).not.toBe(THREE.Mesh.prototype.raycast);
    expect(buildHeroWatchPills([], atlas())).toBeNull();
    expect(buildHeroWatchPills([{ position: new THREE.Vector3(), label: '2 ops' }], null)).toBeNull();
  });
});

describe('pills that would overlap', () => {
  const box = (x: number, y: number, width = 90) => ({ x, y, width, height: PILL_HEIGHT_PX });

  it('are placed first come, first placed: one that would overlap a placed one waits, one clear of all is placed', () => {
    expect(declutterPills([box(0, 0), box(40, 5), box(0, 30), box(200, 0)])).toEqual([true, false, true, true]);
    // Touching is not overlapping.
    expect(declutterPills([box(0, 0), box(90, 0)])).toEqual([true, true]);
    expect(declutterPills([box(0, 0), box(0, PILL_HEIGHT_PX)])).toEqual([true, true]);
    // One that waits is in no one's way.
    expect(declutterPills([box(0, 0), box(50, 0), box(120, 0)])).toEqual([true, false, true]);
    // One not on screen (null: behind the planet) is never placed and never in another's way.
    expect(declutterPills([null, box(0, 0)])).toEqual([false, true]);
  });

  it('shows only the placed ones, each frame, and keeps names clear of those alone', () => {
    const atlas: PillAtlas = { texture: new THREE.Texture(), cells: new Map([['A', { u0: 0, v0: 0, u1: 1, v1: 0.5, widthPx: 90 }], ['B', { u0: 0, v0: 0.5, u1: 1, v1: 1, widthPx: 90 }]]) };
    // Two pills at the same place, facing the camera: the first is placed, the second waits.
    const mesh = buildHeroWatchPills([{ position: new THREE.Vector3(0, 0, 101), label: 'A' }, { position: new THREE.Vector3(0, 0, 101), label: 'B' }], atlas)!;
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10_000);
    camera.position.set(0, 0, 350);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    const renderer = { getSize: (v: THREE.Vector2) => v.set(800, 600), getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
    mesh.onBeforeRender(renderer, new THREE.Scene(), camera, mesh.geometry, mesh.material as THREE.Material, null as never);
    const shown = Array.from((mesh.geometry.getAttribute('shown') as THREE.BufferAttribute).array);
    expect(shown).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(mesh.userData.nameObstacleRects).toHaveLength(1);
    expect(mesh.userData.nameObstacleRects[0].widthPx).toBe(90);

    // One above the other, clear of each other on screen: both placed.
    const stacked = buildHeroWatchPills([{ position: new THREE.Vector3(0, 0, 101), label: 'A' }, { position: new THREE.Vector3(0, 12, 100.3), label: 'B' }], atlas)!;
    stacked.updateMatrixWorld(true);
    stacked.onBeforeRender(renderer, new THREE.Scene(), camera, stacked.geometry, stacked.material as THREE.Material, null as never);
    expect(Array.from((stacked.geometry.getAttribute('shown') as THREE.BufferAttribute).array)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);

    // One on the far side of the planet is not placed, and does not keep one in front from being placed.
    const behind = buildHeroWatchPills([{ position: new THREE.Vector3(0, 0, -101), label: 'A' }, { position: new THREE.Vector3(0, 0, 101), label: 'B' }], atlas)!;
    behind.updateMatrixWorld(true);
    behind.onBeforeRender(renderer, new THREE.Scene(), camera, behind.geometry, behind.material as THREE.Material, null as never);
    expect(Array.from((behind.geometry.getAttribute('shown') as THREE.BufferAttribute).array)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('the atlas', () => {
  it('rims a counted station in rescue orange, an uncounted one in grey, each a lifebuoy; relief the Relief glyph, missions a clipboard', () => {
    const [row] = heroWatchAtlasRows();
    expect(row).toHaveLength(HERO_WATCH_CELLS.length);
    expect(row[HERO_WATCH_CELLS.indexOf('lifeboat')]).toContain(DATA_SCALES.heroWatch);
    expect(row[HERO_WATCH_CELLS.indexOf('lifeboat-uncounted')]).not.toContain(DATA_SCALES.heroWatch);
    expect(row[HERO_WATCH_CELLS.indexOf('relief')]).toContain(DATA_SCALES.heroWatch);
    // The rail's Relief glyph, wherever relief is drawn (glyph round 5: package-plus, 2026-10-11): the tent is gone.
    const relief = row[HERO_WATCH_CELLS.indexOf('relief')];
    for (const [, attrs] of GLYPHS['layer:Relief'].icon) if ('d' in attrs) expect(relief).toContain(String(attrs.d));
    expect(relief).not.toContain('M15.5 21 12 15l-3.5 6');
    expect(relief).not.toContain('m4.93 4.93 4.24 4.24');
    // Missions keep the clipboard on the globe (owner, 2026-10-11): a pin at a state's middle would say a point.
    const mission = row[HERO_WATCH_CELLS.indexOf('mission')];
    expect(mission).toContain(DATA_SCALES.heroWatch);
    expect(mission).toContain('m9 14 2 2 4-4');
    expect(mission).not.toContain('M16 16h6');
    for (const cell of row.filter((_, i) => HERO_WATCH_CELLS[i].startsWith('lifeboat'))) expect(cell).toContain('m4.93 4.93 4.24 4.24');
    expect(HERO_WATCH_LAYOUT).toMatchObject({ cellCount: HERO_WATCH_CELLS.length, rowCount: 1, type: HERO_WATCH_SPRITE_TYPE });
  });
});
