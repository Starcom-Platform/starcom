/**
 * The engine downloads the textures its skin draws, and no others.
 *
 * init() used to ask for all seven Earth textures plus the clouds on every
 * visit. Measured server-side on 2026-09-25 with production's compression, a
 * first visit in the default view spent 2.04 MB on textures Cyber-Earth never
 * samples, and the engine's own cloud texture was never read by anything —
 * the cloud layer loads its own. SKIN_TEXTURES (skinTextures.test.ts) says
 * what each skin needs; this checks the engine asks for exactly that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const requested = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock('../GlobeTextureLoader', () => ({
  GlobeTextureLoader: {
    loadTexture: async (name: string) => {
      requested.names.push(name);
      const t = new THREE.Texture();
      t.name = name;
      return t;
    },
  },
}));

import { GlobeEngine } from '../GlobeEngine';
import { SKIN_TEXTURES } from '../GlobeMaterialManager';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => { requested.names = []; });

describe('GlobeEngine texture loading', () => {
  it('loads only the default view\'s three textures', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    await settle();

    expect([...requested.names].sort()).toEqual([...SKIN_TEXTURES.cyberEarth].sort());
    expect(engine.getMaterial()).not.toBeNull();
    engine.dispose();
  });

  it('never asks for the clouds, which the cloud layer owns and loads itself', async () => {
    const engine = new GlobeEngine({ mode: 'EcoNatural' });
    await settle();
    expect(requested.names).not.toContain('clouds');
    engine.dispose();
  });

  it('loads what a new skin is missing, then rebuilds the material for it', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    await settle();
    const before = engine.getMaterial();
    const changed = vi.fn();
    engine.on('materialChanged', changed);
    requested.names = [];

    engine.setSkin('blueMarble');
    await settle();

    // blueMarble needs blueMarble, earthTopology, earthWater; earthWater is held.
    expect([...requested.names].sort()).toEqual(['blueMarble', 'earthTopology']);
    expect(engine.getMaterial()).not.toBe(before);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ payload: { skin: 'blueMarble' } }));
    engine.dispose();
  });

  it('builds the skin chosen while it was still loading, with that skin\'s textures', async () => {
    // The race lazy loading creates: init() decides what to fetch, the skin
    // changes while the fetch is in flight, and the material is then built for
    // the NEW skin from the OLD skin's textures.
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    engine.setSkin('dayNight');
    await settle();
    await settle();

    for (const name of SKIN_TEXTURES.dayNight) expect(requested.names).toContain(name);
    expect(engine.getSkin()).toBe('dayNight');
    const material = engine.getMaterial() as THREE.ShaderMaterial;
    expect((material.uniforms.dayTexture.value as THREE.Texture).name).toBe('earthDay');
    engine.dispose();
  });

  it('does not rebuild a disposed engine when a skin\'s textures arrive late', async () => {
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    await settle();
    engine.setSkin('blueMarble');
    engine.dispose();
    await settle();
    expect(engine.getMaterial()).toBeNull();
  });

  it('stops calling a handler taken off', () => {
    // There was no off(): a listener lived as long as the engine, whoever added it.
    const engine = new GlobeEngine({ mode: 'CyberCommand' });
    const handler = vi.fn();
    engine.on('materialChanged', handler);
    engine.off('materialChanged', handler);
    engine.emit('materialChanged', {});
    expect(handler).not.toHaveBeenCalled();
    engine.dispose();
  });
});
