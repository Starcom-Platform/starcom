/**
 * useGlobeCameraNear — the camera's near and far planes, how close and how far the
 * controls may take it, and how fast they move it out there, set once the globe exists.
 * CAMERA_NEAR and CAMERA_REACH in globeAltitudes.ts say why.
 *
 * globe.gl sets the planes and distances at startup (near 0.05; minimum distance the
 * globe radius plus 1.1 × near; maximum 10,000), and sets the sky's radius, from which
 * three-render-objects sets the far plane (125,000) in an update that can land after
 * this hook has run: measured in the running build, the far plane was back at 125,000
 * and the Sun, 119,000 out, was cut away. So the far plane and the reach are held at
 * every render, and the near plane follows the camera's distance there, before the
 * frustum is set, so a card or clip frame drawn through the camera gets them too.
 *
 * ─── HOW FAST THE CONTROLS MOVE ────────────────────────────────────────────
 *
 * At every move globe.gl sets the controls' speeds by altitude: a drag turns the view by
 * altitude × 0.3 and a wheel step zooms by √altitude × 0.5, so the ground under the
 * cursor keeps pace as the globe shrinks. Out at the solar system that runs away: at
 * the farthest reach a pixel dragged would turn the view five times round and one wheel
 * step would jump 28-fold, past every planet. Capped from where the globe is already
 * small, a drag from altitude 5 and the wheel from altitude 100, so every view near it
 * moves as before; from the default view to the farthest reach is then about 58 steps.
 */
import { useEffect, type RefObject } from 'react';
import type * as THREE from 'three';
import { CAMERA_NEAR, cameraNearAt } from '../globeAltitudes';
import { cameraFarNow, cameraReachNow } from '../../../solar-system/solarScale';
import { onSceneRender } from '../../../globe-engine/sceneRenderHooks';

const GLOBE_RADIUS_UNITS = 100;
const POLL_MS = 250;
/** A drag turns the view at most one and a half times round per height of the view. */
export const ROTATE_SPEED_CAP = 1.5;
/** A wheel step zooms at most 1.29-fold. */
export const ZOOM_SPEED_CAP = 5;

type Camera = { near: number; far: number; position: { length: () => number }; updateProjectionMatrix: () => void };
type Controls = {
  minDistance: number;
  maxDistance: number;
  rotateSpeed: number;
  zoomSpeed: number;
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
};
type WithCamera = { camera?: () => Camera; controls?: () => Controls; scene?: () => THREE.Scene };

/** Puts the near plane where it belongs for the camera's distance, and the far plane where the scale in force needs it (OR9). */
function followCamera(camera: Camera): void {
  const near = cameraNearAt(camera.position.length());
  const far = cameraFarNow();
  if (camera.near === near && camera.far === far) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

/** Holds the controls' speeds under their caps; see "How fast the controls move". */
function capSpeedsOf(controls: Controls): void {
  controls.rotateSpeed = Math.min(controls.rotateSpeed, ROTATE_SPEED_CAP);
  controls.zoomSpeed = Math.min(controls.zoomSpeed, ZOOM_SPEED_CAP);
}

export function useGlobeCameraNear(globeRef: RefObject<unknown>): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let leave: (() => void) | undefined;
    let stopCapping: (() => void) | undefined;
    const apply = () => {
      if (cancelled) return;
      const globe = globeRef.current as WithCamera | null;
      const camera = globe?.camera?.();
      const controls = globe?.controls?.();
      if (!camera || !controls) {
        timer = setTimeout(apply, POLL_MS);
        return;
      }
      const capSpeeds = () => capSpeedsOf(controls);
      // globe.gl's own rule, so zooming in cannot carry the surface inside the near plane.
      controls.minDistance = Math.max(controls.minDistance, GLOBE_RADIUS_UNITS + CAMERA_NEAR * 1.1);
      controls.maxDistance = cameraReachNow();
      // After globe.gl's own listener, which was added first, so these have the last word.
      controls.addEventListener('change', capSpeeds);
      stopCapping = () => controls.removeEventListener('change', capSpeeds);
      camera.far = cameraFarNow();
      camera.near = cameraNearAt(camera.position.length());
      camera.updateProjectionMatrix();
      const scene = globe?.scene?.();
      if (scene) leave = onSceneRender(scene, (_renderer, drawnThrough) => {
        // The reach glides with the scale (OR9, OR31): out to Neptune at True.
        controls.maxDistance = cameraReachNow();
        if ((drawnThrough as THREE.PerspectiveCamera).isPerspectiveCamera) followCamera(drawnThrough as unknown as Camera);
      });
    };
    apply();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      leave?.();
      stopCapping?.();
    };
  }, [globeRef]);
}
