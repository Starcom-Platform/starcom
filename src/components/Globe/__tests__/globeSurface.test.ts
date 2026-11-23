/**
 * Whether the globe's surface is drawn as its skin, for whenReady.
 *
 * Until the engine hands over its material, react-globe.gl draws its own dark
 * default: a card made then states "Blue Marble" and shows a black planet under
 * the war map's fills. Found by the golden cards (2026-10-03): the first shot
 * after load came out two ways, by when the textures arrived.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { TextureState } from '../../../globe-engine/GlobeEngine';
import { surfaceReadiness } from '../globeSurface';

const state = (name: string, label: string, s: TextureState['state']): TextureState => ({ name, label, state: s });
const MATERIAL = {} as never;

describe('surfaceReadiness', () => {
  it('is not ready before the engine has handed over a material, whatever the textures say', () => {
    expect(surfaceReadiness(null, [state('blueMarble', 'Blue Marble photograph', 'ready')], MATERIAL))
      .toEqual({ ready: false, loading: ['the planet\'s material'] });
  });

  it('is not ready while a texture of the skin is waiting or loading, and names them', () => {
    expect(surfaceReadiness(MATERIAL, [
      state('blueMarble', 'Blue Marble photograph', 'loading'),
      state('earthTopology', 'Relief', 'waiting'),
      state('earthWater', 'Oceans', 'ready'),
    ], MATERIAL)).toEqual({ ready: false, loading: ['Blue Marble photograph', 'Relief'] });
  });

  it('is ready once every texture is in, or has failed or timed out (a stand-in is drawn, and settled)', () => {
    expect(surfaceReadiness(MATERIAL, [
      state('blueMarble', 'Blue Marble photograph', 'ready'),
      state('earthTopology', 'Relief', 'failed'),
      state('earthWater', 'Oceans', 'timeout'),
    ], MATERIAL)).toEqual({ ready: true, loading: [] });
  });

  it('is not ready while the engine has said nothing of the skin\'s textures', () => {
    expect(surfaceReadiness(MATERIAL, [], MATERIAL)).toEqual({ ready: false, loading: ['the planet\'s textures'] });
  });

  /*
   * Found on starcom.app (2026-10-10): a card made seconds after a layer switch that
   * changes the mode drew the previous mode's shader skin under a record saying "Blue
   * Marble". The mode switch builds a new engine; its skin's textures reported ready
   * before its material was built and handed over, while the globe still drew the
   * old engine's material.
   */
  it('is not ready while the globe draws another material than the one the engine built for its skin', () => {
    const OLD = { name: 'old' } as never;
    const ready = [state('blueMarble', 'Blue Marble photograph', 'ready')];
    expect(surfaceReadiness(OLD, ready, null)).toEqual({ ready: false, loading: ['the planet\'s skin'] });
    expect(surfaceReadiness(OLD, ready, MATERIAL)).toEqual({ ready: false, loading: ['the planet\'s skin'] });
    expect(surfaceReadiness(MATERIAL, ready, MATERIAL)).toEqual({ ready: true, loading: [] });
  });
});
