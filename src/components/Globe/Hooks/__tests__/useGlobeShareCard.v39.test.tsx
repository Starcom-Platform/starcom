/**
 * A briefing playlist as a clip (briefing-playlists.md, BP14–BP21; contract v39):
 * the handle's `recordTour({ playlist })`, mounted as an agent meets it. The
 * playlist's layers shown and put back, its read waited for, the clip's camera
 * the screen tour's, each frame drawn with the caption of its moment, and the
 * tour kept in the clip's record.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' }, setVisualizationMode: vi.fn() }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));
/** Each frame's caption as drawn, and what the recorder was told; `fakeClip` stands in a recorded clip for the real one. */
const captured = vi.hoisted(() => ({ captions: [] as string[][], overlays: 0, options: [] as Array<Record<string, unknown>>, fakeClip: false }));
const temporal = vi.hoisted(() => {
  const state = {
    timeWindow: null as null | { start: Date; end: Date },
    isLive: true,
    currentTime: 0,
    setTimeWindow: (start: number, end: number) => { state.timeWindow = { start: new Date(start), end: new Date(end) }; state.currentTime = end; state.isLive = false; },
    setIsLive: (live: boolean) => { if (live) { state.isLive = true; state.timeWindow = null; } },
    setCurrentTime: (ms: number) => { state.currentTime = ms; state.isLive = false; },
  };
  return state;
});
vi.mock('../../../../context/TemporalContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../context/TemporalContext')>()),
  useTemporalStateOptional: () => temporal,
}));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: (_target: unknown, options: { width?: number; height?: number; overlay?: { draw: (ctx: unknown, w: number, h: number) => void } } = {}) => {
    // Not counted: the readiness probe whenReady takes (64 px), which a clip now waits on before its camera moves (H3): not a frame.
    if (options.height === 64 || options.height === 256) return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
    // What the overlay writes on a frame of 1280 x 720.
    const texts: string[] = [];
    if (options.overlay) {
      captured.overlays += 1;
      options.overlay.draw({
        fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, textBaseline: 'top',
        fillRect: () => undefined, strokeRect: () => undefined, drawImage: () => undefined,
        measureText: (text: string) => ({ width: text.length * 8 }),
        fillText: (text: string) => texts.push(text),
      }, 1280, 720);
    }
    captured.captions.push(texts);
    return { dataUrl: 'data:image/jpeg;base64,', width: 1280, height: 720, mimeType: 'image/jpeg' };
  },
}));
vi.mock('../../../../features/globe/capture/recordGlobeClip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/capture/recordGlobeClip')>();
  return {
    ...actual,
    recordGlobeClip: (...args: Parameters<typeof actual.recordGlobeClip>) => {
      captured.options.push({ ...(args[2] ?? {}), durationMs: args[0].durationMs });
      if (captured.fakeClip) {
        const frame = { dataUrl: 'data:image/jpeg;base64,', width: 1280, height: 720, mimeType: 'image/jpeg' as const };
        return Promise.resolve({ frames: [frame], fps: 1, provenance: {} as never, stats: {} as never });
      }
      return actual.recordGlobeClip(...args);
    },
  };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import type { TourCandidate, TourOffer } from '../../../../features/globe/tour/briefingPlaylist';

function fakeGlobe() {
  let pov = { lat: 5, lng: 6, altitude: 2.2 };
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

interface Handle { recordTour: (o: unknown) => Promise<unknown>; captureFrame: (o: unknown) => unknown; getView: () => { lat: number; lng: number; altitude: number } }
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const item = (id: string, lat: number, lng: number, rank: number): TourCandidate => ({
  id, title: `Item ${id}`, position: { lat, lng }, lines: [`Line of ${id}`], why: `Why ${id}`, rank, at: 0, group: id,
});
const ITEMS = [item('a', 49, 32, 0), item('b', 15, 30, 1)];

const mount = (offer: () => TourOffer | null) => {
  const restore = vi.fn();
  const show = vi.fn(() => restore);
  renderHook(() => useGlobeShareCard({
    globeRef: fakeGlobe() as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [],
    tours: { candidatesFor: () => offer(), show },
  }));
  // jsdom decodes no image: every clip here is refused at its end card, after all its footage.
  vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_value: string) { setTimeout(() => this.onerror?.(), 0); } });
  return { show, restore };
};

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  captured.fakeClip = false;
  temporal.isLive = true;
  temporal.timeWindow = null;
  captured.captions = [];
  captured.overlays = 0;
  captured.options = [];
  vi.unstubAllGlobals();
});

