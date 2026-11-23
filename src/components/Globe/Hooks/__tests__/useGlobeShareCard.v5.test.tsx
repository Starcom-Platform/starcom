/**
 * Featuring one report through the share handle (decision D-F, section 18,
 * item 2) — mounted, as an agent meets it.
 *
 * The rules under test are the ones that must hold for any caller, not only
 * Mecha Jono's careful driver: an unknown or RLSH id is refused rather than
 * ignored, nothing is framed below one globe radius, and a card whose chosen
 * report is no longer drawn refuses rather than composing without it.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));

/*
 * A capture that always succeeds, so whether whenReady reports ready depends on
 * the layout check and nothing else. Without this the fake globe could not
 * render at all, whenReady never reported ready, and the placeholder test
 * passed with the layout check deleted — found by mutating it.
 */
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => ({ dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' }),
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { getFeaturedReportId, setFeaturedReportId } from '../../../../features/globe/capture/featuredReportStore';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';

/** A globe whose canvas is laid out at the given on-screen size. */
function fakeGlobe(onScreen: { w: number; h: number }) {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: onScreen.w, clientHeight: onScreen.h };
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

type Info = { id: string; lat: number; lng: number; title: string; time: { iso: string; basis: string } | null };
type Handle = {
  compose: (o?: object) => Promise<unknown>;
  listReports: () => Info[];
  frameReports: (ids: string[], o?: object) => Promise<{ lat: number; lng: number; altitude: number }>;
  focusReport: (id: string | null) => { featured: Info | null };
  recordClip: (o: object) => Promise<unknown>;
  planReportTour: (ids: string[], o?: object) => { keyframes: Array<{ altitude: number; atMs: number }>; stops: Array<{ ids: string[] }> };
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  setFeaturedReportId(null);
});

const info = (id: string, lat: number, lng: number): ShareReportInfo => ({
  id, title: `Report ${id}`, variant: 'raw', variantMeans: 'not assessed', author: 'npub1abcdef…wxyz',
  time: { iso: '2026-09-24T12:00:00.000Z', basis: 'written' }, precisionM: null, lat, lng, sharesPlaceWith: 0,
});
const denver = info('denver', 39.7, -105);
const boston = info('boston', 42.4, -71.1);

const mount = (over: Partial<Parameters<typeof useGlobeShareCard>[0]> = {}) => {
  const globeRef = fakeGlobe({ w: 1280, h: 608 });
  const onViewChosen = vi.fn();
  renderHook(() => useGlobeShareCard({
    globeRef: globeRef as never, feeds: [], marks: null, onViewChosen, shareReports: [denver, boston], ...over,
  }));
  return { globeRef, onViewChosen };
};

describe('listReports', () => {
  it('returns what is drawn, as copies a caller cannot edit into the next answer', () => {
    mount();
    const first = handle().listReports();
    expect(first.map((r) => r.id)).toEqual(['denver', 'boston']);
    first[0].title = 'edited';
    first[0].time!.iso = 'edited';
    expect(handle().listReports()[0].title).toBe('Report denver');
    expect(handle().listReports()[0].time!.iso).toBe('2026-09-24T12:00:00.000Z');
  });
});

describe('frameReports', () => {
  it('points the camera between the reports, no lower than one globe radius', async () => {
    const { globeRef, onViewChosen } = mount();
    let view!: { lat: number; lng: number; altitude: number };
    await act(async () => { view = await handle().frameReports(['denver', 'boston'], { transitionMs: 0 }); });

    expect(view.lng).toBeGreaterThan(-105);
    expect(view.lng).toBeLessThan(-71.1);
    expect(view.altitude).toBeGreaterThanOrEqual(1);
    // It reads the camera back rather than echoing its own plan.
    expect(view).toEqual(globeRef.current.pointOfView());
    expect(onViewChosen).toHaveBeenCalled();
  });

  it('frames one report at the floor, never closer', async () => {
    mount();
    let view!: { altitude: number };
    await act(async () => { view = await handle().frameReports(['denver']); });
    // At the floor, and never a rounding error below it.
    expect(view.altitude).toBeGreaterThanOrEqual(1);
    expect(view.altitude).toBeLessThan(1.001);
  });

  it('refuses an id that is not drawn, rather than framing the rest', async () => {
    mount();
    await expect(handle().frameReports(['denver', 'hero-7'])).rejects.toThrow(/Not on the globe now: hero-7/);
  });

  it('refuses an empty list and an unknown preset', async () => {
    mount();
    await expect(handle().frameReports([])).rejects.toThrow(/at least one report/);
    await expect(handle().frameReports(['denver'], { preset: 'banner' })).rejects.toThrow(/Unknown preset/);
  });

  it('refuses reports on opposite sides of the planet', async () => {
    mount({ shareReports: [info('a', 0, 0), info('b', 0, 179)] });
    await expect(handle().frameReports(['a', 'b'])).rejects.toThrow(/no one side of the planet/);
  });
});

describe('focusReport', () => {
  it('features a drawn report, and clears with null', () => {
    mount();
    expect(handle().focusReport('boston').featured?.id).toBe('boston');
    expect(getFeaturedReportId()).toBe('boston');
    expect(handle().focusReport(null).featured).toBeNull();
    expect(getFeaturedReportId()).toBeNull();
  });

  it('refuses an id that is not drawn, and leaves the choice as it was', () => {
    mount();
    handle().focusReport('denver');
    expect(() => handle().focusReport('hero-7')).toThrow(/not on the globe now/);
    expect(getFeaturedReportId()).toBe('denver');
  });

  it('makes compose refuse when the chosen report is no longer drawn', async () => {
    mount({ featured: null });
    act(() => { handle().focusReport('denver'); });
    await expect(handle().compose({ preset: 'wide' })).rejects.toThrow(/chose "denver", which is not on the globe now/);
  });
});

describe('planReportTour', () => {
  it('plans a tour of drawn reports without moving the camera', () => {
    const { globeRef, onViewChosen } = mount();
    const before = globeRef.current.pointOfView();
    const plan = handle().planReportTour(['denver', 'boston']);
    expect(plan.stops.map((s) => s.ids)).toEqual(expect.arrayContaining([['denver'], ['boston']]));
    for (const k of plan.keyframes) expect(k.altitude).toBeGreaterThanOrEqual(1);
    expect(globeRef.current.pointOfView()).toEqual(before);
    expect(onViewChosen).not.toHaveBeenCalled();
  });

  it('refuses an id that is not drawn', () => {
    mount();
    expect(() => handle().planReportTour(['denver', 'hero-7'])).toThrow(/Not on the globe now: hero-7/);
  });
});

describe('recordClip with a replay', () => {
  it('refuses reports at one moment rather than captioning a still as a replay', async () => {
    mount();
    const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];
    // Both reports were written at the same moment: nothing to sweep.
    await expect(handle().recordClip({ keyframes, replay: {} })).rejects.toThrow(/two or more distinct times/);
  });

  it('refuses a named span that is not two unix-second times, the first before the second (BA2)', async () => {
    mount();
    const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];
    await expect(handle().recordClip({ keyframes, replay: { from: 1_790_899_200 } })).rejects.toThrow(/replay.from and replay.until are unix seconds/);
    await expect(handle().recordClip({ keyframes, replay: { from: 1_790_985_600, until: 1_790_899_200 } })).rejects.toThrow(/the first before the second/);
  });

  it('refuses a named span with no report drawn in it, saying how many are outside it (BA2)', async () => {
    mount();
    const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];
    await expect(handle().recordClip({ keyframes, replay: { pace: 'time', from: 100, until: 200 } }))
      .rejects.toThrow(/A replay from 1970-01-01 00:01Z to 1970-01-01 00:03Z has no report drawn in it: \d+ drawn reports? (is|are) outside it/);
  });

  it('refuses a pace it does not know', async () => {
    mount();
    const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];
    await expect(handle().recordClip({ keyframes, replay: { pace: 'fast' } })).rejects.toThrow(/replay.pace/);
  });
});
