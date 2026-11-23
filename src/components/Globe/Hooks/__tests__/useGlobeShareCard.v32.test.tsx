/**
 * Clips that move through time (decision D-W, step 5c; contract v32): the
 * handle's `recordClip({ sweep })`, mounted as an agent meets it. A stand-in
 * weather layer draws each moment a render after the cursor moves, as the
 * real ones do, so each frame must wait for its own moment. So must a still
 * card at a paused moment (step 5d): `whenReady`.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' }, setVisualizationMode: vi.fn() }),
}));
// Earth Weather drawn, whose forecast hours a sweep loads step by step, unless a test clears it (v65).
const EARTH_WEATHER = { id: 'EarthWeather', label: 'Earth Weather', category: 'EcoNatural', isActive: true, isImplemented: true, isPrimary: true, isPinned: false };
const layerMock = vi.hoisted(() => ({ layers: [] as unknown[] }));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: layerMock.layers, pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));
/** The moment the stand-in weather had drawn when each frame was captured, and whether the clip held the globe's look then. */
const captured = vi.hoisted(() => ({
  lastDrawn: null as number | null, frames: [] as Array<number | null>, held: [] as boolean[],
  // The clip's own frames: whenReady's 64 px probe, which a clip now waits on before its camera moves (H3), set aside.
  clipFrames: [] as Array<number | null>, clipHeld: [] as boolean[],
}));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => {
  const clock = await import('../../../../globe-engine/captureClock');
  return {
    ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
    captureGlobeFrame: (_target: unknown, options: { width?: number; height?: number } = {}) => {
      captured.frames.push(captured.lastDrawn);
      captured.held.push(clock.captureUnderWay());
      // A frame of the clip, not whenReady's probe (64 px tall, 256 for a far view).
      if (options.height !== 64 && options.height !== 256) {
        captured.clipFrames.push(captured.lastDrawn);
        captured.clipHeld.push(clock.captureUnderWay());
      }
      return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
    },
  };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { noteDrawn, resetDrawnForTest } from '../../weather/weatherDrawn';
import { captureUnderWay } from '../../../../globe-engine/captureClock';

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

interface Handle {
  recordClip: (o: object) => Promise<unknown>;
  setTimeWindow: (w: { from: number; until: number }) => Promise<unknown>;
  whenReady: (o: { timeoutMs: number }) => Promise<{ ready: boolean; reason?: string }>;
}
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];
const FROM = 1_791_331_200; // 2026-10-07T00:00:00Z
const HOUR = 3600;

/** The moments the stand-in weather drew, whether the cursor ended live, and how long it takes to draw one. */
const seen = { drawn: [] as number[], live: true, delayMs: 40 };
/** Draws the cursor's moment a moment later, as a weather layer does a render after the cursor moves. */
const StandInWeather: React.FC = () => {
  const { currentTime, isLive } = useTemporalState();
  seen.live = isLive;
  useEffect(() => {
    if (isLive) return undefined;
    // Slower than a frame, as a layer loading or reweighting can be, so a capture that did not wait would see the moment before.
    const timer = setTimeout(() => { noteDrawn('heat', currentTime); seen.drawn.push(currentTime); captured.lastDrawn = currentTime; }, seen.delayMs);
    return () => clearTimeout(timer);
  }, [currentTime, isLive]);
  return null;
};

const mount = (withTimeline = true) => {
  const globeRef = fakeGlobe();
  const wrapper = ({ children }: { children: React.ReactNode }) => (withTimeline
    ? <TemporalProvider><StandInWeather />{children}</TemporalProvider>
    : <>{children}</>);
  renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [] }), { wrapper });
};

beforeEach(() => { layerMock.layers = [EARTH_WEATHER]; });

/** The Share button's own probe frame, taken once the globe has drawn (11 Nov): let it pass, so the frames counted after are whenReady's alone. */
const afterButtonProbe = async () => {
  await act(async () => { await new Promise((done) => { setTimeout(done, 600); }); });
  captured.frames = [];
};

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  resetDrawnForTest();
  seen.drawn = [];
  seen.delayMs = 40;
  captured.frames = [];
  captured.held = [];
  captured.clipFrames = [];
  captured.clipHeld = [];
  captured.lastDrawn = null;
  localStorage.clear();
});

