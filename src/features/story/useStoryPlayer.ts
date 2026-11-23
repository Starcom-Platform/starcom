/**
 * A story played on the globe (D-ST, ST1, ST6), as a briefing tour is played: each step's layers, choices and window
 * set, the camera flown to it (about 2.5 s, a cut where motion is reduced) and held for the step's own hold, its
 * caption shown. A person's hand on the globe pauses it, and Resume sets the step again and holds it in full; Esc or
 * End ends it. Ended, everything a story set is put back as it was before Play: the view, the layers, the window, and
 * each layer's choices given back to the person's own.
 *
 * A link's story opens ready (ST6): the globe at its first step, nothing moving until Play.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyStep, captureStep, releaseChoices, storyById, type Story, type StoryHandle, type StoryStep } from './story';
import { FLIGHT_MS } from '../globe/tour/briefingPlaylist';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'storyPlayer' });

/** Flying back to where the person was, once it ends. */
const RETURN_MS = 1000;

export type StoryPhase = 'off' | 'ready' | 'playing' | 'paused';

export interface StoryPlay {
  phase: StoryPhase;
  story: Story | null;
  /** The step shown, from 0. */
  index: number;
  /** Opens a story at its first step, ready to play (a link's, ST6). */
  ready(story: Story): Promise<void>;
  play(storyId?: string): void;
  pause(): void;
  resume(): void;
  end(): void;
  /** A reason it could not start or go on, said once. */
  notice: string | null;
}

export interface StoryPlayerDeps {
  handle: () => StoryHandle | null | undefined;
  /** The globe's controls, to hear a person's hand. */
  controls: () => { addEventListener(type: 'start', l: () => void): void; removeEventListener(type: 'start', l: () => void): void } | undefined;
  reducedMotion: boolean;
  /** Told when a story starts, so a running tour ends (one player at a time). */
  onStart?: () => void;
}

interface Run {
  story: Story;
  /** The view before Play, put back at the end. */
  before: StoryStep | null;
  index: number;
  paused: boolean;
  cancelled: boolean;
  /** Set on Resume: the step is held again in full. */
  restart: boolean;
}

export function useStoryPlayer(deps: StoryPlayerDeps): StoryPlay {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [phase, setPhase] = useState<StoryPhase>('off');
  const [story, setStory] = useState<Story | null>(null);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const runRef = useRef<Run | null>(null);

  const flight = () => (depsRef.current.reducedMotion ? 0 : FLIGHT_MS);

  const finish = useCallback(async (run: Run) => {
    run.cancelled = true;
    if (runRef.current === run) runRef.current = null;
    setPhase('off');
    const handle = depsRef.current.handle();
    if (!handle) return;
    releaseChoices(handle, run.story.steps);
    if (run.before) {
      try { await applyStep(handle, run.before, { transitionMs: depsRef.current.reducedMotion ? 0 : RETURN_MS, ready: false }); }
      catch (e) { log.warn('the view before the story could not be put back', { error: String(e) }); }
    }
  }, []);

  /** Holds a step for its hold, time counting only while it plays; false once the run has ended. */
  const hold = (run: Run, ms: number) => new Promise<boolean>((resolve) => {
    let elapsed = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (run.restart) { run.restart = false; elapsed = 0; } else if (!run.paused) elapsed += now - last;
      last = now;
      if (run.cancelled) { clearInterval(timer); resolve(false); } else if (elapsed >= ms) { clearInterval(timer); resolve(true); }
    }, 100);
  });

  const go = useCallback(async (run: Run, from: number) => {
    const handle = depsRef.current.handle();
    if (!handle) { setNotice('The globe is not ready yet.'); void finish(run); return; }
    for (let i = from; i < run.story.steps.length; i += 1) {
      if (run.cancelled) return;
      run.index = i;
      setIndex(i);
      const step = run.story.steps[i];
      try {
        await applyStep(handle, step, { transitionMs: flight(), ready: false });
      } catch (e) {
        setNotice(`Step ${i + 1} could not be shown: ${String((e as Error).message ?? e)}`);
      }
      const held = await hold(run, step.holdS * 1000);
      if (!held || run.cancelled) return;
    }
    void finish(run);
  }, [finish]);

  const play = useCallback((storyId?: string) => {
    const chosen = storyId ? storyById(storyId) : story;
    if (!chosen || !chosen.steps.length) { setNotice('A story needs a step to play.'); return; }
    const handle = depsRef.current.handle();
    if (!handle) { setNotice('The globe is not ready yet.'); return; }
    if (runRef.current) void finish(runRef.current);
    depsRef.current.onStart?.();
    let before: StoryStep | null = null;
    try { before = captureStep(handle); } catch { /* nothing drawn to put back */ }
    const run: Run = { story: chosen, before, index: 0, paused: false, cancelled: false, restart: false };
    runRef.current = run;
    setStory(chosen);
    setNotice(null);
    setPhase('playing');
    void go(run, 0);
  }, [story, finish, go]);

  const pause = useCallback(() => {
    const run = runRef.current;
    if (!run || run.paused) return;
    run.paused = true;
    setPhase('paused');
  }, []);

  const resume = useCallback(() => {
    const run = runRef.current;
    if (!run || !run.paused) return;
    // The step set again (the hand may have moved the camera), then held in full.
    run.paused = false;
    run.restart = true;
    setPhase('playing');
    const handle = depsRef.current.handle();
    const step = run.story.steps[run.index];
    if (handle && step) void applyStep(handle, step, { transitionMs: flight(), ready: false }).catch(() => undefined);
  }, []);

  const end = useCallback(() => {
    const run = runRef.current;
    if (run) void finish(run);
    else { setPhase('off'); }
  }, [finish]);

  const ready = useCallback(async (opened: Story) => {
    setStory(opened);
    setIndex(0);
    setNotice(null);
    const handle = depsRef.current.handle();
    if (handle && opened.steps[0]) {
      try { await applyStep(handle, opened.steps[0], { transitionMs: 0 }); }
      catch (e) { setNotice(`The story's first step could not be shown: ${String((e as Error).message ?? e)}`); }
    }
    setPhase('ready');
  }, []);

  // A hand on the globe pauses it; Esc ends it.
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'paused') return undefined;
    const controls = depsRef.current.controls();
    const onTouch = () => pause();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') end(); };
    controls?.addEventListener('start', onTouch);
    window.addEventListener('keydown', onKey);
    return () => {
      controls?.removeEventListener('start', onTouch);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, pause, end]);

  // Unmounted while playing: put back what it set.
  useEffect(() => () => { if (runRef.current) void finish(runRef.current); }, [finish]);

  return { phase, story, index, ready, play, pause, resume, end, notice };
}
