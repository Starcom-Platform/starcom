import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { resolveGlobeClickLatLng } from '../globeClickRaycast';

// Raycaster/intersection math is CPU-side geometry — no WebGLRenderer or canvas
// needed, so these fixtures are real (unrendered) THREE.js objects, not mocks.
function makeSceneWithGlobe(radius = 100) {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16));
  mesh.name = 'globe';
  scene.add(mesh);
  return { scene, mesh };
}

function makeCameraLookingAtOrigin(distance: number) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, distance * 10);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('resolveGlobeClickLatLng', () => {
  it('hits the globe dead-center and resolves to a point on its near face', () => {
    const { scene } = makeSceneWithGlobe(100);
    const camera = makeCameraLookingAtOrigin(300);

    const hit = resolveGlobeClickLatLng(0, 0, camera, scene);

    expect(hit).not.toBeNull();
    // Camera looks down -Z at a sphere centered on the origin: the near-face
    // hit point should be very close to the equator/prime-meridian facing it.
    expect(hit!.lat).toBeCloseTo(0, 0);
  });

  it('returns null when the ray misses the globe entirely', () => {
    const { scene } = makeSceneWithGlobe(100);
    const camera = makeCameraLookingAtOrigin(300);

    // Far off to the side — the sphere (radius 100) doesn't extend anywhere
    // near the edge of a 50°-FOV viewport at this distance.
    const hit = resolveGlobeClickLatLng(0.95, 0.95, camera, scene);

    expect(hit).toBeNull();
  });

  it('returns null when there is no globe mesh in the scene', () => {
    const scene = new THREE.Scene();
    const camera = makeCameraLookingAtOrigin(300);

    expect(resolveGlobeClickLatLng(0, 0, camera, scene)).toBeNull();
  });

  it('resolves different click positions to different coordinates', () => {
    const { scene } = makeSceneWithGlobe(100);
    const camera = makeCameraLookingAtOrigin(300);

    const center = resolveGlobeClickLatLng(0, 0, camera, scene);
    const offCenter = resolveGlobeClickLatLng(0.3, 0.3, camera, scene);

    expect(center).not.toBeNull();
    expect(offCenter).not.toBeNull();
    expect(offCenter!.lat).not.toBeCloseTo(center!.lat, 3);
  });
});
