/**
 * Share handle v11, as an agent meets it: the shot (decision IM1; globe
 * record, section 21), mounted rather than read off the contract.
 *
 * `planShot` stages a shot and describes it, composing nothing. `renderShot`
 * makes its card, passing its type and quality through and carrying the shot,
 * as it was drawn, in the card's provenance. A batch takes shots as it takes
 * v9 requests. What a shot cannot honour is refused before anything changes.
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
    layers: [layer('SceneEvents', 'RaverWatch'), layer('HeatRisk', 'RaverWatch'), layer('WarConflict', 'GeoPolitical')],
    pinLayer: controls.pinLayer, unpinLayer: vi.fn(), clearPins: controls.clearPins,
  }),
}));
const temporal = vi.hoisted(() => ({
  timeWindow: null as null | { start: Date; end: Date },
  isLive: true,
  currentTime: 0,
  setTimeWindow: vi.fn(),
  setIsLive: vi.fn(),
  setCurrentTime: vi.fn(),
}));
vi.mock('../../../../context/TemporalContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../context/TemporalContext')>()),
  useTemporalStateOptional: () => temporal,
}));
const capture = vi.hoisted(() => ({ blank: false, blankBelow: 0, options: [] as Array<Record<string, unknown> | undefined> }));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>();
  return {
    ...original,
    captureGlobeFrame: (_target: unknown, options?: Record<string, unknown>) => {
      capture.options.push(options);
      if (capture.blank || Number(options?.height ?? Infinity) < capture.blankBelow) throw new original.GlobeCaptureError('the captured frame is blank');
      return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
    },
  };
});
const composed = vi.hoisted(() => ({ featured: [] as Array<string | null>, presets: [] as unknown[], blankTimes: 0, inputs: [] as Array<Record<string, unknown>> }));
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
      composed.inputs.push(input as unknown as Record<string, unknown>);
      return {
        dataUrl: `data:card-${input.featured?.id}`, width: 1, height: 1, mimeType: 'image/png',
        provenance: { featured: input.featured?.id, shot: (input as { shot?: unknown }).shot }, sourceRect: {}, frame: { width: 1, height: 1, dataUrl: 'data:frame' },
        regions: { picture: { x: 0, y: 0, width: 1, height: 1 }, footer: { x: 0, y: 1, width: 1, height: 0 } },
        ...((input as { alt?: boolean }).alt === false ? {} : { alt: `Alt for ${input.featured?.id}` }),
        warnings: ['The headline was shortened to fit; the whole title is in the alt text and the provenance.'],
      };
    },
  };
});

// The fake globe has no three.js camera to project with: its bounds, and what is in frame, as they would be.
vi.mock('../../../../features/globe/capture/globeScreenBounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/globeScreenBounds')>()),
  computeGlobeScreenBounds: () => ({ x: 340, y: 0, width: 600, height: 600 }),
}));
vi.mock('../../../../features/globe/capture/describeView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/describeView')>()),
  describeScene: () => ({ layers: [{ layer: 'Scene events', inFrame: 2, drawn: 2, items: [], rankedBy: 'time' }], notCounted: [] }),
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { getGlobeAppearance, resetGlobeAppearanceForTests } from '../../../../services/globe/globeAppearance';
import { getFeaturedReportId, setFeaturedReportId, useFeaturedReportId } from '../../../../features/globe/capture/featuredReportStore';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';
import { noteIntelDrawn, noteIntelTaken } from '../../../../services/intel/intelReportsDrawn';

type Ready = { ready: boolean; waitedMs: number; reason?: string };
type Result = { ok: boolean; card?: { dataUrl: string; provenance: { featured?: string }; frame: object }; reason?: string; note?: string };
type Handle = {
  whenReady: (o?: object) => Promise<Ready>;
  renderBatch: (requests: unknown, o?: object) => Promise<Result[]>;
  planShot: (shot: unknown, o?: object) => Promise<Record<string, unknown>>;
  renderShot: (shot: unknown, o?: object) => Promise<Record<string, unknown> & { card?: { provenance: Record<string, unknown> } }>;
  composeFor: (address: string, o?: object) => Promise<{ dataUrl: string }>;
  compose: (o?: object) => Promise<{ dataUrl: string }>;
  focusReport: (id: string | null) => unknown;
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
function mount(initial: ShareReportInfo[] = [SF, LA], extra: Record<string, unknown> = {}) {
  const globeRef = fakeGlobe();
  const hook = renderHook((props: { reports: ShareReportInfo[] }) => {
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
      ...extra,
    });
  }, { initialProps: { reports: initial } });
  return { globeRef, ...hook };
}


/*
 * Every card size is composed since IM27: describing a card's picture measures
 * its text first, on a 2D canvas that jsdom does not have. Roughly a real
 * font's width, as the compose tests measure. Before each test: each ends by
 * restoring every mock.
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) })) as never,
  );
});

beforeEach(() => {
  capture.blank = false;
  capture.blankBelow = 0;
  composed.featured = [];
  composed.presets = [];
  composed.blankTimes = 0;
  composed.inputs = [];
  resetGlobeAppearanceForTests();
  controls.pinLayer.mockReset();
  controls.clearPins.mockReset();
  temporal.timeWindow = null;
  temporal.isLive = true;
  temporal.setTimeWindow.mockReset().mockImplementation((start: number, end: number) => {
    temporal.timeWindow = { start: new Date(start), end: new Date(end) };
    temporal.isLive = false;
  });
  temporal.setIsLive.mockReset();
  temporal.currentTime = 0;
  temporal.setCurrentTime.mockReset().mockImplementation((at: number) => {
    temporal.currentTime = at;
    temporal.isLive = false;
  });
});
afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  setFeaturedReportId(null);
});

describe('renderShot', () => {
  it('makes the card of a shot, its provenance carrying the shot as drawn, its look set as asked', async () => {
    mount();
    const result = await handle().renderShot({
      subject: { address: SF.id },
      layers: { pins: ['HeatRisk'] },
      appearance: { light: 'headlamp' },
      card: { preset: 'square' },
      output: { type: 'image/webp', quality: 0.8 },
    }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(controls.pinLayer.mock.calls.map((c) => c[0])).toEqual(['HeatRisk']);
    expect(getGlobeAppearance().lightMode).toBe('headlamp');
    expect(composed.inputs[0]).toMatchObject({ preset: 'square', mimeType: 'image/webp', quality: 0.8 });
    // Its link opens the picture lit as it was drawn (deeplink v2).
    expect(String(composed.inputs[0].link)).toMatch(/\?v=2&.*&look=auto,headlamp,0\.15$/);
    const shot = result.card!.provenance.shot as Record<string, unknown>;
    expect(shot).toMatchObject({
      v: 1, subject: { address: SF.id }, emphasis: { featured: true },
      appearance: { light: 'headlamp' }, card: { preset: 'square' }, output: { type: 'image/webp', quality: 0.8, scale: 1 },
    });
    expect(result.shot).toEqual(shot);
    expect(composed.featured).toEqual([SF.id]);
  });

  it('writes a v1 link, with no look, when the look is the default', async () => {
    mount();
    await handle().renderShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    expect(String(composed.inputs[0].link)).toMatch(/\?v=1&/);
    expect(String(composed.inputs[0].link)).not.toMatch(/look=/);
  });

  it('refuses what it cannot honour before changing anything', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id }, layers: { pins: ['RLSH'] } });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/RLSH/) });
    expect(controls.pinLayer).not.toHaveBeenCalled();
    expect(composed.inputs).toEqual([]);
  });
});

describe('planShot', () => {
  it('stages and describes a shot, and composes nothing', async () => {
    mount();
    const plan = await handle().planShot({ subject: { address: LA.id }, card: { callouts: true } }, { timeoutMs: 1000 });
    expect(plan).toMatchObject({ ok: true, shot: { subject: { address: LA.id } }, estimatedComposeMs: null });
    expect(plan.notes).toEqual(['card.callouts is not built yet: only the featured item is labelled']);
    expect(plan.inFrame).toEqual([{ layer: 'Scene events', inFrame: 2, drawn: 2, items: [], rankedBy: 'time' }]);
    expect(plan.warnings).toEqual([]);
    expect(composed.inputs).toEqual([]);
    expect(getFeaturedReportId()).toBe(LA.id);
  });
});

describe('a batch of shots', () => {
  it('takes shots and v9 requests together, each result carrying its shot', async () => {
    mount();
    const results = await handle().renderBatch([
      { subject: { address: SF.id }, card: { preset: 'portrait' } },
      { address: LA.id },
    ], { timeoutMs: 1000 });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(composed.presets).toEqual(['portrait', 'wide']);
    // A Raver Watch item says what it is, so its card is Raver Watch's (IM14, contract v14).
    expect((results[0] as { shot?: { card: unknown } }).shot?.card).toEqual({ preset: 'portrait', template: 'raver_alert' });
    expect(getFeaturedReportId()).toBeNull();
  });
});

describe('layersFor (v12)', () => {
  it('names the layers this build draws for a category', () => {
    mount();
    const layersFor = (handle() as unknown as { layersFor: (c: string) => unknown }).layersFor;
    expect(layersFor('scene.safety')).toEqual({ category: 'scene.safety', layers: ['SceneEvents', 'HeatRisk'], from: 'kind' });
    expect(() => layersFor('Not A Category')).toThrow(/group\.kind/);
  });
});

describe('how a card frames the planet (v13)', () => {
  it('gives the card a QR code of the short view link on starcom.app when the shot asks (IM13, IM31)', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id }, card: { qr: true } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    const qr = (composed.inputs[0] as { qr?: { link: string } }).qr!;
    expect(qr.link.startsWith('https://starcom.app/?v=1&')).toBe(true);
    expect(qr.link).not.toMatch(/focus=|win=|look=/);
  });

  it('passes a shot\'s fit to the card', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id }, framing: { fit: 'planet' } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(composed.inputs[0]).toMatchObject({ fit: 'planet' });
  });

  it('describes the whole planet when nothing is featured, and the view when an item is (IM9)', async () => {
    mount();
    const describe = (o: object) => (handle() as unknown as { describeView: (o: object) => Record<string, unknown> }).describeView(o);
    expect(describe({})).toMatchObject({ fit: 'planet' });
    await handle().planShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    expect(describe({})).toMatchObject({ fit: 'view' });
  });

  it('describes the picture with the fit asked for, and says which', async () => {
    mount();
    const view = (handle() as unknown as { describeView: (o: object) => Record<string, unknown> }).describeView({ preset: 'square', fit: 'planet' });
    expect(view).toMatchObject({ preset: 'square', fit: 'planet' });
    expect(() => (handle() as unknown as { describeView: (o: object) => unknown }).describeView({ fit: 'zoom' })).toThrow(/fit "zoom"/);
  });
});

/*
 * Contract v23: a close-up of the featured item (IM34–IM36), from the layer
 * that drew it, only when a shot asks, refused with that layer's reason, and
 * never for an Intel Report.
 */