describe('recordClip with a sweep', () => {
  it('loads every step first, waits for each frame\'s own moment, and leaves the moment live as it found it', async () => {
    /*
     * jsdom decodes no image, so the end card cannot draw its last frame and
     * the clip is refused there, after all its footage. The footage is what is
     * under test; the clip's record is recordGlobeClip's and clipProvenance's.
     */
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_value: string) { setTimeout(() => this.onerror?.(), 0); } });
    mount();
    noteDrawn('heat', 0);
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, sweep: { from: FROM, until: FROM + 6 * HOUR } }))
      .rejects.toThrow(/could not be decoded for the end card/);
    const at = (hours: number) => (FROM + hours * HOUR) * 1000;
    // Each model step first, back to the start, then each frame at its own moment: 00Z (already drawn), 03Z, 06Z.
    expect(seen.drawn).toEqual([at(0), at(3), at(6), at(0), at(3), at(6)]);
    // And each frame was captured only once its moment had been drawn.
    expect(captured.clipFrames).toEqual([at(0), at(3), at(6)]);
    // The globe's look held for the whole clip, so nothing (the 8K maps, say) lands between two frames (K7),
    // and let go however the clip ended: here, refused at its end card.
    expect(captured.clipHeld).toEqual([true, true, true]);
    expect(captureUnderWay()).toBe(false);
    // Restored as the clip ended, drawn a render later.
    await waitFor(() => expect(seen.live).toBe(true));
    vi.unstubAllGlobals();
  });

  it('refuses a sweep with a replay: the two would disagree about the moment shown', async () => {
    mount();
    await expect(handle().recordClip({ keyframes, replay: {}, sweep: { from: FROM, until: FROM + HOUR } }))
      .rejects.toThrow(/a replay or a sweep, not both/);
  });

  it('refuses a span that is not two whole unix seconds, the first before the second', async () => {
    mount();
    for (const sweep of [{ from: FROM }, { from: FROM + HOUR, until: FROM }, { from: FROM, until: FROM }, { from: FROM + 0.5, until: FROM + HOUR }]) {
      await expect(handle().recordClip({ keyframes, sweep })).rejects.toThrow(/sweep takes \{ from, until, step\? \} in whole unix seconds/);
    }
  });

  it('refuses a span longer than a day while Earth Weather is drawn, saying why', async () => {
    mount();
    await expect(handle().recordClip({ keyframes, sweep: { from: FROM, until: FROM + 25 * HOUR } }))
      .rejects.toThrow(/at most 24 hours while Earth Weather or Space Weather is drawn; this one spans 25\.0/);
  });

  it('sweeps weeks with no forecast layer drawn, its ends loaded first, each frame at its own moment (v65)', async () => {
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_value: string) { setTimeout(() => this.onerror?.(), 0); } });
    layerMock.layers = [];
    mount();
    const DAY = 24 * HOUR;
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, sweep: { from: FROM, until: FROM + 40 * DAY } }))
      .rejects.toThrow(/could not be decoded for the end card/);
    const at = (days: number) => (FROM + days * DAY) * 1000;
    expect(captured.clipFrames).toEqual([at(0), at(20), at(40)]);
    // No model step to load: none of the 320 three-hourly visits a forecast layer's 40 days would take.
    expect(seen.drawn.length).toBeLessThanOrEqual(5);
    vi.unstubAllGlobals();
  });

  it('steps the moment, holding between, when the sweep has a step (v65)', async () => {
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_value: string) { setTimeout(() => this.onerror?.(), 0); } });
    layerMock.layers = [];
    mount();
    const DAY = 24 * HOUR;
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, sweep: { from: FROM, until: FROM + 40 * DAY, step: 15 * DAY } }))
      .rejects.toThrow(/could not be decoded for the end card/);
    const at = (days: number) => (FROM + days * DAY) * 1000;
    expect(captured.clipFrames).toEqual([at(0), at(15), at(30)]);
    vi.unstubAllGlobals();
  });

  it('refuses a span over 400 days, and a step under a minute or over the span (v65)', async () => {
    layerMock.layers = [];
    mount();
    const DAY = 24 * HOUR;
    await expect(handle().recordClip({ keyframes, sweep: { from: FROM, until: FROM + 401 * DAY } })).rejects.toThrow(/at most 400 days; this one spans 401/);
    for (const step of [30, 2 * DAY, 1.5 * HOUR + 0.5]) {
      await expect(handle().recordClip({ keyframes, sweep: { from: FROM, until: FROM + DAY, step } })).rejects.toThrow(/sweep\.step is whole seconds/);
    }
  });

  it('refuses on a page with no timeline to move', async () => {
    mount(false);
    await expect(handle().recordClip({ keyframes, sweep: { from: FROM, until: FROM + HOUR } }))
      .rejects.toThrow(/no timeline for a sweep to move/);
  });
});

describe('whenReady at a paused moment (step 5d)', () => {
  it('waits until the weather is drawn for that moment, not another hour', async () => {
    // Longer than whenReady's first look, so a wait that did not ask which hour was drawn says ready on the hour before.
    seen.delayMs = 400;
    mount();
    await afterButtonProbe();
    noteDrawn('heat', 0);
    await handle().setTimeWindow({ from: FROM - HOUR, until: FROM });
    const ready = await handle().whenReady({ timeoutMs: 3000 });
    expect(ready.ready).toBe(true);
    // The frame that said ready was taken once the moment had been drawn.
    expect(captured.frames).toEqual([FROM * 1000]);
  });

  it('says so when the weather for the moment is not drawn in time', async () => {
    seen.delayMs = 10_000;
    mount();
    await afterButtonProbe();
    noteDrawn('heat', 0);
    await handle().setTimeWindow({ from: FROM - HOUR, until: FROM });
    const ready = await handle().whenReady({ timeoutMs: 500 });
    expect(ready.ready).toBe(false);
    expect(ready.reason).toMatch(/Earth Weather had not drawn 7 Oct 2026 00:00Z: a card then would show another hour's weather/);
    expect(captured.frames).toEqual([]);
  });

  it('does not wait on an hour while live: the weather moves with the clock', async () => {
    mount();
    // A layer drawing live notes the clock's moment, never the one asked about.
    noteDrawn('heat', 0);
    const ready = await handle().whenReady({ timeoutMs: 1000 });
    expect(ready.ready).toBe(true);
    expect(captured.frames).toEqual([null]);
  });
});
