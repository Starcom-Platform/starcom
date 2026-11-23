/**
 * War & Conflict on the globe (decisions WC1-WC4).
 *
 * Read from The Record only while the layer is on. An item standing at the
 * moment the globe shows is a mark: at its point, with a faint ring when the
 * point stands for a province; or, when it names only a country, one mark for
 * the country's items at the country's centre, whose hover says they are about
 * the country as a whole (WC4). Under them, the war map fills each war's
 * countries by its tier, a country in two wars by the higher. The key says
 * what each backing, glyph and tier means, and the feeds say what was not
 * drawn and why.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { ConflictItem, WarItem, WarConflictSnapshot, WarConflictStatus } from '../../../../services/warConflict/warConflict';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const reader = vi.hoisted(() => ({
  snapshot: { items: [], wars: [] } as WarConflictSnapshot,
  status: { loaded: true, error: null, at: Date.UTC(2026, 9, 2, 20, 0) } as WarConflictStatus,
  listeners: new Set<() => void>(),
  stop: vi.fn(),
  start: vi.fn(),
}));
vi.mock('../../../../services/warConflict/warConflict', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/warConflict/warConflict')>()),
  warConflictSnapshot: () => reader.snapshot,
  warConflictStatus: () => reader.status,
  subscribeWarConflict: (listener: () => void) => { reader.listeners.add(listener); return () => reader.listeners.delete(listener); },
  startWarConflict: () => { reader.start(); return reader.stop; },
}));
vi.mock('../../warConflictSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../warConflictSprites')>()),
  warConflictAtlas: () => Promise.resolve(new THREE.Texture()),
  warConflictBadgeAtlas: () => Promise.resolve(new THREE.Texture()),
}));

import { useGlobeWarConflict, WAR_MAP_EDGE_TYPE, WAR_MAP_HATCH_TYPE, WAR_MAP_TYPE } from '../useGlobeWarConflict';
import { HATCH_OPACITY, FADED_HATCH_OPACITY } from '../../warHatch';
import { TERRITORY_FILLS_ORDER } from '../../../../geopolitical/theme/applyTerritoryLook';
import { stillMotion, releaseMotion } from '../../../../globe-engine/captureClock';
import {
  getGlobeQuality, qualityStepOf, reportFrameWindow, resetGlobeQualityForTests,
} from '../../../../services/globe/globeQuality';
import { WAR_CONFLICT_SPRITE_TYPE, WAR_CONFLICT_BACKING_LOOK } from '../../warConflictSprites';
import { CONFLICT_BACKINGS, CONFLICT_GLYPHS } from '../../../../services/warConflict/warConflictView';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { SEMANTIC } from '../../../../styles/tokens';

/** An outline as GeometryFactory.buildBorderLines draws it: one batch named 'borders' (D-GV GV0.2), or a line as it was. */
const isOutline = (o: THREE.Object3D) => (o as THREE.Line).isLine || ((o as LineSegments2).isLineSegments2 && o.name === 'borders');

const HOUR = 3_600;
const nowS = () => Math.floor(Date.now() / 1000);
let n = 0;
const item = (over: Partial<ConflictItem> = {}): ConflictItem => {
  n += 1;
  return {
    family: 'item', id: `30023:pk:starcom-intel-conflict-wikipedia-${n}`, pubkey: 'pk', d: `starcom-intel-conflict-wikipedia-${n}`,
    eventId: 'e', createdAt: nowS() - HOUR, title: `Item ${n}`, reportedAt: nowS() - HOUR, content: 'words',
    events: [{ id: 'airstrike', label: 'Airstrike' }], casualties: [], fatal: false, actors: [], source: 'wikipedia',
    point: { lat: 35, lon: 71.2 }, precision: 'city', jurisdiction: 'af', ...over,
  };
};
const war = (over: Partial<WarItem> = {}): WarItem => ({
  family: 'war', id: `30023:pk:starcom-intel-war-${over.name ?? 'x'}`, pubkey: 'pk', d: `starcom-intel-war-${over.name ?? 'x'}`, eventId: 'e',
  createdAt: nowS(), title: 'Major war: X', reportedAt: nowS(), content: 'words', name: 'X', tier: 'major_war', tierLabel: 'Major war',
  tierMeans: '10,000 or more combat-related deaths in the current or previous year', countries: ['ua'], fatalities: [], includes: [], theatres: [],
  ...over,
});
const square = (lon: number, lat: number) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] });
const COUNTRIES: Record<string, { name: string; geometry: unknown }> = {
  af: { name: 'Afghanistan', geometry: square(62, 30) },
  et: { name: 'Ethiopia', geometry: square(36, 5) },
  ua: { name: 'Ukraine', geometry: square(25, 45) },
  sy: { name: 'Syria', geometry: square(36, 33) },
  tr: { name: 'Turkey', geometry: square(28, 37) },
};
const territories = { byCode: (code: string) => COUNTRIES[code] ?? null } as unknown as TerritoryIndex;

function mount(
  active = true, window: { start: number; end: number } | null = null, featuredId: string | null = null, theatre: string | null = null,
  hatching?: boolean,
) {
  const scene = new THREE.Scene();
  const hook = renderHook((props: { active: boolean; hatching?: boolean }) =>
    useGlobeWarConflict({ scene, active: props.active, territories, window, featuredId, theatres: theatre === null ? undefined : [theatre], hatching: props.hatching }), { initialProps: { active, hatching } });
  return { scene, ...hook };
}
const sprites = (scene: THREE.Scene) => {
  const found: THREE.Points[] = [];
  scene.traverse((o) => { if (o.userData?.type === WAR_CONFLICT_SPRITE_TYPE) found.push(o as THREE.Points); });
  return found;
};
const markCount = (scene: THREE.Scene) => sprites(scene).reduce((sum, p) => sum + p.geometry.getAttribute('position').count, 0);
const fills = (scene: THREE.Scene) => {
  const found: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.userData?.type === WAR_MAP_TYPE) found.push(o); });
  return found;
};
const edgeGroups = (scene: THREE.Scene) => {
  const found: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.userData?.type === WAR_MAP_EDGE_TYPE) found.push(o); });
  return found;
};
const hatchGroups = (scene: THREE.Scene) => {
  const found: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.userData?.type === WAR_MAP_HATCH_TYPE) found.push(o); });
  return found;
};
const lines = (scene: THREE.Scene) => {
  const found: THREE.Line[] = [];
  scene.traverse((o) => { if (isOutline(o)) found.push(o as THREE.Line); });
  return found;
};

beforeEach(() => {
  reader.snapshot = { items: [], wars: [] };
  reader.status = { loaded: true, error: null, at: Date.UTC(2026, 9, 2, 20, 0) };
  reader.start.mockReset();
  reader.stop.mockReset();
  resetLegendsForTest();
});

describe('reading The Record', () => {
  it('reads only while the layer is on, and stops when it goes off', () => {
    const { rerender } = mount(false);
    expect(reader.start).not.toHaveBeenCalled();
    rerender({ active: true });
    expect(reader.start).toHaveBeenCalledTimes(1);
    rerender({ active: false });
    expect(reader.stop).toHaveBeenCalledTimes(1);
  });
});

