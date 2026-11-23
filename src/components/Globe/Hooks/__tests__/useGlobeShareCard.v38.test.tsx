/**
 * Tonight's card through the share handle (raver-nights.md, RN3; contract v38):
 * `subject: { tonight: 'latest' }`, or a renderBatch request's `{ tonight }`.
 * Scene events drawn and read whole, tonight taken from the shot's moment or now,
 * the planet turned to tonight's events, and tonight's page in place of an item's.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
const chosen = vi.hoisted(() => ({ modes: [] as unknown[] }));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: (mode: unknown) => { chosen.modes.push(mode); },
  }),
}));
const layer = (id: string, category: string, isPrimary: boolean) => ({
  id, label: id, category, description: '', isPrimary, isPinned: false, isActive: true, isImplemented: true,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('IntelReports', 'CyberCommand', true), layer('SceneEvents', 'RaverWatch', false), layer('HeatRisk', 'RaverWatch', false)],
    pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));
const temporal = vi.hoisted(() => {
  const state = {
    timeWindow: null as null | { start: Date; end: Date },
    isLive: true,
    currentTime: 0,
    // As TemporalContext: a window pauses at its end; a moment pauses in the step around it; live clears both.
    setTimeWindow: (start: number, end: number, at?: number) => {
      state.timeWindow = { start: new Date(start), end: new Date(end) };
      state.currentTime = at === undefined ? end : Math.min(Math.max(at, start), end);
      state.isLive = false;
    },
    setIsLive: (live: boolean) => { if (live) { state.isLive = true; state.timeWindow = null; } },
    setCurrentTime: (ms: number) => {
      state.currentTime = ms;
      state.isLive = false;
      state.timeWindow = { start: new Date(ms - 3_600_000), end: new Date(ms + 3_600_000) };
    },
  };
  return state;
});
vi.mock('../../../../context/TemporalContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../context/TemporalContext')>()),
  useTemporalStateOptional: () => temporal,
}));
// A capture that always succeeds, so whenReady reports ready on this fake globe.
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => ({ dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' }),
}));
const composed = vi.hoisted(() => ({
  frontPages: [] as unknown[], templates: [] as unknown[], windows: [] as Array<[number, number] | null>, moments: [] as number[],
  live: () => null as [number, number] | null, moment: () => 0,
}));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
  composeShareCard: async (_target: unknown, input: { featured: unknown; frontPage?: unknown; template?: unknown }) => {
    composed.frontPages.push(input.frontPage ?? null);
    composed.templates.push(input.template ?? null);
    composed.windows.push(composed.live());
    composed.moments.push(composed.moment());
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
  describeScene: () => ({ layers: [{ layer: 'Scene events', inFrame: 3, drawn: 3, items: [], rankedBy: 'severity' }], notCounted: [] }),
}));
import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { tonightCard } from '../../../../features/globe/capture/tonightCard';
import type { FeedProvenance } from '../../../../features/globe/capture/shareCardProvenance';
import type { Tonight } from '../../../../services/raverWatch/raverWatchView';

function fakeGlobe() {
  let pov = { lat: 0, lng: 0, altitude: 1.6 };
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

type Result = { ok: boolean; reason?: string };
type Handle = {
  getView: () => { lat: number; lng: number; altitude: number };
  renderShot: (shot: unknown, o?: { timeoutMs?: number }) => Promise<Result>;
  renderBatch: (requests: unknown, o?: { timeoutMs?: number }) => Promise<Result[]>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

// 10 Oct 2026 02:40Z.
const FROM_S = Date.UTC(2026, 9, 10, 2, 40) / 1000;
const tonightFrom = (fromS: number, count = 3): Tonight => ({
  fromS,
  untilS: fromS + 12 * 3600,
  count,
  underHeat: count ? 1 : 0,
  regions: count ? [{ name: 'US Central', count, underHeat: 1, first: { atS: fromS + 1200, local: '21:00 CDT' } }] : [],
  points: count ? [{ lat: 30, lon: -97 }, { lat: 32, lon: -97 }, { lat: 34, lon: -97 }] : [],
});

const sceneFeed = (over: Partial<FeedProvenance> = {}): FeedProvenance => ({
  name: 'Scene events', shortName: 'Scene events', lastUpdated: '2026-10-10T02:00:00.000Z', error: null, loading: false, ...over,
});
const mount = (tonightOf: (fromS: number) => Tonight, feeds: FeedProvenance[] = [sceneFeed()]) => renderHook(() => useGlobeShareCard({
  globeRef: fakeGlobe() as never, feeds, marks: null, onViewChosen: vi.fn(), shareReports: [], tonightOf,
}));

// The timeline's window as the card was composed, in unix seconds.
composed.live = () => (temporal.timeWindow ? [temporal.timeWindow.start.getTime() / 1000, temporal.timeWindow.end.getTime() / 1000] : null);
composed.moment = () => temporal.currentTime / 1000;

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  composed.frontPages.length = 0;
  composed.templates.length = 0;
  chosen.modes.length = 0;
  composed.windows.length = 0;
  composed.moments.length = 0;
  temporal.isLive = true;
  temporal.currentTime = 0;
  temporal.timeWindow = null;
});

describe('tonight\'s card (RN3, v38)', () => {
  it('draws Scene events, reads tonight from the shot\'s moment, turns the planet to its events, and cards its page', async () => {
    const tonightOf = vi.fn((fromS: number) => tonightFrom(fromS));
    mount(tonightOf);
    const result = await handle().renderShot({ subject: { tonight: 'latest' }, time: { at: FROM_S } }, { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    expect(chosen.modes).toContainEqual({ mode: 'RaverWatch', subMode: 'SceneEvents' });
    expect(tonightOf).toHaveBeenLastCalledWith(FROM_S);
    expect(composed.frontPages).toEqual([tonightCard(tonightFrom(FROM_S)).page]);
    expect(composed.templates).toEqual([null]);
    // Drawn over tonight's twelve hours (RN10), then the person's timeline put back: live, as it was.
    expect(composed.windows).toEqual([[FROM_S, FROM_S + 12 * 3600]]);
    // Read from tonight's start: its moment, as the shot states it, never twelve hours on.
    expect(composed.moments).toEqual([FROM_S]);
    expect(temporal.isLive).toBe(true);
    expect(temporal.timeWindow).toBeNull();
    const view = handle().getView();
    expect(view.lat).toBeCloseTo(32, 0);
    expect(view.lng).toBeCloseTo(-97, 0);
    expect(view.altitude).toBe(2.5);
  });

  it('is tonight from now while the timeline is live, as a renderBatch request\'s { tonight }', async () => {
    const tonightOf = vi.fn((fromS: number) => tonightFrom(fromS));
    mount(tonightOf);
    const before = Math.floor(Date.now() / 1000);
    const [result] = await handle().renderBatch([{ tonight: 'latest' }], { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    const fromS = tonightOf.mock.calls.at(-1)![0];
    expect(fromS).toBeGreaterThanOrEqual(before);
    expect(fromS).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(Number.isInteger(fromS)).toBe(true);
  });

  it('puts back a window the person had chosen, and a moment they had paused at', async () => {
    mount((fromS) => tonightFrom(fromS));
    const chosen = { start: Date.UTC(2026, 8, 1) , end: Date.UTC(2026, 8, 8) };
    temporal.setTimeWindow(chosen.start, chosen.end);
    expect((await handle().renderShot({ subject: { tonight: 'latest' }, time: { at: FROM_S } }, { timeoutMs: 2000 })).reason).toBeUndefined();
    expect(composed.windows).toEqual([[FROM_S, FROM_S + 12 * 3600]]);
    expect(temporal).toMatchObject({ isLive: false, currentTime: chosen.end, timeWindow: { start: new Date(chosen.start), end: new Date(chosen.end) } });

    const paused = Date.UTC(2026, 8, 20, 4, 30, 12, 345);
    temporal.setCurrentTime(paused);
    expect((await handle().renderShot({ subject: { tonight: 'latest' } }, { timeoutMs: 2000 })).reason).toBeUndefined();
    // Tonight from the moment it was paused at, to the whole second; and that moment back after.
    expect(composed.windows[1]).toEqual([Math.floor(paused / 1000), Math.floor(paused / 1000) + 12 * 3600]);
    expect(temporal).toMatchObject({ isLive: false, currentTime: paused });
  });

  it('says so, and composes nothing, when no event starts tonight', async () => {
    mount((fromS) => tonightFrom(fromS, 0));
    const result = await handle().renderShot({ subject: { tonight: 'latest' }, time: { at: FROM_S } }, { timeoutMs: 2000 });
    expect(result).toMatchObject({ ok: false, reason: 'No scene events start in the twelve hours from 10 Oct 2026 02:40Z.' });
    expect(composed.frontPages).toEqual([]);
  });

  it('waits for Scene events to finish loading, and says why when they could not be read', async () => {
    const tonightOf = vi.fn((fromS: number) => tonightFrom(fromS));
    mount(tonightOf, [sceneFeed({ loading: true })]);
    expect(await handle().renderShot({ subject: { tonight: 'latest' }, time: { at: FROM_S } }, { timeoutMs: 400 }))
      .toMatchObject({ ok: false, reason: 'Scene events had not loaded after 400 ms, so there is no tonight to draw.' });
    delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
    mount(tonightOf, [sceneFeed({ error: 'no relay answered' })]);
    expect(await handle().renderShot({ subject: { tonight: 'latest' }, time: { at: FROM_S } }, { timeoutMs: 400 }))
      .toMatchObject({ ok: false, reason: 'Scene events could not be read (no relay answered), so there is no tonight to draw.' });
    expect(tonightOf).not.toHaveBeenCalled();
    expect(composed.frontPages).toEqual([]);
  });
});
