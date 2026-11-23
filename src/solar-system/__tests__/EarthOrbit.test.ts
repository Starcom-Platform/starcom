/**
 * The Earth's own orbit ring (owner, 1 Nov): its path round the Sun measured from the Earth, so it passes through the
 * globe at the moment drawn and reaches about 2 AU across at the planets' one true scale; shown as theirs are.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EarthOrbit } from '../components/EarthOrbit';
import { DRAWN_UNITS_PER_AU } from '../bodyPlacement';

describe('EarthOrbit', () => {
  it('rings the Sun through the globe, about 2 AU across at the planets\' scale', () => {
    const scene = new THREE.Scene();
    const orbit = new EarthOrbit(scene);
    const at = new Date();
    orbit.update(at);
    const line = scene.getObjectByName('earth-orbit') as THREE.Line;
    const p = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    let nearest = Infinity;
    for (let i = 0; i < p.count; i++) nearest = Math.min(nearest, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
    // Its first sample is the moment drawn: the Earth itself.
    expect(nearest).toBeLessThan(0.01 * DRAWN_UNITS_PER_AU);
    expect(orbit.getOrbitReach() / DRAWN_UNITS_PER_AU).toBeGreaterThan(1.96);
    expect(orbit.getOrbitReach() / DRAWN_UNITS_PER_AU).toBeLessThan(2.04);
    expect(line.visible).toBe(false);
    orbit.setOrbitShown(0.5);
    expect(line.visible).toBe(true);
    orbit.dispose();
    expect(scene.getObjectByName('earth-orbit')).toBeUndefined();
  });
});