describe('the items', () => {
  it('one at its point as its glyph on its backing, with its hover', async () => {
    reader.snapshot = { items: [item({ title: 'Pakistan launches airstrikes', fatal: true })], wars: [] };
    const { scene } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(1));
    const [points] = sprites(scene);
    expect(points.geometry.getAttribute('atlasCell').getX(0)).toBe(CONFLICT_GLYPHS.indexOf('strike'));
    expect(points.geometry.getAttribute('atlasRow').getX(0)).toBe(CONFLICT_BACKINGS.indexOf('deadly'));
    expect(points.userData.tooltips[0]).toContain('Pakistan launches airstrikes');
    expect(points.userData.layers).toEqual(['War & Conflict']);
  });

  it('a point that stands for a province has a faint ring round it', async () => {
    reader.snapshot = { items: [item({ precision: 'state' })], wars: [] };
    const { scene } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(lines(scene).length).toBeGreaterThan(0);
  });

  it('a country\'s items with no point share one mark at its centre, saying they are about the country as a whole', async () => {
    reader.snapshot = {
      items: [
        item({ title: 'Older', point: undefined, precision: undefined, jurisdiction: 'et', reportedAt: nowS() - 3 * HOUR }),
        item({ title: 'Newer', point: undefined, precision: undefined, jurisdiction: 'et', role: 'critical', events: [{ id: 'travel_warning', label: 'Travel warning' }] }),
        item({ title: 'Placed', point: { lat: 9, lon: 38.7 }, jurisdiction: 'et' }),
      ],
      wars: [],
    };
    const { scene } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const [points] = sprites(scene);
    const tooltips: string[] = points.userData.tooltips;
    const country = tooltips.findIndex((t) => t.startsWith('2 reports about Ethiopia as a whole, newest first:'));
    expect(country).toBeGreaterThanOrEqual(0);
    expect(tooltips[country].indexOf('Newer')).toBeLessThan(tooltips[country].indexOf('Older'));
    // Drawn as the most serious of them.
    expect(points.geometry.getAttribute('atlasRow').getX(country)).toBe(CONFLICT_BACKINGS.indexOf('critical'));
    expect(points.geometry.getAttribute('atlasCell').getX(country)).toBe(CONFLICT_GLYPHS.indexOf('warning'));
  });

  it('where marks crowd, draws the most serious, counting the rest, and opens them all (W1)', async () => {
    reader.snapshot = {
      items: [
        item({ title: 'A report', point: { lat: 35.1, lon: 71.0 } }),
        item({ title: 'Deaths', fatal: true, point: { lat: 35.3, lon: 71.4 } }),
        item({ title: 'A warning', role: 'critical', events: [{ id: 'travel_warning', label: 'Travel warning' }], point: { lat: 35, lon: 71.2 } }),
      ],
      wars: [],
    };
    const { scene } = mount();
    // The marks, then again with their badges once the badges' atlas is baked (and their rings and pings, W4).
    const { INTEL_BADGE_TYPE } = await import('../../intelReportSprites');
    await waitFor(() => expect(sprites(scene)[0]?.children.some((c) => c.userData.type === INTEL_BADGE_TYPE)).toBe(true));
    const [points] = sprites(scene);
    scene.updateMatrixWorld(true);
    const first = new THREE.Vector3().fromBufferAttribute(points.geometry.getAttribute('position') as THREE.BufferAttribute, 2).applyMatrix4(points.matrixWorld);
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10_000);
    camera.position.copy(first).setLength(1500);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const renderer = { getSize: (v: THREE.Vector2) => v.set(800, 600), getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
    points.onBeforeRender(renderer, scene, camera, points.geometry, points.material as THREE.Material, null as never);
    expect(Array.from((points.geometry.getAttribute('markShown') as THREE.BufferAttribute).array)).toEqual([0, 0, 1]);
    expect(points.userData.tooltips[2]).toContain('A warning');
    expect(points.userData.tooltips[2]).toContain('Under it, 2 marks more (2 reports): a click lists all 3, newest first.');
    expect(points.userData.opens[2].heading).toBe('War & Conflict, with 2 marks beside it');
    expect(points.userData.opens[2].notes).toHaveLength(3);
    expect(getLegends().find((l) => l.layerId === 'WarConflict')!.shapeMeans).toMatch(/a number on a mark counts the reports it stands for/);
  });

  it('draws nothing past its three days, and the feed says so', async () => {
    reader.snapshot = { items: [item({ reportedAt: nowS() - 80 * HOUR }), item()], wars: [] };
    const { scene, result } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(result.current.feeds[0].name).toContain('1 past its three days, not drawn');
  });

  it('says what this build does not know: an event type with no glyph, a source with no name (IX1)', () => {
    reader.snapshot = { items: [
      item({ events: [{ id: 'coup', label: 'Coup' }], source: 'new_desk' }),
      item({ events: [{ id: 'coup', label: 'Coup' }] }),
    ], wars: [] };
    const { result } = mount();
    const [feed] = result.current.feeds;
    expect(result.current.feeds.map((f) => f.layer)).toEqual(['WarConflict', 'WarConflict']);
    expect(feed.name).toContain('an event this build has no glyph for: coup (2), drawn by category or as a report');
    expect(feed.name).toContain('a source this build does not name: new_desk (1)');
    expect(feed.note).toMatch(/does not know every event type or source/);
    expect(feed.noteShort).toMatch(/event or source this build does not know/);
  });

  it('says nothing of the kind when it knows everything drawn', () => {
    reader.snapshot = { items: [item()], wars: [] };
    const { result } = mount();
    expect(result.current.feeds[0].name).not.toMatch(/this build/);
    expect(result.current.feeds[0].note).not.toMatch(/this build/);
  });

  it('says how many name no place it can draw', () => {
    reader.snapshot = { items: [item({ point: undefined, jurisdiction: undefined }), item({ point: undefined, jurisdiction: 'zz' })], wars: [] };
    const { result } = mount();
    expect(result.current.feeds[0].name).toContain('2 naming no place drawn here');
  });
});

