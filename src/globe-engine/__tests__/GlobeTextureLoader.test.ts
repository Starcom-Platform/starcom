import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GlobeTextureLoader } from '../GlobeTextureLoader';

// The project-wide THREE.TextureLoader mock (src/setupVitest.ts) calls onLoad
// synchronously with a dummy { image: { src: url } } object, so texture loading is
// observable immediately without awaiting anything real.

describe('GlobeTextureLoader', () => {
  test('loads a texture from its local bundled path (not a live CDN URL)', async () => {
    const texture = await GlobeTextureLoader.loadTexture('earthDay');
    expect((texture as unknown as { image: { src: string } }).image.src).toBe('/assets/textures/earth/earth-day.webp');
  });

  test('throws for an unknown texture name', async () => {
    await expect(GlobeTextureLoader.loadTexture('nonexistentTexture')).rejects.toThrow('Unknown texture');
  });

  test('caches textures — a second load returns the same object', async () => {
    const first = await GlobeTextureLoader.loadTexture('earthNight');
    const second = await GlobeTextureLoader.loadTexture('earthNight');
    expect(first).toBe(second);
  });

  test('applies wrap/offset/anisotropy normalization', async () => {
    const texture = await GlobeTextureLoader.loadTexture('earthDark');
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.offset.x).toBe(0);
    expect(texture.anisotropy).toBe(8);
  });

  test('applies sRGB color space to real color imagery', async () => {
    const texture = await GlobeTextureLoader.loadTexture('blueMarble');
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  test('does NOT apply sRGB color space to data maps (bump/specular)', async () => {
    // Data maps encode raw elevation/mask values, not color — sRGB decoding would
    // wash them out and break the bump/specular math that reads them.
    const bumpTexture = await GlobeTextureLoader.loadTexture('earthTopology');
    expect(bumpTexture.colorSpace).not.toBe(THREE.SRGBColorSpace);

    const specularTexture = await GlobeTextureLoader.loadTexture('earthWater');
    expect(specularTexture.colorSpace).not.toBe(THREE.SRGBColorSpace);
  });

  test('getCachedTexture returns undefined before loading, then the texture after', async () => {
    expect(GlobeTextureLoader.getCachedTexture('clouds')).toBeUndefined();
    const texture = await GlobeTextureLoader.loadTexture('clouds');
    expect(GlobeTextureLoader.getCachedTexture('clouds')).toBe(texture);
  });
});

/*
 * WebP first, today's files as the fallback (owner's choice, 2026-10-07, from the side-by-side review):
 * the Earth textures in WebP cut a first visit's textures from 3.48 MB to 1.68 MB, and a browser that
 * cannot decode WebP (Safari before macOS 11 or iOS 14) draws today's files instead.
 */
describe('GlobeTextureLoader: WebP, with today\'s files to fall back on', () => {
  const NAMES = ['earthDay', 'earthNight', 'blueMarble', 'earthDark', 'earthTopology', 'earthWater', 'clouds'];
  const srcOf = (texture: unknown) => (texture as { image: { src: string } }).image.src;
  const onDisk = (src: string) => fs.existsSync(path.join(process.cwd(), 'public', src));
  afterEach(() => vi.restoreAllMocks());

  test('loads each texture\'s WebP copy, and each copy is in public/', async () => {
    vi.resetModules();
    const { GlobeTextureLoader: loader } = await import('../GlobeTextureLoader');
    for (const name of NAMES) {
      const src = srcOf(await loader.loadTexture(name));
      expect(src).toMatch(/^\/assets\/textures\/earth\/[a-z-]+\.webp$/);
      expect(onDisk(src)).toBe(true);
    }
  });

  test('draws today\'s file where WebP does not decode, and each of those is in public/ too', async () => {
    vi.resetModules();
    const three = await import('three');
    vi.spyOn(three.TextureLoader.prototype, 'load').mockImplementation(function load(
      url: string, onLoad?: (texture: THREE.Texture) => void, _onProgress?: unknown, onError?: (error: unknown) => void,
    ) {
      const texture = { image: { src: url }, offset: { x: 0, y: 0 } } as unknown as THREE.Texture;
      if (url.endsWith('.webp')) onError?.(new Error(`could not decode ${url}`));
      else onLoad?.(texture);
      return texture;
    } as never);
    const { GlobeTextureLoader: loader } = await import('../GlobeTextureLoader');
    for (const name of NAMES) {
      const src = srcOf(await loader.loadTexture(name));
      expect(src).toMatch(/^\/assets\/textures\/earth\/[a-z-]+\.(jpg|png)$/);
      expect(onDisk(src)).toBe(true);
    }
  });

  test('says why when neither copy loads', async () => {
    vi.resetModules();
    const three = await import('three');
    vi.spyOn(three.TextureLoader.prototype, 'load').mockImplementation(function load(
      url: string, _onLoad?: unknown, _onProgress?: unknown, onError?: (error: unknown) => void,
    ) {
      onError?.(new Error(`no answer for ${url}`));
      return {} as THREE.Texture;
    } as never);
    const { GlobeTextureLoader: loader } = await import('../GlobeTextureLoader');
    await expect(loader.loadTexture('earthNight')).rejects.toThrow('no answer for /assets/textures/earth/earth-night.jpg');
  });
});
