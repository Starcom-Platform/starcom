/**
 * How precisely a click on the globe gives a place (plan item 0.11).
 *
 * A click lands within a few pixels of where it was meant, and a pixel covers
 * more ground the higher the camera is. So the precision is the ground under
 * a few pixels at the camera's altitude, snapped up to a step the report form
 * offers. Measured from the point under the camera: a click toward the limb
 * covers more ground still, so this is the best the click can be, not worse.
 */
import { snapPrecisionUp } from '../../services/intel/placePrecision';

const EARTH_RADIUS_M = 6_371_000;

/** How far off a click may land, in pixels. */
export const CLICK_PIXELS = 5;

export function clickPrecisionM(view: {
  /** The camera's distance from the globe's centre, in scene units. */
  cameraDistance: number;
  globeRadius: number;
  fovDeg: number;
  viewportHeightPx: number;
}): number {
  const altitudeM = Math.max(0, view.cameraDistance - view.globeRadius) * (EARTH_RADIUS_M / view.globeRadius);
  const groundInViewM = 2 * altitudeM * Math.tan((view.fovDeg * Math.PI) / 360);
  const perPixelM = groundInViewM / Math.max(1, view.viewportHeightPx);
  return snapPrecisionUp(perPixelM * CLICK_PIXELS);
}