describe('the war map', () => {
  /*
   * Where each war is fought, not every country on its list (theatre-lens.md, TL1):
   * the list washed whole regions, and a card's own item drowned in it.
   */
  it('fills where each war is fought by its tier, outlines the rest of its list, and keys the outline', async () => {
    const russiaUkraine = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    reader.snapshot = {
      items: [],
      wars: [
        war({ name: 'Big', tier: 'major_war', countries: ['ua', 'ru', 'tr'], theatres: [russiaUkraine] }),
        war({ name: 'Small', tier: 'skirmish', countries: ['sy'] }),
      ],
    };
    COUNTRIES.ru = { name: 'Russia', geometry: square(40, 50) };
    // On a screen that has given the hatching up (theatre-lens.md, TL5): the outline alone, keyed as one.
    const { scene } = mount(true, null, null, null, false);
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(0));
    const byTier = Object.fromEntries(fills(scene).map((group) => [group.userData.tier, group.userData.countries]));
    expect(byTier.major_war.sort()).toEqual(['ru', 'ua']);
    expect(byTier.skirmish).toEqual(['sy']);
    const edges = edgeGroups(scene);
    expect(edges.map((group) => [group.userData.tier, group.userData.countries])).toEqual([['major_war', ['tr']]]);
    expect(edges[0].children.length).toBeGreaterThan(0);
    const legend = getLegends().find((l) => l.layerId === 'WarConflict')!;
    expect(legend.swatches.find((s) => s.shape === 'line')).toMatchObject({ label: 'outlined: on a war\'s list, not where it is fought', color: SEMANTIC.severity[3] });
    delete COUNTRIES.ru;
  });

  describe('hatching where a war is listed and not fought (theatre-lens.md, TL5)', () => {
    const RU = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    const listed = () => {
      reader.snapshot = { items: [], wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua', 'tr', 'sy'], theatres: [RU] })] };
    };
    const hatchColour = (group: THREE.Object3D) => ((group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    const hatchOpacities = (scene: THREE.Scene) => hatchGroups(scene).flatMap((group) => group.children
      .map((mesh) => ((mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uOpacity.value as number));

    it('hatches the countries outlined, in their tier\'s colour, and never one a war is fought in', async () => {
      listed();
      const { scene } = mount();
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(1));
      const [hatch] = hatchGroups(scene);
      expect(hatch.userData).toMatchObject({ tier: 'major_war' });
      expect([...hatch.userData.countries].sort()).toEqual(['sy', 'tr']);
      expect(hatch.children.length).toBeGreaterThanOrEqual(2);
      expect(hatchColour(hatch).getHex()).toBe(new THREE.Color(SEMANTIC.severity[3]).getHex());
      // Each country's own material, round its own middle.
      const refs = hatch.children.map((mesh) => (((mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uRef.value as THREE.Vector2).y);
      expect(new Set(refs).size).toBe(2);
      expect(hatch.visible).toBe(true);
      expect(hatchOpacities(scene).every((o) => o === HATCH_OPACITY)).toBe(true);
    });

    it('keys the hatching on a screen that draws it, and on every card as hatched', async () => {
      listed();
      const { rerender } = mount();
      const outer = () => getLegends().find((l) => l.layerId === 'WarConflict')!.swatches.find((s) => s.label.includes('on a war\'s list'));
      await waitFor(() => expect(outer()).toMatchObject({ shape: 'hatch', label: 'hatched: on a war\'s list, not where it is fought' }));
      rerender({ active: true, hatching: false });
      await waitFor(() => expect(outer()).toMatchObject({
        shape: 'line', label: 'outlined: on a war\'s list, not where it is fought',
        card: { shape: 'hatch', label: 'hatched: on a war\'s list, not where it is fought' },
      }));
    });

    it('is given up on a screen told to, and drawn for every capture all the same', async () => {
      listed();
      const { scene, rerender } = mount(true, null, null, null, false);
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(1));
      expect(hatchGroups(scene)[0].visible).toBe(false);
      stillMotion(Date.UTC(2026, 9, 9));
      expect(hatchGroups(scene)[0].visible).toBe(true);
      releaseMotion();
      expect(hatchGroups(scene)[0].visible).toBe(false);
      rerender({ active: true, hatching: true });
      await waitFor(() => expect(hatchGroups(scene)[0].visible).toBe(true));
    });

    it('fades as the outlines do under a lens', async () => {
      listed();
      const { scene } = mount(true, null, null, 'russia-ukraine');
      await waitFor(() => expect(hatchOpacities(scene).length).toBeGreaterThan(0));
      expect(hatchOpacities(scene).every((o) => o === FADED_HATCH_OPACITY)).toBe(true);
    });

    it('tells the quality governor it hatches, so the first step down gives it up, and stops when the layer goes off', async () => {
      resetGlobeQualityForTests();
      listed();
      const { scene, rerender, unmount } = mount();
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(1));
      let at = 0;
      const frames = (ms: number, n = 1) => {
        for (let i = 0; i < n; i += 1) reportFrameWindow({ medianMs: ms, frames: 60, at: (at += 2000) }, 2);
      };
      const step = () => qualityStepOf(getGlobeQuality()).name;
      frames(40, 2);
      expect(step()).toBe('no glow, hatching or orbit rings');
      // Fast again, the hatching comes back: a step of its own while the layer hatches.
      frames(15, 12);
      expect(step()).toBe('full detail');
      at += 60_000;
      frames(40, 2);
      expect(step()).toBe('no glow, hatching or orbit rings');
      rerender({ active: false, hatching: false });
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(0));
      // With nothing to hatch, that step draws as full detail does: nothing to bring back.
      frames(15, 12);
      expect(step()).toBe('no glow, hatching or orbit rings');
      unmount();
      resetGlobeQualityForTests();
    });

    it('stops telling the governor it hatches once the globe is gone', async () => {
      resetGlobeQualityForTests();
      listed();
      const { scene, unmount } = mount();
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(1));
      let at = 0;
      const frames = (ms: number, n = 1) => {
        for (let i = 0; i < n; i += 1) reportFrameWindow({ medianMs: ms, frames: 60, at: (at += 2000) }, 2);
      };
      frames(40, 2);
      unmount();
      frames(15, 12);
      expect(qualityStepOf(getGlobeQuality()).name).toBe('no glow, hatching or orbit rings');
      resetGlobeQualityForTests();
    });

    it('lets go of its materials when the map is rebuilt or goes, and never of the fills\' geometry', async () => {
      listed();
      const { scene, unmount } = mount();
      await waitFor(() => expect(hatchGroups(scene)).toHaveLength(1));
      const mesh = hatchGroups(scene)[0].children[0] as THREE.Mesh;
      const disposed = { material: false, geometry: false };
      mesh.material instanceof THREE.Material && mesh.material.addEventListener('dispose', () => { disposed.material = true; });
      mesh.geometry.addEventListener('dispose', () => { disposed.geometry = true; });
      unmount();
      expect(disposed).toEqual({ material: true, geometry: false });
    });
  });

  it('keys each tier drawn, worst first, in the severity ramp', async () => {
    reader.snapshot = { items: [], wars: [war({ name: 'Big', tier: 'major_war' }), war({ name: 'Small', tier: 'skirmish', countries: ['tr'] })] };
    mount();
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeTruthy());
    const legend = getLegends().find((l) => l.layerId === 'WarConflict')!;
    const areas = legend.swatches.filter((s) => s.shape === 'area');
    expect(areas.map((s) => s.label)).toEqual(['Major war: 1 (10,000 or more combat deaths a year)', 'Skirmishes: 1 (under 100)']);
    expect(areas[0].color).toBe(SEMANTIC.severity[3]);
    expect(areas[1].color).toBe(SEMANTIC.severity[0]);
  });

  it('has its own feed, saying how many wars and from where', () => {
    reader.snapshot = { items: [], wars: [war(), war({ name: 'Y' })] };
    const { result } = mount();
    expect(result.current.feeds.map((f) => f.name)).toContain("The world's wars: 2, from Wikipedia's List of ongoing armed conflicts");
  });

  // IM11: a card prints each caveat in one short sentence; the full wording stays in the provenance.
  it('names both feeds briefly for a card, and gives their note in short', () => {
    reader.snapshot = { items: [item()], wars: [war()] };
    const { result } = mount();
    expect(result.current.feeds.map((f) => f.shortName)).toEqual(['War & Conflict', 'The war map']);
    for (const feed of result.current.feeds) {
      expect(feed.noteShort).toMatch(/never added/);
      expect(feed.noteShort!.length).toBeLessThan(feed.note!.length);
      expect(feed.noteShort!.length).toBeLessThanOrEqual(90);
    }
  });
});

