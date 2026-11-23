/**
 * The time bar's play as one clock (D-EQ, EQ7, EQ17): stepped by the bar, carried on between steps for the quakes as
 * they draw, held at its step while a capture is still, and the decay a set time of play kept in this browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARRY_MAX_MS, clipQuakeReplay, decayWords, DEFAULT_DECAY_S, playClock, playMomentNow, quakeReplayNow, replayDecayS,
  resetPlayClockForTests, setClipQuakeReplay, setReplayDecayS, stepPlayClock, stopPlayClock, subscribePlayClock,
} from '../playClock';
import { setReplayMoment } from '../../../../components/Globe/replayClock';
import { releaseMotion, stillMotion } from '../../../../globe-engine/captureClock';

const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-01T00:00:00Z');

beforeEach(() => { resetPlayClockForTests(); localStorage.clear(); });
afterEach(() => { releaseMotion(); stopPlayClock(); });

describe('the play clock', () => {
  it('starts on its first step, keeping where play began', () => {
    expect(playClock()).toBeNull();
    stepPlayClock(T0, HOUR, 1000);
    stepPlayClock(T0 + HOUR / 2, HOUR, 1500);
    expect(playClock()).toMatchObject({ startMs: T0, atMs: T0 + HOUR / 2, wallMs: 1500, startedWallMs: 1000 });
  });

  it('is carried on between steps at the rate, never more than a second past the last', () => {
    stepPlayClock(T0, HOUR, 1000);
    expect(playMomentNow(1250)).toBe(T0 + HOUR / 4);
    expect(playMomentNow(1000 + 5000)).toBe(T0 + (CARRY_MAX_MS / 1000) * HOUR);
    // Never back before the step.
    expect(playMomentNow(900)).toBe(T0);
  });

  it('holds at its step while a capture is still', () => {
    stepPlayClock(T0, HOUR, 1000);
    stillMotion(T0);
    expect(playMomentNow(1500)).toBe(T0);
  });

  it('tells its listeners on start, a new rate and stop, not on each step', () => {
    const heard = vi.fn();
    const off = subscribePlayClock(heard);
    stepPlayClock(T0, HOUR, 0);
    stepPlayClock(T0 + 1, HOUR, 500);
    expect(heard).toHaveBeenCalledTimes(1);
    stepPlayClock(T0 + 2, 6 * HOUR, 1000);
    expect(heard).toHaveBeenCalledTimes(2);
    stopPlayClock();
    expect(heard).toHaveBeenCalledTimes(3);
    expect(playMomentNow()).toBeNull();
    off();
  });
});

describe('the decay (EQ17)', () => {
  it('is 4 s of play until chosen, and kept', () => {
    expect(replayDecayS()).toBe(DEFAULT_DECAY_S);
    setReplayDecayS(10);
    resetPlayClockForTests();
    expect(replayDecayS()).toBe(10);
  });

  it('falls back to its default from a kept value it does not offer', () => {
    localStorage.setItem('starcom:quake-decay', '7');
    expect(replayDecayS()).toBe(DEFAULT_DECAY_S);
  });

  it('is in the data\'s time for the quakes: seconds of play at the rate', () => {
    expect(quakeReplayNow()).toBeNull();
    stepPlayClock(T0, 4 * HOUR, 1000);
    expect(quakeReplayNow(1000)).toEqual({ atMs: T0, decayMs: 16 * HOUR, msPerSecond: 4 * HOUR });
  });
});

describe("a clip's replay of the quakes (EQ21)", () => {
  afterEach(() => { setReplayMoment(null); setClipQuakeReplay(null); });

  it("draws them from the clip's moment, over its decay in seconds of the clip, before the bar's play", () => {
    stepPlayClock(T0, HOUR, 1000);
    setClipQuakeReplay({ decayS: 10, msPerSecond: 6 * HOUR });
    expect(clipQuakeReplay()).toEqual({ decayS: 10, msPerSecond: 6 * HOUR });
    // Until the clip sets its moment, the bar's play stands.
    expect(quakeReplayNow(1000)?.atMs).toBe(T0);
    setReplayMoment({ atMs: T0 + 5 * HOUR, fadeMs: 1 });
    expect(quakeReplayNow(1000)).toEqual({ atMs: T0 + 5 * HOUR, decayMs: 60 * HOUR, msPerSecond: 6 * HOUR });
    setClipQuakeReplay(null);
    expect(quakeReplayNow(1000)?.atMs).toBe(T0);
  });

  it("says the clip's seconds in the key", () => {
    expect(decayWords(4, 6 * HOUR, 'clip')).toBe('each quake fades over 4 s of the clip, 1 d at 6 h/s');
  });
});
