import * as THREE from 'three';

/**
 * The pick radius in WORLD units that corresponds to `radiusPx` on screen.
 *
 * A landing point's mark is drawn at a fixed size in pixels, so what a person sees to
 * click at is a fixed number of pixels — while raycaster.params.Points.threshold is in
 * world units. A constant there is wrong at every zoom but one: too tight when the
 * globe is far away (the visible dot is unclickable except dead centre) and absurdly
 * loose up close (a click picks a mark a country away).
 *
 * For a perspective camera the world height visible at distance d is 2·d·tan(fov/2),
 * so one pixel is that over the viewport's height in pixels. The distance used is the
 * camera's to the globe's centre, which is the scene origin here — marks near the limb
 * are nearer than that, making the radius slightly generous for them rather than
 * short, which is the right way round for picking.
 */
export function pickRadiusUnits(camera: THREE.Camera, viewportHeightPx: number, radiusPx: number): number {
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera || viewportHeightPx <= 0) return radiusPx;
  const distance = camera.position.length();
  const worldHeight = 2 * distance * Math.tan((perspective.fov * Math.PI) / 360);
  return (worldHeight / viewportHeightPx) * radiusPx;
}

/**
 * Whether a mark can be seen from the camera: the line from the camera to it clears the globe.
 *
 * three.js meets Points along the whole ray, through the Earth and out the far side, and nothing in a
 * pick stands in for the Earth: a hover at the globe's edge over Greenland named Fort Walton Beach,
 * Florida, beyond the horizon, and a click there opened it (D-DP step 5, on the build). A mark stands a
 * little above the surface, so it is seen a little past the surface's own horizon, as drawn.
 */
export function markIsVisible(point: THREE.Vector3, cameraPosition: THREE.Vector3, globeRadius: number): boolean {
  const along = point.clone().sub(cameraPosition);
  const lengthSq = along.lengthSq();
  if (lengthSq === 0) return true;
  // The point of the line from the camera to the mark nearest the Earth's centre.
  const t = Math.max(0, Math.min(1, -cameraPosition.dot(along) / lengthSq));
  return cameraPosition.clone().addScaledVector(along, t).length() >= globeRadius;
}

/**
 * The hits a pick may answer: those seen from the camera. A Points hit is judged by its mark's own
 * place, not by where the ray passed it; any other hit by the point the ray met. A mark folded under
 * another (glyphDeclutter.ts) answers nothing: the one drawn over it hovers and opens it.
 */
export function visibleHits(hits: readonly THREE.Intersection[], cameraPosition: THREE.Vector3, globeRadius: number): THREE.Intersection[] {
  return hits.filter((hit) => {
    let at = hit.point;
    if (hit.object instanceof THREE.Points && hit.index !== undefined) {
      const shown = hit.object.geometry.getAttribute('markShown');
      if (shown && hit.index < shown.count && shown.getX(hit.index) < 0.5) return false;
      const position = hit.object.geometry.getAttribute('position');
      if (position && hit.index < position.count) {
        at = hit.object.localToWorld(new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, hit.index));
      }
    }
    return markIsVisible(at, cameraPosition, globeRadius);
  });
}
