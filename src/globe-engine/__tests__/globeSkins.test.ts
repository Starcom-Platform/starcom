/**
 * The four skins, and the one thing every one of them must do: be lit from somewhere.
 *
 * Before this the globe had three looks, chosen for the viewer by data mode, and Blue
 * Marble was a MeshBasicMaterial — unlit, so it showed full daylight at midnight and no
 * light mode could touch it. The Cyber-Earth look was a cyan `color` multiplied over a
 * nearly-black texture, which is why it read as a dim grey planet rather than a
 * hologram.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GlobeMaterialManager } from '../GlobeMaterialManager';
import { GlobeModeMapping } from '../GlobeModeMapping';
import type { GlobeSkin } from '../../services/globe/globeAppearance';

const texture = () => new THREE.Texture();
const textures = {
  earthDayTexture: texture(), earthNightTexture: texture(), earthDarkTexture: texture(),
  earthTopologyTexture: texture(), earthWaterTexture: texture(), blueMarbleTexture: texture(),
};
const SKINS: GlobeSkin[] = ['blueMarble', 'dayNight', 'cyberEarth', 'terrain'];

describe('the globe skins', () => {
  it('gives every skin a material that light reaches', () => {
    for (const skin of SKINS) {
      const material = GlobeMaterialManager.getMaterialForSkin(skin, textures);
      const lit = material instanceof THREE.ShaderMaterial
        // A shader skin computes its own terminator from this uniform.
        ? Boolean((material as THREE.ShaderMaterial).uniforms.sunDirection)
        // A Phong skin is lit by the scene's rig. Basic materials are not lit at all.
        : material instanceof THREE.MeshPhongMaterial;
      expect(lit, `${skin} is unlit`).toBe(true);
    }
  });

  it('uses the city lights on the night side, not the flat dark landmass', () => {
    const dayNight = GlobeMaterialManager.getMaterialForSkin('dayNight', textures) as THREE.ShaderMaterial;
    expect(dayNight.uniforms.nightTexture.value).toBe(textures.earthNightTexture);
    expect(dayNight.uniforms.dayTexture.value).toBe(textures.earthDayTexture);
  });

  it('falls back to what it has when the city lights did not load', () => {
    const { earthNightTexture: _omitted, ...withoutNight } = textures;
    const dayNight = GlobeMaterialManager.getMaterialForSkin('dayNight', withoutNight) as THREE.ShaderMaterial;
    expect(dayNight.uniforms.nightTexture.value).toBe(textures.earthDarkTexture);
  });

  it('keeps each data mode\'s own look as the default', () => {
    expect(GlobeModeMapping.getRenderConfigForMode('CyberCommand').shader).toBe('cyberEarth');
    expect(GlobeModeMapping.getRenderConfigForMode('EcoNatural').shader).toBe('dayNight');
    expect(GlobeModeMapping.getRenderConfigForMode('GeoPolitical').shader).toBe('blueMarble');
  });
});

describe('applyLighting', () => {
  const direction = new THREE.Vector3(0, 0, 1);

  it('writes the direction, the night fill and the flat flag into a shader skin', () => {
    for (const skin of ['dayNight', 'cyberEarth', 'terrain'] as GlobeSkin[]) {
      const material = GlobeMaterialManager.getMaterialForSkin(skin, textures) as THREE.ShaderMaterial;
      GlobeMaterialManager.applyLighting(material, { direction, nightFill: 0.4, flat: true });
      expect((material.uniforms.sunDirection.value as THREE.Vector3).z, skin).toBeCloseTo(1, 9);
      expect(material.uniforms.nightFill.value, skin).toBe(0.4);
      expect(material.uniforms.flatLighting.value, skin).toBe(1);
      GlobeMaterialManager.applyLighting(material, { direction, nightFill: 0.1, flat: false });
      expect(material.uniforms.flatLighting.value, skin).toBe(0);
    }
  });

  it('leaves a Phong skin alone — its light comes from the scene rig', () => {
    const material = GlobeMaterialManager.getMaterialForSkin('blueMarble', textures);
    expect(() => GlobeMaterialManager.applyLighting(material, { direction, nightFill: 0.2, flat: false })).not.toThrow();
  });
});
