// Pure altitude math for the globe's zoom in/out camera controls, extracted so it's
// testable without rendering Globe.tsx (which constructs a real THREE.WebGLRenderer
// and can't run in jsdom). Also holds setGlobePointOfView below — not pure (it has
// two real side effects), but extracted here for the same testability reason and
// because every pointOfView()-driving call site needs it.
import { leaveSky, solarScale } from '../solar-system/solarScale';
import { closeWithoutLift } from '../solar-system/sky/skyLook';
import { globeCameraTelemetry, type GlobeCameraOrientation } from '../services/globe/GlobeCameraTelemetry';

interface PointOfViewCapable {
  pointOfView(pov: GlobeCameraOrientation, ms: number): unknown;
}

/**
 * Applies a zoom factor to the current altitude, clamped to [min, max].
 * factor < 1 zooms in (moves closer); factor > 1 zooms out.
 */
export function applyZoomFactor(currentAltitude: number, factor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, currentAltitude * factor));
}

/**
 * Converts a world-space direction into the {lat, lng} react-globe.gl's pointOfView()
 * would place a camera at to sit along that exact direction from the globe center (the
 * camera always looks back at the center, so this is "where do I stand to look FROM
 * this direction," not "where do I look TOWARD"). Only the direction matters — vector
 * magnitude is ignored.
 *
 * This is the precise inverse of three-globe's own polar2Cartesian, reproduced from
 * (and verified line-for-line against) node_modules/three-globe/dist/three-globe.mjs's
 * cartesian2Polar — the scene's frame, the same convention as globeWorldToLatLng in
 * src/utils/globeCoordinates.ts. NOT globeLocalToLatLng, which is the globe mesh's own
 * frame, 90° of longitude away. (This comment once called that difference "a different
 * purpose — globe-surface overlay positioning"; overlays placed in the scene with it
 * were drawn 90° east of the truth. See globeCoordinates.ts.)
 */
export function directionToGlobeLatLng(direction: { x: number; y: number; z: number }): { lat: number; lng: number } {
  const r = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
  if (r < 1e-9) return { lat: 0, lng: 0 };
  const phi = Math.acos(direction.y / r);
  const theta = Math.atan2(direction.z, direction.x);
  const lat = 90 - (phi * 180) / Math.PI;
  const lng = 90 - (theta * 180) / Math.PI - (theta < -Math.PI / 2 ? 360 : 0);
  return { lat, lng };
}

/**
 * Real, confirmed root cause (read directly from node_modules/globe.gl/dist/
 * globe.gl.mjs): the imperative pointOfView() setter moves the THREE.js camera
 * directly and never touches the OrbitControls instance or fires its 'change'
 * event — the ONLY thing onZoom/globeCameraTelemetry is wired to. Every real
 * pointOfView() call site in Globe.tsx (zoom buttons, reset view, fly-to-location,
 * the dev snap-testing tool) previously left globeCameraTelemetry — and therefore
 * TinyGlobe's orientation marker and useCameraDetailTier's LOD tier — completely
 * frozen, even though the camera really moved. Only genuine user-driven drag/wheel
 * interaction (which goes through OrbitControls' own pointer handlers) ever updated
 * it. Verified live: 20 real "Zoom in" button clicks left globeCameraTelemetry.
 * getCurrent() null before this fix; after, it correctly reflects the real camera
 * position and the volcano-catalog LOD tier switches (400 -> 1214 markers)
 * correctly in both directions.
 *
 * Simplification: publishes the real target orientation immediately rather than
 * animating telemetry alongside an ms>0 transition tween — consumers jump to the
 * end state instead of smoothly tracking it mid-flight, a real improvement over
 * never updating at all, not a claim that it's frame-accurate during the transition.
 */
export function setGlobePointOfView(g: PointOfViewCapable, pov: GlobeCameraOrientation, ms: number): void {
  // Out of Sky from a place first (D5): the camera is the globe's again, and goes where it is sent, not over the place.
  if (solarScale() === 'sky') {
    closeWithoutLift();
    leaveSky();
  }
  g.pointOfView(pov, ms);
  globeCameraTelemetry.publish(pov);
}
