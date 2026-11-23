import * as THREE from 'three';
import { vi } from 'vitest';
import { GlobeMaterialManager } from '../GlobeMaterialManager';

const mockTextures = {
  earthDayTexture: new THREE.Texture(),
  earthNightTexture: new THREE.Texture(),
  earthDarkTexture: new THREE.Texture(),
  earthTopologyTexture: new THREE.Texture(),
  earthWaterTexture: new THREE.Texture(),
  blueMarbleTexture: new THREE.Texture(),
};

describe('GlobeMaterialManager', () => {
  describe('the Cyber-Earth skin', () => {
    test('separates land from water and carries the city lights, rather than tinting a nearly-black texture', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('cyberEarth', mockTextures) as THREE.ShaderMaterial;
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(material.uniforms.waterTexture.value).toBe(mockTextures.earthWaterTexture);
      expect(material.uniforms.nightTexture.value).toBe(mockTextures.earthNightTexture);
      // The Fresnel rim is what made the old (deleted) TinyGlobe shader read as a hologram.
      expect(material.fragmentShader).toContain('cameraPosition');
    });
  });

  describe('the Blue Marble skin', () => {
    test('is lit: a basic material showed full daylight at midnight and no light mode could touch it', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('blueMarble', mockTextures) as THREE.MeshPhongMaterial;
      expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
      expect(material).not.toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(material.map).toBe(mockTextures.blueMarbleTexture);
      expect(material.bumpMap).toBe(mockTextures.earthTopologyTexture);
      expect(material.specularMap).toBe(mockTextures.earthWaterTexture);
    });
  });

  describe('dayNight mode', () => {
    test('creates a ShaderMaterial with day/night/sunDirection uniforms', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', mockTextures) as THREE.ShaderMaterial;
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(material.uniforms.dayTexture.value).toBe(mockTextures.earthDayTexture);
      expect(material.uniforms.nightTexture.value).toBe(mockTextures.earthNightTexture);
      expect(material.uniforms.sunDirection.value).toBeInstanceOf(THREE.Vector3);
    });

    test('falls back to the day texture for night when neither night texture is provided', () => {
      const { earthDarkTexture: _unused, earthNightTexture: _alsoUnused, ...textures } = mockTextures;
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', textures) as THREE.ShaderMaterial;
      expect(material.uniforms.nightTexture.value).toBe(mockTextures.earthDayTexture);
    });

    test('wires the topology texture as a bump map with a nonzero bumpScale', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', mockTextures) as THREE.ShaderMaterial;
      expect(material.uniforms.bumpMap.value).toBe(mockTextures.earthTopologyTexture);
      expect(material.uniforms.bumpScale.value).toBeGreaterThan(0);
    });

    test('degrades to a no-op bump (scale 0) rather than an unbound sampler if no topology texture is provided', () => {
      const { earthTopologyTexture: _unused, ...textures } = mockTextures;
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', textures) as THREE.ShaderMaterial;
      // The shader's bumpMap uniform must always be bound to SOME texture (a null
      // sampler2D uniform is invalid), so it falls back to the day texture — but with
      // bumpScale forced to 0, so it can never actually perturb normals from that
      // texture's (nonsensical, as height data) color values.
      expect(material.uniforms.bumpMap.value).toBe(mockTextures.earthDayTexture);
      expect(material.uniforms.bumpScale.value).toBe(0);
    });

    test('fragment shader guards bump perturbation behind bumpScale, so scale 0 reproduces the original unperturbed lighting', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', mockTextures) as THREE.ShaderMaterial;
      expect(material.fragmentShader).toContain('if (bumpScale > 0.0)');
      expect(material.fragmentShader).toContain('perturbNormalArb');
    });
  });

  describe('an unknown skin', () => {
    test('falls back to Day / Night, which is lit, rather than to something unlit', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('not-a-skin' as never, mockTextures) as THREE.ShaderMaterial;
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(material.uniforms.sunDirection.value).toBeInstanceOf(THREE.Vector3);
    });
  });

  describe('applyLighting', () => {
    const lighting = (direction: THREE.Vector3) => ({ direction, nightFill: 0.15, flat: false });

    test('updates the sunDirection uniform on a ShaderMaterial, normalized', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('dayNight', mockTextures) as THREE.ShaderMaterial;
      GlobeMaterialManager.applyLighting(material, lighting(new THREE.Vector3(3, 0, 4)));

      const dir = material.uniforms.sunDirection.value as THREE.Vector3;
      expect(dir.length()).toBeCloseTo(1, 6);
      expect(dir.x).toBeCloseTo(0.6, 6);
      expect(dir.z).toBeCloseTo(0.8, 6);
    });

    test('is a no-op for a Phong skin, which the scene rig lights instead', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('blueMarble', mockTextures);
      expect(() => GlobeMaterialManager.applyLighting(material, lighting(new THREE.Vector3(1, 0, 0)))).not.toThrow();
    });

    test('is a no-op for null material', () => {
      expect(() => GlobeMaterialManager.applyLighting(null, lighting(new THREE.Vector3(1, 0, 0)))).not.toThrow();
    });
  });

  describe('disposeMaterial', () => {
    test('disposes the material', () => {
      const material = GlobeMaterialManager.getMaterialForSkin('blueMarble', mockTextures);
      const spy = vi.spyOn(material, 'dispose');
      GlobeMaterialManager.disposeMaterial(material);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
