/**
 * A briefing playlist as a clip (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP14, BP15, BP17).
 *
 * The clip starts on the opening, the whole planet with the playlist's caption,
 * held as the screen holds it, then flies to each stop and holds it for its
 * reading time, at the screen's times. A clip call holds a bounded number of
 * frames, so the worst stops are kept, in the playlist's order, while the
 * footage fits; the captions then say how many there were in all.
 *
 * Pure: the camera's keyframes, and the caption at every moment of the footage,
 * which the recorder draws into each frame and the clip's record lists.
 */
import type { CameraKeyframe } from '../capture/cameraTrack';
import { FLIGHT_MS, flightKeyframes, type Playlist, type Pose } from './briefingPlaylist';
import { OPENING_HOLD_MS, tourCaption, type TourCaption } from './tourPlayer';
import type { TourMarker } from './tourMarker';

/** A stop as the clip shows it: its item, and when its caption shows, through its flight and its hold. */
export interface TourClipStop {
  id: string;
  title: string;
  caption: TourCaption;
  fromMs: number;
  toMs: number;
}

export interface TourClipPlan {
  /** The playlist as the clip shows it: its stops cut to those kept. */
  playlist: Playlist;
  keyframes: CameraKeyframe[];
  durationMs: number;
  opening: { fromMs: number; toMs: number; caption: TourCaption };
  stops: TourClipStop[];
  shown: number;
  total: number;
  partial: boolean;
}

/** How many frames footage of this length is, from frame 0 to its end, as the recorder renders it. */
const framesOf = (durationMs: number, fps: number) => Math.round((durationMs / 1000) * fps) + 1;

/** The keyframes and caption spans of the opening and the first `count` stops. */
function lay(playlist: Playlist, count: number) {
  const keyframes: CameraKeyframe[] = [{ ...playlist.opening, atMs: 0 }, { ...playlist.opening, atMs: OPENING_HOLD_MS }];
  const spans: Array<{ fromMs: number; toMs: number }> = [];
  let t = OPENING_HOLD_MS;
  let previous: Pose = playlist.opening;
  for (const stop of playlist.stops.slice(0, count)) {
    // The flight's first keyframe is where the last hold ended.
    for (const k of flightKeyframes(previous, stop.pose).slice(1)) keyframes.push({ ...k, atMs: t + k.atMs });
    const fromMs = t;
    t += FLIGHT_MS + stop.holdMs;
    keyframes.push({ ...stop.pose, atMs: t });
    spans.push({ fromMs, toMs: t });
    previous = stop.pose;
  }
  return { keyframes, spans, durationMs: t };
}

/** The clip of a playlist at `fps`, in at most `maxFrames` frames. Throws when not even its first stop fits. */
export function planTourClip(playlist: Playlist, { fps, maxFrames }: { fps: number; maxFrames: number }): TourClipPlan {
  let count = 0;
  while (count < playlist.stops.length && framesOf(lay(playlist, count + 1).durationMs, fps) <= maxFrames) count += 1;
  if (count === 0) {
    const needs = lay(playlist, 1).durationMs / 1000;
    throw new Error(`Not even the first stop fits a clip of ${maxFrames} frames at ${fps} fps: the opening and one stop take ${needs.toFixed(1)} s. Ask for a lower fps.`);
  }
  const shown: Playlist = { ...playlist, stops: playlist.stops.slice(0, count) };
  const { keyframes, spans, durationMs } = lay(shown, count);
  return {
    playlist: shown,
    keyframes,
    durationMs,
    opening: { fromMs: 0, toMs: OPENING_HOLD_MS, caption: tourCaption(shown, -1) },
    stops: shown.stops.map((stop, i) => ({
      id: stop.candidate.id,
      title: stop.candidate.title,
      caption: tourCaption(shown, i),
      ...spans[i],
    })),
    shown: count,
    total: playlist.total,
    partial: playlist.partial,
  };
}

/** The caption at `tMs` into the clip: the opening's until the first flight, then each stop's to its hold's end. */
export function captionAt(plan: TourClipPlan, tMs: number): TourCaption {
  const stop = plan.stops.find((s) => tMs >= s.fromMs && tMs < s.toMs) ?? (tMs >= plan.durationMs ? plan.stops[plan.stops.length - 1] : null);
  return stop ? stop.caption : plan.opening.caption;
}

/**
 * The item a clip's stop holds at `tMs` of its footage, for the ping over it (critique C34), or null in a flight or at
 * the opening: from the clip's own timeline, so the same clip draws the same pings.
 */
export function markerAt(plan: TourClipPlan, tMs: number): TourMarker | null {
  for (let i = 0; i < plan.stops.length; i += 1) {
    const heldFrom = plan.stops[i].fromMs + FLIGHT_MS;
    if (tMs >= heldFrom && tMs < plan.stops[i].toMs) {
      const position = plan.playlist.stops[i]?.candidate.position;
      return position ? { lat: position.lat, lng: position.lng, heldForMs: tMs - heldFrom } : null;
    }
  }
  return null;
}
