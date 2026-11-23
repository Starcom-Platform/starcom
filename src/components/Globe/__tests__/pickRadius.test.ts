/**
 * Whether a mark the pointer passed near can be seen (D-DP step 5, found on the build). three.js meets
 * Points along the whole ray, through the Earth and out the far side, and nothing in a pick stands in
 * for the Earth. A hover at the globe's edge over Greenland named Fort Walton Beach, Florida, beyond the
 * horizon, and a click there opened it. A mark is seen when the line from the camera to it clears the
 * globe.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { markIsVisible, visibleHits } from '../pickRadius';

const R = 100;
const onGlobe = (lat: number, lng: number, r = 102) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

describe('a mark seen from the camera', () => {
  const camera = onGlobe(50, 30, 260); // 1.6 globe radii up, over the Black Sea

  it('is one on the near side', () => {
    expect(markIsVisible(onGlobe(55.75, 37.62), camera, R)).toBe(true);
  });

  it('is not one in the near hemisphere but beyond the horizon', () => {
    // Fort Walton Beach: its direction is 82° from the camera's, the horizon at 67°.
    expect(markIsVisible(onGlobe(30.4, -86.6), camera, R)).toBe(false);
  });

  it('is not one on the far side', () => {
    expect(markIsVisible(onGlobe(-40, -150), camera, R)).toBe(false);
  });
});

describe('the hits a pick may answer', () => {
  const camera = onGlobe(50, 30, 260);
  const marks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    ...onGlobe(55.75, 37.62).toArray(), ...onGlobe(30.4, -86.6).toArray(),
  ]), 3)));
  const hit = (index: number) => ({ object: marks, index, point: new THREE.Vector3(), distance: 1 }) as THREE.Intersection;

  it('are the marks seen, by their own place, not where the ray passed', () => {
    expect(visibleHits([hit(0), hit(1)], camera, R).map((h) => h.index)).toEqual([0]);
  });

  it('are a mesh hit judged by the point the ray met', () => {
    const mesh = new THREE.Mesh();
    const near = { object: mesh, point: onGlobe(55.75, 37.62, 100.5), distance: 1 } as THREE.Intersection;
    const far = { object: mesh, point: onGlobe(-40, -150, 100.5), distance: 1 } as THREE.Intersection;
    expect(visibleHits([near, far], camera, R)).toEqual([near]);
  });
});