describe('the key', () => {
  it('names each backing drawn, and says a mark at a country\'s centre is about the whole country', async () => {
    reader.snapshot = { items: [item({ fatal: true }), item({ point: { lat: 1, lon: 1 } })], wars: [] };
    mount();
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeTruthy());
    const legend = getLegends().find((l) => l.layerId === 'WarConflict')!;
    expect(legend.swatches.filter((s) => s.shape !== 'area').map((s) => s.label)).toEqual([
      WAR_CONFLICT_BACKING_LOOK.deadly.means, WAR_CONFLICT_BACKING_LOOK.report.means,
    ]);
    expect(legend.shapeMeans).toMatch(/country's centre/);
    expect(legend.shapeMeans).toMatch(/a strike/);
  });

  it('is withdrawn when the layer goes off', async () => {
    reader.snapshot = { items: [item()], wars: [war()] };
    const { scene, rerender } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(1));
    rerender({ active: false });
    await waitFor(() => expect(markCount(scene)).toBe(0));
    expect(fills(scene)).toHaveLength(0);
    expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeUndefined();
  });
});

describe('for the share handle (contract v10)', () => {
  it('lists what it draws, and features one on a card', async () => {
    const one = item({ title: 'Featured one' });
    reader.snapshot = { items: [one, item({ point: undefined, jurisdiction: 'et' })], wars: [] };
    const { result } = mount(true, null, one.id);
    expect(result.current.reports.map((r) => r.layer)).toEqual(['WarConflict', 'WarConflict']);
    expect(result.current.featured?.id).toBe(one.id);
  });
});

describe('the war map answers a hover and a click (W3)', () => {
  it("names the war where it is fought and where it is only listed, and opens its page and the items there", async () => {
    const { getRegisteredTooltipGroups } = await import('../../pointTooltipRegistry');
    const { lineBatchData } = await import('../../../../geopolitical/geometry/lineBatches');
    const russiaUkraine = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    reader.snapshot = {
      items: [
        item({ title: 'Older in Ukraine', point: undefined, precision: undefined, jurisdiction: 'ua', reportedAt: nowS() - 5 * HOUR }),
        item({ title: 'Newer in Ukraine', point: undefined, precision: undefined, jurisdiction: 'ua', reportedAt: nowS() - HOUR }),
      ],
      wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua', 'tr'], theatres: [russiaUkraine] })],
    };
    const { scene } = mount();
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(0));
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && /territory:war-map:major_war:ua#/.test(o.name)) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBeGreaterThan(0);
    const ua = meshes[0].userData;
    expect(ua.tooltip).toMatch(/^Ukraine: where Big is fought\./);
    expect(ua.tooltip).toMatch(/2 items stand here\. A click lists the war's page and them\./);
    expect(ua.opens.heading).toBe('War & Conflict · Ukraine');
    expect(ua.opens.notes.map((n: { title: string }) => n.title)).toEqual(['Major war: X', 'Newer in Ukraine', 'Older in Ukraine']);

    // Turkey is on the list, not fought in: its hatching and its outline say so.
    const hatch: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === 'war-hatch:tr') hatch.push(o as THREE.Mesh); });
    expect(hatch[0].userData.tooltip).toMatch(/^Turkey: on the list of Big, not where it is fought\./);
    expect(hatch[0].userData.tooltip).toMatch(/A click opens the war's page\./);
    const outline = edgeGroups(scene).flatMap((g) => g.children).flatMap((c) => lineBatchData(c)?.lines ?? []).find((l) => /:tr#/.test(l.id));
    expect(outline?.tooltip).toBe(hatch[0].userData.tooltip);

    // And the map is a group a hover reads.
    const registered = getRegisteredTooltipGroups();
    expect(registered.some((g) => g.children.some((c) => c.userData?.type === WAR_MAP_TYPE))).toBe(true);
  });
});

describe('magnitude and trend (W4)', () => {
  it('counts the largest death toll reported, never adding claims, and nothing that is not a death', async () => {
    const { deathsReported } = await import('../useGlobeWarConflict');
    expect(deathsReported(item({ casualties: [
      { kind: 'killed', count: 3, qualifier: '', words: '3 killed' },
      { kind: 'injured', count: 40, qualifier: '', words: '40 injured' },
      { kind: 'killed', count: 5, qualifier: 'at least', words: 'at least 5 killed' },
      { kind: 'killed', count: null, qualifier: '', words: 'dozens killed' },
    ] }))).toBe(5);
    expect(deathsReported(item())).toBe(0);
  });

  it("gives a war's last week against the week before in its country's hover", async () => {
    const russiaUkraine = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    const DAY = 24 * HOUR;
    reader.snapshot = {
      items: [
        item({ title: 'Long ago', theatre: russiaUkraine, reportedAt: nowS() - 20 * DAY }),
        item({ title: 'Last week', theatre: russiaUkraine, reportedAt: nowS() - 10 * DAY }),
        item({ title: 'This week 1', theatre: russiaUkraine, reportedAt: nowS() - 2 * DAY }),
        item({ title: 'This week 2', theatre: russiaUkraine, reportedAt: nowS() - HOUR }),
      ],
      wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua'], theatres: [russiaUkraine] })],
    };
    const { scene } = mount();
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(0));
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && /territory:war-map:major_war:ua#/.test(o.name)) meshes.push(o as THREE.Mesh); });
    expect(meshes[0].userData.tooltip).toContain('Big: 2 items in the last 7 days, 1 the 7 before.');
  });

  it('keys the rings by what they measure', async () => {
    reader.snapshot = { items: [item({ fatal: true, casualties: [{ kind: 'killed', count: 400, qualifier: '', words: '400 killed' }] })], wars: [] };
    mount();
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeTruthy());
    const legend = getLegends().find((l) => l.layerId === 'WarConflict')!;
    expect(legend.shapeMeans).toMatch(/a wider ring round a mark, more deaths reported: its area grows with the largest figure, as reported, never added/);
    // A card prints swatches: one names the rings, as here there is one to name.
    const { DEATH_RING_KEY } = await import('../useGlobeWarConflict');
    expect(legend.swatches.some((s) => s.label === DEATH_RING_KEY && s.style === 'ring')).toBe(true);
  });

  it('names no wide ring in the key where none is drawn', async () => {
    reader.snapshot = { items: [item({ fatal: true, casualties: [{ kind: 'killed', count: 3, qualifier: '', words: '3 killed' }] })], wars: [] };
    mount();
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeTruthy());
    const { DEATH_RING_KEY } = await import('../useGlobeWarConflict');
    expect(getLegends().find((l) => l.layerId === 'WarConflict')!.swatches.some((s) => s.label === DEATH_RING_KEY)).toBe(false);
  });
});

