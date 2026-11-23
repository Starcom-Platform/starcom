/**
 * In Sky from a place, only what stands above the observer's horizon is named, and never the Earth (plan D5).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aboveHorizon } from '../horizon';

describe('above the horizon', () => {
  it('names what is above the eye\'s horizon, not what is below it, and never the Earth', () => {
    const eye = new THREE.Vector3(0, 100.05, 0);
    const bodies = [
      { id: 'earth', position: new THREE.Vector3() },
      { id: 'moon', position: new THREE.Vector3(3000, 6000, 0) },
      { id: 'sun', position: new THREE.Vector3(100000, -50000, 0) },
      { id: 'mars', position: new THREE.Vector3(-20000, 101, 0) },
    ];
    expect(aboveHorizon(bodies, eye).map((b) => b.id)).toEqual(['moon', 'mars']);
  });
});
