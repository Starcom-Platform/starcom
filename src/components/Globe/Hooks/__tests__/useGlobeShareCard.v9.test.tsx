/**
 * Share handle v9, the two parts built now (the owner's decision of
 * 2026-10-02, "Yes, those two now"; Mecha Jono's v9 proposal), as an agent
 * meets them: mounted, not read off the contract.
 *
 * `whenReady({ address })` resolves once THAT item is drawn, not merely once
 * the globe can be captured, so a card about it never shows a globe without
 * it; on a timeout it says why. `renderBatch` makes many cards in one page
 * load, in order, each result saying what failed and why: an address is
 * awaited, framed, featured and composed, with one retry on a blank frame;
 * what is not built yet (an area, a template) is said, never guessed at.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'RaverWatch', subMode: 'SceneEvents' }, setVisualizationMode: vi.fn() }),
}));
const controls = vi.hoisted(() => ({ pinLayer: vi.fn(), clearPins: vi.fn() }));
const layer = (id: string, category: string) => ({
  id, label: id, category, description: '', isPrimary: false, isPinned: false, isActive: true, isImplemented: true,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('SceneEvents', 'RaverWatch'), layer('HeatRisk', 'RaverWatch')],
    pinLayer: controls.pinLayer, unpinLayer: vi.fn(), clearPins: controls.clearPins,
  }),
}));
const temporal = vi.hoisted(() => ({
  timeWindow: null as null | { start: Date; end: Date },
  isLive: true,
  setTimeWindow: vi.fn(),
  setIsLive: vi.fn(),
}));
vi.mock('../../../../context/TemporalContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../context/TemporalContext')>()),
  useTemporalStateOptional: () => temporal,
}));
const capture = vi.hoisted(() => ({ blank: false }));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>();
  return {
    ...original,
    captureGlobeFrame: () => {
      if (capture.blank) throw new original.GlobeCaptureError('the captured frame is blank');
      return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
    },
  };
});
const composed = vi.hoisted(() => ({ featured: [] as Array<string | null>, presets: [] as unknown[], blankTimes: 0 }));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => {
  const { GlobeCaptureError } = await import('../../../../features/globe/capture/captureGlobeFrame');
  return {
    ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
    composeShareCard: async (_target: unknown, input: { featured: { id: string } | null; preset?: unknown }) => {
      if (composed.blankTimes > 0) {
        composed.blankTimes -= 1;
        throw new GlobeCaptureError('the captured frame is blank');
      }
      composed.featured.push(input.featured?.id ?? null);
      composed.presets.push(input.preset);
      return {
        dataUrl: `data:card-${input.featured?.id}`, width: 1, height: 1, mimeType: 'image/png',
        provenance: { featured: input.featured?.id }, sourceRect: {}, frame: { width: 1, height: 1, dataUrl: 'data:frame' },
      };
    },
  };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { getFeaturedReportId, setFeaturedReportId, useFeaturedReportId } from '../../../../features/globe/capture/featuredReportStore';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';
import { getReportCapOverride, setReportCapOverride } from '../../../../services/intel/reportCap';

type Ready = { ready: boolean; waitedMs: number; reason?: string };
type Result = { ok: boolean; card?: { dataUrl: string; provenance: { featured?: string }; frame: object }; reason?: string; note?: string };
type Handle = {
  whenReady: (o?: object) => Promise<Ready>;
  renderBatch: (requests: unknown, o?: object) => Promise<Result[]>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

function fakeGlobe() {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  return {
    current: {
      renderer: () => ({ domElement: { isConnected: true, clientWidth: 1280, clientHeight: 608, width: 1280, height: 608 } }),
      scene: () => ({}),
      camera: () => ({ fov: 50 }),
      getGlobeRadius: () => 100,
      pointOfView: (next?: typeof pov) => { if (next) pov = { ...pov, ...next }; return pov; },
      controls: () => undefined,
    },
  };
}
const item = (id: string, lat: number, lng: number): ShareReportInfo => ({
  id, layer: 'SceneEvents', title: `Event ${id}`, variant: 'info', variantMeans: 'information (a disc)', author: 'npub1…',
  time: null, precisionM: 11_100, lat, lng, sharesPlaceWith: 0,
});
const SF = item('31923:pk:raver-scene-event-sf', 37.8, -122.4);
const LA = item('31923:pk:raver-scene-event-la', 34.1, -118.2);

/**
 * Mounted as the globe mounts it: the featured item read from the store, as
 * the card states it, arriving a render after it is chosen, as it can in a
 * browser, where the store's update is not drawn in the same task.
 */
