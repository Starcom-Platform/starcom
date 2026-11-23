import * as THREE from 'three';

// ─── TWO FRAMES ──────────────────────────────────────────────────────────────
//
// three-globe, under react-globe.gl, turns its globe mesh -90° about y "to face the
// prime meridian along Z" (three-globe.mjs: `globeObj.rotation.y = -Math.PI / 2`).
// So one lat/lng has two different xyz, and which is right depends on where the
// result goes:
//
//   latLngToGlobeWorld   the scene's frame: prime meridian on +z. Exactly where
//                        react-globe.gl's own getCoords puts a point. Anything a
//                        layer adds to the scene itself must use this.
//   latLngToGlobeLocal   the globe MESH's own frame: prime meridian on +x. Right
//                        only through that mesh's matrixWorld — as picking does
//                        (globeSurfaceMapping.ts) — or inside a group turned the same
//                        way (the geopolitical layers' counter-offset).
//
// Until 2026-09-11 there was one function, in the local convention, named as though
// it were the only one. Every layer that added its own objects to the scene with it —
// satellites, cyber threats, submarine cables, earth weather, river gauges,
// volcanoes, aurora — drew everything 90° of longitude east of the truth: the
// Caribbean's cables across the Sahara, the United States' threat marker off
// Portugal. Its tests checked it against itself, never against the globe.
// globeCoordinates.test.ts now checks both against three-globe.

/**
 * The turn between the two frames: -90° about y, the same one three-globe gives
 * its globe mesh.
 *
 * A group added to the SCENE whose contents were built in the globe mesh's
 * local frame — everything GeometryFactory produces — needs this on the group,
 * and then its local-frame contents land where latLngToGlobeWorld says. A layer
 * that omits it draws 90° of longitude away, which is the failure the note
 * above describes and which happened again, to the intel outline layer, on
 * 2026-09-20.
 */
export const GLOBE_SCENE_COUNTER_OFFSET_RAD = -Math.PI / 2;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeLongitude(lng: number): number {
  return ((lng + 540) % 360) - 180;
}

/** A lat/lng in the scene's frame — where react-globe.gl's getCoords puts it. */
export function latLngToGlobeWorld(lat: number, lng: number, radius: number): THREE.Vector3 {
  const latRad = lat * DEG2RAD;
  const lngRad = lng * DEG2RAD;
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lngRad),
  );
}

/** The lat/lng of a point in the scene's frame. */
export function globeWorldToLatLng(point: THREE.Vector3, radius?: number): { lat: number; lng: number } {
  const r = radius && radius > 0 ? radius : point.length() || 1;
  const lat = Math.asin(clamp(point.y / r, -1, 1)) * RAD2DEG;
  const lng = normalizeLongitude(Math.atan2(point.x, point.z) * RAD2DEG);
  return { lat, lng };
}

/** A lat/lng in the globe mesh's own frame. Not a scene position — see above. */
export function latLngToGlobeLocal(lat: number, lng: number, radius: number): THREE.Vector3 {
  const latRad = lat * DEG2RAD;
  const lngRad = lng * DEG2RAD;

  const x = radius * Math.cos(latRad) * Math.cos(lngRad);
  const y = radius * Math.sin(latRad);
  const z = -radius * Math.cos(latRad) * Math.sin(lngRad);

  return new THREE.Vector3(x, y, z);
}

/** The lat/lng of a point in the globe mesh's own frame. */
export function globeLocalToLatLng(point: THREE.Vector3, radius?: number): { lat: number; lng: number } {
  const r = radius && radius > 0 ? radius : point.length() || 1;
  const lat = Math.asin(clamp(point.y / r, -1, 1)) * RAD2DEG;
  const lng = normalizeLongitude(Math.atan2(-point.z, point.x) * RAD2DEG);
  return { lat, lng };
}
