/**
 * Does the hook actually put geometry in the scene?
 *
 * Written because a live run confirmed the COVERAGE TEXT and nothing else: the
 * numbers said three region subjects had arrived, and no boundary appeared on
 * the globe. Text is not pixels, and a selection function returning features is
 * not a layer drawing them.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import fs from 'node:fs';
import { useGlobeRegionMarks, useRegionSubjectReports } from '../useGlobeRegionMarks';
import { litAreaDrawn, resetLitAreaForTests, setLitArea } from '../../../../features/globe/areas/litArea';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { CYAN } from '../../../../styles/tokens';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CLOUDS } from '../../globeAltitudes';
import { SCREEN_POINTS_RENDER_ORDER } from '../../screenPoints';

/** An outline as GeometryFactory.buildBorderLines draws it: one batch named 'borders' (D-GV GV0.2), or a line as it was. */
const isOutline = (o: THREE.Object3D) => (o as THREE.Line).isLine || ((o as LineSegments2).isLineSegments2 && o.name === 'borders');

// Storage and the ingest, each controllable: empty unless a test fills them.
const store = vi.hoisted(() => ({ reports: [] as unknown[], listeners: new Set<() => void>() }));
const ingest = vi.hoisted(() => ({ held: [] as unknown[], listeners: new Set<(report: unknown) => void>() }));
vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: {
    listReports: async () => [...store.reports],
    onChange: (listener: () => void) => { store.listeners.add(listener); return () => store.listeners.delete(listener); },
  },
}));
vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    subscribe: (listener: (report: unknown) => void) => { ingest.listeners.add(listener); return () => ingest.listeners.delete(listener); },
    replayAccepted: (listener: (report: unknown) => void) => { for (const report of ingest.held) listener(report); },
  },
}));
// Starcom's own state lines, as the app serves them, loaded when a report names a state (BA3).
const statesLoad = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../../services/raverWatch/usStates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/raverWatch/usStates')>();
  const fsm = await import('node:fs');
  const states = actual.usStatesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/us-states-50m.geojson', 'utf8')));
  return { ...actual, loadUsStates: async () => { statesLoad.calls += 1; return states; } };
});

// The areas' baked shapes, as the app serves them, loaded when a report names an area (BA16).
const areasLoad = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => { areasLoad.calls += 1; return shapes; } };
});

const geo = JSON.parse(fs.readFileSync('public/geopolitical/world-territories-lod0.geojson', 'utf8'));
const territories = buildTerritoryIndex(geo.features);

const regionReport = (code: string): IntelReportUI => ({
  id: `r-${code}`, title: code, content: '', author: 'a', category: 'GEOINT',
  tags: ['geometry:jurisdiction'], jurisdictions: [code],
  createdAt: new Date(), updatedAt: new Date(), status: 'SUBMITTED',
} as IntelReportUI);

const sceneRef = () => {
  const scene = new THREE.Scene();
  return {
    scene,
    ref: { current: { scene: () => scene } } as never,
  };
};

describe('useGlobeRegionMarks in a scene', () => {
  it('adds a group holding geometry for a named territory', () => {
    const { scene, ref } = sceneRef();
    renderHook(() => useGlobeRegionMarks(ref, [regionReport('fr')], territories, true));

    const groups = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groups.length).toBeGreaterThan(0);
    // The group must actually hold drawable objects, not merely exist.
    let drawn = 0;
    scene.traverse((o) => { if ((o as THREE.Line).isLine || (o as THREE.Mesh).isMesh) drawn += 1; });
    expect(drawn).toBeGreaterThan(0);
  });

  it('draws nothing when the layer is hidden', () => {
    const { scene, ref } = sceneRef();
    renderHook(() => useGlobeRegionMarks(ref, [regionReport('fr')], territories, false));
    let drawn = 0;
    scene.traverse((o) => { if ((o as THREE.Line).isLine || (o as THREE.Mesh).isMesh) drawn += 1; });
    expect(drawn).toBe(0);
  });

  it('draws nothing for a code no outline here matches', () => {
    const { scene, ref } = sceneRef();
    renderHook(() => useGlobeRegionMarks(ref, [regionReport('us-zz')], territories, true));
    let drawn = 0;
    scene.traverse((o) => { if ((o as THREE.Line).isLine || (o as THREE.Mesh).isMesh) drawn += 1; });
    expect(drawn).toBe(0);
  });
});

/*
 * Territories featured (BA3; plan block J, item 3): a US state drawn from
 * Starcom's own state lines, the featured report's territory lit, and every
 * report about a territory listed for the share handle.
 */
