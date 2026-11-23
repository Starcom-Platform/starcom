/**
 * A quake's depth, drawn (critique-2026-11-01, OR29; plan B2): a thin line from the quake's place down to its
 * hypocentre, at its true depth on the globe's scale (700 km is about a ninth of the radius), seen through the crust:
 * drawn over the globe rather than hidden by it, faintly. A quake on the far side would show through the whole
 * planet, so each frame a line whose place faces away from the camera is folded to nothing.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { KIND_COLOURS } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
const EARTH_RADIUS_KM = 6371;
/** How this layer's lines are found by a probe or a test. */
export const QUAKE_DEPTH_LINES_TYPE = 'quakeDepthLines';

export interface QuakeDepth { id: string; lat: number; lng: number; depthKm: number }

/** The point a quake began, in the scene's frame: its place, `depthKm` below the surface. */
export function hypocentre(q: QuakeDepth): THREE.Vector3 {
  const r = GLOBE_RADIUS_UNITS * (1 - Math.max(0, q.depthKm) / EARTH_RADIUS_KM);
  return latLngToGlobeWorld(q.lat, q.lng, r);
}

export function buildQuakeDepthLines(quakes: readonly QuakeDepth[]): THREE.LineSegments | null {
  const shown = quakes.filter((q) => Number.isFinite(q.depthKm) && q.depthKm > 0 && Number.isFinite(q.lat) && Number.isFinite(q.lng));
  if (!shown.length) return null;
  const tops = shown.map((q) => latLngToGlobeWorld(q.lat, q.lng, GLOBE_RADIUS_UNITS));
  const bottoms = shown.map(hypocentre);
  const positions = new Float32Array(shown.length * 6);
  const write = (i: number, folded: boolean) => {
    const top = tops[i];
    const bottom = folded ? top : bottoms[i];
    positions.set([top.x, top.y, top.z, bottom.x, bottom.y, bottom.z], i * 6);
  };
  shown.forEach((_, i) => write(i, false));
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const material = new THREE.LineBasicMaterial({ color: new THREE.Color(KIND_COLOURS.hazards), transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.userData = { type: QUAKE_DEPTH_LINES_TYPE, quakes: shown.length };
  lines.renderOrder = 119;
  lines.frustumCulled = false;
  const toCamera = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let lastFacing = '';
  lines.onBeforeRender = (_renderer, _scene, camera) => {
    // Faces the camera: the place's outward normal points toward the camera, past the horizon's edge.
    const facing = shown.map((_, i) => {
      normal.copy(tops[i]).normalize();
      toCamera.copy(camera.position).sub(tops[i]).normalize();
      return normal.dot(toCamera) > 0.05 ? '1' : '0';
    }).join('');
    if (facing === lastFacing) return;
    lastFacing = facing;
    for (let i = 0; i < shown.length; i++) write(i, facing[i] !== '1');
    attribute.needsUpdate = true;
  };
  return lines;
}