describe('the war map\'s key counts', () => {
  // A smaller war's countries can all lie under a bigger one's: it is still on the list.
  it('every war of a tier that is shaded somewhere, even one shaded over by a worse war', async () => {
    reader.snapshot = {
      items: [],
      wars: [
        war({ name: 'Big', tier: 'minor_war', countries: ['ua'] }),
        war({ name: 'Hidden', tier: 'minor_war', countries: ['sy'] }),
        war({ name: 'Worse', tier: 'major_war', countries: ['sy'] }),
      ],
    };
    mount();
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeTruthy());
    const labels = getLegends().find((l) => l.layerId === 'WarConflict')!.swatches.map((s) => s.label);
    expect(labels).toContain('Minor war: 2 (1,000 to 9,999)');
    expect(labels).toContain('Major war: 1 (10,000 or more combat deaths a year)');
  });

  it('is drawn over the clouds and under the borders', async () => {
    reader.snapshot = { items: [], wars: [war()] };
    const { scene } = mount();
    await waitFor(() => expect(fills(scene).length).toBe(1));
    const mesh = fills(scene)[0].children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere!;
    // A fill hugs the sphere: its farthest vertex is between the clouds (100.4) and the borders (100.6).
    const pos = mesh.geometry.getAttribute('position');
    const radius = Math.hypot(pos.getX(0), pos.getY(0), pos.getZ(0));
    expect(radius).toBeGreaterThan(100.4);
    expect(radius).toBeLessThan(100.6);
    expect(r).toBeTruthy();
  });

  /*
   * Drawn at no order, the war map went before the countries' own fills (95), and a card's Quiet style,
   * one dark tone over every country, washed a major war's red to salmon, as it did relief's orange.
   * After the countries' fills and before the borders (100), as relief's tint is.
   */
  it('draws after the countries\' own fills, so a card\'s Quiet tone never covers it, and before the borders', async () => {
    reader.snapshot = {
      items: [],
      wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua', 'ru', 'tr'], theatres: [{ slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' }] })],
    };
    COUNTRIES.ru = { name: 'Russia', geometry: square(40, 50) };
    const { scene } = mount();
    await waitFor(() => expect(hatchGroups(scene).length).toBe(1));
    for (const group of [...fills(scene), ...edgeGroups(scene), ...hatchGroups(scene)]) {
      expect(group.userData.type, group.userData.type).toBeTruthy();
      expect(group.renderOrder, group.userData.type).toBeGreaterThan(TERRITORY_FILLS_ORDER);
      expect(group.renderOrder, group.userData.type).toBeLessThan(100);
    }
    expect(fills(scene)).toHaveLength(1);
    expect(edgeGroups(scene)).toHaveLength(1);
    delete COUNTRIES.ru;
  });
});

describe('the war map\'s fills', () => {
  it('are more solid the worse the tier, so the worst wars stand out', async () => {
    reader.snapshot = {
      items: [],
      wars: [war({ name: 'A', tier: 'major_war', countries: ['ua'] }), war({ name: 'B', tier: 'minor_war', countries: ['sy'] }),
        war({ name: 'C', tier: 'conflict', countries: ['tr'] }), war({ name: 'D', tier: 'skirmish', countries: ['et'] })],
    };
    const { scene } = mount();
    await waitFor(() => expect(fills(scene)).toHaveLength(4));
    const opacity = (tier: string) => ((fills(scene).find((g) => g.userData.tier === tier)!.children[0] as THREE.Mesh).material as THREE.Material).opacity;
    expect(opacity('major_war')).toBeGreaterThan(opacity('minor_war'));
    expect(opacity('minor_war')).toBeGreaterThan(opacity('conflict'));
    expect(opacity('conflict')).toBeGreaterThan(opacity('skirmish'));
  });
});

