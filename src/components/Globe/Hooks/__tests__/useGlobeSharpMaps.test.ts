/**
 * The Earth's 8K maps on the globe (useGlobeSharpMaps.ts; decision K7, TX3): fetched only
 * when a person zooms in closer than the default view, at a quality step that keeps them
 * once auto quality has measured the device, on a graphics card that holds them, and put
 * into whatever material the globe is drawing with, never in the middle of a capture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import * as THREE from 'three';

const fake = vi.hoisted(() => {
  type Waiting = { url: string; resolve: (texture: unknown) => void };
  class FakeKTX2Loader {
    readonly waiting: Waiting[] = [];
    disposed = false;
    constructor() { instances.push(this); }
    setTranscoderPath() { return this; }
    setWorkerLimit() { return this; }
    detectSupport() { return this; }
    loadAsync(url: string) { return new Promise((resolve) => { this.waiting.push({ url, resolve }); }); }
    dispose() { this.disposed = true; }
  }
  const instances: FakeKTX2Loader[] = [];
  return { FakeKTX2Loader, instances };
});
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({ KTX2Loader: fake.FakeKTX2Loader }));

import { useGlobeSharpMaps, CAPTURE_RETRY_MS, ZOOM_RUN_GAP_MS } from '../useGlobeSharpMaps';
import { SHARP_MAP_URLS } from '../../../../globe-engine/sharpEarthMaps';
import { GlobeMaterialManager, SKIN_TEXTURES } from '../../../../globe-engine/GlobeMaterialManager';
import { holdForCapture } from '../../../../globe-engine/captureClock';
import { setResolvedGlobeSkin, type GlobeSkin } from '../../../../services/globe/globeAppearance';
import { resetGlobeQualityForTests, setGlobeQualitySetting } from '../../../../services/globe/globeQuality';

const texture = (name: string) => Object.assign(new THREE.Texture(), { name });
function materialFor(skin: GlobeSkin) {
  setResolvedGlobeSkin(skin);
  const textures = Object.fromEntries(SKIN_TEXTURES[skin].map((name) => [`${name}Texture`, texture(`2k-${name}`)]));
  return GlobeMaterialManager.getMaterialForSkin(skin, textures);
}
const slot = (material: THREE.Material, name: string) => ((material as THREE.ShaderMaterial).uniforms[name].value as THREE.Texture).name;

/** A globe whose camera a person moves through its controls, or code moves without them. */
function fakeGlobe({ maxTextureSize = 16384 } = {}) {
  const listeners = { start: new Set<() => void>(), end: new Set<() => void>() };
  const view = { altitude: 2.5 };
  const controls = {
    addEventListener: (type: 'start' | 'end', listener: () => void) => listeners[type].add(listener),
    removeEventListener: (type: 'start' | 'end', listener: () => void) => listeners[type].delete(listener),
  };
  const renderer = { capabilities: { maxTextureSize, getMaxAnisotropy: () => 8 } };
  return {
    ref: { current: { controls: () => controls, renderer: () => renderer, pointOfView: () => ({ ...view }) } },
    view,
    /** A press, scroll step or touch at the altitude the camera is at, let go at `to`. */
    personMoves(to: number) {
      act(() => {
        listeners.start.forEach((listener) => listener());
        view.altitude = to;
        listeners.end.forEach((listener) => listener());
      });
    },
    /** Moved in code, as the turn to the first reports moves it: no press. */
    codeMoves(to: number) { view.altitude = to; },
  };
}

