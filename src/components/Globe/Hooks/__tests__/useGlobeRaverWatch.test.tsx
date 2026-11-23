/**
 * Raver Watch on the globe (globe record, section 19, Phase 1 step 3).
 *
 * The Record is read only while one of its layers is on. An item applying now
 * is drawn where it applies: a point as its glyph on its level's backing, a
 * country as a faint outline in its level's colour. What ended, or applies to
 * a region with no outline here, is not drawn, and the feed says so: the key
 * must never show an empty layer as though nothing had been sent.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { RaverWatchItem, RaverWatchStatus } from '../../../../services/raverWatch/raverWatch';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const reader = vi.hoisted(() => ({
  items: [] as RaverWatchItem[],
  unread: [] as Array<{ kind: string; count: number }>,
  status: { loaded: true, error: null, at: Date.UTC(2026, 8, 29, 9, 30) } as RaverWatchStatus,
  listeners: new Set<() => void>(),
  stop: vi.fn(),
  start: vi.fn(),
}));
vi.mock('../../../../services/raverWatch/raverWatch', () => ({
  raverWatchItems: () => reader.items,
  raverWatchStatus: () => reader.status,
  raverWatchUnread: () => reader.unread,
  subscribeRaverWatch: (listener: () => void) => { reader.listeners.add(listener); return () => reader.listeners.delete(listener); },
  startRaverWatch: () => { reader.start(); return reader.stop; },
}));
const states = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../../services/raverWatch/usStates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/raverWatch/usStates')>()),
  loadUsStates: () => states.load(),
}));
// jsdom has no 2D canvas to bake on: an atlas that is there, as it is in a browser.
vi.mock('../../raverWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raverWatchSprites')>()),
  raverWatchAtlas: () => Promise.resolve(new THREE.Texture()),
}));

import { useGlobeRaverWatch, RAVER_WATCH_FLARE_TYPE, RAVER_WATCH_HALO_TYPE } from '../useGlobeRaverWatch';
import { DATA_SCALES } from '../../../../styles/tokens';
import { RAVER_WATCH_SPRITE_TYPE, RAVER_WATCH_LEVEL_LOOK, RAVER_WATCH_REGION_COLOR } from '../../raverWatchSprites';
import { RAVER_WATCH_GLYPHS } from '../../../../services/raverWatch/raverWatchView';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const DAY_MS = 86_400_000;
import { tonightOf } from '../../../../services/raverWatch/raverWatchView';

/** An outline as GeometryFactory.buildBorderLines draws it: one batch named 'borders' (D-GV GV0.2), or a line as it was. */
const isOutline = (o: THREE.Object3D) => (o as THREE.Line).isLine || ((o as LineSegments2).isLineSegments2 && o.name === 'borders');
const nowS = () => Math.floor(Date.now() / 1000);
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: `30023:pk:raver-${Math.random()}`, pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: nowS() - 3_600,
  layer: 'DrugCheckAlerts', title: 'Carfentanil in counterfeit tablets', source: 'CFSRE NPS Discovery',
  validFrom: nowS() - 86_400, validUntil: nowS() + 20 * 86_400, content: 'words', level: 'red',
  point: { lat: 40.7, lon: -74 }, ...over,
});
const square = (lon: number, lat: number) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat]]] });
const COUNTRIES: Record<string, { name: string; geometry: unknown }> = {
  us: { name: 'United States', geometry: { type: 'Polygon', coordinates: [[[-100, 40], [-90, 40], [-90, 45], [-100, 40]]] } },
  au: { name: 'Australia', geometry: square(135, -30) },
  de: { name: 'Germany', geometry: square(8, 48) },
  fr: { name: 'France', geometry: square(0, 44) },
  // Across the river from the test's Texas, for a heat town's close-up (IM37).
  mx: { name: 'Mexico', geometry: square(-102, 27) },
};
const territories = {
  byCode: (code: string) => COUNTRIES[code.toLowerCase()] ?? null,
  countries: () => Object.entries(COUNTRIES).map(([code, { name }]) => ({ code: code.toUpperCase(), name })),
} as unknown as TerritoryIndex;

const both = { DrugCheckAlerts: true, SceneIncidents: true, SceneEvents: false, HeatRisk: false };
const none = { DrugCheckAlerts: false, SceneIncidents: false, SceneEvents: false, HeatRisk: false };
function mount(active: typeof both, window: { start: number; end: number } | null = null, featuredId: string | null = null, moment: number | null = null) {
  const scene = new THREE.Scene();
  const hook = renderHook((props: { active: typeof both; window: typeof window; featuredId?: string | null; moment?: number | null }) =>
    useGlobeRaverWatch({ scene, active: props.active, territories, window: props.window, featuredId: props.featuredId ?? null, moment: props.moment ?? null }),
  { initialProps: { active, window, featuredId, moment } });
  return { scene, ...hook };
}
const sprites = (scene: THREE.Scene) => {
  const found: THREE.Points[] = [];
  scene.traverse((o) => { if (o.userData?.type === RAVER_WATCH_SPRITE_TYPE) found.push(o as THREE.Points); });
  return found;
};
const outlines = (scene: THREE.Scene) => {
  const found: THREE.Line[] = [];
  scene.traverse((o) => { if (isOutline(o)) found.push(o as THREE.Line); });
  return found;
};
const flares = (scene: THREE.Scene) => {
  const found: THREE.Points[] = [];
  scene.traverse((o) => { if (o.userData?.type === RAVER_WATCH_FLARE_TYPE) found.push(o as THREE.Points); });
  return found;
};
const halos = (scene: THREE.Scene) => {
  const found: THREE.Points[] = [];
  scene.traverse((o) => { if (o.userData?.type === RAVER_WATCH_HALO_TYPE) found.push(o as THREE.Points); });
  return found;
};
const markCount = (scene: THREE.Scene) => sprites(scene).reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);

beforeEach(() => {
  reader.items = [];
  reader.unread = [];
  reader.status = { loaded: true, error: null, at: Date.UTC(2026, 8, 29, 9, 30) };
  reader.start.mockReset();
  reader.stop.mockReset();
  states.load.mockReset();
  states.load.mockResolvedValue(new Map([['us-tx', { name: 'Texas', geometry: { type: 'Polygon', coordinates: [[[-100, 30], [-95, 30], [-95, 33], [-100, 30]]] } }]]));
  resetLegendsForTest();
});

