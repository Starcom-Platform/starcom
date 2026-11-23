/**
 * Whether the globe's surface is drawn as its skin, for whenReady.
 *
 * Until the engine hands over its material, react-globe.gl draws its own dark
 * default, and the engine builds that material only once the skin's textures
 * are in. A card made before then states "Blue Marble" and shows a black planet
 * under the war map's fills. The golden cards found it (2026-10-03): the first
 * shot after a load came out two ways, by when the textures arrived, after
 * whenReady had said ready.
 *
 * A texture that failed or timed out has a stand-in drawn and is settled: the
 * surface will not change by waiting for it.
 *
 * And the material drawn must be the one the engine built for its skin. A layer
 * switch that changes the mode builds a new engine; its skin's textures reported
 * ready before its material was built and handed over, while the globe still drew
 * the old engine's, and a card made then drew the previous mode's skin under a
 * record naming the new one (found on starcom.app, 2026-10-10).
 */
import type * as THREE from 'three';
import type { TextureState } from '../../globe-engine/GlobeEngine';

export interface SurfaceReadiness {
  ready: boolean;
  /** What is still to come, as a reader would name it; empty when ready. */
  loading: string[];
}

export function surfaceReadiness(
  material: THREE.Material | null,
  textures: readonly TextureState[],
  /** The material the engine has built for its skin now, or null while it has built none. */
  built: THREE.Material | null,
): SurfaceReadiness {
  if (!material) return { ready: false, loading: ['the planet\'s material'] };
  if (material !== built) return { ready: false, loading: ['the planet\'s skin'] };
  if (textures.length === 0) return { ready: false, loading: ['the planet\'s textures'] };
  const loading = textures.filter((t) => t.state === 'waiting' || t.state === 'loading').map((t) => t.label);
  return { ready: loading.length === 0, loading };
}
