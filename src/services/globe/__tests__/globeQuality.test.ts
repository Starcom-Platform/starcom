import { describe, it, expect, beforeEach } from 'vitest';
import {
  nextGovernorState, INITIAL_GOVERNOR_STATE, GOVERNOR, LOWEST_STEP, QUALITY_STEPS,
  getGlobeQuality, setGlobeQualitySetting, reportFrameWindow, subscribeGlobeQuality, SETTLE_WINDOWS,
  resetGlobeQualityForTests, qualityStepOf, describeGlobeQuality, setGlobeBloomInUse, setGlobeHatchingInUse,
  holdFullDetail, fullDetailHeld,
  type GovernorState,
} from '../globeQuality';

let clock = 0;
const win = (medianMs: number, frames = 60) => ({ medianMs, frames, at: (clock += 2000) });
const run = (state: GovernorState, windows: number[], dpr = 2, bloomInUse = false, hatchingInUse = false, zonesInUse = false, planesInUse = false) =>
  windows.reduce((s, ms) => nextGovernorState(s, win(ms), dpr, bloomInUse, hatchingInUse, zonesInUse, planesInUse), state);
/** A step by what it gives up, so the tests read the same however many steps there are. */
const stepNamed = (name: string) => {
  const index = QUALITY_STEPS.findIndex((step) => step.name === name);
  if (index < 0) throw new Error(`no step named ${name}`);
  return index;
};
const NO_GLOW = stepNamed('no glow, hatching or orbit rings');
const SOFTER = stepNamed('softer edges');
const NO_CLOUDS = stepNamed('no clouds');

beforeEach(() => { clock = 0; });

describe('auto stepping down', () => {
  it('steps down after two slow windows, and keeps the step when frames got faster', () => {
    const afterSlow = run(INITIAL_GOVERNOR_STATE, [40, 40]);
    expect(afterSlow.step).toBe(SOFTER);
    expect(afterSlow.reason).toMatch(/40 ms/);

    const afterTrial = run(afterSlow, [30, 30]);
    expect(afterTrial.step).toBe(SOFTER);
    expect(afterTrial.trial).toBeNull();
    expect(afterTrial.cappedAtMs).toBeNull();
  });

  it('does not act on one slow window', () => {
    expect(run(INITIAL_GOVERNOR_STATE, [40]).step).toBe(0);
    expect(run(INITIAL_GOVERNOR_STATE, [40, 20, 40]).step).toBe(0);
  });

  it('puts detail back and holds when drawing less did not make frames faster', () => {
    // A 30-frames-a-second cap: every window reads 33 ms whatever is drawn.
    const capped = run(INITIAL_GOVERNOR_STATE, [33, 33, 33, 33]);
    expect(capped.step).toBe(0);
    expect(capped.cappedAtMs).toBe(33);
    expect(capped.reason).toBe('dropping to softer edges did not make frames faster (still near 33 ms), so it went back');

    // And it stays at full detail rather than ratcheting down to its plainest.
    expect(run(capped, Array(20).fill(33)).step).toBe(0);
  });

  it('starts stepping again when a capped device gets genuinely worse', () => {
    const capped = run(INITIAL_GOVERNOR_STATE, [33, 33, 33, 33]);
    const worse = run(capped, [60, 60]);
    expect(worse.cappedAtMs).toBeNull();
    expect(worse.step).toBe(SOFTER);
  });

  it('skips a step that draws the same picture on this screen', () => {
    // On a 1× display "softer edges" changes nothing; trialling it would look like a cap.
    const oneX = run(INITIAL_GOVERNOR_STATE, [40, 40], 1);
    expect(oneX.step).toBe(NO_CLOUDS);
    expect(QUALITY_STEPS[oneX.step].clouds).toBe(false);
  });

  it('drops the glow round the Sun first, while the Sun is drawn (K6, SS2)', () => {
    const glowing = run(INITIAL_GOVERNOR_STATE, [40, 40], 2, true);
    expect(glowing.step).toBe(NO_GLOW);
    expect(QUALITY_STEPS[glowing.step].bloom).toBe(false);
    expect(QUALITY_STEPS[glowing.step].maxPixelRatio).toBe(QUALITY_STEPS[0].maxPixelRatio);
  });

  it('passes over the glow while no Sun is drawn, where dropping it would look like a cap', () => {
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 2, false).step).toBe(SOFTER);
  });

  // War & Conflict's hatching is given up first, with the glow (theatre-lens.md, TL5).
  it('drops the hatching first, while War & Conflict hatches, and passes over it while it does not', () => {
    expect(QUALITY_STEPS.filter((step) => step.hatching).map((step) => step.name)).toEqual(['full detail']);
    const hatching = run(INITIAL_GOVERNOR_STATE, [40, 40], 2, false, true);
    expect(hatching.step).toBe(NO_GLOW);
    expect(QUALITY_STEPS[hatching.step].hatching).toBe(false);
    expect(QUALITY_STEPS[hatching.step].maxPixelRatio).toBe(QUALITY_STEPS[0].maxPixelRatio);
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 2, false, false).step).toBe(SOFTER);
  });

  // Zones' Sector lines simpler from "softer edges" on (D-ZR; the owner, 2026-10-18: where it lags, step detail down).
  it('draws a partition\'s Sector lines simpler from softer edges on; on a 1× display it stops there while Zones are drawn', () => {
    expect(QUALITY_STEPS.filter((step) => !step.simpleSectorLines).map((step) => step.name)).toEqual(['full detail', 'no glow, hatching or orbit rings']);
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 1, false, false, true).step).toBe(SOFTER);
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 1).step).toBe(NO_CLOUDS);
  });

  // The satellites' plane rings, given up with the glow (the owner, 2026-10-24); the satellites never are.
  it('gives the plane rings up with the glow, a step that counts only while Satellites draws them', () => {
    expect(QUALITY_STEPS.filter((step) => step.planeRings).map((step) => step.name)).toEqual(['full detail']);
    // On a 2× display with no Sun and no hatching, the rings are what the first step down changes.
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 2, false, false, false, true).step).toBe(NO_GLOW);
    expect(run(INITIAL_GOVERNOR_STATE, [40, 40], 2).step).toBe(SOFTER);
  });

  it('stops at the lowest step and says so', () => {
    const lowest: GovernorState = { ...INITIAL_GOVERNOR_STATE, step: LOWEST_STEP };
    const after = run(lowest, [80, 80]);
    expect(after.step).toBe(LOWEST_STEP);
    expect(after.reason).toMatch(/lowest step/);
  });
});