describe('reading The Record', () => {
  it('reads nothing while its layers are off, and stops reading when they go off', () => {
    const { rerender } = mount(none);
    expect(reader.start).not.toHaveBeenCalled();

    rerender({ active: { ...none, SceneIncidents: true }, window: null });
    expect(reader.start).toHaveBeenCalledTimes(1);

    rerender({ active: none, window: null });
    expect(reader.stop).toHaveBeenCalledTimes(1);
  });
});

describe('what is drawn', () => {
  it('each item applying now, on a layer that is on, as one mark', async () => {
    reader.items = [
      item(),
      item({ layer: 'SceneIncidents', category: 'heat', level: 'amber' }),
      item({ validUntil: nowS() - 60 }),
    ];
    const { scene, rerender } = mount({ ...none, DrugCheckAlerts: true });
    await waitFor(() => expect(markCount(scene)).toBe(1));

    rerender({ active: both, window: null });
    await waitFor(() => expect(markCount(scene)).toBe(2));
  });

  // Red and amber lines on the borders mean a provisional border (globe record, section 8):
  // an alert's country is outlined in the mode's own violet, and the key says its level.
  it('a country it applies to as a faint violet outline, never a border’s colour, named in the key with its level', async () => {
    reader.items = [item({ point: undefined, jurisdiction: 'us', level: 'amber' })];
    const { scene } = mount(both);
    await waitFor(() => expect(outlines(scene).length).toBeGreaterThan(0));
    const material = outlines(scene)[0].material as THREE.LineBasicMaterial;
    expect(`#${material.color.getHexString()}`).toBe(RAVER_WATCH_REGION_COLOR);
    expect(material.opacity).toBeLessThan(0.7);
    expect(markCount(scene)).toBe(0);
    const legend = getLegends().find((l) => l.layerId === 'DrugCheckAlerts')!;
    expect(legend.swatches).toEqual([{ color: RAVER_WATCH_REGION_COLOR, label: 'United States: level amber', shape: 'line' }]);
  });

  // A state's alert is its state's outline, never widened to the country (RW4); the
  // states are fetched only when an item names one.
  // describeView counts marks per layer by this, and would count both under the mode's name.
  it('names each mark’s own layer, for describeView to count', async () => {
    reader.items = [item({ id: 'a' }), item({ id: 'b', layer: 'SceneIncidents', category: 'heat', point: { lat: 1, lon: 1 } })];
    const { scene } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    expect(sprites(scene)[0].userData.layers).toEqual(['Drug-check alerts', 'Scene incidents']);
  });

  it('a US state it applies to as that state’s outline, the states fetched only when one is named', async () => {
    reader.items = [item()];
    const { scene, rerender } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(states.load).not.toHaveBeenCalled();

    reader.items = [item({ id: 'tx', point: undefined, jurisdiction: 'us-tx', level: 'red' })];
    act(() => reader.listeners.forEach((l) => l()));
    rerender({ active: both, window: null });
    await waitFor(() => expect(outlines(scene).length).toBeGreaterThan(0));
    expect(states.load).toHaveBeenCalledTimes(1);
    const legend = getLegends().find((l) => l.layerId === 'DrugCheckAlerts')!;
    expect(legend.swatches).toEqual([{ color: RAVER_WATCH_REGION_COLOR, label: 'Texas: level red', shape: 'line' }]);
  });

  it('names six countries in the key, then how many more are outlined', async () => {
    const anywhere = { byCode: (code: string) => ({ name: code.toUpperCase(), geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }) } as unknown as TerritoryIndex;
    reader.items = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh'].map((code) => item({ id: code, point: undefined, jurisdiction: code, level: 'red' }));
    renderHook(() => useGlobeRaverWatch({ scene: new THREE.Scene(), active: both, territories: anywhere, window: null }));
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'DrugCheckAlerts')).toBeTruthy());
    const labels = getLegends().find((l) => l.layerId === 'DrugCheckAlerts')!.swatches.map((s) => s.label);
    expect(labels).toEqual(['AA: level red', 'BB: level red', 'CC: level red', 'DD: level red', 'EE: level red', 'FF: level red', 'and 2 more outlined']);
  });

  it('faded near its end', async () => {
    reader.items = [item({ validFrom: nowS() - 10 * 86_400, validUntil: nowS() + 3_600 })];
    const { scene } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    const opacity = (sprites(scene)[0].geometry.getAttribute('markOpacity') as THREE.BufferAttribute).getX(0);
    expect(opacity).toBeLessThan(0.5);
  });

  it('with a window chosen, what applied during it', async () => {
    const past = item({ validFrom: nowS() - 40 * 86_400, validUntil: nowS() - 30 * 86_400 });
    reader.items = [past];
    const { scene, rerender } = mount(both);
    await new Promise((r) => setTimeout(r, 20));
    expect(markCount(scene)).toBe(0);

    rerender({ active: both, window: { start: Date.now() - 35 * DAY_MS, end: Date.now() - 34 * DAY_MS } });
    await waitFor(() => expect(markCount(scene)).toBe(1));
  });

  it('draws nothing when its layers go off', async () => {
    reader.items = [item()];
    const { scene, rerender } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    rerender({ active: none, window: null });
    await waitFor(() => expect(markCount(scene)).toBe(0));
  });
});

