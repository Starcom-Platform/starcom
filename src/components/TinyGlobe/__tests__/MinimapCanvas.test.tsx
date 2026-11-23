/**
 * The flat minimap changing skin (decision D-MG, MG1): it never draws the new skin with the old skin's
 * textures. When the skin changes, the paint loop starts again in the same commit that asks for the
 * new textures; a frame that fires before the old ones are cleared drew Blue Marble from the Cyber
 * Command maps, and threw, on the running build (golden run, 2026-10-11).
 */
import React from 'react';
import * as THREE from 'three';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinimapOrbit } from '../minimapOrbit';
import { MINIMAP_SKIN_TEXTURES } from '../minimapPixels';
import { MinimapCanvas } from '../MinimapCanvas';

const draws = vi.hoisted(() => [] as Array<{ skin: string; read: string[] }>);
vi.mock('../minimapPixels', async (importOriginal) => {
  const real = await importOriginal<typeof import('../minimapPixels')>();
  return {
    ...real,
    drawMinimapPixels: (_out: unknown, skin: string, textures: Record<string, unknown>) => {
      draws.push({ skin, read: Object.keys(textures).sort() });
    },
  };
});

/** Frames wait for `flush`, except one asked for while `due` is set: it fires at once, as a frame can before React re-renders. */
let frames: Array<FrameRequestCallback> = [];
let due = false;
const flush = () => act(() => { const now = frames; frames = []; now.forEach((paint) => paint(performance.now())); });

const props = {
  orbit: { pose: () => ({ lat: 10, lng: 20 }) } as unknown as MinimapOrbit,
  sun: new THREE.Vector3(1, 0, 0),
  nightFill: 0.1,
  points: [],
  marker: null,
  ring: { maxRadiusDeg: 2, repeatMs: 1000, color: '#00e5ff' },
  atmosphere: '#00e5ff',
  stillColor: '#5b6b7a',
  reducedMotion: false,
  onPick: () => {},
};

describe('MinimapCanvas changing skin', () => {
  const real = { fetch: globalThis.fetch, bitmap: globalThis.createImageBitmap, context: HTMLCanvasElement.prototype.getContext };
  beforeEach(() => {
    draws.length = 0;
    frames = [];
    due = false;
    globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['map']) })) as unknown as typeof fetch;
    globalThis.createImageBitmap = vi.fn(async () => ({ close() {} })) as unknown as typeof createImageBitmap;
    const pixels = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
    HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage() {}, putImageData() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => pixels(w, h),
      createImageData: pixels,
      createRadialGradient: () => ({ addColorStop() {} }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((paint) => {
      if (due) { due = false; paint(performance.now()); } else frames.push(paint);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frames = []; });
  });
  afterEach(() => {
    globalThis.fetch = real.fetch;
    globalThis.createImageBitmap = real.bitmap;
    HTMLCanvasElement.prototype.getContext = real.context;
    vi.restoreAllMocks();
  });

  it('draws each skin only from its own textures, even when a frame fires as the skin changes', async () => {
    const { rerender } = render(<MinimapCanvas skin="cyberEarth" {...props} />);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flush();
    expect(draws.at(-1)).toEqual({ skin: 'cyberEarth', read: [...MINIMAP_SKIN_TEXTURES.cyberEarth].sort() });

    due = true;
    rerender(<MinimapCanvas skin="blueMarble" {...props} />);
    due = false;
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flush();
    expect(draws.at(-1)).toEqual({ skin: 'blueMarble', read: ['blueMarble'] });
    for (const { skin, read } of draws) {
      expect(read, skin).toEqual([...MINIMAP_SKIN_TEXTURES[skin as keyof typeof MINIMAP_SKIN_TEXTURES]].sort());
    }
  });
});
