/**
 * The area a roughly placed report could be in (decision D-F, section 18, item 3).
 *
 * A report carries `geoPrecisionM` when its publisher stated one (`geo_precision`)
 * or its position came from a geohash cell. A glyph alone claims a point; for a
 * report placed only to its county, that claim is false at any zoom where the
 * difference shows. So the area is drawn under the glyph, in the glyph's colour.
 *
 * Surface geometry, not a screen-sized mark, on purpose: it has to be the real
 * size of the uncertainty. At a share card's altitude a county is smaller than the
 * 35 px glyph over it and stays hidden, which is right — there the glyph's own
 * size is coarser than the precision. It appears as someone zooms in, exactly
 * where a pin would start to mislead. The card states precision in words for the
 * report it features.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../utils/globeCoordinates';
import { SURFACE_LINES } from './globeAltitudes';
import { getReplayMoment } from './replayClock';

/** Below this the uncertainty is a few pixels at any zoom a person uses; nothing is drawn. */
export const COARSE_PRECISION_M = 2_000;

/** How a probe or a test finds the areas. */
export const INTEL_AREA_TYPE = 'intelReportPrecisionAreas';

const EARTH_RADIUS_M = 6_371_000;
const SEGMENTS = 48;
const FILL_OPACITY = 0.16;
const EDGE_OPACITY = 0.55;

export interface PrecisionArea {
  lat: number;
  lng: number;
  precisionM: number | null;
  color: string;
}

/** Points on the small circle `angle` radians from the centre, on a sphere of `radius`. */
function ringAround(lat: number, lng: number, angle: number, radius: number): THREE.Vector3[] {
  const centre = latLngToGlobeWorld(lat, lng, 1).normalize();
  // Any vector not parallel to the centre gives a tangent basis.
  const helper = Math.abs(centre.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const east = new THREE.Vector3().crossVectors(helper, centre).normalize();
  const north = new THREE.Vector3().crossVectors(centre, east).normalize();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const dir = east.clone().multiplyScalar(Math.cos(t)).add(north.clone().multiplyScalar(Math.sin(t)));
    points.push(centre.clone().multiplyScalar(Math.cos(angle)).add(dir.multiplyScalar(Math.sin(angle))).multiplyScalar(radius));
  }
  return points;
}

/** One object holding every coarse report's area, or null when there are none. */
export function buildPrecisionAreas(areas: readonly PrecisionArea[], globeRadius: number): THREE.Group | null {
  const coarse = areas.filter((a) => typeof a.precisionM === 'number' && a.precisionM >= COARSE_PRECISION_M);
  if (coarse.length === 0) return null;

  const r = globeRadius * SURFACE_LINES;
  const fill: number[] = [];
  const fillColours: number[] = [];
  const edge: number[] = [];
  const edgeColours: number[] = [];
  const colour = new THREE.Color();

  for (const area of coarse) {
    // Wider than a hemisphere is no longer a place; cap at a quarter of the globe.
    const angle = Math.min((area.precisionM as number) / EARTH_RADIUS_M, Math.PI / 4);
    const centre = latLngToGlobeWorld(area.lat, area.lng, r);
    const ring = ringAround(area.lat, area.lng, angle, r);
    colour.set(area.color);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      fill.push(centre.x, centre.y, centre.z, a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 3; k++) fillColours.push(colour.r, colour.g, colour.b);
      edge.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let k = 0; k < 2; k++) edgeColours.push(colour.r, colour.g, colour.b);
    }
  }

  const noPick = () => {};
  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
  fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColours, 3));
  const mesh = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: FILL_OPACITY, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.raycast = noPick;

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColours, 3));
  const lines = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: EDGE_OPACITY, depthWrite: false,
  }));
  lines.raycast = noPick;

  /*
   * Hidden in a replay: an area drawn before its report has appeared would show
   * where a report is about to be. Read as each draws, like the glyphs' clock.
   */
  for (const [object, opacity] of [[mesh, FILL_OPACITY], [lines, EDGE_OPACITY]] as const) {
    object.onBeforeRender = () => {
      (object.material as THREE.Material).opacity = getReplayMoment() ? 0 : opacity;
    };
  }

  const group = new THREE.Group();
  group.add(mesh, lines);
  group.userData = { type: INTEL_AREA_TYPE, areas: coarse.length };
  return group;
}

/** Release the areas' GPU memory. */
export function disposePrecisionAreas(group: THREE.Group): void {
  group.traverse((o) => {
    const drawn = o as THREE.Mesh;
    if (drawn.geometry) drawn.geometry.dispose();
    const material = drawn.material as THREE.Material | undefined;
    material?.dispose();
  });
}
