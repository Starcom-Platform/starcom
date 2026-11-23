/**
 * The Earth's maps at 8K, compressed for the graphics card (decision K7; record
 * docs/missions/01-architecture-decisions/earth-textures.md).
 *
 * The camera can come down to about 70 km, where a 2048-pixel day map puts 20 km in a
 * pixel. The 8K maps put about 5 km there. They are KTX2 files of Basis Universal's
 * ETC1S, transcoded in the browser to whatever the graphics card reads compressed: an 8K
 * map takes about 22 MB of graphics memory on a phone and about 45 MB on a desktop,
 * mipmaps included, instead of the 180 MB it would take as a plain image, and 1 to 4.3 MB
 * to fetch.
 *
 * Fetched only on approach (TX3), when a person's own zoom brings the camera closer than
 * the default view (useGlobeSharpMaps), at a quality step that keeps them, on a graphics
 * card that holds a texture 8192 wide. A move made in code never fetches them, so a first
 * visit fetches nothing more, and the golden cards, made at Low, never use them.
 *
 * The day and night maps are Solar System Scope's (8192×4096, CC BY 4.0); GeoPolitical's
 * Blue Marble is NASA's topography-and-bathymetry mosaic for December 2004, public
 * domain, cut to 8K. CyberCommand's stylised dark base has no 8K source, so that skin
 * takes only the 8K city lights.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
// The transcoder KTX2Loader runs in a worker: three.js's own, patched to compile no code
// from strings, which the content security policy forbids (scripts/lib/basisTranscoderPatch.mjs),
// and its WebAssembly as three.js ships it. Both are served under content-hashed names.
import transcoderUrl from '../assets/basis/basis_transcoder.js?url';
import transcoderWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
import type { GlobeSkin } from '../services/globe/globeAppearance';

/** A person's zoom must end below this altitude to fetch the 8K maps: closer than the default view. */
export const SHARP_MAPS_ALTITUDE = 2.5;
/**
 * How much closer a zoom must bring the camera to count, as a fraction of the altitude it
 * began at: far more than rounding (the default view can read 2.4999999999999996), far
 * less than one turn of a mouse wheel.
 */
export const APPROACH_FRACTION = 0.01;
/** The 8K maps' width. A graphics card that cannot hold a texture this wide keeps the maps it has. */
export const SHARP_MAP_WIDTH = 8192;
/** Maps not arrived in this long are given up, their workers ended, and tried again on the next approach. */
export const SHARP_MAPS_TIMEOUT_MS = 120_000;
/** Transcoding workers at once: one for each map a skin draws. */
export const SHARP_MAPS_WORKERS = 2;

export type SharpMap = 'day' | 'night' | 'blueMarble';

export const SHARP_MAP_URLS: Record<SharpMap, string> = {
  day: '/assets/textures/earth/8k/earth-day-8k.ktx2',
  night: '/assets/textures/earth/8k/earth-night-8k.ktx2',
  blueMarble: '/assets/textures/earth/8k/earth-blue-marble-8k.ktx2',
};

/** Which 8K maps each skin draws. */
export const SKIN_SHARP_MAPS: Record<GlobeSkin, readonly SharpMap[]> = {
  dayNight: ['day', 'night'],
  terrain: ['day'],
  blueMarble: ['blueMarble'],
  cyberEarth: ['night'],
};

/** KTX2Loader asks for its transcoder by these names; they are served under the names the build gave them. */
export const TRANSCODER_FILES: Readonly<Record<string, string>> = {
  'basis_transcoder.js': transcoderUrl,
  'basis_transcoder.wasm': transcoderWasmUrl,
};

export type SharpTextures = Partial<Record<SharpMap, THREE.Texture>>;

/** Whether a person's zoom, from altitude `from` to altitude `to`, is an approach: it fetches the 8K maps. */
export function isApproach(from: number, to: number): boolean {
  return to < SHARP_MAPS_ALTITUDE && to < from * (1 - APPROACH_FRACTION);
}

/** Whether this graphics card can hold the 8K maps. One that cannot would draw an incomplete texture: a black Earth. */
export function canDrawSharpMaps(renderer: Pick<THREE.WebGLRenderer, 'capabilities'>): boolean {
  return (renderer.capabilities?.maxTextureSize ?? 0) >= SHARP_MAP_WIDTH;
}