describe('auto stepping back up', () => {
  it('brings detail back only after sustained fast frames', () => {
    const reduced: GovernorState = { ...INITIAL_GOVERNOR_STATE, step: NO_CLOUDS };
    expect(run(reduced, Array(GOVERNOR.fastWindowsToStep - 1).fill(15)).step).toBe(NO_CLOUDS);
    expect(run(reduced, Array(GOVERNOR.fastWindowsToStep).fill(15)).step).toBe(SOFTER);
  });

  it('brings the glow back with full detail, the two drawing the same while no Sun is drawn', () => {
    const softer: GovernorState = { ...INITIAL_GOVERNOR_STATE, step: SOFTER };
    expect(run(softer, Array(GOVERNOR.fastWindowsToStep).fill(15), 2, false).step).toBe(0);
    // While the Sun is drawn, the glow is a step of its own; and while War & Conflict hatches, so is the hatching.
    expect(run(softer, Array(GOVERNOR.fastWindowsToStep).fill(15), 2, true).step).toBe(NO_GLOW);
    expect(run(softer, Array(GOVERNOR.fastWindowsToStep).fill(15), 2, false, true).step).toBe(NO_GLOW);
  });

  it('does not return to a step that proved too slow soon after coming back', () => {
    const reduced: GovernorState = { ...INITIAL_GOVERNOR_STATE, step: NO_CLOUDS };
    const cameBack = run(reduced, Array(8).fill(15));
    expect(cameBack.step).toBe(SOFTER);

    const relapsed = run(cameBack, [40, 40, 20, 20]);
    expect(relapsed.step).toBe(NO_CLOUDS);
    expect(relapsed.floor).toBe(NO_CLOUDS);

    expect(run(relapsed, Array(30).fill(15)).step).toBe(NO_CLOUDS);
  });

  it('holds between the two thresholds', () => {
    const reduced: GovernorState = { ...INITIAL_GOVERNOR_STATE, step: SOFTER };
    expect(run(reduced, Array(30).fill(21)).step).toBe(SOFTER);
  });
});