describe('close-ups (v23)', () => {
  const INSET = {
    kind: 'venues', featured: { id: SF.id, lat: 37.778, lon: -122.417, color: '#c77dff', cancelled: false, label: 'The Midway' },
    others: [], outlines: [], bounds: { west: -122.43, south: 37.77, east: -122.40, north: 37.79 },
    title: 'Public venues the same night', within: 'within 25 km', placedTo: 'about 150 m', gridKm: 1,
  };

  it('gives the card the close-up the item\'s layer makes, when the shot asks, and says so in the shot', async () => {
    const closeUp = vi.fn(async () => INSET);
    const closeUpRefusal = vi.fn(() => null);
    mount(undefined, { closeUp, closeUpRefusal });
    const result = await handle().renderShot({ subject: { address: SF.id }, card: { inset: true } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(closeUpRefusal).toHaveBeenCalledWith(SF.id);
    expect(closeUp).toHaveBeenCalledWith(SF.id);
    expect(composed.inputs[0].inset).toBe(INSET);
    expect((result.shot as { card: object }).card).toMatchObject({ inset: true });
  });

  it('none unless the shot asks', async () => {
    const closeUp = vi.fn(async () => INSET);
    mount(undefined, { closeUp, closeUpRefusal: () => null });
    await handle().renderShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    expect(closeUp).not.toHaveBeenCalled();
    expect(composed.inputs[0].inset).toBeUndefined();
  });

  it('refuses with the layer\'s own reason, composing nothing', async () => {
    const why = 'This scene event is placed only to its town, about 11 km: a close-up would claim more than its note does.';
    const closeUp = vi.fn(async () => INSET);
    mount(undefined, { closeUp, closeUpRefusal: () => why });
    const result = await handle().renderShot({ subject: { address: SF.id }, card: { inset: true } }, { timeoutMs: 1000 });
    expect(result).toMatchObject({ ok: false, reason: why });
    expect(closeUp).not.toHaveBeenCalled();
    expect(composed.inputs).toEqual([]);
  });

  it('never for an Intel Report, which no layer here makes a close-up of', async () => {
    const report: ShareReportInfo = { ...item('intel-1', 10, 10), layer: 'IntelReports', variant: 'not-assessed' as never };
    mount([SF, LA, report], { closeUp: vi.fn(async () => undefined), closeUpRefusal: () => undefined });
    const result = await handle().renderShot({ subject: { address: report.id }, card: { inset: true } }, { timeoutMs: 1000 });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/never for an Intel Report, whose place can be a filing address/) });
    expect(composed.inputs).toEqual([]);
  });

  it('refused when the layer cannot make it at the time, saying why', async () => {
    const why = 'The close-up needs the outline of us-ca, which could not be loaded from Starcom: try again.';
    mount(undefined, { closeUp: async () => ({ refused: why }), closeUpRefusal: () => null });
    const result = await handle().renderShot({ subject: { address: SF.id }, card: { inset: true } }, { timeoutMs: 1000 });
    expect(result).toMatchObject({ ok: false, reason: why });
    expect(composed.inputs).toEqual([]);
  });
});