describe('useGlobeRegionMarks: territories featured', () => {
  const lines = (scene: THREE.Scene) => {
    const found: THREE.Line[] = [];
    scene.traverse((o) => { if (isOutline(o)) found.push(o as THREE.Line); });
    return found;
  };

  it('draws a US state from Starcom\'s own state lines, loaded only when a report names one', async () => {
    statesLoad.calls = 0;
    const { scene, ref } = sceneRef();
    const { result } = renderHook(() => useGlobeRegionMarks(ref, [regionReport('us-oh')], territories, true));
    await waitFor(() => expect(lines(scene).length).toBeGreaterThan(0));
    expect(statesLoad.calls).toBe(1);
    expect(result.current.unmatched).toEqual([]);
    const { result: countryOnly } = renderHook(() => useGlobeRegionMarks(sceneRef().ref, [regionReport('fr')], territories, true));
    expect(countryOnly.current.drawn).toBeGreaterThan(0);
    expect(statesLoad.calls).toBe(1);
  });

  it('draws an area from its baked shapes, loaded only when a report names one (BA16)', async () => {
    areasLoad.calls = 0;
    const { scene, ref } = sceneRef();
    const { result } = renderHook(() => useGlobeRegionMarks(ref, [regionReport('union:eu')], territories, true));
    await waitFor(() => expect(lines(scene).length).toBeGreaterThan(0));
    expect(areasLoad.calls).toBe(1);
    expect(result.current.unmatched).toEqual([]);
    expect(result.current.reports).toEqual([expect.objectContaining({ id: 'r-union:eu', territories: [{ code: 'union:eu', name: 'European Union' }] })]);
    renderHook(() => useGlobeRegionMarks(sceneRef().ref, [regionReport('fr'), regionReport('us-oh')], territories, true));
    expect(areasLoad.calls).toBe(1);
  });

  it('a click inside an area opens its reports after those of the smaller territory there, and none in its holes (BA9)', async () => {
    const { ref } = sceneRef();
    const reports = [regionReport('union:eu'), regionReport('fr'), regionReport('ch')];
    const { result } = renderHook(() => useGlobeRegionMarks(ref, reports, territories, true));
    await waitFor(() => expect(result.current.reports).toHaveLength(3));
    expect(result.current.groupsAt!(48.86, 2.35).map((g) => g.key)).toEqual(['territory:fr', 'territory:union:eu']);
    // Bern: Switzerland's, and no part of the European Union.
    expect(result.current.groupsAt!(46.95, 7.45).map((g) => g.key)).toEqual(['territory:ch']);
  });

  it('lights an area no report names while it is lit, whether or not Intel Reports are shown, and says so (BA23, BA24)', async () => {
    resetLitAreaForTests();
    const { scene, ref } = sceneRef();
    const { rerender } = renderHook((props: { visible: boolean }) => useGlobeRegionMarks(ref, [], territories, props.visible), { initialProps: { visible: false } });
    const areaParts = (part: 'area-fill' | 'area-edge') => {
      const found: THREE.Object3D[] = [];
      scene.traverse((o) => { if ((o.userData as { lit?: string }).lit === part) found.push(o); });
      return found;
    };
    expect(areaParts('area-edge')).toHaveLength(0);
    act(() => setLitArea('union:eu'));
    await waitFor(() => expect(litAreaDrawn()).toBe('union:eu'));
    expect(areaParts('area-fill').length).toBeGreaterThan(0);
    // Every ring of it: its edge round Switzerland too.
    const edges = areaParts('area-edge') as LineSegments2[];
    expect(edges.length).toBeGreaterThan(0);
    expect((edges[0].material as LineMaterial).color.getHexString()).toBe(CYAN[100].slice(1).toLowerCase());
    rerender({ visible: true });
    expect(areaParts('area-edge').length).toBeGreaterThan(0);
    act(() => setLitArea(null));
    await waitFor(() => expect(litAreaDrawn()).toBeNull());
    expect(areaParts('area-edge')).toHaveLength(0);
    expect(areaParts('area-fill')).toHaveLength(0);
  });

  /** What lights the featured territory (BA3), by part: its fill and its edge. */
  const litParts = (scene: THREE.Scene, part: 'fill' | 'edge') => {
    const found: THREE.Object3D[] = [];
    scene.traverse((o) => { if ((o.userData as { lit?: string }).lit === part) found.push(o); });
    return found;
  };
  /** How far a drawn thing's first vertex stands from the globe's centre, in scene units. */
  const radiusOf = (o: THREE.Object3D) => {
    const geometry = (o as THREE.Mesh).geometry;
    const start = geometry.getAttribute('instanceStart') ?? geometry.getAttribute('position');
    return Math.hypot(start.getX(0), start.getY(0), start.getZ(0));
  };

  it('lights the featured report\'s territory: a faint fill and a near-white edge, wider than any outline', () => {
    const { scene, ref } = sceneRef();
    // One array throughout, as the app's state holds it: featuring alone must light.
    const reports = [regionReport('fr'), regionReport('de')];
    const { rerender } = renderHook((props: { featured: string | null }) => useGlobeRegionMarks(ref, reports, territories, true, props.featured), { initialProps: { featured: null } });
    expect(litParts(scene, 'fill')).toHaveLength(0);
    expect(litParts(scene, 'edge')).toHaveLength(0);
    const outlines = lines(scene).length;
    rerender({ featured: 'r-fr' });
    // Every outline stays; France is lit over its own.
    expect(lines(scene).length).toBe(outlines);

    // The edge: near-white cyan, solid, three pixels where every outline is one.
    const [edge] = litParts(scene, 'edge') as LineSegments2[];
    expect(edge).toBeInstanceOf(LineSegments2);
    const edgeLook = edge.material as LineMaterial;
    expect(edgeLook.color.getHexString()).toBe(CYAN[100].slice(1).toLowerCase());
    expect(edgeLook.opacity).toBe(1);
    expect(edgeLook.linewidth).toBeGreaterThanOrEqual(3);
    const outlineColour = (lines(scene)[0].material as THREE.LineBasicMaterial).color.getHexString();
    expect(outlineColour).not.toBe(edgeLook.color.getHexString());

    // The fill: the intel layer's cyan, faint enough that what lies inside reads through it.
    const fills = litParts(scene, 'fill') as THREE.Mesh[];
    expect(fills.length).toBeGreaterThan(0);
    const fill = fills[0].material as THREE.MeshBasicMaterial;
    expect(fill.color.getHexString()).toBe(CYAN[400].slice(1).toLowerCase());
    expect(fill.opacity).toBeGreaterThan(0.1);
    expect(fill.opacity).toBeLessThan(0.3);

    // Over the cloud shell, which veils whatever stands under it; the edge over the fill.
    expect(radiusOf(fills[0])).toBeGreaterThan(100 * CLOUDS);
    expect(radiusOf(edge)).toBeGreaterThan(radiusOf(fills[0]));
    // Drawn after every border, and before the report glyphs.
    expect(edge.renderOrder).toBeGreaterThan(110);
    expect(edge.renderOrder + 20).toBeLessThan(SCREEN_POINTS_RENDER_ORDER);
  });

  it('lights nothing for a featured report with a point of its own, or none featured, and unlights when featuring stops', () => {
    const { scene, ref } = sceneRef();
    const pointed = { ...regionReport('fr'), id: 'r-point', latitude: 48.8, longitude: 2.3 } as IntelReportUI;
    const reports = [regionReport('de'), pointed];
    const { rerender } = renderHook((props: { featured: string | null }) => useGlobeRegionMarks(ref, reports, territories, true, props.featured), { initialProps: { featured: 'r-point' } });
    expect(litParts(scene, 'edge')).toHaveLength(0);
    rerender({ featured: 'r-de' });
    expect(litParts(scene, 'edge').length).toBeGreaterThan(0);
    expect(litParts(scene, 'fill').length).toBeGreaterThan(0);
    rerender({ featured: null });
    expect(litParts(scene, 'edge')).toHaveLength(0);
    expect(litParts(scene, 'fill')).toHaveLength(0);
  });

  it('draws every outline over the cloud shell, and after the borders, which would paint over it (BA11)', () => {
    const { scene, ref } = sceneRef();
    renderHook(() => useGlobeRegionMarks(ref, [regionReport('fr')], territories, true));
    const outline = lines(scene)[0];
    const start = outline.geometry.getAttribute((outline as unknown as LineSegments2).isLineSegments2 ? 'instanceStart' : 'position');
    expect(Math.hypot(start.getX(0), start.getY(0), start.getZ(0))).toBeGreaterThan(100 * CLOUDS);
    // The national borders draw at 100 and a priority up to 3; the lit edge at 120.
    expect(outline.renderOrder).toBeGreaterThan(103);
    expect(outline.renderOrder).toBeLessThan(120);
  });

  it('lights a territory once, however often the report names it: a fill drawn twice is twice as solid', () => {
    const once = sceneRef();
    renderHook(() => useGlobeRegionMarks(once.ref, [regionReport('fr')], territories, true, 'r-fr'));
    const twice = sceneRef();
    const named = { ...regionReport('fr'), jurisdictions: ['fr', 'FR'] } as IntelReportUI;
    renderHook(() => useGlobeRegionMarks(twice.ref, [named], territories, true, 'r-fr'));
    expect(litParts(twice.scene, 'fill').length).toBe(litParts(once.scene, 'fill').length);
    const segments = (scene: THREE.Scene) => litParts(scene, 'edge').reduce((n, o) => n + (o as LineSegments2).geometry.getAttribute('instanceStart').count, 0);
    expect(segments(twice.scene)).toBe(segments(once.scene));
  });

  it('says what a click inside each outlined territory opens, and nothing while the layer is hidden (BA9)', () => {
    const { ref } = sceneRef();
    const reports = [regionReport('fr')];
    const { result, rerender } = renderHook((props: { visible: boolean }) => useGlobeRegionMarks(ref, reports, territories, props.visible), { initialProps: { visible: true } });
    const [france] = result.current.groupsAt!(48.86, 2.35);
    expect(france).toMatchObject({ key: 'territory:fr', title: 'France · 1 report' });
    expect(france.members.map((m) => m.pubkey)).toEqual(['r-fr']);
    expect(result.current.groupsAt!(30, -40)).toEqual([]);
    rerender({ visible: false });
    expect(result.current.groupsAt).toBeNull();
  });

  it('none when no territory is outlined', () => {
    const { result } = renderHook(() => useGlobeRegionMarks(sceneRef().ref, [regionReport('us-zz')], territories, true));
    expect(result.current.groupsAt).toBeNull();
  });

  it('lists each report about a territory for the share handle, and says what a card says of the featured one', () => {
    const { ref } = sceneRef();
    const { result } = renderHook(() => useGlobeRegionMarks(ref, [regionReport('fr')], territories, true, 'r-fr'));
    expect(result.current.reports).toEqual([expect.objectContaining({ id: 'r-fr', layer: 'IntelReports', territories: [{ code: 'fr', name: 'France' }] })]);
    expect(result.current.featured?.lines).toContain('About France as a whole: the report names no place in it');
  });
});

