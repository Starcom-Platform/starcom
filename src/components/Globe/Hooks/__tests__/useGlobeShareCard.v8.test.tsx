/**
 * Share handle v8 (globe record, section 19, Phase 1 step 4; decisions RW7
 * and RW8), as an agent meets it: mounted, not read off the contract.
 *
 * `setTimeWindow({ from, until })` moves the app's shared window, the one the
 * timeline shows and a person sees, in unix seconds, and resolves once the
 * window has changed; `null` returns to live. `getTimeWindow()` reads it. A
 * card's provenance records the window, names the Raver Watch items drawn, and
 * carries its own address: `link`, a deeplink v1 that reads back as the view
 * it was made from.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'RaverWatch', subMode: 'DrugCheckAlerts' }, setVisualizationMode: vi.fn() }),
}));
const layer = (id: string, category: string, over: Record<string, boolean> = {}) => ({
  id, label: id, category, description: '', isPrimary: false, isPinned: false, isActive: false, isImplemented: true, ...over,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [
      layer('IntelReports', 'CyberCommand'),
      layer('DrugCheckAlerts', 'RaverWatch', { isPrimary: true, isActive: true }),
      layer('SpaceWeather', 'EcoNatural', { isPinned: true, isActive: true }),
    ],
    pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
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
const composed = vi.hoisted(() => ({ input: null as null | Record<string, unknown> }));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
  composeShareCard: async (_target: unknown, input: Record<string, unknown>) => {
    composed.input = input;
    return { dataUrl: 'data:', width: 1, height: 1, mimeType: 'image/png', provenance: {}, sourceRect: {}, frame: { width: 1, height: 1 } };
  },
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { parseDeeplink } from '../../../../context/deeplinkV1';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';

type Window = { from: number | null; until: number | null; live: boolean };
type Handle = {
  getTimeWindow: () => Window;
  setTimeWindow: (window: { from: number; until: number } | null) => Promise<Window>;
  compose: (options?: object) => Promise<unknown>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const globeRef = {
  current: {
    renderer: () => ({ domElement: { isConnected: true, clientWidth: 1280, clientHeight: 608 } }),
    scene: () => ({}), camera: () => ({}), getGlobeRadius: () => 100,
    pointOfView: () => ({ lat: 48.21, lng: 16.37, altitude: 1.3 }), controls: () => undefined,
  },
};
const FROM = 1_790_899_200;
const UNTIL = 1_791_158_400;
const alert: ShareReportInfo = {
  id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', title: 'Aktuelle Warnungen', variant: 'red', variantMeans: 'level red (a glow)',
  author: 'npub1…', time: null, precisionM: 11_100, lat: 48.2, lng: 16.4, sharesPlaceWith: 0,
};
const mount = (shareReports: ShareReportInfo[] = []) =>
  renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null, shareReports }));

beforeEach(() => {
  temporal.timeWindow = null;
  temporal.isLive = true;
  temporal.setTimeWindow.mockReset().mockImplementation((start: number, end: number) => {
    temporal.timeWindow = { start: new Date(start), end: new Date(end) };
    temporal.isLive = false;
  });
  temporal.setIsLive.mockReset().mockImplementation((live: boolean) => {
    if (live) temporal.timeWindow = null;
    temporal.isLive = live;
  });
  composed.input = null;
});
afterEach(() => { delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE]; });

describe('the shared time window (RW7)', () => {
  it('reads as live until one is set', () => {
    mount();
    expect(handle().getTimeWindow()).toEqual({ from: null, until: null, live: true });
  });

  it('moves the app’s window, in unix seconds, and resolves once it has moved', async () => {
    const { rerender } = mount();
    const set = handle().setTimeWindow({ from: FROM, until: UNTIL });
    rerender();
    await expect(set).resolves.toEqual({ from: FROM, until: UNTIL, live: false });
    expect(temporal.setTimeWindow).toHaveBeenCalledWith(FROM * 1000, UNTIL * 1000);
    expect(handle().getTimeWindow()).toEqual({ from: FROM, until: UNTIL, live: false });
  });

  /*
   * A window change rebuilds every layer's marks: on a page drawing hundreds of scene
   * events under software rendering it took longer than 3 s, and a shot was refused a
   * window the timeline took a moment later (found on starcom.app, 2026-10-10).
   */
  it('waits for a timeline slow to take the window, rather than refusing it at 3 s', async () => {
    temporal.setTimeWindow.mockReset().mockImplementation((start: number, end: number) => {
      setTimeout(() => {
        temporal.timeWindow = { start: new Date(start), end: new Date(end) };
        temporal.isLive = false;
      }, 4000);
    });
    mount();
    await expect(handle().setTimeWindow({ from: FROM, until: UNTIL })).resolves.toEqual({ from: FROM, until: UNTIL, live: false });
  }, 20_000);

  it('waits for a timeline slow to pause at a shot\'s moment, rather than refusing it at 3 s', async () => {
    temporal.setCurrentTime.mockReset().mockImplementation((at: number) => {
      setTimeout(() => { temporal.currentTime = at; temporal.isLive = false; }, 4000);
    });
    mount();
    const plan = await (handle() as unknown as { planShot: (s: unknown, o?: unknown) => Promise<{ ok: boolean; reason?: string }> })
      .planShot({ subject: { view: { lat: 10, lng: 20, altitude: 2 } }, time: { at: UNTIL } }, { timeoutMs: 20_000 });
    expect(plan.reason ?? '').not.toMatch(/did not pause/);
    expect(temporal.currentTime).toBe(UNTIL * 1000);
  }, 25_000);

  it('returns to live on null', async () => {
    temporal.timeWindow = { start: new Date(FROM * 1000), end: new Date(UNTIL * 1000) };
    const { rerender } = mount();
    const set = handle().setTimeWindow(null);
    rerender();
    await expect(set).resolves.toEqual({ from: null, until: null, live: true });
    expect(temporal.setIsLive).toHaveBeenCalledWith(true);
  });

  it.each([
    ['ends before it begins', { from: UNTIL, until: FROM }],
    ['is not in whole seconds', { from: FROM + 0.5, until: UNTIL }],
    ['is not a window', { from: FROM } as unknown as { from: number; until: number }],
  ])('refuses a window that %s, and moves nothing', async (_why, bad) => {
    mount();
    await expect(handle().setTimeWindow(bad)).rejects.toThrow(/whole unix seconds/);
    expect(temporal.setTimeWindow).not.toHaveBeenCalled();
  });
});

describe('a card’s provenance (RW8)', () => {
  it('carries its view as a link that reads back as that view, and its window', async () => {
    temporal.timeWindow = { start: new Date(FROM * 1000), end: new Date(UNTIL * 1000) };
    mount([alert]);
    await handle().compose({ preset: 'wide' });

    const link = String(composed.input!.link);
    expect(link.startsWith(`${window.location.origin}/?v=1`)).toBe(true);
    expect(parseDeeplink(new URL(link).search)).toEqual({
      v: 1, sub: 'DrugCheckAlerts', mode: 'RaverWatch',
      at: { lat: 48.21, lng: 16.37, alt: 1.3 }, pins: ['SpaceWeather'], focus: null, win: { from: FROM, until: UNTIL },
    });
    expect(composed.input!.window).toEqual({ from: FROM, until: UNTIL });
  });

  it('names the Raver Watch items drawn, and says the window is live when it is', async () => {
    mount([alert, { ...alert, id: 'intel-1', layer: 'IntelReports', variant: 'raw' }]);
    await handle().compose();
    expect(composed.input!.raverWatchItems).toEqual([{ id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', level: 'red' }]);
    expect(composed.input!.window).toBeNull();
  });
});

void React;