describe('what the key says', () => {
  it('names each level it drew, in the style it drew it', async () => {
    reader.items = [item(), item({ level: 'amber', id: 'b' })];
    mount({ ...none, DrugCheckAlerts: true });
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'DrugCheckAlerts')).toBeTruthy());
    const legend = getLegends().find((l) => l.layerId === 'DrugCheckAlerts')!;
    expect(legend.swatches).toEqual([
      { color: RAVER_WATCH_LEVEL_LOOK.red.color, label: RAVER_WATCH_LEVEL_LOOK.red.means, style: 'glow' },
      { color: RAVER_WATCH_LEVEL_LOOK.amber.color, label: RAVER_WATCH_LEVEL_LOOK.amber.means, style: 'ring' },
    ]);
  });

  it('gives each layer on its source, when The Record answered, and what it did not draw and why', async () => {
    reader.items = [
      item(),
      item({ id: 'ended', validUntil: nowS() - 60 }),
      item({ id: 'state', point: undefined, jurisdiction: 'us-zz' }),
    ];
    const { result } = mount({ ...none, DrugCheckAlerts: true });
    const [feed] = result.current.feeds;
    // Under the layer it feeds, for the globe's loading status (D-LS).
    expect(feed.layer).toBe('DrugCheckAlerts');
    expect(feed.name).toContain('Drug-check alerts');
    expect(feed.name).toContain('CFSRE NPS Discovery');
    // Our own notes are credited to nobody, and the name does not name us (the operator, 24 Oct; record D-L, L6).
    expect(feed.name).not.toContain('Mecha Jono');
    expect(feed.credits).toEqual([]);
    expect(feed.name).toContain('1 past its end, not drawn');
    expect(feed.name).toContain('1 for a region not outlined here');
    expect(feed.lastUpdated).toBe(new Date(Date.UTC(2026, 8, 29, 9, 30)).toISOString());
    expect(feed).toMatchObject({ error: null, loading: false });
    expect(feed.note).toMatch(/while it applies/);
  });

  // IM11: a card prints each caveat in one short sentence; the full wording stays in the provenance.
  it('names each feed by its layer for a card, and gives its note in short', () => {
    reader.items = [item()];
    const { result } = mount({ ...none, DrugCheckAlerts: true });
    const [feed] = result.current.feeds;
    expect(feed.shortName).toBe('Drug-check alerts');
    expect(feed.noteShort).toMatch(/11 km/);
    expect(feed.noteShort!.length).toBeLessThan(feed.note!.length);
    expect(feed.noteShort!.length).toBeLessThanOrEqual(90);
  });

  it('says it is loading until The Record answers, and why when it cannot be read', () => {
    reader.status = { loaded: false, error: null, at: null };
    const { result, rerender } = mount({ ...none, SceneIncidents: true });
    expect(result.current.feeds[0]).toMatchObject({ loading: true, lastUpdated: null });

    reader.status = { loaded: false, error: 'The Record could not be read: connection failed', at: null };
    act(() => reader.listeners.forEach((l) => l()));
    rerender({ active: { ...none, SceneIncidents: true }, window: null });
    expect(result.current.feeds[0]).toMatchObject({ loading: false, error: 'The Record could not be read: connection failed' });
  });
});

describe('for the share handle (contract v8)', () => {
  it('lists what it draws, each with its layer, and features one on a card', async () => {
    const alert = item({ id: '30023:pk:raver-a' });
    const us = item({ id: '30023:pk:raver-us', point: undefined, jurisdiction: 'us', level: 'amber', layer: 'SceneIncidents' });
    reader.items = [alert, us, item({ id: '30023:pk:raver-ended', validUntil: nowS() - 60 })];
    const { result } = mount(both, null, us.id);
    await waitFor(() => expect(result.current.reports).toHaveLength(2));
    expect(result.current.reports.map((r) => [r.id, r.layer, r.variant])).toEqual([
      ['30023:pk:raver-a', 'DrugCheckAlerts', 'red'],
      ['30023:pk:raver-us', 'SceneIncidents', 'amber'],
    ]);
    expect(result.current.featured).toMatchObject({ id: us.id, title: us.title });
    expect(result.current.featured!.lines).toContain('Applies to United States');
  });

  it('features nothing it does not draw', () => {
    reader.items = [item({ id: '30023:pk:raver-ended', validUntil: nowS() - 60 })];
    const { result } = mount(both, null, '30023:pk:raver-ended');
    expect(result.current.featured).toBeNull();
  });

  it('draws a featured item larger, and the rest fainter, as a featured report is', async () => {
    reader.items = [item({ id: 'x', point: { lat: 10, lon: 10 } }), item({ id: 'y', point: { lat: 20, lon: 20 } })];
    const { scene, rerender } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const sizesBefore = Array.from((sprites(scene)[0].geometry.getAttribute('pointSize') as THREE.BufferAttribute).array);

    rerender({ active: both, window: null, featuredId: 'x' });
    await waitFor(() => {
      const sizes = Array.from((sprites(scene)[0].geometry.getAttribute('pointSize') as THREE.BufferAttribute).array);
      expect(sizes[0]).toBeGreaterThan(sizesBefore[0]);
    });
    const opacity = Array.from((sprites(scene)[0].geometry.getAttribute('markOpacity') as THREE.BufferAttribute).array);
    expect(opacity[0]).toBe(1);
    expect(opacity[1]).toBeLessThan(0.5);
  });
});

