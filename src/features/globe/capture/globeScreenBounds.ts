/**
 * Where the globe actually is inside the frame.
 *
 * ─── WHY THIS IS NEEDED ────────────────────────────────────────────────────
 *
 * The first real capture from Phase 1 (1400x708) put the globe in roughly the
 * middle 40% of the frame width, with wide empty margins either side. That is
 * correct for a viewport — the globe sits in a centre column between HUD rails
 * — and poor for a published card, where the subject should fill the frame.
 *
 * Cropping needs the globe's pixel extent, and the naive guesses are both
 * wrong: "it's centred" fails as soon as `globeOffset` is set, and "it's a
 * fixed fraction" fails at every altitude and aspect ratio.
 *
 * ─── HOW, AND WHY NOT THE BOUNDING CUBE ────────────────────────────────────
 *
 * This first projected the eight corners of the sphere's bounding cube. That
 * provably contains the silhouette and is easy to argue about, and I chose it
 * over an analytic silhouette on the grounds that a tight one "would be
 * smaller but a mistake in it crops the Earth".
 *
 * Measured, the cube reports 607px for a globe whose silhouette is 453px — 34%
 * oversized, because a cube corner sits at R√3 from the centre. That margin is
 * not free breathing room. Padded by 12% and expanded to the card's 1.91
 * aspect it becomes a 1438px-wide box inside a 1400px frame, so the crop
 * clamps to the frame and does not crop at all. The first card composed by the
 * shipped pipeline showed the globe filling a third of its width with wide
 * black margins either side — the exact complaint at the top of this file,
 * produced by the function written to fix it. Found by looking at the PNG.
 *
 * So it uses the real silhouette, which is not a guess: for a sphere of radius
 * R seen from distance d, the points where the view ray grazes the surface
 * form a circle of radius R·√(d²−R²)/d, centred R²/d along the camera
 * direction. Those are points ON the sphere, so their projection IS its
 * outline — nothing is approximated except how finely the circle is sampled.
 *
 * Provably-contains is still the property worth having, so the sampling error
 * is corrected rather than hoped about: a polygon through N points is
 * INSCRIBED in the outline, inside it by at most a factor cos(π/N), and the
 * box is expanded by exactly that before being returned. At 256 samples the
 * correction is under a fiftieth of a pixel; it is applied anyway, because
 * "too small to matter" is the reasoning that produced the byte-size blank
 * check this feature already had to remove.
 *
 * The projection follows the convention already used by
 * features/globe/rendering/useModelScreenProjection: `Vector3.project(camera)`
 * to NDC, then NDC to pixels with y inverted. One convention, one place to be
 * wrong.
 */
import * as THREE from 'three';

export interface ScreenBounds {
  /** Pixel coordinates within the frame, origin top-left. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface BoundsTarget {
  camera(): THREE.Camera;
  getGlobeRadius(): number;
}

/**
 * How finely the silhouette circle is sampled.
 *
 * 256 is not tuning: it puts the inscription correction below at ~7.5e-5 of
 * the globe's screen radius — a fiftieth of a pixel at the sizes this runs at
 * — for 256 vector projections, once per capture.
 */
const SILHOUETTE_SAMPLES = 256;

export class GlobeBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlobeBoundsError';
  }
}

/**
 * The sphere's bounding box in pixels, for a frame of the given size.
 *
 * Returns bounds that may extend beyond the frame — that is real information
 * (the globe is partly off-screen at low altitude) and clamping it here would
 * hide it from the caller that has to decide what to do.
 */