type Uniforms = Record<string, { value: unknown } | undefined>;

/** Puts the 8K maps into a skin's material, each into the slot that map fills. */
export function applySharpMaps(material: THREE.Material, skin: GlobeSkin, maps: SharpTextures): void {
  if (skin === 'blueMarble') {
    const phong = material as THREE.MeshPhongMaterial;
    if (maps.blueMarble && phong.map !== maps.blueMarble) {
      phong.map = maps.blueMarble;
      phong.needsUpdate = true;
    }
    return;
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms as Uniforms | undefined;
  if (!uniforms) return;
  if (maps.day && (skin === 'dayNight' || skin === 'terrain') && uniforms.dayTexture) uniforms.dayTexture.value = maps.day;
  if (maps.night && (skin === 'dayNight' || skin === 'cyberEarth') && uniforms.nightTexture) uniforms.nightTexture.value = maps.night;
}

/**
 * Sampled as the 2K maps are (GlobeTextureLoader.normalizeTexture): wrapping round in
 * longitude, so the date line has no seam, and read as sRGB colour, as the files say.
 */
function sampledAsTheMapsBefore(texture: THREE.Texture, anisotropy: number): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/** The texture `pending` brings, or a failure once `ms` have passed; one that comes later is let go. */
function arrivingWithin(pending: Promise<THREE.Texture>, ms: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => {
      late = true;
      reject(new Error(`not arrived in ${Math.round(ms / 1000)} s`));
    }, ms);
    pending.then(
      (texture) => {
        clearTimeout(timer);
        if (late) texture.dispose();
        else resolve(texture);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Fetches the 8K maps for the globe's renderer, each map once, and keeps them until it is
 * disposed.
 *
 * The KTX2 loader, and the workers that transcode, live only while maps are on their
 * way. Each worker's WebAssembly memory grows to hold an 8K map, so they are ended once
 * the maps asked for together have come, or failed; a map asked for later, for another
 * mode, starts a loader of its own. A loader keeps a transcoder that failed to start for
 * good, so a failure ends it too, and the next approach starts afresh. It is ended only
 * once nothing is on its way: ended while its transcoder is starting, KTX2Loader would
 * go on to start a worker that nothing ends.
 */
export class SharpMapLoader {
  private readonly maps = new Map<SharpMap, Promise<THREE.Texture>>();
  private batch: { loader: KTX2Loader; waiting: number } | null = null;
  private disposed = false;
  private readonly anisotropy: number;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
  }

  load(map: SharpMap): Promise<THREE.Texture> {
    if (this.disposed) return Promise.reject(new Error('the globe is gone'));
    const kept = this.maps.get(map);
    if (kept) return kept;
    const fetched = this.fetch(map);
    this.maps.set(map, fetched);
    // A failed fetch is not kept, so the next approach tries again.
    fetched.catch(() => {
      if (this.maps.get(map) === fetched) this.maps.delete(map);
    });
    return fetched;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.maps.values()) pending.then((texture) => texture.dispose(), () => undefined);
    this.maps.clear();
    // A batch still on its way ends its loader once it settles (fetch's finally), and lets its maps go.
  }

  private fetch(map: SharpMap): Promise<THREE.Texture> {
    const batch = this.batch ?? (this.batch = { loader: this.createLoader(), waiting: 0 });
    batch.waiting += 1;
    return arrivingWithin(batch.loader.loadAsync(SHARP_MAP_URLS[map]), SHARP_MAPS_TIMEOUT_MS)
      .then((texture) => {
        if (this.disposed) {
          texture.dispose();
          throw new Error('the globe is gone');
        }
        return sampledAsTheMapsBefore(texture, this.anisotropy);
      })
      .finally(() => {
        batch.waiting -= 1;
        if (batch.waiting > 0) return;
        batch.loader.dispose();
        if (this.batch === batch) this.batch = null;
      });
  }

  private createLoader(): KTX2Loader {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => TRANSCODER_FILES[url] ?? url);
    return new KTX2Loader(manager)
      .setTranscoderPath('')
      .setWorkerLimit(SHARP_MAPS_WORKERS)
      .detectSupport(this.renderer);
  }
}
