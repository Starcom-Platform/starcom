/**
 * A story as one clip (D-ST, ST3, ST7, ST8): the footage opens on the first step, held for its hold; each step after
 * is a flight from the last (about 2.5 s, rising to the whole planet over a long way, as a tour's do) and its hold. Up
 * to STORY_MAX_FRAMES frames at 30 fps, a minute: every step that fits, the rest left out and said so. Each step's
 * span runs from the start of its flight to the end of its hold; its caption shows, and its layers, choices and window
 * are set, from the span's start (the flight shows the next step's world, as a tour's caption does its next stop).
 */
import { fill } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import { flightKeyframes, FLIGHT_MS } from '../globe/tour/briefingPlaylist';
import type { CameraKeyframe } from '../globe/capture/cameraTrack';
import type { TourCaption } from '../globe/tour/tourPlayer';
import type { Story, StoryStep } from './story';

/** A story's clip, at most: 60 s at 30 fps (ST7); every other clip keeps MAX_FRAMES, 900. */
export const STORY_MAX_FRAMES = 1800;

export interface StoryClipSpan {
  index: number;
  fromMs: number;
  toMs: number;
  caption: TourCaption;
}

export interface StoryClipPlan {
  keyframes: CameraKeyframe[];
  durationMs: number;
  spans: StoryClipSpan[];
  /** The steps the clip shows, of the story's. */
  shown: number;
  total: number;
  partial: boolean;
}

const framesOf = (durationMs: number, fps: number) => Math.round((durationMs / 1000) * fps) + 1;

const poseOf = (step: StoryStep) => ({ lat: step.view.lat, lng: step.view.lng, altitude: step.view.altitude });

function lay(steps: readonly StoryStep[], flightMs: number) {
  const keyframes: CameraKeyframe[] = [];
  const spans: Array<{ index: number; fromMs: number; toMs: number }> = [];
  let t = 0;
  steps.forEach((step, index) => {
    const pose = poseOf(step);
    const fromMs = t;
    if (index === 0) {
      keyframes.push({ ...pose, atMs: 0 });
    } else {
      // The flight's first keyframe is where the last hold ended.
      for (const k of flightKeyframes(poseOf(steps[index - 1]), pose, flightMs).slice(1)) keyframes.push({ ...k, atMs: t + k.atMs });
      t += flightMs;
    }
    t += step.holdS * 1000;
    keyframes.push({ ...pose, atMs: t });
    spans.push({ index, fromMs, toMs: t });
  });
  return { keyframes, spans, durationMs: t };
}

/** The clip of a story at `fps`, in at most `maxFrames` frames. Throws when it has no step, or not even its first fits. */
export function planStoryClip(
  story: Story, w: Messages['story'], { fps, maxFrames = STORY_MAX_FRAMES, flightMs = FLIGHT_MS }: { fps: number; maxFrames?: number; flightMs?: number },
): StoryClipPlan {
  if (!story.steps.length) throw new Error('A story needs a step to make a clip of.');
  let count = 0;
  while (count < story.steps.length && framesOf(lay(story.steps.slice(0, count + 1), flightMs).durationMs, fps) <= maxFrames) count += 1;
  if (count === 0) throw new Error(`Not even the first step fits a clip of ${maxFrames} frames at ${fps} fps. Ask for a lower fps.`);
  const steps = story.steps.slice(0, count);
  const { keyframes, spans, durationMs } = lay(steps, flightMs);
  const title = story.title || w.untitled;
  return {
    keyframes,
    durationMs,
    spans: spans.map((s) => ({
      ...s,
      caption: { playlist: title, progress: fill(w.step, { i: s.index + 1, n: story.steps.length }), title: story.steps[s.index].caption, why: '', lines: [] },
    })),
    shown: count,
    total: story.steps.length,
    partial: count < story.steps.length,
  };
}

/** The span the footage is in at `tMs`: the last that has begun. */
export function spanAt(plan: StoryClipPlan, tMs: number): StoryClipSpan {
  let at = plan.spans[0];
  for (const span of plan.spans) if (span.fromMs <= tMs) at = span;
  return at;
}