export function computeGlobeScreenBounds(
  target: BoundsTarget,
  frame: { width: number; height: number },
): ScreenBounds {
  const camera = target.camera?.();
  const radius = target.getGlobeRadius?.();

  if (!camera) {
    throw new GlobeBoundsError('No camera — the globe has not initialised yet.');
  }
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
    throw new GlobeBoundsError(
      `getGlobeRadius() returned ${radius}, which cannot bound anything.`,
    );
  }
  if (!(frame.width > 0) || !(frame.height > 0)) {
    throw new GlobeBoundsError(
      `Frame is ${frame.width}x${frame.height}; bounds within a zero-area frame are meaningless.`,
    );
  }

  // three.js needs an up-to-date matrixWorldInverse before project(); the live
  // renderer keeps it current, but a capture may run between frames.
  camera.updateMatrixWorld();

  /*
   * ─── INSIDE THE GLOBE IS A REAL CASE AND IT NEEDS ITS OWN CHECK ──────────
   *
   * I first assumed the frustum test below would catch this. It does not: from
   * the centre, four of the eight cube corners still project in front of the
   * camera, so a box comes back and it looks reasonable. It bounds the corners
   * that happen to be visible, which is not the globe.
   *
   * A test written for the intent caught the gap. "Crop to the globe" has no
   * meaning from inside it — there is no silhouette, the surface surrounds the
   * viewer — so the condition is checked directly rather than inferred.
   */
  const distanceFromCentre = camera.position.length();
  if (distanceFromCentre < radius) {
    throw new GlobeBoundsError(
      `The camera is inside the globe (${distanceFromCentre.toFixed(1)} from centre, `
      + `radius ${radius}). There is no silhouette to crop to — and the arithmetic `
      + 'below agrees: the tangent circle\'s radius involves √(d²−R²), which is '
      + 'imaginary from in here. Checked directly rather than left to produce a NaN '
      + 'box that would propagate silently.',
    );
  }

  /*
   * The tangent circle — where the view rays graze the surface.
   *
   *   radius  R·√(d²−R²)/d        distance from centre  R²/d
   *
   * Its plane is perpendicular to the camera-to-centre axis, so e1/e2 below
   * span it. Every point on it is a point on the sphere.
   */
  const d = distanceFromCentre;
  const circleRadius = (radius * Math.sqrt(d * d - radius * radius)) / d;
  const axis = camera.position.clone().normalize();
  const centre = axis.clone().multiplyScalar((radius * radius) / d);

  // Any vector not parallel to the axis will seed the cross products; choosing
  // by the axis's own components keeps them well-conditioned at the poles.
  const seed = Math.abs(axis.x) < 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(axis, seed).normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let anyInFront = false;
  const point = new THREE.Vector3();

  for (let i = 0; i < SILHOUETTE_SAMPLES; i++) {
    const theta = (i / SILHOUETTE_SAMPLES) * Math.PI * 2;
    point.copy(centre)
      .addScaledVector(e1, Math.cos(theta) * circleRadius)
      .addScaledVector(e2, Math.sin(theta) * circleRadius);
    const ndc = point.project(camera);
    /*
     * z outside [-1, 1] means the point is behind the near plane or past the
     * far plane, where the perspective divide flips sign and the projected x/y
     * are meaningless. Such points are skipped rather than folded in —
     * including one silently produces bounds mirrored across the frame, which
     * looks like a plausible box and is not one.
     */
    if (ndc.z < -1 || ndc.z > 1) continue;
    anyInFront = true;
    const x = (ndc.x * 0.5 + 0.5) * frame.width;
    const y = (ndc.y * -0.5 + 0.5) * frame.height;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }

  if (!anyInFront) {
    throw new GlobeBoundsError(
      'Every point on the globe\'s silhouette projected outside the view frustum — '
      + 'the camera is facing away from the globe, so there is no box to crop to. '
      + '(Being inside the globe is checked separately above.)',
    );
  }

  /*
   * The correction that keeps "provably contains" true. A polygon through N
   * samples sits inside the outline; scaling it by 1/cos(π/N) about the centre
   * puts it outside. Applied to the box, using its own half-extent as the
   * bounding radius.
   */
  const gap = (1 / Math.cos(Math.PI / SILHOUETTE_SAMPLES)) - 1;
  const margin = (Math.max(maxX - minX, maxY - minY) / 2) * gap;
  minX -= margin; maxX += margin; minY -= margin; maxY += margin;

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Expand bounds to a target aspect ratio, growing the short axis around the
 * centre so nothing already inside is cropped out.
 *
 * Grow-only, deliberately. Fitting a 1400x708 capture into a 1200x630 card by
 * shrinking the box would trim the globe's edge, and an image that quietly
 * clips its subject is worse than one with margins.
 */
export function expandToAspect(bounds: ScreenBounds, aspect: number): ScreenBounds {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new GlobeBoundsError(`aspect must be a positive finite number, got ${aspect}`);
  }
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  let { width, height } = bounds;

  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  return {
    minX: cx - width / 2, maxX: cx + width / 2,
    minY: cy - height / 2, maxY: cy + height / 2,
    width, height,
  };
}

/**
 * Add a proportional margin on every side.
 *
 * ─── NOT OPTIONAL, AND 6% IS NOT ENOUGH ────────────────────────────────────
 *
 * computeGlobeScreenBounds bounds the SPHERE. What the globe renders is wider
 * than that: the atmosphere shader draws a glow beyond the surface, and it is
 * part of the image a viewer expects to see whole.
 *
 * Found by looking at a composed card rather than by any test — the geometry
 * was correct and the picture still had the glow shaved off along the bottom
 * edge. A test asserting containment of surface points cannot catch it, because
 * the glow is not on the sphere.
 *
 * So callers should pad by at least ~0.1. A smaller value crops something the
 * geometry never knew about.
 */
export function padBounds(bounds: ScreenBounds, fraction: number): ScreenBounds {
  if (!Number.isFinite(fraction) || fraction < 0) {
    throw new GlobeBoundsError(`padding fraction must be >= 0 and finite, got ${fraction}`);
  }
  const dx = bounds.width * fraction;
  const dy = bounds.height * fraction;
  return {
    minX: bounds.minX - dx, maxX: bounds.maxX + dx,
    minY: bounds.minY - dy, maxY: bounds.maxY + dy,
    width: bounds.width + dx * 2,
    height: bounds.height + dy * 2,
  };
}
