/**
 * A camera path through time — the one track a clip may drive.
 *
 * ─── WHY KEYFRAMES FROM THE START ──────────────────────────────────────────
 *
 * The first version of this could have been "pan from A to B". But a pan is
 * just a path with two keyframes, and anything shipped as a two-point API
 * becomes a second API the moment someone wants a third point — which, for a
 * clip that orbits a region and then pulls back, is immediately. So the track
 * is keyframes, and a pan is the simplest case of it.
 *
 * clipProvenance's rule is that state may change during a clip only if a
 * declared track drives it. This is that track for the camera, and the
 * `ClipTrack` union there is where a data-over-time track joins it.
 *
 * ─── THREE INTERPOLATION DECISIONS, EACH FOR A REASON ──────────────────────
 *
 * Longitude takes the SHORTER arc. Linear interpolation from 170°E to 170°W
 * would sweep 340° west across the whole planet to travel 20° east — a clip
 * that spins the globe is not a subtle defect.
 *
 * Altitude interpolates GEOMETRICALLY. Zooming from 2.5 to 0.5 radii linearly
 * spends most of its time far out and then lunges at the surface; a ratio per
 * unit time is what the eye reads as a steady zoom.
 *
 * Each segment eases in and out (smoothstep), so the camera arrives at a
 * keyframe rather than bouncing off it. Uniform speed through a keyframe
 * reads as a jolt.
 */

export interface CameraPose {
  lat: number;
  lng: number;
  /** Globe radii above the surface, as react-globe.gl reports it. */
  altitude: number;
}

export interface CameraKeyframe extends CameraPose {
  /** Offset from the start of the clip. */
  atMs: number;
}

export interface CameraTrack {
  durationMs: number;
  keyframes: CameraKeyframe[];
  /** The pose at a moment of the clip. Clamped to [0, durationMs]. */
  at(tMs: number): CameraPose;
}

export class CameraTrackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraTrackError';
  }
}

/** Signed degrees from `from` to `to` along the shorter arc, in (-180, 180]. */
export function signedLonDelta(from: number, to: number): number {
  const d = ((to - from + 540) % 360) - 180;
  // (540 % 360) - 180 maps an exact half-turn to -180; either direction is
  // equally short there, and a positive half-turn reads less surprisingly.
  return d === -180 ? 180 : d;
}

const normaliseLng = (lng: number) => ((lng + 540) % 360) - 180;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export function buildCameraTrack(keyframes: CameraKeyframe[]): CameraTrack {
  if (keyframes.length < 2) {
    throw new CameraTrackError(
      `A track needs at least two keyframes, got ${keyframes.length}. One pose is a still, and `
      + 'recording a still as a clip would spend frames saying nothing.',
    );
  }
  if (keyframes[0].atMs !== 0) {
    throw new CameraTrackError(
      `The first keyframe must be at 0ms, got ${keyframes[0].atMs}. Otherwise the clip has an `
      + 'opening span with no defined camera, which the recorder would have to invent.',
    );
  }
  for (let i = 0; i < keyframes.length; i++) {
    const k = keyframes[i];
    if (![k.lat, k.lng, k.altitude, k.atMs].every(Number.isFinite)) {
      throw new CameraTrackError(`Keyframe ${i} has a non-finite value.`);
    }
    if (k.lat < -90 || k.lat > 90) throw new CameraTrackError(`Keyframe ${i} latitude ${k.lat} is off the planet.`);
    if (!(k.altitude > 0)) {
      throw new CameraTrackError(
        `Keyframe ${i} altitude ${k.altitude} must be above the surface — at or below it there is `
        + 'no globe to film, and geometric interpolation toward zero is undefined.',
      );
    }
    if (i > 0 && !(k.atMs > keyframes[i - 1].atMs)) {
      throw new CameraTrackError(
        `Keyframe ${i} at ${k.atMs}ms does not come after keyframe ${i - 1} at ${keyframes[i - 1].atMs}ms.`,
      );
    }
  }

  const durationMs = keyframes[keyframes.length - 1].atMs;

  const at = (tMs: number): CameraPose => {
    const t = Math.min(Math.max(tMs, 0), durationMs);
    let i = 0;
    while (i < keyframes.length - 2 && t > keyframes[i + 1].atMs) i++;
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const s = smoothstep((t - a.atMs) / (b.atMs - a.atMs));
    return {
      lat: a.lat + (b.lat - a.lat) * s,
      lng: normaliseLng(a.lng + signedLonDelta(a.lng, b.lng) * s),
      altitude: a.altitude * Math.pow(b.altitude / a.altitude, s),
    };
  };

  return { durationMs, keyframes, at };
}
