import { useEffect } from 'react';
import type * as THREE from 'three';
import type { GlobeEngine } from '../../../globe-engine/GlobeEngine';

/**
 * Hand on each material the engine rebuilds.
 *
 * A skin change rebuilds the material once the skin's textures arrive, which
 * 33aaa278 made asynchronous. Globe.tsx read the material at once and got the
 * old one: a planet chosen in Globe Appearance was not drawn until a reload.
 */
export function useEngineMaterial(
  engine: Pick<GlobeEngine, 'on' | 'off' | 'getMaterial'> | null,
  setMaterial: (material: THREE.Material) => void,
): void {
  useEffect(() => {
    if (!engine) return;
    const follow = () => {
      const next = engine.getMaterial();
      if (next) setMaterial(next);
    };
    engine.on('materialChanged', follow);
    return () => engine.off('materialChanged', follow);
  }, [engine, setMaterial]);
}