// Contract v14: Mecha Jono's card templates, the badge the item's own where it says (IM14).
describe('templates', () => {
  const WAR = { ...item('30023:pk:starcom-intel-conflict-x', 35, 71.2), layer: 'WarConflict' as const, variant: 'critical' as const, role: 'critical' as const };

  it('badges a Raver Watch item\'s card as Raver Watch, chosen by the item', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(composed.inputs[0].template).toEqual({ name: 'raver_alert', chosenBy: 'item' });
    expect((result.shot as { card: object }).card).toEqual({ preset: 'wide', template: 'raver_alert' });
  });

  it('refuses a template the item disagrees with, and makes no card', async () => {
    mount([SF, LA, WAR]);
    const result = await handle().renderShot({ subject: { address: WAR.id }, card: { template: 'actionable_intel' } }, { timeoutMs: 1000 });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/role is critical: its card is critical_intel/) });
    expect(composed.inputs).toEqual([]);
  });

  it('composeFor makes one item\'s card with its template, as compose returns it', async () => {
    mount([SF, LA, WAR]);
    const card = await handle().composeFor(WAR.id, { template: 'critical_intel', preset: 'embed' });
    expect(card.dataUrl).toBe(`data:card-${WAR.id}`);
    expect(composed.inputs[0]).toMatchObject({ preset: 'embed', template: { name: 'critical_intel', chosenBy: 'item' } });
    expect(Object.keys(card).sort()).toEqual(['alt', 'dataUrl', 'frame', 'height', 'mimeType', 'provenance', 'regions', 'sourceRect', 'warnings', 'width']);
    expect(card.regions).toEqual({ picture: { x: 0, y: 0, width: 1, height: 1 }, footer: { x: 0, y: 1, width: 1, height: 0 } });
  });

  it('composeFor throws why there is no card', async () => {
    mount();
    await expect(handle().composeFor(SF.id, { template: 'declassified' })).rejects.toThrow(/front page/);
    await expect(handle().composeFor(SF.id, { template: 'critical_intel' })).rejects.toThrow(/Raver Watch: its card is raver_alert/);
    expect(composed.inputs).toEqual([]);
  });

  it('gives the share button\'s card of an item the item\'s own badge', async () => {
    mount([SF, LA, WAR]);
    handle().focusReport(WAR.id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await handle().compose();
    expect(composed.inputs[0].template).toEqual({ name: 'critical_intel', chosenBy: 'item' });
  });

  it('makes the share button\'s card with no badge when nothing is featured', async () => {
    mount();
    await handle().compose();
    expect(composed.inputs[0].template).toBeNull();
  });
});

