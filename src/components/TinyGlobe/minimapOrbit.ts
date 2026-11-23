/**
 * Where the mini-globe's camera is at a moment (decision D-MG, mini-globe.md; MG2, MG3, MG5, MG7).
 *
 * It orbits once every 90 s, its longitude falling, so the planet seems to turn west to east under it
 * as Earth does, at the latitude of the view it last faced. When the main globe's view moves it turns
 * to face it, the shorter way round, holds it 8 s, then orbits on from there. Hovering stops it where it
 * is, and leaving goes on from there, turning first to any view the main globe moved to meanwhile.
 * With reduced motion it never orbits or turns: it faces the main view.
 *
 * Pure, on the clock it is given: the component calls `pose(now)` each frame.
 */
export const ORBIT_PERIOD_MS = 90_000;
/** How long a turn to the main view takes. */
export const TURN_MS = 1_200;
/** How long the main view is held before the orbit goes on. */
export const HOLD_MS = 8_000;
/** How far the main view must move, in degrees of arc, to be turned to again. */
export const MOVED_DEG = 1;
/** Where it orbits from before the main view is known. */
const HOME: Pose = { lat: 20, lng: 0 };

export interface Pose {
  lat: number;
  lng: number;
}

type Motion =
  | { kind: 'turning'; from: Pose; to: Pose; at: number }
  | { kind: 'holding'; to: Pose; at: number }
  | { kind: 'orbiting'; from: Pose; at: number };

const DEG = Math.PI / 180;
const wrap = (lng: number) => ((lng + 540) % 360) - 180;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Degrees of arc between two places. */
function arcDeg(a: Pose, b: Pose): number {
  const cos = Math.sin(a.lat * DEG) * Math.sin(b.lat * DEG) + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lng - a.lng) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

export class MinimapOrbit {
  private readonly reducedMotion: boolean;
  private motion: Motion = { kind: 'orbiting', from: HOME, at: 0 };
  /** The main view last faced, or turned to. */
  private target: Pose | null = null;
  /** While hovered: where it stopped, when, and the main view it has not yet turned to. */
  private paused: { pose: Pose; at: number; pending: Pose | null } | null = null;

  constructor({ reducedMotion }: { reducedMotion: boolean }) {
    this.reducedMotion = reducedMotion;
  }

  /** The main globe's view, as its camera telemetry gives it. */
  view(at: Pose, nowMs: number): void {
    if (this.paused) {
      this.paused.pending = at;
      return;
    }
    if (this.target && arcDeg(this.target, at) < MOVED_DEG) return;
    const first = this.target === null;
    this.target = at;
    // The first view, and every view with reduced motion, is faced at once.
    this.motion = first || this.reducedMotion
      ? { kind: 'holding', to: at, at: nowMs }
      : { kind: 'turning', from: this.pose(nowMs), to: at, at: nowMs };
  }

  /** The pointer over the mini-globe, or off it. */
  hover(over: boolean, nowMs: number): void {
    if (over && !this.paused) {
      this.paused = { pose: this.pose(nowMs), at: nowMs, pending: null };
      return;
    }
    if (over || !this.paused) return;
    const { pose, at, pending } = this.paused;
    this.paused = null;
    // Time stood still while hovered: every motion goes on from where it stopped.
    this.motion = { ...this.motion, at: this.motion.at + (nowMs - at) };
    if (pending && (!this.target || arcDeg(this.target, pending) >= MOVED_DEG)) {
      this.target = pending;
      this.motion = this.reducedMotion
        ? { kind: 'holding', to: pending, at: nowMs }
        : { kind: 'turning', from: pose, to: pending, at: nowMs };
    }
  }

  /** Where the camera looks at `nowMs`. */
  pose(nowMs: number): Pose {
    if (this.paused) return this.paused.pose;
    const motion = this.motion;
    if (this.reducedMotion) return motion.kind === 'orbiting' ? motion.from : motion.to;
    if (motion.kind === 'turning') {
      const t = (nowMs - motion.at) / TURN_MS;
      if (t >= 1) {
        this.motion = { kind: 'holding', to: motion.to, at: motion.at + TURN_MS };
        return this.pose(nowMs);
      }
      const k = smooth(Math.max(0, t));
      const dLng = wrap(motion.to.lng - motion.from.lng);
      return { lat: motion.from.lat + (motion.to.lat - motion.from.lat) * k, lng: wrap(motion.from.lng + dLng * k) };
    }
    if (motion.kind === 'holding') {
      if (nowMs - motion.at < HOLD_MS) return motion.to;
      this.motion = { kind: 'orbiting', from: motion.to, at: motion.at + HOLD_MS };
      return this.pose(nowMs);
    }
    return { lat: motion.from.lat, lng: wrap(motion.from.lng - ((nowMs - motion.at) * 360) / ORBIT_PERIOD_MS) };
  }
}
