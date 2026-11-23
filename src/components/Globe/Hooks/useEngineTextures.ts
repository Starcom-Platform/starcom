import { useEffect, useState } from 'react';
import type { GlobeEngine, TextureState } from '../../../globe-engine/GlobeEngine';

export type TextureReporter = Pick<GlobeEngine, 'on' | 'off' | 'getTextureStates'>;

/**
 * How each texture of the globe's surface stands, kept current (plan item
 * 8.3c). A skin change draws other textures, so a rebuilt material re-reads.
 */
export function useEngineTextures(engine: TextureReporter | null): TextureState[] {
  const [states, setStates] = useState<TextureState[]>(() => engine?.getTextureStates() ?? []);
  useEffect(() => {
    if (!engine) { setStates([]); return; }
    const read = () => setStates(engine.getTextureStates());
    read();
    engine.on('texturesChanged', read);
    engine.on('materialChanged', read);
    return () => {
      engine.off('texturesChanged', read);
      engine.off('materialChanged', read);
    };
  }, [engine]);
  return states;
}
