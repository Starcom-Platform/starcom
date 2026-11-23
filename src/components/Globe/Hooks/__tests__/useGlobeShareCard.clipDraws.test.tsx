/**
 * A clip's frames, one draw each.
 *
 * recordClip renders every frame itself, through captureGlobeFrame. Each capture sized the drawing buffer for
 * itself, rendered and read, then put the size back and rendered again for the live view; and between two frames
 * the live loop drew the globe once more, at a moment nobody keeps. Three draws and two resizes a frame, where the
 * frame is one draw: on the Jetson, drawing in software, about 2.3 to 3 s a footage frame (measured 4-5 Nov).
 *
 * This mounts the handle on a globe whose renderer notes what it is asked to do, and whose own loop draws through
 * its composer on every tick, as globe.gl's does, and records a clip through the real captureGlobeFrame.
 */
import React from 'react';
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

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { stilledAt } from '../../../../globe-engine/captureClock';

/** CSS size of the page's globe, on a 2x screen: its canvas is twice that in device pixels. */
const CSS = { width: 270, height: 480 };
const RATIO = 2;

/**
 * A globe as far as a clip touches it. Its renderer behaves as three.js's does for size (setSize takes CSS pixels
 * and writes the canvas at the pixel ratio; setPixelRatio re-applies the size it holds), and notes each resize and
 * each draw: `frame` for a render made while motion is held still (a capture's), `live` for any other.
 */
function countingGlobe(over: { blankFromFrame?: number } = {}) {
  const log: string[] = [];
  let ratio = RATIO;
  const css = { ...CSS };
  const canvas = {
    isConnected: true, clientWidth: CSS.width, clientHeight: CSS.height,
    width: CSS.width * RATIO, height: CSS.height * RATIO,
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  };
  let frames = 0;
  let reads = 0;
  const gl = {
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
    readPixels: (_x: number, _y: number, w: number, h: number, _f: number, _t: number, out: Uint8Array) => {
      const blank = over.blankFromFrame !== undefined && frames > over.blankFromFrame;
      for (let k = 0; k < w * h * 4; k += 4) { const v = blank ? 7 : (reads++ % 251); out[k] = v; out[k + 1] = v; out[k + 2] = v; out[k + 3] = 255; }
    },
  };
  const renderer = {
    domElement: canvas,
    getContext: () => gl,
    getPixelRatio: () => ratio,
    getSize: (v: { set: (w: number, h: number) => unknown }) => v.set(css.width, css.height),
    setPixelRatio: (r: number) => {
      ratio = r;
      canvas.width = Math.floor(css.width * ratio); canvas.height = Math.floor(css.height * ratio);
      log.push(`pixelRatio:${r}`);
    },
    setSize: (w: number, h: number) => {
      css.width = w; css.height = h;
      canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio);
      log.push(`setSize:${w}x${h}`);
    },
    render: () => {
      if (stilledAt() !== null) frames += 1;
      log.push(stilledAt() === null ? 'live' : `frame:${canvas.width}x${canvas.height}`);
    },
  };
  // globe.gl draws every tick through its EffectComposer (three-render-objects' tick).
  const composer = { render: () => renderer.render() };
  const ownRender = composer.render;
  const camera = { aspect: CSS.width / CSS.height, updateProjectionMatrix: () => {} };
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const globe = {
    renderer: () => renderer,
    scene: () => ({}),
    camera: () => camera,
    postProcessingComposer: () => composer,
    getGlobeRadius: () => 100,
    pointOfView: (next?: typeof pov) => { if (next) pov = { ...pov, ...next }; return pov; },
    controls: () => undefined,
  };
  // The live loop, ticking at its own pace as the browser gives it frames.
  const loop = setInterval(() => composer.render(), 4);
  return { log, renderer, canvas, camera, composer, ownRender, ref: { current: globe }, stop: () => clearInterval(loop) };
}

