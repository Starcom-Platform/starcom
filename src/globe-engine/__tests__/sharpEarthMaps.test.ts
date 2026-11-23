/**
 * The Earth's 8K maps (decision K7; sharpEarthMaps.ts): which map each skin takes, into
 * which slot of the skin's real material, what counts as an approach, which graphics
 * cards take them, and how the loader fetches, keeps and lets go of them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const fake = vi.hoisted(() => {
  type Waiting = { url: string; resolve: (texture: unknown) => void; reject: (error: Error) => void };
  /** A KTX2Loader that records how it was set up, and whose loads the test settles. */
  class FakeKTX2Loader {
    readonly manager: { resolveURL(url: string): string };
    transcoderPath: string | undefined;
    workerLimit: number | undefined;
    supportFor: unknown;
    disposed = false;
    readonly waiting: Waiting[] = [];
    constructor(manager: { resolveURL(url: string): string }) {
      this.manager = manager;
      instances.push(this);
    }
    setTranscoderPath(transcoderPath: string) { this.transcoderPath = transcoderPath; return this; }
    setWorkerLimit(limit: number) { this.workerLimit = limit; return this; }
    detectSupport(renderer: unknown) { this.supportFor = renderer; return this; }
    loadAsync(url: string) {
      return new Promise((resolve, reject) => { this.waiting.push({ url, resolve, reject }); });
    }
    dispose() { this.disposed = true; }
  }
  const instances: FakeKTX2Loader[] = [];
  return { FakeKTX2Loader, instances };
});
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({ KTX2Loader: fake.FakeKTX2Loader }));

import {
  SHARP_MAPS_ALTITUDE, SHARP_MAPS_TIMEOUT_MS, SHARP_MAPS_WORKERS, SHARP_MAP_URLS, SKIN_SHARP_MAPS, TRANSCODER_FILES,
  SharpMapLoader, applySharpMaps, canDrawSharpMaps, isApproach,
} from '../sharpEarthMaps';
import { GlobeMaterialManager, SKIN_TEXTURES } from '../GlobeMaterialManager';
import type { GlobeSkin } from '../../services/globe/globeAppearance';

