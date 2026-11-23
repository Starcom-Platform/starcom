/**
 * Looking by area through the share handle (BA21; contract v30): what is
 * listed, narrowed to an area by where each item stands. The shapes are
 * fetched the first time an area is asked for, so the answer is a promise.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
const layer = (id: string, category: string, isPrimary: boolean) => ({
  id, label: id, category, description: '', isPrimary, isPinned: false, isActive: true, isImplemented: true,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('IntelReports', 'CyberCommand', true), layer('WarConflict', 'GeoPolitical', false)],
    pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));
// A capture that always succeeds, so whenReady reports ready on this fake globe.
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => ({ dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' }),
}));
// What a card is composed from, recorded; the fake globe has no camera to project its bounds or describe its picture.
const composed = vi.hoisted(() => ({ inputs: [] as Array<{ featured: { id: string; title: string; lines: string[] } | null; fit?: string }> }));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
  composeShareCard: async (_target: unknown, input: { featured: { id: string; title: string; lines: string[] } | null; fit?: string }) => {
    composed.inputs.push(input);
    return {
      dataUrl: 'data:card', width: 1, height: 1, mimeType: 'image/png', provenance: { featured: input.featured },
      sourceRect: {}, frame: { width: 1, height: 1, dataUrl: 'data:frame' },
      regions: { picture: { x: 0, y: 0, width: 1, height: 1 }, footer: { x: 0, y: 1, width: 1, height: 0 } }, warnings: [],
    };
  },
}));
vi.mock('../../../../features/globe/capture/globeScreenBounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/globeScreenBounds')>()),
  computeGlobeScreenBounds: () => ({ x: 340, y: 0, width: 600, height: 600 }),
}));
vi.mock('../../../../features/globe/capture/describeView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/describeView')>()),
  describeScene: () => ({ layers: [{ layer: 'Intel Reports', inFrame: 2, drawn: 4, items: [], rankedBy: 'severity' }], notCounted: [] }),
}));
// The areas' shapes as Starcom serves them; a test can make the fetch fail.
const areasLoad = vi.hoisted(() => ({ fail: false, calls: 0 }));
vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => { areasLoad.calls += 1; return areasLoad.fail ? undefined : shapes; } };
});

// The territories, for naming what is outside an area's frame.
vi.mock('../useTerritories', async () => {
  const fsm = await import('node:fs');
  const { buildTerritoryIndex } = await import('../../../../services/intel/coverage/territoryIndex');
  const index = buildTerritoryIndex(JSON.parse(fsm.readFileSync('public/geopolitical/world-territories-lod0.geojson', 'utf8')).features);
  return { loadTerritories: async () => index };
});
// No globe layer draws here: a lit area is drawn as soon as it is lit.
vi.mock('../../../../features/globe/areas/litArea', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/litArea')>();
  return { ...actual, setLitArea: (code: string | null) => { actual.setLitArea(code); actual.markLitAreaDrawn(code); } };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { getLitArea } from '../../../../features/globe/areas/litArea';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';

function fakeGlobe() {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: 1280, clientHeight: 608 };
  return {
    current: {
      renderer: () => ({ domElement: canvas }),
      scene: () => ({}),
      camera: () => ({}),
      getGlobeRadius: () => 100,
      pointOfView: (next?: typeof pov) => { if (next) pov = { ...pov, ...next }; return pov; },
      controls: () => undefined,
    },
  };
}

type Listed = ShareReportInfo[];
type Handle = {
  listReports: (o?: { counts?: boolean; area?: string }) => Listed | Promise<Listed | { reports: Listed; intelReports: unknown }>;
  frameArea: (area: unknown, o?: { preset?: string }) => Promise<{ lat: number; lng: number; altitude: number; outside: string | null }>;
  getView: () => { lat: number; lng: number; altitude: number };
  planShot: (shot: unknown, o?: { timeoutMs?: number }) => Promise<{ ok: boolean; shot?: { subject: unknown; framing: unknown }; reason?: string }>;
  renderShot: (shot: unknown, o?: { timeoutMs?: number }) => Promise<{ ok: boolean; shot?: { subject: unknown }; reason?: string }>;
  renderBatch: (requests: unknown, o?: { timeoutMs?: number }) => Promise<Array<{ ok: boolean; reason?: string }>>;
  focusReport: (id: string | null) => unknown;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
afterEach(() => { delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE]; areasLoad.fail = false; });

const at = (id: string, lat: number, lng: number): ShareReportInfo => ({
  id, layer: 'IntelReports', title: `Report ${id}`, variant: 'raw', variantMeans: 'not assessed', author: 'npub1abcdef…wxyz',
  time: { iso: '2026-10-04T12:00:00.000Z', basis: 'written' }, precisionM: null, lat, lng, sharesPlaceWith: 0,
});
const listed = [at('paris', 48.9, 2.4), at('bern', 47.0, 7.4), at('denver', 39.7, -105.0), at('rome', 41.9, 12.5)];
const mount = () => renderHook(() => useGlobeShareCard({
  globeRef: fakeGlobe() as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: listed,
  reportCounts: { shown: 4, matching: 4, setting: 50 },
}));

describe('listReports({ area }) (BA21, v30)', () => {
  it('lists what stands in the area, in the list\'s order, the bare eu too', async () => {
    mount();
    expect((await handle().listReports({ area: 'union:eu' }) as Listed).map((r) => r.id)).toEqual(['paris', 'rome']);
    expect((await handle().listReports({ area: 'eu' }) as Listed).map((r) => r.id)).toEqual(['paris', 'rome']);
    expect((await handle().listReports({ area: 'continent:north-america' }) as Listed).map((r) => r.id)).toEqual(['denver']);
  });

  it('with counts, the counts of the whole list and the reports in the area', async () => {
    mount();
    const answer = await handle().listReports({ area: 'union:eu', counts: true }) as { reports: Listed; intelReports: { shown: number } };
    expect(answer.reports.map((r) => r.id)).toEqual(['paris', 'rome']);
    expect(answer.intelReports.shown).toBe(4);
  });

  it('refuses an area no one defined, naming where the codes are', async () => {
    mount();
    await expect(handle().listReports({ area: 'union:no-such-body' })).rejects.toThrow(/listAreas\(\)/);
  });

  it('says so when the shapes cannot be fetched, and fetches again when asked again', async () => {
    mount();
    areasLoad.fail = true;
    await expect(handle().listReports({ area: 'union:eu' })).rejects.toThrow(/could not be fetched/);
    areasLoad.fail = false;
    expect((await handle().listReports({ area: 'union:eu' }) as Listed)).toHaveLength(2);
  });

  it('copies, so a caller that edits one cannot edit the next answer', async () => {
    mount();
    const first = await handle().listReports({ area: 'union:eu' }) as Listed;
    first[0].title = 'edited';
    first[0].time!.iso = 'edited';
    const again = await handle().listReports({ area: 'union:eu' }) as Listed;
    expect(again[0].title).toBe('Report paris');
    expect(again[0].time!.iso).toBe('2026-10-04T12:00:00.000Z');
  });

  it('with no area, the whole list at once, as before', () => {
    mount();
    const all = handle().listReports();
    expect(Array.isArray(all)).toBe(true);
    expect((all as Listed).map((r) => r.id)).toEqual(['paris', 'bern', 'denver', 'rome']);
  });
});

describe('frameArea (BA22, v30)', () => {
  it('moves the camera to the area\'s largest part, and says what is outside the frame', async () => {
    mount();
    const framed = await handle().frameArea('union:eu', { preset: 'wide' });
    expect(framed.outside).toBe('Outside the frame: French Guiana, Réunion, Guadeloupe and 2 more.');
    expect(framed.lat).toBeGreaterThan(40);
    expect(framed.lng).toBeGreaterThan(-5);
    expect(framed.lng).toBeLessThan(30);
    expect(framed.altitude).toBeGreaterThanOrEqual(1);
    expect(handle().getView()).toMatchObject({ lat: framed.lat, lng: framed.lng });
  });

  it('nothing outside an area one view holds, and the bare eu as the European Union', async () => {
    mount();
    expect((await handle().frameArea('zone:sahel')).outside).toBeNull();
    expect((await handle().frameArea('EU')).outside).toBe('Outside the frame: French Guiana, Réunion, Guadeloupe and 2 more.');
  });

  it('refuses an area no one defined, or a preset it does not know, leaving the camera', async () => {
    mount();
    const before = handle().getView();
    await expect(handle().frameArea('union:no-such-body')).rejects.toThrow(/listAreas\(\)/);
    await expect(handle().frameArea('union:eu', { preset: 'poster' })).rejects.toThrow(/preset/);
    expect(handle().getView()).toEqual(before);
  });
});

describe('a shot of an area (BA22, BA23, v30)', () => {
  it('is staged on the page: framed to the area and lit, and the shot says so', async () => {
    mount();
    // This fake globe cannot measure a card's text, so the plan stops there; the staging is what is asked here.
    const plan = await handle().planShot({ subject: { area: 'union:eu' } }, { timeoutMs: 2000 });
    expect(plan.shot).toMatchObject({ subject: { area: 'union:eu' }, framing: { fit: 'view' } });
    expect(getLitArea()).toBe('union:eu');
    expect(handle().getView().lat).toBeGreaterThan(40);
  });

  it('a card about the area: its name, its Intel Reports counted, what is outside, and no item featured', async () => {
    mount();
    composed.inputs.length = 0;
    const made = await handle().renderShot({ subject: { area: 'union:eu' } }, { timeoutMs: 2000 });
    expect(made.reason).toBeUndefined();
    const { featured, fit } = composed.inputs[0];
    expect(fit).toBe('view');
    expect(featured).toMatchObject({ id: 'area:union:eu', title: 'European Union' });
    expect(featured!.lines[0]).toBe('2 Intel Reports in it: 2 not assessed');
    expect(featured!.lines[featured!.lines.length - 1]).toBe('Outside the frame: French Guiana, Réunion, Guadeloupe and 2 more.');
  });

  it('renderBatch takes an area as a request', async () => {
    mount();
    composed.inputs.length = 0;
    const [result] = await handle().renderBatch([{ area: 'zone:sahel', preset: 'square' }], { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    expect(composed.inputs[0].featured).toMatchObject({ id: 'area:zone:sahel', title: 'Sahel Zone' });
    expect(getLitArea()).toBe('zone:sahel');
  });

  it('a shot of a report afterwards leaves no area lit', async () => {
    mount();
    await handle().renderShot({ subject: { area: 'union:eu' } }, { timeoutMs: 2000 });
    expect(getLitArea()).toBe('union:eu');
    await handle().renderShot({ subject: { view: { lat: 10, lng: 20, altitude: 2 } } }, { timeoutMs: 2000 });
    expect(getLitArea()).toBeNull();
  });
});