type Surface = { ready: boolean; loading: string[] };
function mount(initial: ShareReportInfo[] = [SF, LA], surface?: Surface, whyNotDrawn?: (id: string) => string | null | undefined, extra: Record<string, unknown> = {}) {
  const globeRef = fakeGlobe();
  const hook = renderHook((props: { reports: ShareReportInfo[]; surface?: Surface }) => {
    const featuredId = useFeaturedReportId();
    const [shown, setShown] = React.useState<string | null>(null);
    React.useEffect(() => {
      const timer = setTimeout(() => setShown(featuredId), 20);
      return () => clearTimeout(timer);
    }, [featuredId]);
    const chosen = props.reports.find((r) => r.id === shown);
    return useGlobeShareCard({
      globeRef: globeRef as never, feeds: [], marks: null, shareReports: props.reports,
      featured: chosen ? { id: chosen.id, title: chosen.title, position: { lat: chosen.lat, lng: chosen.lng }, lines: [] } : null,
      ...(props.surface ? { surface: props.surface } : {}),
      ...(whyNotDrawn ? { whyNotDrawn } : {}),
      ...extra,
    });
  }, { initialProps: { reports: initial, surface } });
  return { globeRef, ...hook };
}

beforeEach(() => {
  capture.blank = false;
  composed.featured = [];
  composed.presets = [];
  composed.blankTimes = 0;
  controls.pinLayer.mockReset();
  controls.clearPins.mockReset();
  temporal.timeWindow = null;
  temporal.isLive = true;
  temporal.setTimeWindow.mockReset().mockImplementation((start: number, end: number) => {
    temporal.timeWindow = { start: new Date(start), end: new Date(end) };
    temporal.isLive = false;
  });
  temporal.setIsLive.mockReset();
});
afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  setFeaturedReportId(null);
});

