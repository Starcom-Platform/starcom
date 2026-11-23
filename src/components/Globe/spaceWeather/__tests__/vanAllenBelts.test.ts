/**
 * The Van Allen belts (space-weather-visualization.md, SW5): the outer belt brightened by the
 * electrons GOES measures, the inner at a typical brightness, both round the dipole's axis.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVanAllenBelts, outerBeltGain, parseGoesElectrons, BELT_RADIUS_RE } from '../vanAllenBelts';
import { RE_UNITS } from '../fieldLines';

describe('the electrons GOES measures', () => {
  it('are the newest ≥2 MeV reading, its satellite and time', () => {
    const rows = [
      { time_tag: '2026-10-10T19:05:00Z', satellite: 19, flux: 300.5, energy: '>=2 MeV' },
      { time_tag: '2026-10-10T19:10:00Z', satellite: 19, flux: 221.5, energy: '>=2 MeV' },
      { time_tag: '2026-10-10T19:15:00Z', satellite: 19, flux: null, energy: '>=2 MeV' },
      { time_tag: '2026-10-10T19:20:00Z', satellite: 19, flux: 99, energy: '>=4 MeV' },
    ];
    expect(parseGoesElectrons(rows)).toEqual({ at: '2026-10-10T19:10:00Z', flux: 221.5, satellite: 19 });
    expect(parseGoesElectrons([])).toBeNull();
  });
});

describe('the outer belt\'s brightness', () => {
  it('rises with the flux on a log scale, from a glimmer at 10 pfu to full at 10,000', () => {
    expect(outerBeltGain(10)).toBeCloseTo(0.15, 9);
    expect(outerBeltGain(10_000)).toBeCloseTo(1, 9);
    expect(outerBeltGain(316)).toBeGreaterThan(outerBeltGain(100));
    // A decade up of three is a third of the way.
    expect(outerBeltGain(100)).toBeCloseTo(0.15 + 0.85 / 3, 9);
    expect(outerBeltGain(1)).toBeCloseTo(0.15, 9);
    expect(outerBeltGain(1e6)).toBeCloseTo(1, 9);
  });
});

describe('the belts drawn', () => {
  it('fill a sphere round the Earth, as added light, set round the dipole\'s axis in the scene', () => {
    const belts = createVanAllenBelts({ steps: 32 });
    const mesh = belts.object as THREE.Mesh;
    const material = mesh.material as THREE.ShaderMaterial;
    (mesh.geometry as THREE.SphereGeometry).computeBoundingSphere();
    expect(mesh.geometry.boundingSphere!.radius).toBeCloseTo(BELT_RADIUS_RE * RE_UNITS, 3);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthTest).toBe(false);
    // GEO (x, y, z) is the scene's (z, x, y).
    belts.setAxis([0.1, -0.2, 0.97]);
    const axis = material.uniforms.axis.value as THREE.Vector3;
    expect(axis.toArray().map((v) => +v.toFixed(6))).toEqual(new THREE.Vector3(-0.2, 0.97, 0.1).normalize().toArray().map((v) => +v.toFixed(6)));
    belts.setOuterGain(0.6);
    expect(material.uniforms.outerGain.value).toBe(0.6);
    belts.dispose();
  });
});
