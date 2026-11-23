/**
 * The solar wind past the magnetosphere, drawn (space-weather-visualization.md, SW6, SW17): carried
 * from GSM into the scene as the field lines are, its particles on their streamlines, brighter in the
 * magnetosheath.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNearEarthFlowParticles, flowPaths, flowReSecond, gsmToSceneMatrix } from '../nearEarthFlowParticles';
import { gsmToScene } from '../fieldLines';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';

const frame = recalc(Date.UTC(2026, 9, 10, 12) / 1000);

describe('the near-Earth flow drawn', () => {
  it('is carried from GSM into the scene as the field lines are', () => {
    const m = gsmToSceneMatrix(frame);
    for (const p of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [3, -2, 5]]) {
      const got = new THREE.Vector3(...p).applyMatrix4(m);
      const want = gsmToScene(frame, p);
      expect(got.distanceTo(new THREE.Vector3(...want))).toBeLessThan(1e-6);
    }
  });

  it('runs at 4 Earth radii a second for a 400 km/s wind, in proportion to it', () => {
    expect(flowReSecond(400)).toBe(4);
    expect(flowReSecond(800)).toBe(8);
  });

  it('marks the magnetosheath along each streamline, and is brighter there', () => {
    const paths = flowPaths(10.5);
    expect(paths).toHaveLength(600);
    expect(paths.some((p) => p.sheath.some((v) => v === 1))).toBe(true);
    const particles = createNearEarthFlowParticles(paths, '#FFC98A');
    particles.place(12.3, 4);
    const g = particles.object.geometry;
    const starts = g.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
    expect(starts.count).toBe(3000);
    // Each a streak: a dark tail behind a lit head, the head ahead of the tail downstream (toward -x).
    const p = starts.data.array as Float32Array, c = (g.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data.array as Float32Array;
    expect(c[0] + c[1] + c[2]).toBe(0);
    let downstream = 0;
    for (let i = 0; i < 3000; i++) if (p[i * 6 + 3] < p[i * 6]) downstream++;
    expect(downstream).toBeGreaterThan(2800);
    // Brighter in the magnetosheath than anywhere else.
    const heads = Array.from({ length: 3000 }, (_, i) => c[i * 6 + 3]);
    expect(Math.max(...heads)).toBeGreaterThan(new THREE.Color('#FFC98A').r);
    // And dimmer out in the free stream: most heads, fully faded in, are at half strength.
    expect(heads.filter((h) => h > 0 && h <= new THREE.Color('#FFC98A').r * 0.51).length).toBeGreaterThan(1000);
    // The same moment, the same picture.
    const first = Array.from(p).slice(0, 30);
    particles.place(12.3, 4);
    expect(Array.from(starts.data.array as Float32Array).slice(0, 30)).toEqual(first);
    particles.dispose();
  });
});
