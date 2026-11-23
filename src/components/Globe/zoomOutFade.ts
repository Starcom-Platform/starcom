/**
 * Marks fade as the Earth shrinks on screen (block G, item 1; critique audit
 * section 1.3).
 *
 * Every mark is a fixed number of screen pixels: `gl_PointSize` in CSS pixels, so a
 * mark reads the same at any zoom. Zoomed out, that turned against them. The Earth
 * shrank and its marks did not, so a few hundred of them blanketed a disc smaller
 * than their own spread and outgrew the planet they stood on.
 *
 * One measure decides, for every layer: how large the Earth looks, its radius on
 * screen in CSS pixels. Marks are whole while it is at least ZOOM_FADE_FULL_PX,
 * which keeps every view a person uses and every card (the default view puts it near
 * 290 px, a card's closest near 560), and gone once it is down to ZOOM_FADE_GONE_PX,
 * where even one mark is a tenth of the disc. A mark that has all but faded no longer
 * answers a hover either: what cannot be seen is not there to point at.
 */
import * as THREE from 'three';

/** The globe's radius in scene units: every mark sits on or above a sphere this size. */
export const GLOBE_RADIUS = 100;
/** Marks are whole while the Earth's radius on screen is at least this, in CSS pixels. */
export const ZOOM_FADE_FULL_PX = 120;
/** And gone once it is this small. */
export const ZOOM_FADE_GONE_PX = 40;
/** A mark drawn at or below this share no longer answers a hover. */
const PICKABLE_ABOVE = 0.05;

/**
 * The Earth's radius on screen in CSS pixels, seen from `distance` scene units off its
 * centre through a vertical field of view of `fovDeg` degrees over `viewportHeight` CSS
 * pixels. Unbounded from inside the globe.
 */
export function earthRadiusOnScreen(distance: number, fovDeg: number, viewportHeight: number, radius = GLOBE_RADIUS): number {
  if (distance <= radius) return Infinity;
  const angular = Math.asin(radius / distance);
  return (Math.tan(angular) / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)) * (viewportHeight / 2);
}

/** How much of a mark is drawn when the Earth's radius on screen is `px`: whole, gone, or smoothly between. */
export function zoomOutFade(px: number): number {
  const t = THREE.MathUtils.clamp((px - ZOOM_FADE_GONE_PX) / (ZOOM_FADE_FULL_PX - ZOOM_FADE_GONE_PX), 0, 1);
  return t * t * (3 - 2 * t);
}

const centre = new THREE.Vector3();
const eye = new THREE.Vector3();
const size = new THREE.Vector2();

/**
 * The fade for marks drawn by `renderer` through `camera`, read where each mark
 * layer reads its pixel ratio: in `onBeforeRender`, every frame, at no cost while a
 * layer is off. A layer's marks sit on a sphere round their object's origin (the
 * shaders derive each mark's normal from it), so that origin is the Earth's centre.
 */
export function zoomOutFadeFor(renderer: THREE.WebGLRenderer, camera: THREE.Camera | null | undefined, object: THREE.Object3D): number {
  const perspective = camera as THREE.PerspectiveCamera | null | undefined;
  if (!perspective?.isPerspectiveCamera) return 1;
  centre.setFromMatrixPosition(object.matrixWorld);
  eye.setFromMatrixPosition(perspective.matrixWorld);
  const distance = eye.distanceTo(centre);
  // From inside the globe the Earth fills the view.
  if (distance <= GLOBE_RADIUS) return 1;
  renderer.getSize(size);
  return zoomOutFade(earthRadiusOnScreen(distance, perspective.fov, size.y));
}

/**
 * How much of the solar system is drawn through `camera` (decision K6, SS3): none while
 * the Earth's marks are whole, so close-up work costs nothing; all of it once they are
 * gone; and between, as they fade, one giving way to the other. Measured from the
 * Earth's centre, the scene's origin, where the solar system is drawn around.
 */
export function solarSystemShownFor(renderer: THREE.WebGLRenderer, camera: THREE.Camera | null | undefined): number {
  const perspective = camera as THREE.PerspectiveCamera | null | undefined;
  if (!perspective?.isPerspectiveCamera) return 0;
  eye.setFromMatrixPosition(perspective.matrixWorld);
  const distance = eye.length();
  if (distance <= GLOBE_RADIUS) return 0;
  renderer.getSize(size);
  return 1 - zoomOutFade(earthRadiusOnScreen(distance, perspective.fov, size.y));
}

/** Whether a mark has faded all but away, and so may not answer a hover. */
export function fadedOut(object: THREE.Object3D): boolean {
  const material = (object as THREE.Points).material as THREE.ShaderMaterial | undefined;
  const fade = material?.uniforms?.zoomFade?.value;
  return typeof fade === 'number' && fade <= PICKABLE_ABOVE;
}
