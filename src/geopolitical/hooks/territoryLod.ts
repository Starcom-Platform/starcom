/**
 * Which level of detail the borders and territories draw at, and when a slow frame steps it down (D-GV GV0.2).
 *
 * Two things chose the level, and fought. The watcher picked it from the camera's distance; a frame-budget check in
 * the hover loop stepped it down after 45 frames over 38 ms. That check counted a rebuild's own slow frames (the
 * parse, the triangulation, the cross-fade), so a rebuild caused the next, and the watcher climbed straight back:
 * three rebuilds in 2.5 s near altitude 1.6, each fetching the border topology again. Here a build's own frames are
 * not counted, and a step down holds as a ceiling for half a minute, which the watcher respects.
 *
 * Pure, so the hook's timing can be tested without a renderer.
 */

export type Lod = 0 | 1 | 2;

/** Camera distances where the levels meet: beyond t0 the coarsest, inside t1 the finest. */
export const LOD_THRESHOLDS = { t0: 350, t1: 200 } as const;

/** The level for a camera distance, keeping the current one within `hysteresis` of a boundary. */
export function pickLOD(distance: number, hysteresis: number, current: Lod | null): Lod {
  const { t0, t1 } = LOD_THRESHOLDS;
  if (current !== null) {
    if (current === 0 && distance > t0 - hysteresis) return 0;
    if (current === 1 && distance < t0 + hysteresis && distance > t1 - hysteresis) return 1;
    if (current === 2 && distance < t1 + hysteresis) return 2;
  }
  if (distance > t0) return 0;
  if (distance > t1) return 1;
  return 2;
}

/** A frame slower than this counts against the budget. */
export const SLOW_FRAME_MS = 38;
/** Net slow frames that step the level down. A fast frame takes two back. */
export const SLOW_FRAMES_TO_STEP = 45;
/** After a build lands, its fade and first frames are its own: not counted for this long. */
export const BUILD_SETTLE_MS = 1500;
/** A step down holds as a ceiling for this long, so the watcher cannot climb straight back. */
export const STEP_DOWN_HOLD_MS = 30_000;

export interface FrameBudget {
  slowFrames: number;
  /** Until when frames are not counted: a build's own. */
  quietUntil: number;
  /** The ceiling a step down set, and when it was set. */
  ceiling: Lod | null;
  ceilingSetAt: number;
}

export function createFrameBudget(): FrameBudget {
  return { slowFrames: 0, quietUntil: 0, ceiling: null, ceilingSetAt: -Infinity };
}

/** A build has landed: its settling frames are not the device's. */
export function noteBuildLanded(budget: FrameBudget, now: number): void {
  budget.quietUntil = now + BUILD_SETTLE_MS;
  budget.slowFrames = 0;
}

/**
 * Count one frame. Returns the level to step down to, or null. Nothing is counted while a build is under way or
 * settling, and nothing below the coarsest level.
 */
export function noteFrame(budget: FrameBudget, now: number, frameMs: number, current: Lod, building: boolean): Lod | null {
  if (building || now < budget.quietUntil) return null;
  budget.slowFrames = frameMs > SLOW_FRAME_MS ? budget.slowFrames + 1 : Math.max(0, budget.slowFrames - 2);
  if (budget.slowFrames < SLOW_FRAMES_TO_STEP || current === 0) return null;
  const down = (current - 1) as Lod;
  budget.slowFrames = 0;
  budget.ceiling = down;
  budget.ceilingSetAt = now;
  return down;
}

/** The ceiling a recent step down holds, or null once it has lapsed. */
export function ceilingAt(budget: FrameBudget, now: number): Lod | null {
  return budget.ceiling !== null && now - budget.ceilingSetAt < STEP_DOWN_HOLD_MS ? budget.ceiling : null;
}

/** The level the watcher wants: by distance, within the device's cap and any step-down ceiling. */
export function desiredLod(distance: number, hysteresis: number, current: Lod | null, deviceCap: Lod, budget: FrameBudget, now: number): Lod {
  const byDistance = pickLOD(distance, hysteresis, current);
  const ceiling = ceilingAt(budget, now);
  return Math.min(byDistance, deviceCap, ceiling ?? 2) as Lod;
}
