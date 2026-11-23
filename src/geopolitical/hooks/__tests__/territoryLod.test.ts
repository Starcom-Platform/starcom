/**
 * The level of detail settles instead of flapping (D-GV GV0.2).
 *
 * Near altitude 1.6 the borders rebuilt three times in 2.5 s: a frame-budget check counted a rebuild's own slow
 * frames and stepped down, and the distance watcher climbed straight back.
 */
import { describe, it, expect } from 'vitest';
import {
  pickLOD, createFrameBudget, noteFrame, noteBuildLanded, ceilingAt, desiredLod,
  SLOW_FRAMES_TO_STEP, BUILD_SETTLE_MS, STEP_DOWN_HOLD_MS, LOD_THRESHOLDS,
} from '../territoryLod';

/** Feed `count` frames of `frameMs`, a frame every 16 ms from `from`, and return what they asked for. */
function frames(budget: ReturnType<typeof createFrameBudget>, count: number, frameMs: number, current: 0 | 1 | 2, from: number, building = false) {
  const asked: number[] = [];
  for (let i = 0; i < count; i++) {
    const down = noteFrame(budget, from + i * 16, frameMs, current, building);
    if (down !== null) asked.push(down);
  }
  return asked;
}

describe('the level by distance', () => {
  it('keeps the current level inside its hysteresis, and picks by distance alone at first', () => {
    // Altitude 1.6 is distance 260: inside level 1's band.
    expect(pickLOD(260, 25, null)).toBe(1);
    expect(pickLOD(260, 25, 0)).toBe(1);
    expect(pickLOD(LOD_THRESHOLDS.t0 - 10, 25, 0)).toBe(0);
    expect(pickLOD(LOD_THRESHOLDS.t0 + 10, 25, 1)).toBe(1);
    expect(pickLOD(LOD_THRESHOLDS.t1 + 10, 25, 2)).toBe(2);
    expect(pickLOD(500, 25, null)).toBe(0);
    expect(pickLOD(150, 25, null)).toBe(2);
  });
});

describe('the frame budget', () => {
  it('steps down once after sustained slow frames, and not before', () => {
    const budget = createFrameBudget();
    expect(frames(budget, SLOW_FRAMES_TO_STEP - 1, 60, 2, 0)).toEqual([]);
    expect(frames(budget, 1, 60, 2, 10_000)).toEqual([1]);
  });

  it('never counts a build\'s own frames, while it runs or while it settles', () => {
    const budget = createFrameBudget();
    expect(frames(budget, 200, 90, 2, 0, true)).toEqual([]);
    noteBuildLanded(budget, 5_000);
    expect(frames(budget, Math.floor(BUILD_SETTLE_MS / 16) - 1, 90, 2, 5_000)).toEqual([]);
    expect(budget.slowFrames).toBe(0);
  });

  it('lets fast frames take slow ones back, so a stutter does not step down', () => {
    const budget = createFrameBudget();
    for (let i = 0; i < 300; i++) noteFrame(budget, i * 16, i % 2 === 0 ? 60 : 10, 2, false);
    expect(budget.ceiling).toBeNull();
  });

  it('does not step below the coarsest level', () => {
    const budget = createFrameBudget();
    expect(frames(budget, 500, 90, 0, 0)).toEqual([]);
  });
});

describe('the watcher within a step-down ceiling', () => {
  it('holds the ceiling for half a minute, so the watcher does not climb straight back', () => {
    const budget = createFrameBudget();
    frames(budget, SLOW_FRAMES_TO_STEP, 60, 1, 0);
    const steppedAt = budget.ceilingSetAt;
    expect(ceilingAt(budget, steppedAt + 1_000)).toBe(0);
    // Distance 260 wants level 1; the ceiling keeps it at 0 until it lapses.
    expect(desiredLod(260, 25, 0, 2, budget, steppedAt + 2_500)).toBe(0);
    expect(desiredLod(260, 25, 0, 2, budget, steppedAt + STEP_DOWN_HOLD_MS - 1)).toBe(0);
    expect(desiredLod(260, 25, 0, 2, budget, steppedAt + STEP_DOWN_HOLD_MS)).toBe(1);
  });

  it('never goes finer than the device allows', () => {
    expect(desiredLod(150, 25, null, 1, createFrameBudget(), 0)).toBe(1);
    expect(desiredLod(150, 25, null, 0, createFrameBudget(), 0)).toBe(0);
  });

  it('rebuilds once, not three times, in the 2.5 s near altitude 1.6 that used to flap', () => {
    // The old loop: a step down from 1 to 0 under a rebuild's own slow frames, then the climb back, then again.
    const budget = createFrameBudget();
    let current: 0 | 1 | 2 = 1;
    let rebuilds = 0;
    for (let t = 0; t < 2_500; t += 16) {
      const building = false;
      const down = noteFrame(budget, t, 60, current, building);
      if (down !== null) { current = down; rebuilds++; noteBuildLanded(budget, t); continue; }
      if (t % 750 < 16) {
        const want = desiredLod(260, 25, current, 2, budget, t);
        if (want !== current) { current = want; rebuilds++; noteBuildLanded(budget, t); }
      }
    }
    expect(rebuilds).toBeLessThanOrEqual(1);
    expect(current).toBe(0);
  });
});