describe('v1.1: scene events, places that are areas, and what is listed instead', () => {
  const HOUR_S = 3_600;
  const sceneEvent = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
    id: `31923:pk:raver-scene-event-${Math.random()}`, layer: 'SceneEvents', level: undefined, category: 'event',
    title: 'House event in San Francisco, CA', source: '19hz.info', location: 'San Francisco, CA',
    validFrom: nowS() - 86_400, start: nowS() + 2 * HOUR_S, end: nowS() + 7 * HOUR_S, validUntil: nowS() + 7 * HOUR_S,
    startTzid: 'America/Los_Angeles', genres: ['house'], point: { lat: 37.8, lon: -122.4 }, precision: 'city', cancelled: false, ...over,
  });
  const events = { ...none, SceneEvents: true };

  it('reads The Record while only scene events are on', () => {
    mount(events);
    expect(reader.start).toHaveBeenCalledTimes(1);
  });

  it('a town\'s events share one mark, whose hover names them soonest first', async () => {
    reader.items = [
      sceneEvent({ title: 'Later', start: nowS() + 30 * HOUR_S, end: nowS() + 35 * HOUR_S, validUntil: nowS() + 35 * HOUR_S }),
      sceneEvent({ title: 'Sooner' }),
      sceneEvent({ title: 'Elsewhere', location: 'Oakland, CA', point: { lat: 37.8, lon: -122.3 } }),
    ];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const tooltips: string[] = sprites(scene)[0].userData.tooltips;
    const town = tooltips.find((t) => t.startsWith('2 scene events in San Francisco, CA'))!;
    expect(town).toBeDefined();
    expect(town.indexOf('Sooner')).toBeLessThan(town.indexOf('Later'));
  });

  it('an event not begun is faint, and one under way is whole', async () => {
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 } }), sceneEvent({ point: { lat: 20, lon: 20 }, start: nowS() - HOUR_S })];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const opacity = Array.from((sprites(scene)[0].geometry.getAttribute('markOpacity') as THREE.BufferAttribute).array);
    expect(Math.min(...opacity)).toBeLessThan(0.6);
    expect(Math.max(...opacity)).toBe(1);
  });

  // The flare as an event starts (raver-nights.md, RN1, RN5).
  it('flares an event that has just started: a ring wider than its glyph, in its colour, fading through its twenty minutes', async () => {
    reader.items = [
      sceneEvent({ title: 'Just started', point: { lat: 10, lon: 10 }, start: nowS() - 5 * 60 }),
      sceneEvent({ title: 'An hour in', point: { lat: 20, lon: 20 }, start: nowS() - HOUR_S }),
      sceneEvent({ title: 'Not yet', point: { lat: 30, lon: 30 } }),
    ];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(3));
    const [ring, ...more] = flares(scene);
    expect(more).toEqual([]);
    const glyphPx = Math.max(...Array.from((sprites(scene)[0].geometry.getAttribute('pointSize') as THREE.BufferAttribute).array));
    const ringPx = (ring.geometry.getAttribute('pointSize') as THREE.BufferAttribute).array[0];
    expect(ringPx).toBeGreaterThan(glyphPx);
    const colour = Array.from((ring.geometry.getAttribute('pointColor') as THREE.BufferAttribute).array).slice(0, 3);
    const violet = new THREE.Color(RAVER_WATCH_LEVEL_LOOK.info.color);
    expect(colour.map((c) => Math.round(c * 255))).toEqual([violet.r, violet.g, violet.b].map((c) => Math.round(c * 255)));
    const opacity = (ring.material as THREE.ShaderMaterial).uniforms.opacity.value as number;
    expect(opacity).toBeGreaterThan(0.2);
    expect(opacity).toBeLessThan(0.9);
    expect(ring.userData.ids).toEqual([reader.items[0].id]);
  });

  it('flares by the moment the timeline is paused at, not the end of the step around it, and none over a range read to its end', async () => {
    // Ten days back, so only the paused moment can make it flare.
    const start = nowS() - 10 * 86_400;
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 }, start, end: start + 6 * HOUR_S, validFrom: start - 86_400, validUntil: start + 6 * HOUR_S })];
    const step = { start: (start - 12 * HOUR_S) * 1000, end: (start + 12 * HOUR_S) * 1000 };
    const paused = mount(events, step, null, (start + 5 * 60) * 1000);
    await waitFor(() => expect(markCount(paused.scene)).toBe(1));
    expect(flares(paused.scene)).toHaveLength(1);
    // Five minutes into its twenty: a ring early in its swell.
    expect((flares(paused.scene)[0].material as THREE.ShaderMaterial).uniforms.opacity.value).toBeGreaterThan(0.5);
    const range = mount(events, { start: step.start, end: (start + 5 * 60) * 1000 }, null, (start + 5 * 60) * 1000);
    await waitFor(() => expect(markCount(range.scene)).toBe(1));
    expect(flares(range.scene)).toHaveLength(0);
  });

  it('starts its ring outside the glyph, at the very moment it starts', async () => {
    // The moment live is the minute: an event starting on it is at the start of its flare.
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 }, start: Math.floor(nowS() / 60) * 60 })];
    const { scene } = mount(events);
    await waitFor(() => expect(flares(scene)).toHaveLength(1));
    const glyphPx = (sprites(scene)[0].geometry.getAttribute('pointSize') as THREE.BufferAttribute).array[0];
    const ringPx = (flares(scene)[0].geometry.getAttribute('pointSize') as THREE.BufferAttribute).array[0];
    expect(ringPx).toBeGreaterThanOrEqual(glyphPx * 1.25);
  });

  it('flares later in its twenty minutes wider and fainter', async () => {
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 }, start: nowS() - 3 * 60 })];
    const early = mount(events);
    await waitFor(() => expect(flares(early.scene)).toHaveLength(1));
    const at = (scene: THREE.Scene) => {
      const ring = flares(scene)[0];
      return { px: (ring.geometry.getAttribute('pointSize') as THREE.BufferAttribute).array[0], opacity: (ring.material as THREE.ShaderMaterial).uniforms.opacity.value as number };
    };
    const first = at(early.scene);
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 }, start: nowS() - 15 * 60 })];
    const later = mount(events);
    await waitFor(() => expect(flares(later.scene)).toHaveLength(1));
    const second = at(later.scene);
    expect(second.px).toBeGreaterThan(first.px);
    expect(second.opacity).toBeLessThan(first.opacity);
  });

  it('flares a town for its newest start, and dims a flare under another item featured', async () => {
    const town = { lat: 10, lon: 10 };
    reader.items = [sceneEvent({ point: town, start: nowS() - 15 * 60 }), sceneEvent({ point: town, start: nowS() - 3 * 60 })];
    const { scene } = mount(events);
    await waitFor(() => expect(flares(scene)).toHaveLength(1));
    const opacityOf = (s: THREE.Scene) => (flares(s)[0].material as THREE.ShaderMaterial).uniforms.opacity.value as number;
    // Three minutes in, not fifteen.
    expect(opacityOf(scene)).toBeGreaterThan(0.6);
    const flaring = sceneEvent({ point: { lat: 10, lon: 10 }, start: nowS() - 3 * 60 });
    const other = item({ point: { lat: 40, lon: 40 } });
    reader.items = [flaring, other];
    const featured = mount({ ...both, SceneEvents: true }, null, other.id);
    await waitFor(() => expect(flares(featured.scene)).toHaveLength(1));
    expect(opacityOf(featured.scene)).toBeLessThan(0.5);
  });

  // The heat halo (raver-nights.md, RN2, RN4).
  it('haloes an event in a town at Orange or worse that day, under its glyph, in its level\'s colour, and keys it', async () => {
    const hot = item({ layer: 'HeatRisk', level: 'red', heatRisk: 3, point: { lat: 37.8, lon: -122.45 }, validFrom: nowS() - HOUR_S, validUntil: nowS() + 20 * HOUR_S });
    reader.items = [sceneEvent(), sceneEvent({ title: 'Cool', point: { lat: 47.6, lon: -122.3 } }), hot];
    const { scene } = mount(events);
    await waitFor(() => expect(halos(scene)).toHaveLength(1));
    const [halo] = halos(scene);
    const colour = Array.from((halo.geometry.getAttribute('pointColor') as THREE.BufferAttribute).array).slice(0, 3);
    const red = new THREE.Color(DATA_SCALES.heatRisk[3]);
    expect(colour.map((c) => Math.round(c * 255))).toEqual([red.r, red.g, red.b].map((c) => Math.round(c * 255)));
    // Under the glyph: drawn before it among the layer's marks.
    expect(halo.renderOrder).toBeLessThan(sprites(scene)[0].renderOrder);
    expect(halo.userData.ids).toEqual([reader.items[0].id]);
    const swatches = getLegends().find((legend) => legend.layerId === 'SceneEvents')!.swatches;
    expect(swatches).toContainEqual({ color: DATA_SCALES.heatRisk[3], label: 'in a town at HeatRisk 3 (Red) that day: a halo', shape: 'glow' });
  });

  it('draws no halo below Orange, nor for heat on another day', async () => {
    const mild = item({ layer: 'HeatRisk', level: 'amber', heatRisk: 1, point: { lat: 37.8, lon: -122.45 }, validFrom: nowS() - HOUR_S, validUntil: nowS() + 20 * HOUR_S });
    const yesterday = item({ layer: 'HeatRisk', level: 'red', heatRisk: 3, point: { lat: 37.8, lon: -122.45 }, validFrom: nowS() - 30 * HOUR_S, validUntil: nowS() - 6 * HOUR_S });
    reader.items = [sceneEvent(), mild, yesterday];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(halos(scene)).toEqual([]);
    expect(getLegends().find((legend) => legend.layerId === 'SceneEvents')!.swatches.some((s) => s.shape === 'glow')).toBe(false);
  });

  it('keys a flare while one is drawn, and not otherwise', async () => {
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 }, start: nowS() - 5 * 60 })];
    const { scene } = mount(events);
    await waitFor(() => expect(flares(scene)).toHaveLength(1));
    const swatches = getLegends().find((legend) => legend.layerId === 'SceneEvents')!.swatches;
    expect(swatches).toContainEqual(expect.objectContaining({ label: 'just started: a ring that swells and fades', shape: 'ring' }));
    reader.items = [sceneEvent({ point: { lat: 10, lon: 10 } })];
    const quiet = mount(events);
    await waitFor(() => expect(markCount(quiet.scene)).toBe(1));
    expect(getLegends().find((legend) => legend.layerId === 'SceneEvents')!.swatches.some((s) => s.shape === 'ring')).toBe(false);
  });

  it('the key says a scene event is a scene event, not information', async () => {
    reader.items = [sceneEvent()];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    const labels = getLegends().find((legend) => legend.layerId === 'SceneEvents')!.swatches.map((s) => s.label);
    expect(labels).toEqual(['a scene event (a disc)']);
  });

  it('a live town is drawn after a town whose events are all called off, so it lies on top', async () => {
    reader.items = [
      sceneEvent({ id: 'live', title: 'Live one', point: { lat: 37.8, lon: -122.4 } }),
      sceneEvent({ id: 'off', title: 'Called off', cancelled: true, point: { lat: 37.8, lon: -122.3 } }),
    ];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const tooltips: string[] = sprites(scene)[0].userData.tooltips;
    expect(tooltips[0]).toMatch(/^Cancelled/);
    expect(tooltips[1]).toMatch(/^Live one/);
  });

  it('an event more than a week away is not drawn yet', async () => {
    reader.items = [sceneEvent({ start: nowS() + 8 * 86_400, end: nowS() + 8 * 86_400 + 5 * HOUR_S, validUntil: nowS() + 8 * 86_400 + 5 * HOUR_S })];
    const { scene } = mount(events);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(markCount(scene)).toBe(0);
  });

  it('policy news is not drawn, and is listed apart', async () => {
    const policy = item({ id: 'policy', layer: 'SceneIncidents', category: 'policy', level: 'amber', point: undefined, jurisdiction: 'us' });
    reader.items = [policy];
    const { scene, result } = mount(both);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(markCount(scene)).toBe(0);
    expect(outlines(scene)).toHaveLength(0);
    expect(result.current.listed.news.map((i) => i.id)).toEqual(['policy']);
  });

  it('scene news is not drawn, is listed apart, and the feed says so (RW17)', async () => {
    const news = item({ id: 'news', layer: 'SceneEvents', level: undefined, sceneNews: true, category: 'scene.news', point: { lat: 35.7, lon: 139.7 } });
    reader.items = [news];
    const { scene, result } = mount({ ...both, SceneEvents: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(markCount(scene)).toBe(0);
    expect(result.current.listed.sceneNews.map((i) => i.id)).toEqual(['news']);
    expect(result.current.listed.news).toEqual([]);
    const events = result.current.feeds.find((f) => f.shortName === 'Scene events')!;
    expect(events.name).toContain('1 scene news, listed');
  });

  it('says when notes of a kind this build does not read were refused (IX1), and nothing when none were', () => {
    reader.items = [item()];
    reader.unread = [{ kind: 'scene_rumour', count: 3 }];
    const { result, rerender } = mount(both);
    expect(result.current.feeds[0].note).toContain('3 notes of a kind this build does not read (scene_rumour 3) are not shown');
    expect(result.current.feeds[0].noteShort).toMatch(/of a kind this build does not read/);
    reader.unread = [];
    rerender({ active: { ...both }, window: null });
    expect(result.current.feeds[0].note).not.toMatch(/this build/);
  });

  it('what names no place is listed, newest first', () => {
    reader.items = [
      item({ id: 'older', point: undefined, validFrom: nowS() - 2 * 86_400 }),
      item({ id: 'newer', point: undefined }),
    ];
    const { result } = mount(both);
    expect(result.current.listed.unplaced.map((i) => i.id)).toEqual(['newer', 'older']);
  });

  it('a warning for all of Europe outlines Europe, and is named once in the key', async () => {
    reader.items = [item({ id: 'eu', point: undefined, region: 'europe', level: 'amber' })];
    const { scene, result } = mount(both);
    await waitFor(() => expect(outlines(scene).length).toBeGreaterThan(0));
    const swatches = getLegends().find((legend) => legend.layerId === 'DrugCheckAlerts')!.swatches.map((s) => s.label);
    expect(swatches).toContain('Europe: level amber');
    expect(result.current.listed.unplaced.map((i) => i.id)).toEqual(['eu']);
  });

  it('a subdivision with no outline here is outlined as its country', async () => {
    reader.items = [item({ id: 'nsw', point: undefined, jurisdiction: 'au-nsw', level: 'amber' })];
    const { scene } = mount(both);
    await waitFor(() => expect(outlines(scene).length).toBeGreaterThan(0));
    const swatches = getLegends().find((legend) => legend.layerId === 'DrugCheckAlerts')!.swatches.map((s) => s.label);
    expect(swatches).toContain('Australia: level amber');
  });

  it('a point that stands for a state is drawn with a ring round it', async () => {
    reader.items = [item({ id: 'city', point: { lat: 10, lon: 10 }, precision: 'city' })];
    const { scene, rerender } = mount(both);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(outlines(scene)).toHaveLength(0);
    reader.items = [item({ id: 'state', point: { lat: -33.9, lon: 151.2 }, precision: 'state' })];
    act(() => { reader.listeners.forEach((listener) => listener()); });
    rerender({ active: both, window: null });
    await waitFor(() => expect(outlines(scene).length).toBeGreaterThan(0));
  });
});