// Contract v15: the War & Conflict Brief's front page (IM16).
describe('the brief', () => {
  const wc = (id: string, lat: number, lng: number) => ({ ...item(id, lat, lng), layer: 'WarConflict' as const, variant: 'report' as const, role: 'context' as const });
  const W1 = wc('30023:pk:starcom-intel-conflict-1', 30, 40);
  const W2 = wc('30023:pk:starcom-intel-conflict-2', 32, 44);
  const BRIEF = {
    day: '2026-10-02', count: 3, noTheatre: 1, ids: [W1.id, W2.id, '30023:pk:starcom-intel-conflict-unplaced'],
    theatres: [{ slug: 'x', name: 'X war', count: 2, tier: 'major_war' }],
    title: 'War & Conflict Brief · 2 Oct 2026', lines: ['3 items reported on 2 Oct 2026 (UTC), posted on The Record'],
  };
  const feed = (over: Record<string, unknown> = {}) => ({ name: 'War & Conflict, war news posted on The Record', shortName: 'War & Conflict', lastUpdated: '2026-10-02T12:00:00.000Z', loading: false, ...over });

  it('makes the day\'s front page: centred on its drawn items, its facts on the card, no item featured', async () => {
    const { globeRef } = mount([SF, LA, W1, W2], { briefOf: () => BRIEF, feeds: [feed()] });
    const result = await handle().renderShot({ subject: { brief: 'latest' } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(composed.inputs[0]).toMatchObject({
      frontPage: { template: 'conflict_brief', day: '2026-10-02', title: BRIEF.title, count: 3, noTheatre: 1 },
      template: { name: 'conflict_brief', chosenBy: 'subject' },
      featured: null,
    });
    expect(result.shot).toMatchObject({ subject: { brief: '2026-10-02' }, framing: { fit: 'planet' }, card: { template: 'conflict_brief' } });
    const pov = globeRef.current.pointOfView();
    expect(pov.lat).toBeCloseTo(31, 0);
    expect(pov.lng).toBeCloseTo(42, 0);
    expect(pov.altitude).toBe(2.5);
  });

  it('asks for the day it is given, and says so when that day has none', async () => {
    const asked: Array<string | undefined> = [];
    mount([SF], { briefOf: (day?: string) => { asked.push(day); return null; }, feeds: [feed()] });
    expect(await handle().renderShot({ subject: { brief: '2026-09-01' } }, { timeoutMs: 500 }))
      .toMatchObject({ ok: false, reason: 'No War & Conflict items were read for 2026-09-01 (UTC).' });
    expect(asked).toContain('2026-09-01');
    expect(composed.inputs).toEqual([]);
  });

  it('waits for War & Conflict to finish loading, and says so when it does not', async () => {
    mount([SF], { briefOf: () => BRIEF, feeds: [feed({ loading: true, lastUpdated: null })] });
    expect(await handle().renderShot({ subject: { brief: 'latest' } }, { timeoutMs: 300 }))
      // whenReady says it first since D-LS's LS5, as it does for every shown layer's feed still loading.
      .toMatchObject({ ok: false, reason: expect.stringMatching(/After 300 ms, War & Conflict was still loading: a card then would predate its data/) });
  });

  it('says why when War & Conflict could not be read', async () => {
    mount([SF], { briefOf: () => null, feeds: [feed({ error: 'The Record could not be read', lastUpdated: null })] });
    expect(await handle().renderShot({ subject: { brief: 'latest' } }, { timeoutMs: 300 }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/could not be read \(The Record could not be read\)/) });
  });
});

// Contract v17: alt text and warnings on every card, through the handle as compose made them.
describe('alt text and warnings', () => {
  it('pass through the handle on the card, and a render returns the card\'s warnings', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    const card = result.card as unknown as { alt?: string; warnings: string[] };
    expect(card.alt).toBe(`Alt for ${SF.id}`);
    expect(card.warnings).toEqual(['The headline was shortened to fit; the whole title is in the alt text and the provenance.']);
    expect(result.warnings).toContain('The headline was shortened to fit; the whole title is in the alt text and the provenance.');
  });

  it('leave the alt text off when the shot says so', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id }, output: { alt: false } }, { timeoutMs: 1000 });
    expect(composed.inputs[0].alt).toBe(false);
    expect('alt' in (result.card as object)).toBe(false);
  });
});

