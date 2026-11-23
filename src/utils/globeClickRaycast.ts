import * as THREE from 'three';
import { findPrimaryGlobeMesh, worldPointToGeoOnGlobe } from './globeSurfaceMapping';

// Extracted so it's testable with plain THREE.js fixtures (Raycaster math is
// CPU-side geometry, no WebGLRenderer/canvas needed) without having to render
// the component that owns the click DOM-event glue (which, like the rest of
// Globe.tsx-adjacent code, can't run in jsdom).

/**
 * Raycasts from the camera through the given normalized-device-coordinates
 * (each in [-1, 1]) against the scene's primary globe mesh, returning the
 * lat/lng of the hit point, or null if the ray misses the globe entirely.
 */
export function resolveGlobeClickLatLng(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
  scene: THREE.Scene
): { lat: number; lng: number } | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

  const globeMesh = findPrimaryGlobeMesh(scene);
  if (!globeMesh) return null;

  const intersects = raycaster.intersectObject(globeMesh, true);
  if (intersects.length === 0) return null;

  return worldPointToGeoOnGlobe(intersects[0].point, globeMesh);
}
