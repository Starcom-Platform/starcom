/**
 * A body lit from where the Sun really is, seen from it (decision K6, step 3;
 * sunlitMaterial.ts): the planets and the Moon each carry their own direction to the
 * Sun, which the globe's one shared light could not give them.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSunlitMaterial, setSunDirection, setSunlitMap, setSunlitOpacity } from '../sunlitMaterial';

describe('the sunlit material', () => {
  it('is the body\'s own colour until its imagery arrives, then its imagery', () => {
    const material = createSunlitMaterial(0xcd5c5c);
    expect(material.uniforms.hasMap.value).toBe(false);
    expect(material.uniforms.color.value.getHex()).toBe(0xcd5c5c);
    const texture = new THREE.Texture();
    setSunlitMap(material, texture);
    expect(material.uniforms.map.value).toBe(texture);
    expect(material.uniforms.hasMap.value).toBe(true);
  });

  it('holds a direction to the Sun, as a unit vector', () => {
    const material = createSunlitMaterial(0xffffff);
    setSunDirection(material, new THREE.Vector3(0, 0, 250));
    expect(material.uniforms.sunDirection.value.toArray()).toEqual([0, 0, 1]);
  });

  it('fades by the opacity its shader reads, kept in step with the material\'s own', () => {
    const material = createSunlitMaterial(0xffffff);
    expect(material.transparent).toBe(true);
    setSunlitOpacity(material, 0.3);
    expect(material.uniforms.opacity.value).toBe(0.3);
    expect(material.opacity).toBe(0.3);
  });

  it('leaves the night side dark but not black', () => {
    const fill = createSunlitMaterial(0xffffff).uniforms.nightFill.value;
    expect(fill).toBeGreaterThan(0);
    expect(fill).toBeLessThan(0.1);
  });
});