interface Handle {
  recordClip: (o: object) => Promise<unknown>;
}
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
/** Five frames: 0, 250, 500, 750 and 1000 ms of a one-second turn at 4 fps. */
const keyframes = [{ lat: 10, lng: 20, altitude: 2.4, atMs: 0 }, { lat: 10, lng: 5, altitude: 2.4, atMs: 1000 }];
const FRAMES = 5;

let globe: ReturnType<typeof countingGlobe> | null = null;
afterEach(() => {
  globe?.stop();
  globe = null;
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  vi.unstubAllGlobals();
});

/** The clip's own frames in the log: the last `FRAMES` captures (whenReady's small probe comes first). */
const footage = (log: string[], count = FRAMES) => {
  const at = log.map((e, i) => (e.startsWith('frame:') ? i : -1)).filter((i) => i >= 0).slice(-count);
  return { first: at[0], last: at[at.length - 1], frames: at.map((i) => log[i]) };
};

const record = async (over: Parameters<typeof countingGlobe>[0] = {}) => {
  globe = countingGlobe(over);
  renderHook(() => useGlobeShareCard({ globeRef: globe!.ref as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [] }));
  // jsdom decodes no image, so the clip is refused at its end card, after all its footage: the footage is what is under test.
  vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onerror?.(), 0); } });
  return handle().recordClip({ keyframes, fps: 4, settleMs: 0 });
};

describe('a clip draws each frame once', () => {
  it('renders each footage frame once, with no live draw between its first frame and its last', async () => {
    await expect(record()).rejects.toThrow(/could not be decoded for the end card/);
    const { log } = globe!;
    const { first, last, frames } = footage(log);
    // Every frame the canvas's own size in device pixels, as before.
    expect(frames).toEqual(Array(FRAMES).fill(`frame:${CSS.width * RATIO}x${CSS.height * RATIO}`));
    expect(log.slice(first, last + 1).filter((e) => e === 'live')).toEqual([]);
  });

  it('sizes the drawing buffer once for the footage, not around every frame', async () => {
    await expect(record()).rejects.toThrow(/could not be decoded for the end card/);
    const { log } = globe!;
    const { first, last } = footage(log);
    expect(log.slice(first, last + 1).filter((e) => e.startsWith('setSize') || e.startsWith('pixelRatio'))).toEqual([]);
  });

  it('gives the live globe back once its frames are read: its size, pixel ratio and aspect, one render, and its own loop drawing', async () => {
    await expect(record()).rejects.toThrow(/could not be decoded for the end card/);
    const { log, renderer, canvas, camera, composer, ownRender } = globe!;
    const { last } = footage(log);
    const after = log.slice(last + 1);
    // Put back once, then drawn for the live view.
    expect(after.slice(0, 3)).toEqual(['pixelRatio:2', `setSize:${CSS.width}x${CSS.height}`, 'live']);
    expect(after.filter((e) => e.startsWith('setSize') || e.startsWith('pixelRatio'))).toHaveLength(2);
    expect(renderer.getPixelRatio()).toBe(RATIO);
    expect([canvas.width, canvas.height]).toEqual([CSS.width * RATIO, CSS.height * RATIO]);
    expect(camera.aspect).toBeCloseTo(CSS.width / CSS.height);
    expect(composer.render).toBe(ownRender);
    const drawn = log.length;
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(log.slice(drawn)).toContain('live');
  });

  it('gives the live globe back as it was when a frame is refused as blank mid-clip', async () => {
    await expect(record({ blankFromFrame: 3 })).rejects.toThrow(/blank/);
    const { log, renderer, canvas, camera, composer, ownRender } = globe!;
    expect(renderer.getPixelRatio()).toBe(RATIO);
    expect([canvas.width, canvas.height]).toEqual([CSS.width * RATIO, CSS.height * RATIO]);
    expect(camera.aspect).toBeCloseTo(CSS.width / CSS.height);
    expect(composer.render).toBe(ownRender);
    const drawn = log.length;
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(log.slice(drawn)).toContain('live');
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
