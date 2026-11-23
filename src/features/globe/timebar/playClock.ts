/**
 * The time bar's play as one clock (D-EQ, EQ7, EQ17, EQ18): the bar steps it twice a second as it moves the window,
 * and the quakes read it as they draw, carried on between steps, so each quake rises, bursts and decays smoothly at
 * its own moment. Like the replay clock (replayClock.ts), one value read in onBeforeRender, never a React render a
 * frame.
 *
 * How long a quake stays after it happens is a set time of play, whatever the rate (EQ17): 1 s, 4 s or 10 s, kept in
 * this browser.
 */
import { useSyncExternalStore } from 'react';
import { stilledAt } from '../../../globe-engine/captureClock';
import { getReplayMoment } from '../../../components/Globe/replayClock';

export const DECAY_CHOICES_S = [1, 4, 10] as const;
export type DecaySeconds = (typeof DECAY_CHOICES_S)[number];
export const DEFAULT_DECAY_S: DecaySeconds = 4;
/** How far past its last step the clock is carried on, ms: a stalled step never runs the quakes on ahead of it. */
export const CARRY_MAX_MS = 1000;

export interface PlayClock {
  /** The moment play began from, ms since the epoch: what the replay reads counts from it. */
  startMs: number;
  /** The moment the last step reached. */
  atMs: number;
  /** When that step was taken, on the wall clock. */
  wallMs: number;
  /** The time shown per second of play. */
  msPerSecond: number;
  /** When play began, on the wall clock: what the replay reads ends there. */
  startedWallMs: number;
}

/** What a render needs of the play: whether it runs, from where and how fast. It changes on start, stop and rate. */
export type PlayShape = { playing: false } | { playing: true; startMs: number; msPerSecond: number; startedWallMs: number };

const STOPPED: PlayShape = { playing: false };
let clock: PlayClock | null = null;
let shape: PlayShape = STOPPED;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

/** A step of play: the moment reached at this wall time. The first step starts the clock. */
export function stepPlayClock(atMs: number, msPerSecond: number, wallMs = Date.now()): void {
  const starting = clock === null;
  clock = starting
    ? { startMs: atMs, atMs, wallMs, msPerSecond, startedWallMs: wallMs }
    : { ...clock as PlayClock, atMs, wallMs, msPerSecond };
  if (starting || (shape.playing && shape.msPerSecond !== msPerSecond)) {
    shape = { playing: true, startMs: clock.startMs, msPerSecond, startedWallMs: clock.startedWallMs };
    tell();
  }
}

export function stopPlayClock(): void {
  if (clock === null) return;
  clock = null;
  shape = STOPPED;
  tell();
}

export function playClock(): PlayClock | null {
  return clock;
}

/** The moment play has reached now: the last step's, carried on at the rate; while a capture holds still, the step's. */
export function playMomentNow(wallMs = Date.now()): number | null {
  if (!clock) return null;
  if (stilledAt() !== null) return clock.atMs;
  const carried = Math.min(CARRY_MAX_MS, Math.max(0, wallMs - clock.wallMs));
  return clock.atMs + (carried / 1000) * clock.msPerSecond;
}

export function subscribePlayClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePlayShape(): PlayShape {
  return useSyncExternalStore(subscribePlayClock, () => shape, () => STOPPED);
}

// ── Play asked for from elsewhere (the command palette, D-CP) ────────────────
const playAsks = new Set<(on: boolean) => void>();
/** The time bar starts or stops playing, as its own button would. */
export function requestPlay(on: boolean): void {
  playAsks.forEach((ask) => ask(on));
}
/** The time bar hears asks to play; returns how to stop hearing them. */
export function onPlayRequest(ask: (on: boolean) => void): () => void {
  playAsks.add(ask);
  return () => { playAsks.delete(ask); };
}

// ── Decay (EQ17) ─────────────────────────────────────────────────────────────
const DECAY_KEY = 'starcom:quake-decay';
let decay: DecaySeconds | null = null;