describe('what is not a measurement', () => {
  it('measures a device drawing only a few frames a window, because that is the slow device', () => {
    // 6 frames a second is 12 in a two-second window, which a minimum of 20 threw away.
    const twelve = [166, 166].reduce(
      (st) => nextGovernorState(st, { medianMs: 166, frames: 12, at: (clock += 2000) }, 2),
      INITIAL_GOVERNOR_STATE,
    );
    expect(twelve.step).toBe(SOFTER);
  });

  it('ignores a window with no median to take', () => {
    const state = { ...INITIAL_GOVERNOR_STATE, slow: 1 };
    expect(nextGovernorState(state, { medianMs: 500, frames: 1, at: 1 }, 2)).toBe(state);
    expect(nextGovernorState(state, { medianMs: Number.NaN, frames: 60, at: 1 }, 2)).toBe(state);
  });
});

describe('the setting', () => {
  beforeEach(() => {
    localStorage.clear();
    resetGlobeQualityForTests();
  });

  it('pins full detail at High and the lowest step at Low, whatever auto measured', () => {
    reportFrameWindow(win(40), 2);
    reportFrameWindow(win(40), 2);
    expect(getGlobeQuality().step).toBe(SOFTER);

    setGlobeQualitySetting('high');
    // `settled`: a pinned setting has nothing left to measure (see the settle tests).
    expect(getGlobeQuality()).toEqual({ setting: 'high', step: 0, reason: null, settled: true });
    setGlobeQualitySetting('low');
    expect(qualityStepOf(getGlobeQuality())).toBe(QUALITY_STEPS[LOWEST_STEP]);

    setGlobeQualitySetting('auto');
    expect(getGlobeQuality().step).toBe(SOFTER);
  });

  it('keeps the glow at High and drops it at Low, so a card at Low is unchanged', () => {
    setGlobeQualitySetting('high');
    expect(qualityStepOf(getGlobeQuality()).bloom).toBe(true);
    setGlobeQualitySetting('low');
    expect(qualityStepOf(getGlobeQuality()).bloom).toBe(false);
  });

  it('keeps the 8K maps at the top two steps only, and never at Low (K7)', () => {
    expect(QUALITY_STEPS.filter((step) => step.sharpMaps).map((step) => step.name)).toEqual(['full detail', 'no glow, hatching or orbit rings']);
    setGlobeQualitySetting('low');
    expect(qualityStepOf(getGlobeQuality()).sharpMaps).toBe(false);
  });

  it('drops the glow first when told the Sun is drawn', () => {
    setGlobeBloomInUse(true);
    reportFrameWindow(win(40), 2);
    reportFrameWindow(win(40), 2);
    expect(qualityStepOf(getGlobeQuality()).name).toBe('no glow, hatching or orbit rings');
  });

  it('drops the hatching first when told War & Conflict hatches, and forgets it on a reset', () => {
    setGlobeHatchingInUse(true);
    reportFrameWindow(win(40), 2);
    reportFrameWindow(win(40), 2);
    expect(qualityStepOf(getGlobeQuality()).name).toBe('no glow, hatching or orbit rings');
    resetGlobeQualityForTests();
    reportFrameWindow(win(40), 2);
    reportFrameWindow(win(40), 2);
    expect(qualityStepOf(getGlobeQuality()).name).toBe('softer edges');
  });

  it('does not measure while pinned', () => {
    setGlobeQualitySetting('high');
    reportFrameWindow(win(80), 2);
    reportFrameWindow(win(80), 2);
    setGlobeQualitySetting('auto');
    expect(getGlobeQuality().step).toBe(0);
  });

  it('persists the choice, not the measurement', () => {
    setGlobeQualitySetting('low');
    const stored = Object.entries(localStorage).find(([k]) => k.includes('globe-quality'));
    expect(stored?.[1]).toContain('"setting":"low"');
    expect(stored?.[1]).not.toContain('step');
  });

  it('hands useSyncExternalStore the same object until something changes, and tells subscribers when it does', () => {
    const first = getGlobeQuality();
    let heard = 0;
    const stop = subscribeGlobeQuality(() => { heard++; });

    reportFrameWindow(win(20), 2); // in between: nothing changes
    expect(getGlobeQuality()).toBe(first);
    expect(heard).toBe(0);

    setGlobeQualitySetting('low');
    expect(heard).toBe(1);
    stop();
  });
});