void React;

describe('v1.2: HeatRisk, and scene events at a public venue', () => {
  const HOUR_S = 3_600;
  const heat = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
    id: `30023:pk:raver-heat-risk-${Math.random()}`, layer: 'HeatRisk', category: 'heat', level: 'red', heatRisk: 3,
    title: 'HeatRisk Red in Costa Mesa, CA on Sat 3 Oct', source: 'National Weather Service HeatRisk',
    validFrom: nowS() - HOUR_S, validUntil: nowS() + 20 * HOUR_S, point: { lat: 33.6, lon: -117.9 }, precision: 'city', ...over,
  });
  const atVenue = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
    id: `31923:pk:raver-scene-event-${Math.random()}`, layer: 'SceneEvents', level: undefined, category: 'event',
    title: 'House at Public Works, San Francisco, CA', source: '19hz.info',
    location: 'Public Works, 161 Erie Street, San Francisco, CA', venue: 'Public Works', license: 'ODbL-1.0 (venue: OpenStreetMap contributors)',
    validFrom: nowS() - 86_400, start: nowS() + 2 * HOUR_S, end: nowS() + 7 * HOUR_S, validUntil: nowS() + 7 * HOUR_S,
    startTzid: 'America/Los_Angeles', genres: ['house'], point: { lat: 37.769, lon: -122.42 }, precision: 'venue', cancelled: false, ...over,
  });
  const heatOn = { ...none, HeatRisk: true };
  const events = { ...none, SceneEvents: true };

  it('reads The Record while only HeatRisk is on', () => {
    mount(heatOn);
    expect(reader.start).toHaveBeenCalledTimes(1);
  });

  it('draws a HeatRisk note at its town as the heat glyph on its level\'s backing, its hover naming the NWS level', async () => {
    reader.items = [heat(), heat({ id: 'orange', level: 'amber', heatRisk: 2, point: { lat: 34.1, lon: -118.2 } })];
    const { scene } = mount(heatOn);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const [points] = sprites(scene);
    expect(points.userData.layers).toEqual(['Heat risk', 'Heat risk']);
    const cells = Array.from((points.geometry.getAttribute('atlasCell') as THREE.BufferAttribute).array);
    expect(new Set(cells)).toEqual(new Set([RAVER_WATCH_GLYPHS.indexOf('heat')]));
    const rows = Array.from((points.geometry.getAttribute('atlasRow') as THREE.BufferAttribute).array);
    expect([...rows].sort()).toEqual([0, 1]);
    expect((points.userData.tooltips as string[]).join('\n')).toContain('NWS HeatRisk Red (3 of 4)');
  });

  it('keys HeatRisk by its levels, and gives it a feed of its own', async () => {
    reader.items = [heat()];
    const { result } = mount(heatOn);
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'HeatRisk')).toBeTruthy());
    const legend = getLegends().find((l) => l.layerId === 'HeatRisk')!;
    expect(legend.layer).toBe('Heat risk');
    expect(legend.swatches.map((s) => s.label)).toEqual([RAVER_WATCH_LEVEL_LOOK.red.means]);
    expect(legend.shapeMeans).toMatch(/HeatRisk/);
    expect(result.current.feeds.map((f) => f.name)).toEqual([
      'Heat risk from National Weather Service HeatRisk',
    ]);
  });

  it('draws nothing of HeatRisk while it is off', async () => {
    reader.items = [heat(), item()];
    const { scene } = mount({ ...none, DrugCheckAlerts: true });
    await waitFor(() => expect(markCount(scene)).toBe(1));
    expect(sprites(scene)[0].userData.layers).toEqual(['Drug-check alerts']);
  });

  it('a public venue\'s events share one mark at the venue, apart from the town\'s', async () => {
    reader.items = [
      atVenue({ title: 'Sooner at the venue' }),
      atVenue({ title: 'Later at the venue', start: nowS() + 30 * HOUR_S, end: nowS() + 35 * HOUR_S, validUntil: nowS() + 35 * HOUR_S }),
      atVenue({ title: 'In town', venue: undefined, license: undefined, precision: 'city', location: 'San Francisco, CA', point: { lat: 37.8, lon: -122.4 } }),
    ];
    const { scene } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const tooltips: string[] = sprites(scene)[0].userData.tooltips;
    const venue = tooltips.find((t) => t.startsWith('2 scene events at Public Works, 161 Erie Street'));
    expect(venue).toBeDefined();
    expect(venue).toMatch(/OpenStreetMap contributors, ODbL/);
    expect(tooltips.some((t) => t.startsWith('In town'))).toBe(true);
  });

  it('the key says a scene event is at its town, or at a public venue, and credits the venue\'s source', async () => {
    reader.items = [atVenue()];
    const { scene, result } = mount(events);
    await waitFor(() => expect(markCount(scene)).toBe(1));
    const legend = getLegends().find((l) => l.layerId === 'SceneEvents')!;
    expect(legend.shapeMeans).not.toMatch(/never the venue/);
    expect(legend.shapeMeans).toMatch(/public venue/);
    expect(legend.shapeMeans).toMatch(/OpenStreetMap/);
    expect(result.current.feeds[0].note).toMatch(/public venue/);
    expect(result.current.feeds[0].note).not.toMatch(/placed no finer than about 11 km\.$/);
  });
});