/*
 * Where the reports about a territory come from (BA3). Storage alone was how
 * they arrived: the ingest's live feed misses what it took before the globe
 * subscribed, and storage takes each of the 200 it holds one write at a time.
 * Measured on the built app against The Record: 11 of 140 listed when
 * whenReady answered, all 140 some 85 seconds later, while the glyphs had all
 * theirs at once from what the ingest holds. A driver listing at whenReady saw
 * 11.
 */
describe('useRegionSubjectReports: what the ingest holds, and what storage keeps', () => {
  beforeEach(() => {
    store.reports = [];
    store.listeners.clear();
    ingest.held = [];
    ingest.listeners.clear();
  });
  const pointed = { ...regionReport('fr'), id: 'r-point', latitude: 48.8, longitude: 2.3 } as IntelReportUI;
  const placeless = { ...regionReport('fr'), id: 'r-none', jurisdictions: [] } as IntelReportUI;
  const ids = (reports: IntelReportUI[]) => reports.map((r) => r.id).sort();

  it('takes the reports about a territory the ingest already holds, at once, not when storage has them', () => {
    ingest.held = [regionReport('fr'), pointed, placeless, regionReport('us-oh')];
    const { result } = renderHook(() => useRegionSubjectReports());
    expect(ids(result.current)).toEqual(['r-fr', 'r-us-oh']);
  });

  it('keeps one storage holds and the ingest does not, as an earlier session\'s', async () => {
    store.reports = [regionReport('de')];
    ingest.held = [regionReport('fr')];
    const { result } = renderHook(() => useRegionSubjectReports());
    await waitFor(() => expect(ids(result.current)).toEqual(['r-de', 'r-fr']));
  });

  it('the network\'s latest version wins over the stored copy: one that names no territory now drops out', async () => {
    store.reports = [regionReport('de')];
    const { result } = renderHook(() => useRegionSubjectReports());
    await waitFor(() => expect(ids(result.current)).toEqual(['r-de']));
    act(() => { for (const listener of ingest.listeners) listener({ ...regionReport('de'), jurisdictions: [] }); });
    expect(ids(result.current)).toEqual([]);
    // And storage catching up with the old copy does not bring it back.
    await act(async () => { for (const listener of store.listeners) listener(); });
    expect(ids(result.current)).toEqual([]);
  });

  it('adds one arriving live, and one storage gains later', async () => {
    const { result } = renderHook(() => useRegionSubjectReports());
    act(() => { for (const listener of ingest.listeners) listener(regionReport('es')); });
    expect(ids(result.current)).toEqual(['r-es']);
    store.reports = [regionReport('it')];
    await act(async () => { for (const listener of store.listeners) listener(); });
    expect(ids(result.current)).toEqual(['r-es', 'r-it']);
  });
});