const renderer = { capabilities: { getMaxAnisotropy: () => 16, maxTextureSize: 16384 } } as unknown as THREE.WebGLRenderer;
const texture = (name: string) => Object.assign(new THREE.Texture(), { name });
/** Settles every load waiting on the newest loader, in order, each with a texture named for its file. */
const arrive = async () => {
  const loader = fake.instances[fake.instances.length - 1];
  for (const { url, resolve } of loader.waiting.splice(0)) resolve(texture(url));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** A skin's material as the globe builds it, from placeholder 2K textures. */
function materialFor(skin: GlobeSkin) {
  const textures = Object.fromEntries(SKIN_TEXTURES[skin].map((name) => [`${name}Texture`, texture(`2k-${name}`)]));
  return GlobeMaterialManager.getMaterialForSkin(skin, textures);
}

beforeEach(() => { fake.instances.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('which 8K maps each skin takes (K7)', () => {
  it("gives the day-and-night skin both maps, terrain the day map, and GeoPolitical NASA's Blue Marble", () => {
    expect(SKIN_SHARP_MAPS.dayNight).toEqual(['day', 'night']);
    expect(SKIN_SHARP_MAPS.terrain).toEqual(['day']);
    expect(SKIN_SHARP_MAPS.blueMarble).toEqual(['blueMarble']);
  });

  it('gives CyberCommand only the city lights: its stylised dark base has no 8K source', () => {
    expect(SKIN_SHARP_MAPS.cyberEarth).toEqual(['night']);
  });

  it("serves every map from the app's own origin, and every file is there", () => {
    const publicDir = path.resolve(__dirname, '../../../public');
    for (const url of Object.values(SHARP_MAP_URLS)) {
      expect(url.startsWith('/assets/textures/earth/8k/')).toBe(true);
      expect(fs.statSync(path.join(publicDir, url)).size).toBeGreaterThan(500_000);
    }
  });

  it("gives KTX2Loader the app's patched transcoder, which compiles no code from strings, and three.js's own WebAssembly", () => {
    expect(TRANSCODER_FILES['basis_transcoder.js']).toMatch(/\/src\/assets\/basis\/basis_transcoder\.js$/);
    expect(TRANSCODER_FILES['basis_transcoder.wasm']).toMatch(/\/three\/examples\/jsm\/libs\/basis\/basis_transcoder\.wasm$/);
  });
});

describe('applySharpMaps, into the materials the globe builds', () => {
  const sampled = (material: THREE.Material, slot: string) => (material as THREE.ShaderMaterial).fragmentShader.includes(`texture2D(${slot}`);

  it('puts the 8K day and night maps into the day-and-night skin, where its shader samples them, and leaves its relief', () => {
    const material = materialFor('dayNight') as THREE.ShaderMaterial;
    const bump = material.uniforms.bumpMap.value;
    applySharpMaps(material, 'dayNight', { day: texture('8k-day'), night: texture('8k-night') });
    expect((material.uniforms.dayTexture.value as THREE.Texture).name).toBe('8k-day');
    expect((material.uniforms.nightTexture.value as THREE.Texture).name).toBe('8k-night');
    expect(sampled(material, 'dayTexture') && sampled(material, 'nightTexture')).toBe(true);
    expect(material.uniforms.bumpMap.value).toBe(bump);
  });

  it("puts only the city lights into CyberCommand's skin, leaving its dark base", () => {
    const material = materialFor('cyberEarth') as THREE.ShaderMaterial;
    const before = Object.fromEntries(Object.entries(material.uniforms).map(([slot, u]) => [slot, u.value]));
    applySharpMaps(material, 'cyberEarth', { day: texture('8k-day'), night: texture('8k-night') });
    expect((material.uniforms.nightTexture.value as THREE.Texture).name).toBe('8k-night');
    expect(sampled(material, 'nightTexture')).toBe(true);
    const changed = Object.keys(before).filter((slot) => material.uniforms[slot].value !== before[slot]);
    expect(changed).toEqual(['nightTexture']);
  });

  it('puts the day map into the terrain skin', () => {
    const material = materialFor('terrain') as THREE.ShaderMaterial;
    applySharpMaps(material, 'terrain', { day: texture('8k-day') });
    expect((material.uniforms.dayTexture.value as THREE.Texture).name).toBe('8k-day');
    expect(sampled(material, 'dayTexture')).toBe(true);
  });

  it("puts NASA's Blue Marble into GeoPolitical's lit material, and has it rebuilt", () => {
    const material = materialFor('blueMarble') as THREE.MeshPhongMaterial;
    const before = material.version;
    applySharpMaps(material, 'blueMarble', { blueMarble: texture('8k-blueMarble') });
    expect(material.map?.name).toBe('8k-blueMarble');
    expect(material.version).toBeGreaterThan(before);
  });
});

describe('isApproach: what a person zoom must do to fetch the 8K maps', () => {
  it('ends closer than the default view, and closer than it began', () => {
    expect(isApproach(2.5, 2.3)).toBe(true);
    expect(isApproach(3, 2.4)).toBe(true);
    expect(isApproach(1.8, 1.6)).toBe(true);
  });

  it('is not a drag at the default view, whose altitude rounding can read 2.4999999999999996', () => {
    expect(2.4999999999999996).toBeLessThan(SHARP_MAPS_ALTITUDE);
    expect(isApproach(2.5, 2.4999999999999996)).toBe(false);
    expect(isApproach(2.4999999999999996, 2.4999999999999996)).toBe(false);
  });

  it('is not a drag at a close view that code flew to, nor a zoom out, nor a zoom that stays out', () => {
    expect(isApproach(1.8, 1.8)).toBe(false);
    expect(isApproach(1.8, 2.1)).toBe(false);
    expect(isApproach(4, 2.6)).toBe(false);
  });

  it('needs more than a hundredth of the altitude it began at', () => {
    expect(isApproach(2, 1.99)).toBe(false);
    expect(isApproach(2, 1.979)).toBe(true);
  });
});

describe('canDrawSharpMaps', () => {
  it('takes a graphics card that holds a texture 8192 wide, and refuses one that does not, which would draw a black Earth', () => {
    const card = (maxTextureSize?: number) => ({ capabilities: { maxTextureSize } }) as unknown as THREE.WebGLRenderer;
    expect(canDrawSharpMaps(card(16384))).toBe(true);
    expect(canDrawSharpMaps(card(8192))).toBe(true);
    expect(canDrawSharpMaps(card(4096))).toBe(false);
    expect(canDrawSharpMaps(card(undefined))).toBe(false);
  });
});

describe('SharpMapLoader', () => {
  it("sets up KTX2Loader for the globe's renderer, its transcoder found under the build's names, two workers at most", async () => {
    const loader = new SharpMapLoader(renderer);
    void loader.load('day');
    const [ktx2] = fake.instances;
    expect(ktx2.transcoderPath).toBe('');
    expect(ktx2.workerLimit).toBe(SHARP_MAPS_WORKERS);
    expect(ktx2.supportFor).toBe(renderer);
    expect(ktx2.manager.resolveURL('basis_transcoder.js')).toBe(TRANSCODER_FILES['basis_transcoder.js']);
    expect(ktx2.manager.resolveURL('basis_transcoder.wasm')).toBe(TRANSCODER_FILES['basis_transcoder.wasm']);
    expect(ktx2.manager.resolveURL(SHARP_MAP_URLS.day)).toBe(SHARP_MAP_URLS.day);
    expect(ktx2.waiting.map((w) => w.url)).toEqual([SHARP_MAP_URLS.day]);
    await arrive();
  });

  it('fetches each map once, however often it is asked, sampled as the 2K maps are', async () => {
    const loader = new SharpMapLoader(renderer);
    const asked = [loader.load('day'), loader.load('day'), loader.load('night')];
    expect(fake.instances[0].waiting.map((w) => w.url)).toEqual([SHARP_MAP_URLS.day, SHARP_MAP_URLS.night]);
    await arrive();
    const [day, again, night] = await Promise.all(asked);
    expect(day).toBe(again);
    expect(await loader.load('night')).toBe(night);
    expect(fake.instances).toHaveLength(1);
    // Round in longitude, so the date line has no seam; sRGB colour; as GlobeTextureLoader sets the 2K maps.
    expect([day.wrapS, day.wrapT, day.colorSpace, day.anisotropy]).toEqual([
      THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.SRGBColorSpace, 8,
    ]);
  });

  it('ends its loader, and the workers with it, once the maps asked for together have come; a later map starts a new one', async () => {
    const loader = new SharpMapLoader(renderer);
    const both = Promise.all([loader.load('day'), loader.load('night')]);
    const [first] = fake.instances;
    first.waiting[1].resolve(texture('night'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.disposed).toBe(false);
    first.waiting[0].resolve(texture('day'));
    await both;
    expect(first.disposed).toBe(true);

    const later = loader.load('blueMarble');
    expect(fake.instances).toHaveLength(2);
    await arrive();
    expect((await later).name).toBe(SHARP_MAP_URLS.blueMarble);
    expect(fake.instances[1].disposed).toBe(true);
  });

  it('tries again with a fresh loader after a failure, as KTX2Loader keeps a transcoder that failed to start', async () => {
    const loader = new SharpMapLoader(renderer);
    const failed = loader.load('day');
    fake.instances[0].waiting[0].reject(new Error('transcoder did not start'));
    await expect(failed).rejects.toThrow('transcoder did not start');
    expect(fake.instances[0].disposed).toBe(true);

    const retried = loader.load('day');
    expect(fake.instances).toHaveLength(2);
    await arrive();
    expect((await retried).name).toBe(SHARP_MAP_URLS.day);
  });

  it('gives up on maps that have not come in time, ends the workers, and lets a late one go', async () => {
    vi.useFakeTimers();
    const loader = new SharpMapLoader(renderer);
    const stuck = loader.load('night');
    const outcome = stuck.then(() => 'arrived', (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(SHARP_MAPS_TIMEOUT_MS);
    expect(await outcome).toMatch(/not arrived in 120 s/);
    expect(fake.instances[0].disposed).toBe(true);

    const late = texture('late');
    const dispose = vi.spyOn(late, 'dispose');
    fake.instances[0].waiting[0].resolve(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(dispose).toHaveBeenCalled();

    void loader.load('night');
    expect(fake.instances).toHaveLength(2);
  });

  it('disposed while a map is on its way, ends the loader only once it settles, and lets that map go', async () => {
    const loader = new SharpMapLoader(renderer);
    const kept = loader.load('day');
    await arrive();
    const day = await kept;
    const onTheWay = loader.load('night').catch((error: Error) => error.message);
    const dayDispose = vi.spyOn(day, 'dispose');

    loader.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Ended now, KTX2Loader would start the worker it is waiting for after its own dispose, and nothing would end it.
    expect(fake.instances[1].disposed).toBe(false);
    expect(dayDispose).toHaveBeenCalled();

    const night = texture('night');
    const nightDispose = vi.spyOn(night, 'dispose');
    fake.instances[1].waiting[0].resolve(night);
    expect(await onTheWay).toBe('the globe is gone');
    expect(nightDispose).toHaveBeenCalled();
    expect(fake.instances[1].disposed).toBe(true);
    await expect(loader.load('day')).rejects.toThrow('the globe is gone');
  });
});