/** Settles every map on its way. */
async function arrive() {
  await act(async () => {
    for (const loader of fake.instances) for (const { url, resolve } of loader.waiting.splice(0)) resolve(texture(url));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const fetched = () => fake.instances.flatMap((loader) => loader.waiting.map((w) => w.url));

beforeEach(() => {
  fake.instances.length = 0;
  resetGlobeQualityForTests();
  setGlobeQualitySetting('high');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('useGlobeSharpMaps', () => {
  it('fetches nothing when code brings the camera close, as the turn to the first reports does, nor when the person then drags there', async () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), true));
    globe.codeMoves(1.8);
    globe.personMoves(1.8);
    await arrive();
    expect(fake.instances).toHaveLength(0);
  });

  it('fetches nothing on a drag at the default view, whose altitude can read 2.4999999999999996', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), true));
    globe.personMoves(2.4999999999999996);
    expect(fake.instances).toHaveLength(0);
  });

  it('puts the 8K maps into the material once a person zooms in closer than the default view', async () => {
    const globe = fakeGlobe();
    const material = materialFor('dayNight');
    renderHook(() => useGlobeSharpMaps(globe.ref, material, true));
    globe.personMoves(2.2);
    expect(fetched()).toEqual([SHARP_MAP_URLS.day, SHARP_MAP_URLS.night]);
    await arrive();
    expect([slot(material, 'dayTexture'), slot(material, 'nightTexture')]).toEqual([SHARP_MAP_URLS.day, SHARP_MAP_URLS.night]);
  });

  it("counts a trackpad's run of small steps from where it began, and a run after a pause from where that one begins", () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const globe = fakeGlobe();
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), true));
    // Each step under a hundredth of the altitude: none counts alone.
    for (const to of [2.495, 2.49, 2.485]) { globe.personMoves(to); now += 16; }
    expect(fake.instances).toHaveLength(0);
    // A pause: the next run counts from 2.485. Counted from 2.5 instead, 2.47 would be enough.
    now += ZOOM_RUN_GAP_MS + 1;
    for (const to of [2.48, 2.475, 2.47]) { globe.personMoves(to); now += 16; }
    expect(fake.instances).toHaveLength(0);
    globe.personMoves(2.46);
    expect(fetched()).toEqual([SHARP_MAP_URLS.day, SHARP_MAP_URLS.night]);
  });

  it('fetches nothing until auto quality has measured the device, nor at a step that drops them', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), true));
    act(() => setGlobeQualitySetting('auto'));
    globe.personMoves(2.0);
    act(() => setGlobeQualitySetting('low'));
    globe.personMoves(1.6);
    expect(fake.instances).toHaveLength(0);
    act(() => setGlobeQualitySetting('high'));
    globe.personMoves(1.4);
    expect(fake.instances).toHaveLength(1);
  });

  it('fetches nothing on a graphics card that cannot hold a texture 8192 wide', () => {
    const globe = fakeGlobe({ maxTextureSize: 4096 });
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), true));
    globe.personMoves(1.5);
    expect(fake.instances).toHaveLength(0);
  });

  it('fetches nothing before the globe is up', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSharpMaps(globe.ref, materialFor('dayNight'), false));
    globe.personMoves(1.5);
    expect(fake.instances).toHaveLength(0);
  });

  it('puts them into a material built later, for another mode, without fetching again; a map not yet fetched comes on the next approach', async () => {
    const globe = fakeGlobe();
    const { rerender } = renderHook(({ material }) => useGlobeSharpMaps(globe.ref, material, true), { initialProps: { material: materialFor('dayNight') } });
    globe.personMoves(2.0);
    await arrive();

    const cyber = materialFor('cyberEarth');
    rerender({ material: cyber });
    expect(slot(cyber, 'nightTexture')).toBe(SHARP_MAP_URLS.night);
    expect(fake.instances).toHaveLength(1);

    const marble = materialFor('blueMarble') as THREE.MeshPhongMaterial;
    rerender({ material: marble });
    expect(marble.map?.name).toBe('2k-blueMarble');
    globe.personMoves(1.8);
    await arrive();
    expect(marble.map?.name).toBe(SHARP_MAP_URLS.blueMarble);
  });

  it('waits while a clip is being captured, and puts them in once it ends', async () => {
    const globe = fakeGlobe();
    const material = materialFor('dayNight');
    renderHook(() => useGlobeSharpMaps(globe.ref, material, true));
    const releaseClip = holdForCapture();
    try {
      globe.personMoves(2.0);
      await arrive();
      expect(slot(material, 'dayTexture')).toBe('2k-earthDay');
    } finally {
      releaseClip();
    }
    await waitFor(() => expect(slot(material, 'dayTexture')).toBe(SHARP_MAP_URLS.day));
  });

  it('puts nothing into the material once the globe is gone, leaves nothing waiting on a capture, and lets the maps go', async () => {
    const globe = fakeGlobe();
    const material = materialFor('dayNight');
    const { unmount } = renderHook(() => useGlobeSharpMaps(globe.ref, material, true));
    globe.personMoves(2.0);
    const [loader] = fake.instances;
    const day = texture('day');
    const dispose = vi.spyOn(day, 'dispose');
    const releaseClip = holdForCapture();
    try {
      const timeouts = vi.spyOn(globalThis, 'setTimeout');
      unmount();
      await act(async () => {
        loader.waiting[0].resolve(day);
        loader.waiting[1].resolve(texture('night'));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(slot(material, 'dayTexture')).toBe('2k-earthDay');
      expect(timeouts.mock.calls.filter(([, ms]) => ms === CAPTURE_RETRY_MS)).toHaveLength(0);
      expect(dispose).toHaveBeenCalled();
      expect(loader.disposed).toBe(true);
    } finally {
      releaseClip();
    }
  });
});