// Contract v19: time.at pauses the shared timeline (IM20), and a paused card is stilled at its moment (IM23).
describe('a moment in time', () => {
  it('pauses the timeline at the shot\'s moment, and stills the card\'s motion there', async () => {
    mount();
    const result = await handle().renderShot({ subject: { address: SF.id }, time: { at: 1_790_967_291 } }, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    expect(temporal.setCurrentTime).toHaveBeenCalledWith(1_790_967_291_000);
    expect(composed.inputs[0].stillAt).toBe(1_790_967_291_000);
    expect((result.shot as { time: unknown }).time).toEqual({ at: 1_790_967_291 });
  });

  it('leaves a live card\'s moment to compose', async () => {
    mount();
    await handle().renderShot({ subject: { address: SF.id } }, { timeoutMs: 1000 });
    expect('stillAt' in composed.inputs[0]).toBe(false);
  });

  it('holds a raw frame still at the paused moment, as a card is, unless one is asked for', () => {
    mount();
    capture.options = [];
    handle().captureFrame({ scale: 1 });
    expect(capture.options[0]).toEqual({ scale: 1 });
    temporal.setCurrentTime(1_790_967_291_000);
    handle().captureFrame({ scale: 1 });
    expect(capture.options[1]).toEqual({ scale: 1, stillAt: 1_790_967_291_000 });
    handle().captureFrame({ scale: 1, stillAt: 5 });
    expect(capture.options[2]).toEqual({ scale: 1, stillAt: 5 });
  });
});

/*
 * whenReady's probe (2 Nov): a far view drew under a pixel at 64 px and was called blank for the whole wait, and a
 * square probe saw less across than the wide screen. The probe keeps the canvas's shape, and asks again at 256 px.
 */
describe("whenReady's probe frame", () => {
  const probes = () => capture.options.filter((o) => o?.height === 64 || o?.height === 256);

  it('asks a view blank at 64 px tall again at 256 before calling it blank, in the canvas\'s own shape', async () => {
    mount([SF, LA]);
    capture.blankBelow = 256;
    capture.options = [];
    expect((await handle().whenReady({ timeoutMs: 400 })).ready).toBe(true);
    expect(probes().map((o) => [o?.width, o?.height])).toEqual([[135, 64], [539, 256]]);
  });

  it('calls it blank only when neither size draws', async () => {
    mount([SF, LA]);
    capture.blank = true;
    const ready = await handle().whenReady({ timeoutMs: 400 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toContain('it was blank');
  });
});

/*
 * whenReady waits for every shown layer's feeds (decision D-LS, LS5): it released before Eco Disasters, Comm Hubs,
 * Cyber Threats and Conflict Zones had their data, and a card then predated them.
 */
describe('whenReady and the shown layers\' feeds', () => {
  const cables = (loading: boolean) => ({ name: 'Submarine cable map', shortName: 'Comm Hubs cables', layer: 'CommHubs', lastUpdated: null, loading, timestamped: false });

  it('waits while a shown layer\'s feed is still loading, and says which', async () => {
    mount([SF, LA], { feeds: [cables(true)] });
    const ready = await handle().whenReady({ timeoutMs: 400 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toContain('Comm Hubs cables was still loading: a card then would predate its data');
  });

  it('is ready once the feed is in', async () => {
    mount([SF, LA], { feeds: [cables(false)] });
    expect((await handle().whenReady({ timeoutMs: 400 })).ready).toBe(true);
  });

  it('waits on a feed that counts its progress short of its total', async () => {
    mount([SF, LA], { feeds: [{ name: 'Intel Reports from the relays (1 of 6 answered)', shortName: 'Intel Reports', layer: 'IntelReports', lastUpdated: new Date().toISOString(), loading: true, progress: { done: 1, total: 6 } }] });
    const ready = await handle().whenReady({ timeoutMs: 400 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toContain('Intel Reports was still loading');
  });

  it('does not wait on a feed that has not reported, which may never', async () => {
    mount([SF, LA], { feeds: [{ name: 'A source that never starts', layer: 'CommHubs', lastUpdated: null }] });
    expect((await handle().whenReady({ timeoutMs: 400 })).ready).toBe(true);
  });
});

/*
 * Mecha Jono's videos, 24 Oct (plan H3): the reports arrived as the planet turned. whenReady, which a clip now waits
 * on before its camera moves, waits until what the Intel Reports pipeline took in is drawn.
 */
describe('whenReady and the Intel Reports just read', () => {
  it('waits while the reports just read are a render away from the globe, and says so', async () => {
    mount([SF, LA]);
    const taken = noteIntelTaken();
    const ready = await handle().whenReady({ timeoutMs: 400 });
    noteIntelDrawn(taken);
    expect(ready.ready).toBe(false);
    expect(ready.reason).toContain('the Intel Reports just read were not drawn yet: a card then would show fewer than were read');
  });

  it('is ready once they are drawn', async () => {
    mount([SF, LA]);
    noteIntelDrawn(noteIntelTaken());
    expect((await handle().whenReady({ timeoutMs: 400 })).ready).toBe(true);
  });
});