function readDecay(): DecaySeconds {
  try {
    const kept = Number(localStorage.getItem(DECAY_KEY));
    return (DECAY_CHOICES_S as readonly number[]).includes(kept) ? kept as DecaySeconds : DEFAULT_DECAY_S;
  } catch { return DEFAULT_DECAY_S; }
}

/** How long a quake stays after it happens, in seconds of play. */
export function replayDecayS(): DecaySeconds {
  decay ??= readDecay();
  return decay;
}

export function setReplayDecayS(s: DecaySeconds): void {
  decay = s;
  try { localStorage.setItem(DECAY_KEY, String(s)); } catch { /* kept for this page only */ }
  tell();
}

export function useReplayDecayS(): DecaySeconds {
  return useSyncExternalStore(subscribePlayClock, replayDecayS, () => DEFAULT_DECAY_S);
}

export interface QuakeReplayMoment {
  /** The moment reached, ms since the epoch. */
  atMs: number;
  /** How long a quake stays after it happens, in ms of the data's time. */
  decayMs: number;
  /** The time shown per second of play: a second of play is this many ms of the data's time. */
  msPerSecond: number;
}

// ── A clip's replay (EQ21) ───────────────────────────────────────────────────
/** A clip replaying the quakes: their decay in seconds of the clip, and the data's time per second of it. */
export interface ClipQuakeReplay {
  decayS: DecaySeconds;
  msPerSecond: number;
}
let clipReplay: ClipQuakeReplay | null = null;

/** Set by recordClip for a replay's footage, and cleared after: the quakes are drawn from its moment meanwhile. */
export function setClipQuakeReplay(next: ClipQuakeReplay | null): void {
  clipReplay = next;
  tell();
}

export function clipQuakeReplay(): ClipQuakeReplay | null {
  return clipReplay;
}

export function useClipQuakeReplay(): ClipQuakeReplay | null {
  return useSyncExternalStore(subscribePlayClock, clipQuakeReplay, () => null);
}

/**
 * Where the quakes' replay stands this frame: a clip's replay moment while one records (EQ21), else the bar's play;
 * null while neither runs.
 */
export function quakeReplayNow(wallMs = Date.now()): QuakeReplayMoment | null {
  const clip = clipReplay ? getReplayMoment() : null;
  if (clip && clipReplay) {
    return { atMs: clip.atMs, decayMs: clipReplay.decayS * clipReplay.msPerSecond, msPerSecond: clipReplay.msPerSecond };
  }
  const atMs = playMomentNow(wallMs);
  if (atMs === null || !clock) return null;
  return { atMs, decayMs: replayDecayS() * clock.msPerSecond, msPerSecond: clock.msPerSecond };
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A span of the data's time in the bar's own short words: "16 h", "4 d", "4 mo", "10 y". */
export function playSpanWords(ms: number): string {
  const [unit, word] = ms < DAY_MS ? [HOUR_MS, 'h'] : ms < 30 * DAY_MS ? [DAY_MS, 'd'] : ms < 365 * DAY_MS ? [30 * DAY_MS, 'mo'] : [365 * DAY_MS, 'y'];
  const n = ms / unit;
  return `${n < 10 ? Math.round(n * 10) / 10 : Math.round(n)} ${word}`;
}

/** The key's words for a replay's decay (EQ17, EQ21): "each quake fades over 4 s of play, 16 h at 4 h/s". */
export function decayWords(decayS: number, msPerSecond: number, by: 'play' | 'clip' = 'play'): string {
  return `each quake fades over ${decayS} s of ${by === 'clip' ? 'the clip' : 'play'}, ${playSpanWords(decayS * msPerSecond)} at ${playSpanWords(msPerSecond)}/s`;
}

export function resetPlayClockForTests(): void {
  clock = null;
  shape = STOPPED;
  decay = null;
  clipReplay = null;
}