describe('a war that changes tier', () => {
  // GeometryFactory caches a fill by id and shape, with the colour it was first built in.
  it('is drawn in its new tier\'s colour, not the one its country was first filled in', async () => {
    reader.snapshot = { items: [], wars: [war({ name: 'Shifting', tier: 'major_war', countries: ['et'] })] };
    const { scene, rerender } = mount();
    await waitFor(() => expect(fills(scene)).toHaveLength(1));
    reader.snapshot = { items: [], wars: [war({ name: 'Shifting', tier: 'skirmish', countries: ['et'] })] };
    reader.listeners.forEach((listener) => listener());
    rerender({ active: true });
    await waitFor(() => expect(fills(scene)[0]?.userData.tier).toBe('skirmish'));
    const material = (fills(scene)[0].children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(`#${material.color.getHexString()}`.toUpperCase()).toBe(SEMANTIC.severity[0].toUpperCase());
  });
});

describe('when the globe goes away', () => {
  it('withdraws its key and its marks', async () => {
    reader.snapshot = { items: [item()], wars: [war()] };
    const { scene, unmount } = mount();
    await waitFor(() => expect(markCount(scene)).toBe(1));
    unmount();
    expect(getLegends().find((l) => l.layerId === 'WarConflict')).toBeUndefined();
    expect(markCount(scene)).toBe(0);
  });
});

// IM16: the War & Conflict Brief's front page, from everything read for its day.
describe('the brief', () => {
  it('gives the newest day\'s brief from what it read, by theatre', () => {
    const afpak = { slug: 'afghanistan-pakistan', name: 'Afghanistan–Pakistan war', region: 'South Asia' };
    reader.snapshot = {
      items: [item({ theatre: afpak }), item({ theatre: afpak }), item({ point: undefined, jurisdiction: undefined })],
      wars: [war({ name: 'AfPak', tier: 'minor_war', theatres: [afpak] })],
    };
    const { result } = mount();
    expect(result.current.briefOf()).toMatchObject({
      count: 3, noTheatre: 1, theatres: [{ slug: 'afghanistan-pakistan', count: 2, tier: 'minor_war' }],
    });
  });

  it('gives the day it is asked for, and none for a day with nothing', () => {
    reader.snapshot = { items: [item()], wars: [] };
    const { result } = mount();
    const today = new Date((nowS() - HOUR) * 1000).toISOString().slice(0, 10);
    expect(result.current.briefOf(today)?.day).toBe(today);
    expect(result.current.briefOf('2020-01-01')).toBeNull();
  });

  it('gives none while the layer is off', () => {
    reader.snapshot = { items: [item()], wars: [] };
    const { result } = mount(false);
    expect(result.current.briefOf()).toBeNull();
  });
});

/*
 * WC3: picking a theatre in the brief lights up its war and its events. The war
 * map shades only the wars that list it; the other theatres' items dim, as a
 * card's other items do around the one it features.
 */
/*
 * The item a card is about, lit, and the war map faded under it (theatre-lens.md,
 * TL1): in the wash, the item sat in one small country and could not be seen.
 */
describe('a featured item', () => {
  const litParts = (scene: THREE.Scene) => {
    const found: string[] = [];
    scene.traverse((o) => { if (o.userData?.lit) found.push(o.userData.lit); });
    return found;
  };
  const fillOpacities = (scene: THREE.Scene) => fills(scene).map((group) => ((group.children[0] as THREE.Mesh).material as THREE.Material).opacity);

  it('fades every war fill and lights its own country, and puts both back when it is no longer featured', async () => {
    const featured = item({ title: 'Here', jurisdiction: 'et', point: undefined, precision: undefined });
    reader.snapshot = { items: [featured], wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua'] }), war({ name: 'Horn', tier: 'minor_war', countries: ['et'] })] };
    const scene = new THREE.Scene();
    const hook = renderHook((props: { featuredId: string | null }) =>
      useGlobeWarConflict({ scene, active: true, territories, window: null, featuredId: props.featuredId, theatre: null }), { initialProps: { featuredId: featured.id as string | null } });
    await waitFor(() => expect(litParts(scene)).toContain('war-fill'));
    expect(litParts(scene)).toContain('war-edge');
    expect(fillOpacities(scene).every((o) => o === 0.08)).toBe(true);
    hook.rerender({ featuredId: null });
    await waitFor(() => expect(litParts(scene)).toEqual([]));
    expect(fillOpacities(scene).sort()).toEqual([0.28, 0.36]);
  });

  it('fades the map for an item that names no country, and lights nothing', async () => {
    const featured = item({ title: 'At sea', jurisdiction: undefined, point: { lat: 12, lon: 45 } });
    reader.snapshot = { items: [featured], wars: [war({ name: 'Big', tier: 'major_war', countries: ['ua'] })] };
    const { scene } = mount(true, null, featured.id);
    await waitFor(() => expect(fillOpacities(scene)).toEqual([0.08]));
    expect(litParts(scene)).toEqual([]);
  });
});

describe('a theatre picked in the brief', () => {
  const UKRAINE = { slug: 'russo-ukrainian-war', name: 'Russo-Ukrainian War', region: 'europe' };
  const SUDAN = { slug: 'sudanese-civil-war', name: 'Sudanese civil war', region: 'africa' };

  const litParts = (scene: THREE.Scene) => {
    const found: string[] = [];
    scene.traverse((o) => { if (o.userData?.lit) found.push(o.userData.lit); });
    return found;
  };
  const fillOpacities = (scene: THREE.Scene) => fills(scene).map((group) => ((group.children[0] as THREE.Mesh).material as THREE.Material).opacity);

  // The lens (theatre-lens.md, TL2): the theatre's countries lit, the rest of the war map faded, not hidden.
  it('lights the theatre\'s countries, as Mecha Jono\'s vocabulary lists them, and fades every war fill', async () => {
    const russiaUkraine = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    reader.snapshot = {
      items: [],
      wars: [war({ name: 'East', tier: 'major_war', countries: ['ua'], theatres: [russiaUkraine] }), war({ name: 'Horn', tier: 'minor_war', countries: ['et'], theatres: [SUDAN] })],
    };
    const { scene } = mount(true, null, null, russiaUkraine.slug);
    await waitFor(() => expect(litParts(scene)).toContain('war-theatre-fill'));
    expect(fills(scene).flatMap((f) => f.userData.countries).sort()).toEqual(['et', 'ua']);
    expect(fillOpacities(scene).every((o) => o === 0.08)).toBe(true);
  });

  it('lights the countries its items name, for a theatre the vocabulary does not list', async () => {
    reader.snapshot = {
      items: [item({ title: 'In it', theatre: UKRAINE, jurisdiction: 'ua', point: undefined, precision: undefined })],
      wars: [war({ name: 'East', tier: 'major_war', countries: ['ua', 'tr'], theatres: [UKRAINE] })],
    };
    const { scene } = mount(true, null, null, UKRAINE.slug);
    await waitFor(() => expect(litParts(scene)).toEqual(['war-theatre-fill', 'war-theatre-edge']));
  });

  it('gives way to a featured item: its country lit, not the theatre\'s', async () => {
    const featured = item({ title: 'Here', theatre: SUDAN, jurisdiction: 'et', point: undefined, precision: undefined });
    reader.snapshot = { items: [featured, item({ title: 'In it', theatre: UKRAINE, jurisdiction: 'ua', point: undefined, precision: undefined })], wars: [] };
    const { scene } = mount(true, null, featured.id, UKRAINE.slug);
    await waitFor(() => expect(litParts(scene)).toEqual(['war-fill', 'war-edge']));
  });

  it("dims the other theatres' items and leaves its own whole", async () => {
    reader.snapshot = {
      items: [item({ title: 'In it', theatre: UKRAINE }), item({ title: 'Elsewhere', theatre: SUDAN, point: { lat: 10, lon: 30 } })],
      wars: [],
    };
    const { scene } = mount(true, null, null, UKRAINE.slug);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const points = sprites(scene)[0];
    const ids = points.userData.ids as string[];
    const opacity = points.geometry.getAttribute('markOpacity').array as Float32Array;
    const of = (title: string) => opacity[ids.indexOf(reader.snapshot.items.find((it) => it.title === title)!.id)];
    expect(of('In it')).toBeCloseTo(1, 5);
    expect(of('Elsewhere')).toBeLessThan(0.5);
  });

  it('lights nothing once the layer is off, though the pick is kept, and says which theatre is lit', async () => {
    const russiaUkraine = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    reader.snapshot = { items: [], wars: [war({ name: 'East', countries: ['ua'], theatres: [russiaUkraine] })] };
    const { scene, result, rerender } = mount(true, null, null, russiaUkraine.slug);
    await waitFor(() => expect(litParts(scene)).toContain('war-theatre-fill'));
    expect(result.current.theatreLit()).toEqual(['russia-ukraine']);
    rerender({ active: false });
    await waitFor(() => expect(litParts(scene)).toEqual([]));
    expect(result.current.theatreLit()).toEqual([]);
  });

  // A card's lens on several theatres at once (theatre-lens.md, TL15): the four-theatre front page.
  it('lights several theatres at once, says so, and dims the items of any other', async () => {
    const RU = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
    const TP = { slug: 'turkey-pkk', name: 'Turkey–PKK', region: 'Middle East' };
    reader.snapshot = {
      items: [item({ title: 'R', theatre: RU }), item({ title: 'T', theatre: TP, point: { lat: 37, lon: 40 } }), item({ title: 'Other', theatre: SUDAN, point: { lat: 10, lon: 30 } })],
      wars: [],
    };
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeWarConflict({ scene, active: true, territories, window: null, theatres: [RU.slug, TP.slug] }));
    const litCountries = () => {
      const found = new Set<string>();
      scene.traverse((o) => { if (o.userData?.lit === 'war-theatre-fill') found.add(o.name.replace(/^.*fill:([a-z]+)#.*$/, '$1')); });
      return [...found].sort();
    };
    // Russia has no outline in this index; Ukraine, Turkey and Syria do (Iraq does not).
    await waitFor(() => expect(litCountries()).toEqual(['sy', 'tr', 'ua']));
    expect(result.current.theatreLit()).toEqual(['russia-ukraine', 'turkey-pkk']);
    await waitFor(() => expect(markCount(scene)).toBe(3));
    const points = sprites(scene)[0];
    const ids = points.userData.ids as string[];
    const opacity = points.geometry.getAttribute('markOpacity').array as Float32Array;
    const of = (title: string) => opacity[ids.indexOf(reader.snapshot.items.find((it) => it.title === title)!.id)];
    expect(of('R')).toBeCloseTo(1, 5);
    expect(of('T')).toBeCloseTo(1, 5);
    expect(of('Other')).toBeLessThan(0.5);
  });

  it('says a featured item\'s country is lit, not the theatre', async () => {
    const featured = item({ title: 'Here', theatre: SUDAN, jurisdiction: 'et', point: undefined, precision: undefined });
    reader.snapshot = { items: [featured], wars: [] };
    const { scene, result } = mount(true, null, featured.id, UKRAINE.slug);
    await waitFor(() => expect(litParts(scene)).toEqual(['war-fill', 'war-edge']));
    expect(result.current.theatreLit()).toEqual([]);
  });

  it('gives each theatre\'s items a day up to a brief\'s day, from everything read, and none while the layer is off', () => {
    const day1 = Math.floor(Date.UTC(2026, 9, 3, 12) / 1000);
    const day2 = Math.floor(Date.UTC(2026, 9, 4, 12) / 1000);
    reader.snapshot = { items: [item({ theatre: UKRAINE, reportedAt: day1 }), item({ theatre: UKRAINE, reportedAt: day2 }), item({ theatre: UKRAINE, reportedAt: day2 })], wars: [] };
    const { result, rerender } = mount();
    const days = result.current.theatreDaysTo('2026-10-04').get(UKRAINE.slug)!;
    expect(days).toHaveLength(14);
    expect(days.slice(-2)).toEqual([{ day: '2026-10-03', count: 1 }, { day: '2026-10-04', count: 2 }]);
    rerender({ active: false });
    expect(result.current.theatreDaysTo('2026-10-04').size).toBe(0);
  });

  it('gives the brief its days and its items', () => {
    const day1 = Math.floor(Date.UTC(2026, 9, 3, 12) / 1000);
    const day2 = Math.floor(Date.UTC(2026, 9, 4, 12) / 1000);
    const a = item({ reportedAt: day1 });
    const b = item({ reportedAt: day2 });
    reader.snapshot = { items: [a, b], wars: [] };
    const { result } = mount();
    expect(result.current.briefDays).toEqual(['2026-10-04', '2026-10-03']);
    expect(result.current.itemsByIds([b.id, a.id]).map((it) => it.id)).toEqual([b.id, a.id]);
  });
});


describe('a briefing tour of today (briefing-playlists.md, BP5)', () => {
  it('offers the day\'s items as they arrive, says when the read is done, and nothing while the layer is off', () => {
    reader.snapshot = { items: [item({ role: 'critical' })], wars: [] };
    reader.status = { loaded: false, error: null, at: null };
    const { result, rerender } = mount(true);
    expect(result.current.tourCandidates()!.complete).toBe(false);
    reader.status = { loaded: true, error: null, at: Date.now() };
    rerender({ active: true });
    const offer = result.current.tourCandidates()!;
    expect(offer.complete).toBe(true);
    expect(offer.candidates[0].why).toMatch(/^Critical, as its report tagged it/);
    rerender({ active: false });
    expect(result.current.tourCandidates()).toBeNull();
  });
});

describe('a theatre, for its card (theatre-lens.md, TL3)', () => {
  const RU = { slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' };
  const HORN = { slug: 'ethiopia-eritrea', name: 'Ethiopia–Eritrea', region: 'Africa' };

  it('names it, lists its items drawn, its worst war, and its countries with an outline', () => {
    const inIt = item({ title: 'In it', theatre: RU, point: { lat: 48, lon: 37 }, jurisdiction: 'ua' });
    const elsewhere = item({ title: 'Elsewhere', theatre: HORN, point: { lat: 9, lon: 38 }, jurisdiction: 'et' });
    reader.snapshot = {
      items: [inIt, elsewhere],
      wars: [
        war({ name: 'Smaller', tier: 'minor_war', tierLabel: 'Minor war', theatres: [RU] }),
        war({ name: 'Russo-Ukrainian war', tier: 'major_war', tierLabel: 'Major war', theatres: [RU] }),
        war({ name: 'A major war, first by name', tier: 'major_war', tierLabel: 'Major war', theatres: [RU] }),
      ],
    };
    const { result } = mount();
    const facts = result.current.theatreFacts('russia-ukraine')!;
    expect(facts.name).toBe('Russia–Ukraine war');
    expect(facts.reports.map((r) => r.id)).toEqual([inIt.id]);
    expect(facts.war).toEqual({ name: 'A major war, first by name', tierLabel: 'Major war' });
    // Russia has no outline in this index: only Ukraine is framed and lit.
    expect(facts.countries.map((c) => c.code)).toEqual(['ua']);
    expect(facts.countries[0].region).toBe(COUNTRIES.ua);
    expect(result.current.theatreSlugs()).toEqual(['ethiopia-eritrea', 'russia-ukraine']);
  });

  it('knows a theatre only an item names, with no war, and none nothing read names; nothing while the layer is off', () => {
    const SUDAN = { slug: 'sudanese-civil-war', name: 'Sudanese civil war', region: 'africa' };
    reader.snapshot = { items: [item({ theatre: SUDAN, jurisdiction: 'et', point: undefined, precision: undefined })], wars: [] };
    const { result, rerender } = mount();
    const facts = result.current.theatreFacts(SUDAN.slug)!;
    expect(facts.war).toBeNull();
    expect(facts.countries.map((c) => c.code)).toEqual(['et']);
    expect(result.current.theatreFacts('atlantis')).toBeNull();
    rerender({ active: false });
    expect(result.current.theatreFacts(SUDAN.slug)).toBeNull();
    expect(result.current.theatreSlugs()).toEqual([]);
  });
});

describe('arcs of state forces (theatre-lens.md, TL6)', () => {
  const TURKEY = { name: 'Turkish Armed Forces', kind: 'state_force', country: 'tr' };
  const SUDAN = { slug: 'sudanese-civil-war', name: 'Sudanese civil war', region: 'africa' };
  const UKR = { slug: 'russo-ukrainian-war', name: 'Russo-Ukrainian War', region: 'europe' };

  it('joins a state force\'s country to where the item happened, faint at the force\'s end, in the item\'s backing colour', () => {
    const strike = item({ title: 'Drone strike near <Kunduz>', fatal: true, casualties: [{ kind: 'killed', count: 3, qualifier: '', words: '3 killed' }], actors: [TURKEY] });
    reader.snapshot = { items: [strike, item({ title: 'At home', jurisdiction: 'tr', point: { lat: 39, lon: 32 }, actors: [TURKEY] })], wars: [] };
    const { result } = mount();
    const [arc, ...rest] = result.current.arcs;
    expect(rest).toEqual([]);
    expect([arc.startLat, arc.startLng]).toEqual([39.5, 30.5]);
    expect([arc.endLat, arc.endLng]).toEqual([35, 71.2]);
    const deadly = WAR_CONFLICT_BACKING_LOOK.deadly.color;
    const rgb = [1, 3, 5].map((i) => parseInt(deadly.slice(i, i + 2), 16)).join(', ');
    expect(arc.color).toEqual([`rgba(${rgb}, 0.25)`, `rgba(${rgb}, 0.9)`]);
    expect(arc.label).toBe('Turkish Armed Forces, from Turkey, named in "Drone strike near <Kunduz>". '
      + 'The arc joins their country to where it happened; it is not a path anything took. A click lists what names them.');
    // A click opens the items naming the force acting abroad (W3): the strike, not the item at home, which draws no arc.
    expect(arc.opens?.heading).toBe('War & Conflict · Turkish Armed Forces, from Turkey');
    expect(arc.opens?.notes.map((n) => n.title)).toEqual(['Drone strike near <Kunduz>']);
    // Turkey to Afghanistan, about 35° apart: a low arc, under the cap an arc across the planet takes.
    expect(arc.altitude).toBeCloseTo(0.2 * 2 * Math.asin(Math.sqrt(Math.sin(((35 - 39.5) * Math.PI) / 360) ** 2
      + Math.cos((39.5 * Math.PI) / 180) * Math.cos((35 * Math.PI) / 180) * Math.sin(((71.2 - 30.5) * Math.PI) / 360) ** 2)), 6);
    expect(arc.altitude).toBeLessThan(0.25);
  });

  it('keys the arcs as what they are, and only while one is drawn', async () => {
    reader.snapshot = { items: [item({ actors: [TURKEY] })], wars: [] };
    const { rerender } = mount();
    const arcSwatch = () => getLegends().find((l) => l.layerId === 'WarConflict')?.swatches.find((s) => s.shape === 'arc');
    await waitFor(() => expect(arcSwatch()).toMatchObject({ label: 'an arc: a state\'s forces from another country, coloured as its item' }));
    reader.snapshot = { items: [item({ actors: [] })], wars: [] };
    act(() => reader.listeners.forEach((l) => l()));
    rerender({ active: true });
    await waitFor(() => expect(arcSwatch()).toBeUndefined());
  });

  it('dims the arcs of the other theatres under a lens, and of every other item under a featured one', () => {
    const inIt = item({ title: 'In it', theatre: UKR, actors: [TURKEY] });
    const other = item({ title: 'Elsewhere', theatre: SUDAN, actors: [TURKEY] });
    reader.snapshot = { items: [inIt, other], wars: [] };
    const alphaOf = (arcs: Array<{ color: [string, string]; label: string }>, title: string) =>
      Number(arcs.find((a) => a.label.includes(title))!.color[1].match(/, ([0-9.]+)\)$/)![1]);
    const lens = mount(true, null, null, UKR.slug).result.current.arcs;
    expect(alphaOf(lens, 'In it')).toBeCloseTo(0.9, 5);
    expect(alphaOf(lens, 'Elsewhere')).toBeLessThan(0.5);
    const featured = mount(true, null, other.id).result.current.arcs;
    expect(alphaOf(featured, 'Elsewhere')).toBeCloseTo(0.9, 5);
    expect(alphaOf(featured, 'In it')).toBeLessThan(0.5);
  });

  it('draws none while the layer is off', () => {
    reader.snapshot = { items: [item({ actors: [TURKEY] })], wars: [] };
    expect(mount(false).result.current.arcs).toEqual([]);
  });
});

describe("the second left rail's choices (critique-2026-11-01, OR1; plan B1)", () => {
  const TURKEY = { name: 'Turkish Armed Forces', kind: 'state_force', country: 'tr' };
  const mountShowing = (show: Partial<{ items: boolean; arcs: boolean; deaths: boolean; map: boolean }>) => {
    const scene = new THREE.Scene();
    const hook = renderHook(() => useGlobeWarConflict({ scene, active: true, territories, window: null, show }));
    return { scene, ...hook };
  };
  const legend = () => getLegends().find((l) => l.layerId === 'WarConflict');
  beforeEach(() => {
    reader.snapshot = {
      items: [item({ fatal: true, casualties: [{ kind: 'killed', count: 400, qualifier: '', words: '400 killed' }], actors: [TURKEY] })],
      wars: [war({ name: 'Small', tier: 'skirmish', countries: ['sy'] })],
    };
  });

  it('draws everything, and keys it, when nothing is turned off', async () => {
    const { result, scene } = mountShowing({});
    await waitFor(() => expect(legend()?.swatches.some((s) => s.shape === 'arc')).toBe(true));
    expect(result.current.arcs.length).toBe(1);
    expect(legend()!.swatches.some((s) => s.style === 'ring' && s.label.startsWith('a wider ring'))).toBe(true);
    expect(legend()!.swatches.some((s) => s.shape === 'area')).toBe(true);
    expect(fills(scene)[0].parent!.visible).toBe(true);
  });

  it('hands the globe no arcs, and keys none, with the arcs off', async () => {
    const { result } = mountShowing({ arcs: false });
    await waitFor(() => expect(legend()).toBeTruthy());
    expect(result.current.arcs).toEqual([]);
    expect(legend()!.swatches.some((s) => s.shape === 'arc')).toBe(false);
  });

  it('hides the war map and keys no tier with the map off', async () => {
    const { scene } = mountShowing({ map: false });
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(0));
    expect(fills(scene)[0].parent!.visible).toBe(false);
    expect(legend()!.swatches.some((s) => s.shape === 'area')).toBe(false);
  });

  it('draws no deaths rings, and keys none, with the deaths off; hides the marks with the items off', async () => {
    mountShowing({ deaths: false });
    await waitFor(() => expect(legend()).toBeTruthy());
    expect(legend()!.swatches.some((s) => s.label.startsWith('a wider ring'))).toBe(false);
    resetLegendsForTest();
    const { scene } = mountShowing({ items: false });
    await waitFor(() => expect(legend()).toBeTruthy());
    expect(sprites(scene).every((p) => !p.parent!.visible)).toBe(true);
    expect(legend()!.swatches.some((s) => s.style === 'ring' || s.style === 'disc' || s.style === 'glow')).toBe(false);
  });
});