describe('whenReady({ address })', () => {
  it('without an address, as before: ready once a frame can be captured, and no reason', async () => {
    mount();
    const ready = await handle().whenReady({ timeoutMs: 1000 });
    expect(ready).toMatchObject({ ready: true });
    expect(ready).not.toHaveProperty('reason');
  });

  it('waits until that item is drawn', async () => {
    const { rerender } = mount([LA]);
    const waiting = handle().whenReady({ address: SF.id, timeoutMs: 3000 });
    let settled = false;
    void waiting.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(settled).toBe(false);
    rerender({ reports: [LA, SF] });
    await expect(waiting).resolves.toMatchObject({ ready: true });
  });

  it('says why when that item is not drawn in time', async () => {
    mount([LA]);
    const ready = await handle().whenReady({ address: SF.id, timeoutMs: 300 });
    expect(ready.ready).toBe(false);
    expect(ready.waitedMs).toBeGreaterThanOrEqual(300);
    expect(ready.reason).toContain(SF.id);
    expect(ready.reason).toMatch(/listReports/);
  });

  it('says why the layer that holds it does not draw it, when one does (ask D)', async () => {
    const why = `"${SF.id}" is a Scene events note, and Scene events is off: setLayer('SceneEvents') or pinLayers(['SceneEvents']).`;
    mount([LA], undefined, (id) => (id === SF.id ? why : undefined));
    const ready = await handle().whenReady({ address: SF.id, timeoutMs: 300 });
    expect(ready).toMatchObject({ ready: false, reason: `After 300 ms, ${why}` });
    // An address no layer holds: the general hint, as before.
    const unknown = await handle().whenReady({ address: 'nobody-holds-this', timeoutMs: 300 });
    expect(unknown.reason).toMatch(/listReports/);
  });

  it('says why when the item is drawn and the globe cannot be captured', async () => {
    capture.blank = true;
    mount();
    const ready = await handle().whenReady({ address: SF.id, timeoutMs: 300 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toMatch(/blank|frame/);
  });
});

describe('whenReady and the globe\'s surface', () => {
  // Until the planet's material and textures are in, a card draws a planet without its skin.
  it('is not ready while the surface is loading, and is once it has', async () => {
    const { rerender } = mount([SF, LA], { ready: false, loading: ['Blue Marble photograph'] });
    const waiting = handle().whenReady({ timeoutMs: 3000 });
    let settled = false;
    void waiting.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(settled).toBe(false);
    rerender({ reports: [SF, LA], surface: { ready: true, loading: [] } });
    await expect(waiting).resolves.toMatchObject({ ready: true });
  });

  /*
   * A layer of another mode builds a new engine and skin, which the next render shows:
   * looking before it, whenReady saw the old mode's surface, settled, and a card drew
   * the previous skin (found on starcom.app, 2026-10-10).
   */
  it('looks only once a change asked for just before has rendered', async () => {
    const { rerender } = mount([SF, LA], { ready: true, loading: [] });
    const ready = handle().whenReady({ timeoutMs: 300 });
    rerender({ reports: [SF, LA], surface: { ready: false, loading: ['the planet\'s skin'] } });
    await expect(ready).resolves.toMatchObject({ ready: false, reason: expect.stringMatching(/the planet's skin/) });
  });

  it('says which of the surface is still loading when it does not load in time', async () => {
    mount([SF, LA], { ready: false, loading: ['Blue Marble photograph', 'Relief'] });
    const ready = await handle().whenReady({ address: SF.id, timeoutMs: 300 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toMatch(/surface/);
    expect(ready.reason).toContain('Blue Marble photograph, Relief');
  });
});

describe('renderBatch', () => {
  it('makes a card for each address, in order, each featuring its item, and features nothing after', async () => {
    mount();
    const results = await handle().renderBatch([{ address: SF.id, preset: 'square' }, { address: LA.id }], { timeoutMs: 1000 });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(composed.featured).toEqual([SF.id, LA.id]);
    expect(composed.presets).toEqual(['square', 'wide']);
    expect(results[0].card).toMatchObject({ dataUrl: `data:card-${SF.id}`, provenance: { featured: SF.id } });
    // One image crosses the boundary per card, as compose returns it.
    expect(results[0].card!.frame).toEqual({ width: 1, height: 1 });
    expect(getFeaturedReportId()).toBeNull();
  });

  it('frames each at no lower than one globe radius', async () => {
    const { globeRef } = mount();
    await handle().renderBatch([{ address: SF.id }], { timeoutMs: 1000 });
    expect(globeRef.current.pointOfView().altitude).toBeGreaterThanOrEqual(1);
    expect(globeRef.current.pointOfView().lat).toBeCloseTo(37.8, 0);
  });

  it('says an area is not built yet, and goes on to the next', async () => {
    mount();
    const results = await handle().renderBatch([{ area: { jurisdiction: 'us-ca' } }, { address: LA.id }], { timeoutMs: 1000 });
    expect(results[0]).toMatchObject({ ok: false });
    expect(results[0].reason).toMatch(/area/);
    expect(results[1]).toMatchObject({ ok: true });
  });

  it('says why an address not drawn in time has no card, and goes on', async () => {
    mount([LA]);
    const results = await handle().renderBatch([{ address: SF.id }, { address: LA.id }], { timeoutMs: 300 });
    expect(results[0].ok).toBe(false);
    expect(results[0].reason).toContain(SF.id);
    // whenReady's own answer, after waiting, not a refusal from framing it.
    expect(results[0].reason).toMatch(/^After 300 ms/);
    expect(results[1].ok).toBe(true);
  });

  it('pins the layers asked for, and refuses one this build does not have', async () => {
    mount();
    const results = await handle().renderBatch([
      { address: SF.id, layers: ['SceneEvents', 'HeatRisk'] },
      { address: LA.id, layers: ['NoSuchLayer'] },
    ], { timeoutMs: 1000 });
    expect(controls.pinLayer.mock.calls.map((c) => c[0])).toEqual(['SceneEvents', 'HeatRisk']);
    expect(results[0].ok).toBe(true);
    expect(results[1]).toMatchObject({ ok: false });
    expect(results[1].reason).toMatch(/NoSuchLayer/);
  });

  it('sets the window asked for, in unix seconds', async () => {
    const { rerender } = mount();
    const batch = handle().renderBatch([{ address: SF.id, window: { from: 1_790_899_200, until: 1_791_158_400 } }], { timeoutMs: 1000 });
    setTimeout(() => rerender({ reports: [SF, LA] }), 50);
    const results = await batch;
    expect(temporal.setTimeWindow).toHaveBeenCalledWith(1_790_899_200_000, 1_791_158_400_000);
    expect(results[0].ok).toBe(true);
  });

  // Templates are built since contract v14: a request's template is a shot's card.template.
  it('refuses a template it does not know, naming those it has', async () => {
    mount();
    const [result] = await handle().renderBatch([{ address: SF.id, template: 'raver_watch.scene_event' }], { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^unknown template "raver_watch.scene_event": the templates are critical_intel/);
  });

  it('makes the card with a template it has', async () => {
    mount();
    const [result] = await handle().renderBatch([{ address: SF.id, template: 'raver_alert' }], { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect((result as { shot?: { card?: { template?: string } } }).shot?.card?.template).toBe('raver_alert');
  });

  it('tries a blank frame once more, and says so when it is blank again', async () => {
    mount();
    composed.blankTimes = 1;
    const [once] = await handle().renderBatch([{ address: SF.id }], { timeoutMs: 1000 });
    expect(once.ok).toBe(true);
    composed.blankTimes = 2;
    const [twice] = await handle().renderBatch([{ address: SF.id }], { timeoutMs: 1000 });
    expect(twice).toMatchObject({ ok: false });
    expect(twice.reason).toMatch(/blank/);
  });

  it('refuses a request it cannot read, by what is wrong with it', async () => {
    mount();
    const results = await handle().renderBatch([
      null,
      { address: SF.id, area: { jurisdiction: 'us-ca' } },
      {},
      { address: SF.id, preset: 'banner', layers: ['SceneEvents'] },
    ], { timeoutMs: 1000 });
    expect(results.map((r) => r.ok)).toEqual([false, false, false, false]);
    // Refused before anything is changed for it.
    expect(controls.pinLayer).not.toHaveBeenCalled();
    expect(results[1].reason).toMatch(/one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing/);
    expect(results[2].reason).toMatch(/address/);
    expect(results[3].reason).toMatch(/banner/);
  });

  it('refuses anything but a list', async () => {
    mount();
    await expect(handle().renderBatch({ address: SF.id })).rejects.toThrow(/list/);
  });
});

/*
 * The report cap through the handle (BA1, BA5, BA7): listReports says when the
 * cap cut the list, and setReportCap sets a cap for this page only.
 */
describe('the report cap (v25)', () => {
  type CapHandle = {
    listReports: (o?: { counts?: boolean }) => unknown;
    setReportCap: (cap: unknown) => { cap: number | null; label: string; from: string };
    getReportCap: () => { cap: number | null; label: string; from: string };
  };
  const capHandle = () => handle() as unknown as CapHandle;
  afterEach(() => setReportCapOverride(undefined));

  it('lists as before with no options, and with counts says how many matched and whether the cap cut them', () => {
    mount([SF, LA], undefined, undefined, { reportCounts: { shown: 50, matching: 128, setting: 50 } });
    expect(capHandle().listReports()).toHaveLength(2);
    expect(capHandle().listReports({ counts: true })).toEqual({
      reports: [expect.objectContaining({ id: SF.id }), expect.objectContaining({ id: LA.id })],
      intelReports: { shown: 50, matching: 128, cap: 50, truncated: true },
    });
  });

  it('says nothing was cut when nothing was, nor when the priority filter, not the cap, drew fewer', () => {
    mount([SF, LA], undefined, undefined, { reportCounts: { shown: 30, matching: 30, setting: 50 } });
    expect((capHandle().listReports({ counts: true }) as { intelReports: { truncated: boolean } }).intelReports.truncated).toBe(false);
    setReportCapOverride(undefined);
    delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
    mount([SF, LA], undefined, undefined, { reportCounts: { shown: 25, matching: 30, setting: 50 } });
    expect((capHandle().listReports({ counts: true }) as { intelReports: { truncated: boolean } }).intelReports.truncated).toBe(false);
  });

  it('sets a cap for this page only, max and unlimited by name, and clears it with null', () => {
    mount([SF, LA], undefined, undefined, { reportCounts: { shown: 50, matching: 128, setting: 50 } });
    expect(capHandle().getReportCap()).toEqual({ cap: 50, label: '50', from: 'setting' });
    expect(capHandle().setReportCap('max')).toEqual({ cap: 1000, label: 'Max (1,000)', from: 'handle' });
    expect(getReportCapOverride()).toEqual({ cap: 1000 });
    expect(capHandle().setReportCap('unlimited')).toEqual({ cap: null, label: 'Unlimited', from: 'handle' });
    expect(capHandle().setReportCap(null)).toMatchObject({ from: 'setting' });
    expect(getReportCapOverride()).toBeUndefined();
  });

  it('refuses a cap it cannot read, saying why, and changes nothing', () => {
    mount();
    expect(() => capHandle().setReportCap(5)).toThrow(/a whole number from 10, 'max' or 'unlimited'/);
    expect(getReportCapOverride()).toBeUndefined();
  });
});