describe('what the popup says', () => {
  it('says what each setting means, and why auto chose its step', () => {
    expect(describeGlobeQuality({ setting: 'high', step: 0, reason: null })).toMatch(/Full detail always/);
    expect(describeGlobeQuality({ setting: 'low', step: LOWEST_STEP, reason: null }))
      .toBe('Always no clouds or atmosphere. Marks, fills and borders are never reduced.');
    expect(describeGlobeQuality({ setting: 'auto', step: 0, reason: null })).toMatch(/only if this device cannot keep up/);
    expect(describeGlobeQuality({ setting: 'auto', step: NO_CLOUDS, reason: 'frames took 40 ms each, fewer than 40 a second' }))
      .toBe('Drawing no clouds: frames took 40 ms each, fewer than 40 a second.');
    expect(describeGlobeQuality({ setting: 'auto', step: NO_GLOW, reason: 'frames took 40 ms each, fewer than 40 a second' }))
      .toBe('Drawing no glow, hatching or orbit rings: frames took 40 ms each, fewer than 40 a second.');
  });
});


/**
 * When auto has seen enough to have stepped down if it was going to.
 *
 * The cloud layer waits for this before fetching clouds.png — 2.19 MB, the
 * largest single file of a first visit, measured server-side on 2026-09-25 —
 * because auto starts at full detail and only a measurement can say a device
 * cannot carry clouds. Fetched straight away, a slow device (and every
 * headless agent) downloaded clouds it was about to hide.
 */
describe('settled', () => {
  beforeEach(() => resetGlobeQualityForTests());

  it('is false under auto until enough windows have been measured', () => {
    expect(getGlobeQuality().settled).toBe(false);
    for (let i = 0; i < SETTLE_WINDOWS - 1; i++) reportFrameWindow(win(10), 1);
    expect(getGlobeQuality().settled).toBe(false);
    reportFrameWindow(win(10), 1);
    expect(getGlobeQuality().settled).toBe(true);
  });

  it('comes after the earliest possible step down, so a slow device has already said so', () => {
    // A clearly slow device steps down on its second slow window. Settling any
    // earlier would fetch clouds the governor was about to remove.
    for (let i = 0; i < SETTLE_WINDOWS; i++) reportFrameWindow(win(80), 1);
    const state = getGlobeQuality();
    expect(state.settled).toBe(true);
    expect(qualityStepOf(state).clouds).toBe(false);
  });

  it('does not count a window too thin to be a measurement', () => {
    for (let i = 0; i < SETTLE_WINDOWS; i++) reportFrameWindow(win(10, 1), 1);
    expect(getGlobeQuality().settled).toBe(false);
  });

  it('is true at once when the setting is pinned', () => {
    setGlobeQualitySetting('high');
    expect(getGlobeQuality().settled).toBe(true);
    setGlobeQualitySetting('low');
    expect(getGlobeQuality().settled).toBe(true);
  });

  it('tells subscribers when it settles, even though the step did not change', () => {
    let calls = 0;
    subscribeGlobeQuality(() => { calls += 1; });
    for (let i = 0; i < SETTLE_WINDOWS; i++) reportFrameWindow(win(10), 1);
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});

describe('a still card at full detail (the owner, 2026-10-24)', () => {
  beforeEach(() => resetGlobeQualityForTests());

  it('draws full detail while held, whatever the viewer pinned or auto measured, and gives the step back', () => {
    setGlobeQualitySetting('low');
    expect(getGlobeQuality().step).toBe(LOWEST_STEP);
    const release = holdFullDetail();
    expect(getGlobeQuality().step).toBe(0);
    expect(getGlobeQuality().settled).toBe(true);
    expect(fullDetailHeld()).toBe(true);
    release();
    expect(getGlobeQuality().step).toBe(LOWEST_STEP);
    expect(fullDetailHeld()).toBe(false);
  });

  it('holds over a step auto chose, and tells its listeners both ways', () => {
    // Slow, then faster once stepped down: the step down helped, so auto keeps it.
    for (const ms of [80, 80, 40, 40]) reportFrameWindow(win(ms), 2);
    const stepped = getGlobeQuality().step;
    expect(stepped).toBeGreaterThan(0);
    let told = 0;
    const off = subscribeGlobeQuality(() => { told += 1; });
    const release = holdFullDetail();
    expect(getGlobeQuality().step).toBe(0);
    release();
    expect(getGlobeQuality().step).toBe(stepped);
    expect(told).toBe(2);
    off();
  });

  it('counts holds, and a second release of one does nothing', () => {
    const first = holdFullDetail();
    const second = holdFullDetail();
    first();
    first();
    expect(fullDetailHeld()).toBe(true);
    second();
    expect(fullDetailHeld()).toBe(false);
  });
});