describe('recordTour (contract v39)', () => {
  it('shows the playlist, records its stops at the screen\'s pace with each frame\'s caption drawn in, and puts back what it showed', async () => {
    const { show, restore } = mount(() => ({ candidates: ITEMS, complete: true }));
    const before = handle().getView();
    await expect(handle().recordTour({ playlist: 'war', fps: 1, settleMs: 0 })).rejects.toThrow(/end card/);
    expect(show).toHaveBeenCalledWith('war');
    expect(restore).toHaveBeenCalledTimes(1);
    expect(handle().getView()).toEqual(before);
    // The opening (3 s) and two stops of a line each (2.5 s flight + 6.4 s hold): 20.8 s, 22 frames at 1 fps.
    expect(captured.options[0]).toMatchObject({ durationMs: 20_800, fps: 1 });
    expect(captured.captions).toHaveLength(22);
    expect(captured.captions[0]).toEqual(['WAR & CONFLICT TODAY', 'War & Conflict today', '2 stops, worst first, by region']);
    expect(captured.captions[4]).toEqual(['WAR & CONFLICT TODAY · 1 OF 2', 'Item a', 'Why a', 'Line of a']);
    expect(captured.captions[21]).toEqual(['WAR & CONFLICT TODAY · 2 OF 2', 'Item b', 'Why b', 'Line of b']);
    expect(captured.options[0].tour).toMatchObject({
      playlist: 'war', title: 'War & Conflict today', shown: 2, total: 2, partial: false,
      opening: { fromMs: 0, toMs: 3000 },
      stops: [
        { id: 'a', title: 'Item a', progress: '1 of 2', why: 'Why a', lines: ['Line of a'], fromMs: 3000, toMs: 11_900 },
        { id: 'b', title: 'Item b', progress: '2 of 2', why: 'Why b', lines: ['Line of b'], fromMs: 11_900, toMs: 20_800 },
      ],
    });
  });

  it('resolves only once the page shows again what it showed before: a caller\'s next shot never meets the tour\'s', async () => {
    captured.fakeClip = true;
    const restore = vi.fn(() => { setTimeout(() => temporal.setIsLive(true), 300); });
    renderHook(() => useGlobeShareCard({
      globeRef: fakeGlobe() as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [],
      tours: {
        candidatesFor: () => ({ candidates: ITEMS, complete: true }),
        // As the raves playlist does: tonight's hours on the timeline, put back a render or two later.
        show: () => { temporal.setTimeWindow(Date.UTC(2026, 9, 10, 0), Date.UTC(2026, 9, 10, 12)); return restore; },
      },
    }));
    await handle().recordTour({ playlist: 'raves', fps: 1, settleMs: 0 });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(temporal.isLive).toBe(true);
  });

  it('tours the whole read when it completes while it waits', async () => {
    const ready = Date.now() + 300;
    mount(() => ({ candidates: ITEMS, complete: Date.now() >= ready }));
    await expect(handle().recordTour({ playlist: 'war', fps: 1, settleMs: 0, timeoutMs: 5000 })).rejects.toThrow(/end card/);
    expect(captured.options[0].tour).toMatchObject({ partial: false, shown: 2 });
  });

  it('waits for the layer\'s read, then tours what arrived and says so', async () => {
    mount(() => ({ candidates: ITEMS.slice(0, 1), complete: false }));
    await expect(handle().recordTour({ playlist: 'raves', fps: 1, settleMs: 0, timeoutMs: 300 })).rejects.toThrow(/end card/);
    expect(captured.options[0].tour).toMatchObject({ playlist: 'raves', partial: true, shown: 1 });
    // Wrapped to the panel's width, it reads as one sentence.
    expect(captured.captions[0].slice(2).join(' ')).toBe('1 stop, worst first, by region. Still reading The Record: this tours what had arrived');
  });

  it('refuses a playlist it does not have, and one with nothing to tour, putting back what it showed', async () => {
    const empty = mount(() => ({ candidates: [], complete: true }));
    await expect(handle().recordTour({ playlist: 'news' })).rejects.toThrow('playlist is one of war, raves, heat, heroes: the briefing tour\'s playlists.');
    expect(empty.show).not.toHaveBeenCalled();
    await expect(handle().recordTour({ playlist: 'heat', fps: 1, settleMs: 0 })).rejects.toThrow('Nothing to tour on Heat watch: its layer offers no items now.');
    expect(empty.restore).toHaveBeenCalledTimes(1);
    expect(captured.captions).toEqual([]);
  });

  it('leaves a clip that tours nothing as it was, and the raw frame without anything drawn on it', async () => {
    mount(() => ({ candidates: ITEMS, complete: true }));
    handle().captureFrame({ overlay: { surface: {}, draw: () => { throw new Error('drawn'); } } });
    expect(captured.overlays).toBe(0);
    // A clip after a tour carries none of the tour's captions.
    await expect(handle().recordTour({ playlist: 'war', fps: 1, settleMs: 0 })).rejects.toThrow(/end card/);
    captured.overlays = 0;
    captured.options = [];
    const handleWithClip = handle() as unknown as { recordClip: (o: object) => Promise<unknown> };
    await expect(handleWithClip.recordClip({ keyframes: [{ lat: 0, lng: 0, altitude: 2, atMs: 0 }, { lat: 0, lng: 10, altitude: 2, atMs: 1000 }], fps: 2, settleMs: 0 })).rejects.toThrow(/end card/);
    expect(captured.overlays).toBe(0);
    expect(captured.options[0]).not.toHaveProperty('tour');
  });
});
