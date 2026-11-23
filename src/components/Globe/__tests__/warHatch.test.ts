/**
 * The hatching of War & Conflict's outer countries (theatre-lens.md, TL5): a
 * shader drawn over a country's fill geometry, in its tier's colour, its lines
 * rising to the right at 45° on the ground round the country's middle.
 *
 * What the lines look like is checked on the rendered globe and the golden cards;
 * here, what the material is given and how it stands among the see-through layers.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hatchMaterial, HATCH_OPACITY, FADED_HATCH_OPACITY } from '../warHatch';

describe('a country\'s hatching', () => {
  it('is drawn in its colour, at its opacity, round its middle', () => {
    const material = hatchMaterial(0xfb594d, HATCH_OPACITY, { lat: 60, lng: -30 });
    expect((material.uniforms.uColor.value as THREE.Color).getHex()).toBe(0xfb594d);
    expect(material.uniforms.uOpacity.value).toBe(HATCH_OPACITY);
    const ref = material.uniforms.uRef.value as THREE.Vector2;
    expect(ref.x).toBeCloseTo(0.5, 10);
    expect(ref.y).toBeCloseTo(-Math.PI / 6, 10);
  });

  it('stands as a fill does: see-through, writing no depth, drawn over the sphere it sits on', () => {
    const material = hatchMaterial(0xfb594d, HATCH_OPACITY, { lat: 0, lng: 0 });
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.polygonOffset).toBe(true);
  });

  it('fades under a featured item or a lens, and is never fainter than it can be seen', () => {
    expect(FADED_HATCH_OPACITY).toBeLessThan(HATCH_OPACITY);
    expect(FADED_HATCH_OPACITY).toBeGreaterThan(0);
  });

  it('finds where each pixel is on the ground as the fills are laid out, and spaces its lines by pixels', () => {
    const material = hatchMaterial(0xfb594d, HATCH_OPACITY, { lat: 0, lng: 0 });
    // The fills' vertices: x = cos(lat)cos(lng), y = sin(lat), z = -cos(lat)sin(lng) (GeometryFactory, z flipped).
    expect(material.fragmentShader).toMatch(/atan\(-d\.z, d\.x\)/);
    expect(material.fragmentShader).toMatch(/fwidth/);
  });
});