describe('v1.2: a town\'s HeatRisk days share one mark', () => {
  const HOUR_S = 3_600;
  const day = (title: string, level: 'red' | 'amber', heatRisk: number, untilH: number, point = { lat: 25.8, lon: -80.2 }): RaverWatchItem => item({
    id: `30023:pk:raver-heat-risk-${Math.random()}`, layer: 'HeatRisk', category: 'heat', level, heatRisk, title,
    source: 'National Weather Service HeatRisk', validFrom: nowS() - HOUR_S, validUntil: nowS() + untilH * HOUR_S, point, precision: 'city',
  });

  // They publish a note per town per day, each standing from when it was sent: three days would be three marks on one spot.
  it('draws one mark a town, at its worst level, whose hover names the days soonest first', async () => {
    reader.items = [
      day('HeatRisk Orange in Miami, FL on Sun 4 Oct', 'amber', 2, 60),
      day('HeatRisk Red in Miami, FL on Sat 3 Oct', 'red', 3, 36),
      day('HeatRisk Orange in Miami, FL on Fri 2 Oct', 'amber', 2, 12),
      day('HeatRisk Orange in Houston, TX on Fri 2 Oct', 'amber', 2, 12, { lat: 29.8, lon: -95.4 }),
    ];
    const { scene } = mount({ ...none, HeatRisk: true });
    await waitFor(() => expect(markCount(scene)).toBe(2));
    const [points] = sprites(scene);
    const tooltips: string[] = points.userData.tooltips;
    const miami = tooltips.findIndex((t) => t.startsWith('3 HeatRisk days here, soonest first:'));
    expect(miami).toBeGreaterThanOrEqual(0);
    const text = tooltips[miami];
    expect(text.indexOf('Fri 2 Oct')).toBeLessThan(text.indexOf('Sat 3 Oct'));
    expect(text.indexOf('Sat 3 Oct')).toBeLessThan(text.indexOf('Sun 4 Oct'));
    const rows = Array.from((points.geometry.getAttribute('atlasRow') as THREE.BufferAttribute).array);
    // Red's row (0) for Miami, whose worst day is Red; amber's (1) for Houston.
    expect(rows[miami]).toBe(0);
    expect(rows[1 - miami]).toBe(1);
  });
});

