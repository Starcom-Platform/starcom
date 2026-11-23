/**
 * The engine says how each texture of the globe's surface stands (plan item
 * 8.3c), and can try the ones that failed again.
 *
 * A texture that failed or took over 10 s was replaced by a one-pixel colour
 * and the material was built anyway. The loader said "Earth's surface: ready"
 * and left, and a missing night side was drawn flat with no word of why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

const loads = vi.hoisted(() => ({
  behaviour: {} as Record<string, 'ok' | 'fail' | 'hang'>,
}));
vi.mock('../GlobeTextureLoader', () => ({
  GlobeTextureLoader: {
    loadTexture: (name: string) => {
      const how = loads.behaviour[name] ?? 'ok';
      if (how === 'fail') return Promise.reject(new Error(`404 ${name}`));
      if (how === 'hang') return new Promise(() => {});
      const t = new THREE.Texture();
      t.name = name;
      return Promise.resolve(t);
    },
  },
}));

import { GlobeEngine } from '../GlobeEngine';

const byName = (engine: GlobeEngine) => Object.fromEntries(engine.getTextureStates().map((s) => [s.name, s.state]));

describe('GlobeEngine texture states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Cyber-Earth, the default view, draws these three.
    loads.behaviour = { earthDark: 'ok', earthWater: 'fail', earthNight: 'hang' };
  });
  afterEach(() => vi.useRealTimers());

  it('says each texture is loading, then ready, failed, or timed out', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    const changes = vi.fn();
    engine.on('texturesChanged', changes);
    await vi.advanceTimersByTimeAsync(0);
    expect(byName(engine)).toEqual({ earthDark: 'ready', earthWater: 'failed', earthNight: 'loading' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(byName(engine)).toEqual({ earthDark: 'ready', earthWater: 'failed', earthNight: 'timeout' });
    expect(changes).toHaveBeenCalled();
    // Built anyway, with stand-ins, as before: the globe is drawn.
    expect(engine.getMaterial()).not.toBeNull();
    engine.dispose();
  });

  it('names each texture for what it shows', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    await vi.advanceTimersByTimeAsync(10_000);
    const labels = engine.getTextureStates().map((s) => s.label);
    expect(labels).toEqual(['Dark surface', 'Oceans', 'City lights']);
    engine.dispose();
  });

  it('tries the failed ones again, and draws them once they load', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    await vi.advanceTimersByTimeAsync(10_000);
    const before = engine.getMaterial();
    const rebuilt = vi.fn();
    engine.on('materialChanged', rebuilt);
    loads.behaviour = { earthDark: 'ok', earthWater: 'ok', earthNight: 'ok' };
    await engine.retryTextures();
    expect(byName(engine)).toEqual({ earthDark: 'ready', earthWater: 'ready', earthNight: 'ready' });
    expect(rebuilt).toHaveBeenCalled();
    expect(engine.getMaterial()).not.toBe(before);
    engine.dispose();
  });
});
