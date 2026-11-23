import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createTerritoryFillMaterial,
  isTerritoryFillMaterial,
  getTerritoryMaterialBaseColorHex,
  setTerritoryMaterialBaseColor,
  getTerritoryMaterialOpacity,
  setTerritoryMaterialOpacity,
  setTerritoryMaterialHoverSelectDim,
  setTerritoryMaterialSunDirection,
  setTerritoryMaterialQaTint,
  setTerritoryMaterialOneColour
} from '../territoryFillMaterial';

describe('territoryFillMaterial', () => {
  it('creates a ShaderMaterial tagged for identification, with sensible defaults', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(isTerritoryFillMaterial(mat)).toBe(true);
    expect(isTerritoryFillMaterial(new THREE.MeshBasicMaterial())).toBe(false);
    expect(isTerritoryFillMaterial(null)).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.side).toBe(THREE.DoubleSide);
    // Depth-tested, so an opaque model above a fill is not painted over by it.
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(getTerritoryMaterialBaseColorHex(mat)).toBe(0x0044ff);
    expect(getTerritoryMaterialOpacity(mat)).toBe(0.4);
    expect(mat.uniforms.uHoverT.value).toBe(0);
    expect(mat.uniforms.uSelectT.value).toBe(0);
    expect(mat.uniforms.uDimT.value).toBe(0);
    expect(mat.uniforms.uQaTintStrength.value).toBe(0);
  });

  it('respects an explicit side override instead of always defaulting to DoubleSide', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4, side: THREE.FrontSide });
    expect(mat.side).toBe(THREE.FrontSide);
  });

  it('setTerritoryMaterialBaseColor mutates only uBaseColor', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    setTerritoryMaterialBaseColor(mat, 0xff5555);
    expect(getTerritoryMaterialBaseColorHex(mat)).toBe(0xff5555);
    expect(mat.uniforms.uOpacity.value).toBe(0.4);
  });

  it('setTerritoryMaterialOpacity mutates only uOpacity', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    setTerritoryMaterialOpacity(mat, 0.9);
    expect(getTerritoryMaterialOpacity(mat)).toBe(0.9);
    expect(getTerritoryMaterialBaseColorHex(mat)).toBe(0x0044ff);
  });

  it('setTerritoryMaterialHoverSelectDim sets all three t-values independently', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    setTerritoryMaterialHoverSelectDim(mat, 0.5, 0.25, 0.75);
    expect(mat.uniforms.uHoverT.value).toBe(0.5);
    expect(mat.uniforms.uSelectT.value).toBe(0.25);
    expect(mat.uniforms.uDimT.value).toBe(0.75);
  });

  it('setTerritoryMaterialSunDirection normalizes the given vector', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    setTerritoryMaterialSunDirection(mat, new THREE.Vector3(3, 0, 4)); // length 5
    const v = mat.uniforms.uSunDirection.value as THREE.Vector3;
    expect(v.length()).toBeCloseTo(1, 6);
    expect(v.x).toBeCloseTo(0.6, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0.8, 6);
  });

  it('setTerritoryMaterialQaTint sets both color and strength together', () => {
    const mat = createTerritoryFillMaterial({ baseColorHex: 0x0044ff, opacity: 0.4 });
    setTerritoryMaterialQaTint(mat, 0xff0000, 0.5);
    expect((mat.uniforms.uQaTintColor.value as THREE.Color).getHex()).toBe(0xff0000);
    expect(mat.uniforms.uQaTintStrength.value).toBe(0.5);
  });
});

describe('the one-colour switch (decision K5)', () => {
  const parts = () => createTerritoryFillMaterial({ baseColorHex: 0x2b4257, opacity: 0.5, partState: new THREE.DataTexture(new Uint8Array(4), 1, 1) });

  it('draws each part\'s own colour until told one colour, then that colour, and back', () => {
    const material = parts();
    expect(material.uniforms.uOneColour.value).toBe(0);
    setTerritoryMaterialOneColour(material, 0x123456);
    expect(material.uniforms.uOneColour.value).toBe(1);
    expect((material.uniforms.uBaseColor.value as THREE.Color).getHex()).toBe(0x123456);
    setTerritoryMaterialOneColour(material, null);
    expect(material.uniforms.uOneColour.value).toBe(0);
  });

  it('selects in the shader, exactly, between the part\'s colour and the one colour', () => {
    // A select, not mix(): Quiet cards are compared pixel for pixel with their goldens.
    expect(parts().fragmentShader).toMatch(/#define BASE_COLOR \(uOneColour > 0\.5 \? uBaseColor : vBaseColor\)/);
  });
});