describe('v1.2: the key names the levels drawn', () => {
  it('names no amber when a town\'s Orange day lies under its Red one', async () => {
    reader.items = [
      item({ id: 'a', layer: 'HeatRisk', category: 'heat', level: 'amber', heatRisk: 2, title: 'HeatRisk Orange in Miami, FL on Fri 2 Oct', validUntil: nowS() + 12 * 3_600, point: { lat: 25.8, lon: -80.2 } }),
      item({ id: 'r', layer: 'HeatRisk', category: 'heat', level: 'red', heatRisk: 3, title: 'HeatRisk Red in Miami, FL on Sat 3 Oct', validUntil: nowS() + 36 * 3_600, point: { lat: 25.8, lon: -80.2 } }),
    ];
    const { scene } = mount({ ...none, HeatRisk: true });
    await waitFor(() => expect(markCount(scene)).toBe(1));
    const legend = getLegends().find((l) => l.layerId === 'HeatRisk')!;
    expect(legend.swatches.map((s) => s.label)).toEqual([RAVER_WATCH_LEVEL_LOOK.red.means]);
  });
});

describe('v1.2: two layers in one town', () => {
  it('draws a town\'s scene events and its HeatRisk as two marks, one per layer', async () => {
    const at = { lat: 34.1, lon: -118.2 };
    reader.items = [
      item({ id: 'heat', layer: 'HeatRisk', category: 'heat', level: 'red', heatRisk: 4, title: 'HeatRisk Magenta in Los Angeles, CA on Wed 7 Oct', point: at }),
      item({
        id: 'event', layer: 'SceneEvents', level: undefined, category: 'event', title: 'House in Los Angeles, CA', source: '19hz.info',
        location: 'Los Angeles, CA', start: nowS() + 3_600, end: nowS() + 5 * 3_600, validUntil: nowS() + 5 * 3_600, startTzid: 'America/Los_Angeles', point: at,
      }),
    ];
    const { scene } = mount({ ...none, SceneEvents: true, HeatRisk: true });
    await waitFor(() => expect(markCount(scene)).toBe(2));
    expect([...sprites(scene)[0].userData.layers].sort()).toEqual(['Heat risk', 'Scene events']);
  });
});

/*
 * Close-ups (IM34–IM36): Raver Watch answers for the items it draws, making a
 * public venue's from the venues drawn, and a heat town's with the state lines
 * Starcom serves, loaded only then.
 */
describe('close-ups', () => {
  const venue = (id: string, lat: number, lon: number) => item({
    id, layer: 'SceneEvents', level: undefined, precision: 'venue', venue: `Venue ${id}`, point: { lat, lon },
    start: nowS() + 3_600, end: nowS() + 6 * 3_600, validFrom: nowS() - 3_600, validUntil: nowS() + 6 * 3_600,
  });

  it('makes a public venue\'s from the venues drawn, and says why another item has none', async () => {
    reader.items = [venue('a', 37.778, -122.417), venue('b', 37.76, -122.39), venue('c', 37.8, -122.42), item({ id: 'alert' })];
    const { result } = mount({ ...both, SceneEvents: true });
    await waitFor(() => expect(result.current.reports).toHaveLength(4));
    expect(result.current.closeUpRefusal('a')).toBeNull();
    expect(result.current.closeUpRefusal('alert')).toMatch(/only for a public venue or a heat town/);
    expect(result.current.closeUpRefusal('not-drawn')).toBeUndefined();
    const inset = await result.current.closeUp('a');
    expect(inset).toMatchObject({ kind: 'venues', featured: { id: 'a', label: 'Venue a' } });
    expect((inset as { others: Array<{ id: string }> }).others.map((m) => m.id).sort()).toEqual(['b', 'c']);
    expect(states.load).not.toHaveBeenCalled();
    expect(await result.current.closeUp('not-drawn')).toBeUndefined();
    expect(await result.current.closeUp('alert')).toEqual({ refused: expect.stringMatching(/only for a public venue or a heat town/) });
  });

  it('loads the state lines from Starcom for a heat town\'s', async () => {
    const heat = (id: string, lat: number, lon: number, risk: number) => item({
      id, layer: 'HeatRisk', level: risk >= 3 ? 'red' : 'amber', heatRisk: risk, jurisdiction: 'us-tx',
      point: { lat, lon }, validUntil: nowS() + 20 * 3_600,
    });
    reader.items = [heat('h1', 30.3, -97.7, 3), heat('h2', 29.4, -98.5, 2)];
    const { result } = mount({ ...both, HeatRisk: true });
    await waitFor(() => expect(result.current.reports).toHaveLength(2));
    const inset = await result.current.closeUp('h1');
    expect(states.load).toHaveBeenCalled();
    expect(inset).toMatchObject({ kind: 'heat', within: 'Texas', others: [{ id: 'h2' }] });
    // The countries in view from the territories the layer has (IM37): the United States' states are drawn instead.
    const names = (inset as { outlines: Array<{ name: string }> }).outlines.map((o) => o.name);
    expect(names).not.toContain('United States');
    expect(names).toContain('Mexico');
    expect(names).not.toContain('France');
  });
});

