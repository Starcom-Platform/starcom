// GlobeTextureLoader.ts
// AI-NOTE: See globe-textures.artifact for asset manifest and usage mapping.

/**
 * GlobeTextureLoader: Centralized texture preloading and caching for the Globe Engine.
 * - See globe-textures.artifact for asset manifest and usage mapping.
 */

import * as THREE from 'three';

// AI-NOTE: See globe-textures.artifact for asset manifest and usage mapping.
//
// Bundled locally (public/assets/textures/earth/) rather than fetched from unpkg at
// runtime: this app's sandbox/dev environment has shown live third-party CDN fetches
// can silently fail (no network route to unpkg.com), and a missing globe texture is a
// much worse failure than a slightly larger local bundle.
//
// Who made each map, under which licence, and what Starcom changed: globe-engine/imagery.ts
// (decisions TX8–TX12), which a card's credits and the credits page both read. Traced on
// 2026-10-07: the dark base is Google's WebGL Globe texture, the relief NASA Earth
// Observatory's topography map, the clouds Natural Earth III's from NASA's; the water
// mask, whose source nobody could find, was replaced with NASA's (TX9).
//
// `isDataMap: true` marks textures that encode non-color data (elevation, land/ocean
// mask) rather than an sRGB color image — these must NOT get sRGB color-space decoding
// or they'll wash out.
//
// ─── WEBP FIRST, TODAY'S FILES TO FALL BACK ON ─────────────────────────────
//
// Each texture is fetched as WebP, and as the original only where WebP does not load,
// which a browser that cannot decode it (Safari before macOS 11 or iOS 14) reaches
// through the load's error. Chosen by the owner on 2026-10-07 from a side-by-side of the
// same views drawn with each: WebP at quality 85, the clouds' transparency kept exact,
// the two data maps lossless so not one value changes. A first visit's textures went
// from 3.48 MB to 1.68 MB, and the most any view moved was 0.41% RMSE, no pixel by more
// than 8%. Made with: cwebp -q 85 -m 6 -sharp_yuv (photographs), cwebp -q 80 -alpha_q 100
// -m 6 (clouds), cwebp -lossless -z 9 (topology, water).
//
// ─── THE DAY AND NIGHT MAPS: SOLAR SYSTEM SCOPE (decision K7) ──────────────
//
// The day and night maps are Solar System Scope's (solarsystemscope.com/textures, CC BY
// 4.0), cut from its 8192×4096 maps: the day map to 2048×1024, the night map to
// 4096×2048. They replaced three-globe's example images, whose source was never
// recorded, so that the 8K maps fetched on approach (sharpEarthMaps.ts) are the same
// maps, only sharper, and every map drawn has a known source and licence. Chosen by the
// owner on 2026-10-07: the old day map was a vivid relief-shaded style and the old night
// map bluish, and switching to Solar System Scope's only close in would have changed the
// globe's look at the default distance.
const textureManifest: Record<string, { url: string; webp: string; usage: string[]; isDataMap?: boolean }> = {
  earthDay: {
    url: '/assets/textures/earth/earth-day.jpg',
    webp: '/assets/textures/earth/earth-day.webp',
    usage: ['EcoNatural', 'dayNight', 'default'],
  },
  earthNight: {
    url: '/assets/textures/earth/earth-night.jpg',
    webp: '/assets/textures/earth/earth-night.webp',
    usage: ['EcoNatural', 'dayNight'],
  },
  blueMarble: {
    url: '/assets/textures/earth/earth-blue-marble.jpg',
    webp: '/assets/textures/earth/earth-blue-marble.webp',
    usage: ['GeoPolitical', 'blueMarble'],
  },
  earthDark: {
    url: '/assets/textures/earth/earth-dark.jpg',
    webp: '/assets/textures/earth/earth-dark.webp',
    usage: ['CyberCommand', 'hologram'],
  },
  earthTopology: {
    url: '/assets/textures/earth/earth-topology.png',
    webp: '/assets/textures/earth/earth-topology.webp',
    usage: ['hologram', 'bumpMap'],
    isDataMap: true,
  },
  earthWater: {
    url: '/assets/textures/earth/earth-water.png',
    webp: '/assets/textures/earth/earth-water.webp',
    usage: ['hologram', 'specularMap'],
    isDataMap: true,
  },
  clouds: {
    url: '/assets/textures/earth/clouds.png',
    webp: '/assets/textures/earth/clouds.webp',
    usage: ['cloudLayer'],
  },
};

const textureCache: Record<string, THREE.Texture> = {};

export class GlobeTextureLoader {
  /**
   * Where a texture is, WebP first, so another reader fetches the very files the globe does, from the
   * same cache: the mini-globe's 2D canvas (decision D-MG, MG1).
   */
  static urlsOf(name: string): { webp: string; url: string } | null {
    const entry = textureManifest[name];
    return entry ? { webp: entry.webp, url: entry.url } : null;
  }

  /**
   * Load texture by name (see globe-textures.artifact)
   */
  static async loadTexture(name: string): Promise<THREE.Texture> {
    if (textureCache[name]) {
      // Ensure cached textures also have normalized parameters
      const cached = textureCache[name];
      GlobeTextureLoader.normalizeTexture(cached, textureManifest[name]?.isDataMap);
      return cached;
    }
    const entry = textureManifest[name];
    if (!entry) throw new Error(`Unknown texture: ${name}`);
    // WebP first; the original where it does not load (see the manifest's note).
    const texture = await GlobeTextureLoader.fetchTexture(entry.webp).catch(() => GlobeTextureLoader.fetchTexture(entry.url));
    // Normalize texture orientation consistently
    GlobeTextureLoader.normalizeTexture(texture, entry.isDataMap);
    textureCache[name] = texture;
    return texture;
  }

  private static fetchTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
  }

  /** Normalize texture sampling, orientation, and color handling.
   * - Repeat in U to allow seam wrapping
   * - Clamp in V to avoid polar artifacts
   * - Shift by -90° along U (offset.x = 0.75) to align with globe overlays
   * - sRGB color space for real color imagery (not for data maps like bump/specular,
   *   which encode raw elevation/mask values that would wash out under sRGB decoding)
   * - Anisotropic filtering so the texture stays sharp at grazing viewing angles near
   *   the globe's silhouette, instead of blurring — 8x is safely within what three.js
   *   will clamp to at render time on any GPU that supports anisotropic filtering at all
   */
  private static normalizeTexture(texture: THREE.Texture, isDataMap?: boolean) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // Keep native longitudinal alignment so overlays using lat/lon remain accurate
    texture.offset.x = 0;
    texture.anisotropy = 8;
    if (!isDataMap) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
  }

  /**
   * Get cached texture if available
   */
  static getCachedTexture(name: string): THREE.Texture | undefined {
    return textureCache[name];
  }
}