/*
 * Why an address it holds is not drawn (Mecha Jono's ask D): a heat bulletin
 * they could not feature was a plain HeatRisk note, with HeatRisk off. The
 * layer that would draw it says so, and why it does not.
 */
describe('why an item is not drawn', () => {
  it('names the layer that is off, and how to turn it on', async () => {
    const heat = item({ id: 'heat-1', layer: 'HeatRisk', level: 'red', heatRisk: 3, jurisdiction: 'us-tx' });
    reader.items = [heat, item({ id: 'alert-1' })];
    const { result } = mount(both);
    await waitFor(() => expect(result.current.reports).toHaveLength(1));
    expect(result.current.whyNotDrawn('heat-1')).toMatch(/"heat-1" is a Heat risk note, and Heat risk is off: setLayer\('HeatRisk'\) or pinLayers\(\['HeatRisk'\]\)/);
    expect(result.current.whyNotDrawn('alert-1')).toBeNull();
    expect(result.current.whyNotDrawn('not-raver-watch')).toBeUndefined();
  });

  it('says when it applies outside the moment shown, news is listed, and an item names no place', async () => {
    const ended = item({ id: 'ended', validFrom: nowS() - 10 * 86_400, validUntil: nowS() - 86_400 });
    const news = item({ id: 'news', layer: 'SceneIncidents', category: 'policy', level: 'info' });
    const nowhere = item({ id: 'nowhere', point: undefined, jurisdiction: undefined });
    reader.items = [ended, news, nowhere, item({ id: 'drawn' })];
    const { result } = mount(both);
    await waitFor(() => expect(result.current.reports.length).toBeGreaterThan(0));
    expect(result.current.whyNotDrawn('ended')).toMatch(/applies from .* until .*, outside the moment the globe shows/);
    expect(result.current.whyNotDrawn('news')).toMatch(/policy news, listed in the Raver Watch panel and never drawn/);
    expect(result.current.whyNotDrawn('nowhere')).toMatch(/names no place the globe can draw/);
  });
});

describe('a briefing tour of tonight\'s raves or the heat watch (briefing-playlists.md, BP5)', () => {
  it('offers its items as they arrive, says when the read is done, and nothing while its layers are off', () => {
    reader.items = [item({ level: 'red' }), item({ layer: 'HeatRisk', level: undefined, heatRisk: 3 })];
    reader.status = { loaded: false, error: null, at: null };
    const { result, rerender } = mount(both);
    expect(result.current.tourCandidates('raves', Date.now())!.complete).toBe(false);
    reader.status = { loaded: true, error: null, at: Date.now() };
    rerender({ active: both, window: null });
    const raves = result.current.tourCandidates('raves', Date.now())!;
    expect(raves.complete).toBe(true);
    expect(raves.candidates.map((c) => c.why)).toEqual(['Red drug-check alert']);
    expect(result.current.tourCandidates('heat', Date.now())!.candidates.map((c) => c.why)).toEqual(['HeatRisk Red (3 of 4)']);
    rerender({ active: none, window: null });
    expect(result.current.tourCandidates('raves', Date.now())).toBeNull();
  });
});

describe('tonight, for its card (raver-nights.md, RN3)', () => {
  it('reads tonight from every scene event read, with the heat notes beside them, whatever is drawn', () => {
    const fromS = nowS();
    const austin = { lat: 30.27, lon: -97.74 };
    reader.items = [
      item({ id: 'ev-tonight', layer: 'SceneEvents', level: undefined, start: fromS + 3_600, end: fromS + 5 * 3_600, startTzid: 'America/Chicago', point: austin }),
      item({ id: 'ev-tomorrow', layer: 'SceneEvents', level: undefined, start: fromS + 13 * 3_600, end: fromS + 15 * 3_600, startTzid: 'America/Chicago', point: austin }),
      item({ id: 'heat', layer: 'HeatRisk', level: undefined, heatRisk: 3, point: austin, validFrom: fromS - 3_600, validUntil: fromS + 20 * 3_600 }),
    ];
    // Scene events and HeatRisk off: a card about tonight turns them on, and reads what was read.
    const { result } = mount(none);
    const tonight = result.current.tonightFrom(fromS);
    expect(tonight).toEqual(tonightOf(reader.items, fromS));
    expect(tonight.count).toBe(1);
    expect(tonight.fromS).toBe(fromS);
  });
});

/*
 * Harm reduction sites (decision D-LS, LS7): Mecha Jono posted none of them on 2026-10-17 (0 of 799 Raver Watch
 * notes carried the tag), and this build draws none. Shown, the layer says which, so its globe is never silently empty.
 */
describe('harm reduction sites', () => {
  const mountHarm = () => renderHook(() => useGlobeRaverWatch({
    scene: new THREE.Scene(), active: none, harmReductionSites: true, territories, window: null,
  }));

  it('reads The Record when it is the only Raver Watch layer shown, and says none are posted', () => {
    reader.items = [];
    reader.start.mockClear();
    const { result } = mountHarm();
    expect(reader.start).toHaveBeenCalled();
    expect(result.current.feeds).toEqual([expect.objectContaining({
      layer: 'HarmReductionSites', shortName: 'Harm-reduction sites',
      name: 'Harm-reduction sites posted on The Record (none posted)',
    })]);
  });

  it('says how many are posted, and that this build does not draw them yet', () => {
    reader.items = [item({ id: 'h1', layer: 'HarmReductionSites' }), item({ id: 'h2', layer: 'HarmReductionSites' })];
    const { result } = mountHarm();
    expect(result.current.feeds[0].name).toBe('Harm-reduction sites posted on The Record (2 posted, not drawn: this build does not draw them yet)');
  });
});

