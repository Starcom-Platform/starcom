/**
 * Render the globe along a camera track, frame by frame, at an exact rate.
 *
 * ─── WHY THIS IS NOT MEDIARECORDER ─────────────────────────────────────────
 *
 * It was, for one iteration, and it produced a file that looked fine and was
 * wrong in a way only an independent tool could see.
 *
 * canvas.captureStream() + MediaRecorder did capture real frames — that part
 * held, despite preserveDrawingBuffer: false. But checked with ffprobe rather
 * than by the browser that made it, a camera path that took 4.3 s of wall time
 * came out as 3.25 s of footage: the whole path was there, start pose to end
 * pose, played about a third too fast. Converted to mp4 it shrank again, to
 * 2.86 s.
 *
 * MediaRecorder is a real-time encoder, and a machine that cannot render in
 * real time does not get real time back from it. That broke two things:
 *
 *   TIMING. clipProvenance states world changes with time ranges —
 *   "unreachable 0:03–0:04". On a footage timeline that does not match the
 *   clock those ranges were measured on, the caveat points at the wrong
 *   moment. A caveat that points at the wrong moment is worse than none,
 *   because it reads as precise.
 *
 *   QUALITY. The same run achieved about 6.8 frames a second. Mecha Jono runs
 *   headless, and headless Chromium usually has no GPU — so the agent would
 *   routinely produce choppy footage that nobody would post.
 *
 * So each frame is rendered at an exact moment of the track instead: frame i
 * depicts track time i/fps, read with captureGlobeFrame's render-then-read.
 * Footage time, track time and provenance time are then the same thing by
 * construction. Frame rate stops being a property of the machine and becomes
 * a choice; a slow machine simply takes longer. The frames are assembled into
 * video by ffmpeg on the agent's side — which it needs anyway, because the
 * platforms a clip is posted to want H.264 mp4.
 *
 * ─── WHAT CARRIED OVER FROM THE FIRST ITERATION ────────────────────────────
 *
 * The warm-up. The first spike's opening frame was missing the territory fill
 * later frames had: the clip began on a region whose geometry had not loaded,
 * and the footage recorded the globe filling itself in. Visible only by
 * extracting the frames and looking. So every keyframe is visited and allowed
 * to settle before frame 0 — warming only the start would move the problem
 * into the middle of the shot. After the change, the opening frame is filled.
 *
 * ─── WHY SAMPLES READ LIVE STATE ───────────────────────────────────────────
 *
 * `sample` must read the latest world, never a snapshot from when rendering
 * began. Rendering takes far longer than the footage it produces, so a feed
 * can easily change mid-render — and the frames rendered after that change
 * really do show it. clipProvenance can only be as honest as its samples.
 */
import { buildClipProvenance, type ClipProvenance, type ClipReplay, type ClipSample, type ClipStory, type ClipSweep, type ClipTour } from './clipProvenance';
import type { CameraPose, CameraTrack } from './cameraTrack';
import type { CaptureResult } from './captureGlobeFrame';
import type { MarkerStyle } from '../../../components/Globe/markerStyles';

export interface RecordClipDeps {
  /** Move the camera and resolve once it has rendered there, plus `settleMs`. */
  applyPose(pose: CameraPose, settleMs?: number): Promise<void>;
  /**
   * Set the moment a replay has reached, or the shared moment a sweep has
   * reached (decision D-W, step 5c), `tMs` into the footage, before that frame
   * is posed and captured. Awaited: a swept moment reaches the weather a render
   * later, and resolves once it is drawn. Absent when the clip drives only the
   * camera.
   */
  applyTime?(tMs: number): void | Promise<void>;
  /**
   * Render and read one frame at the current pose. captureGlobeFrame, whose
   * blank-frame refusal therefore guards every frame, not just the first.
   * Given the footage time the frame depicts, so a tour's caption for that
   * moment can be drawn into it (BP15).
   */
  captureFrame(tMs: number): CaptureResult;
  /** Each frame as it is made, footage then end card, in order: an encoder's (D-ST, ST8). */
  onFrame?(frame: CaptureResult, index: number): void | Promise<void>;
  /** The world right now, read from LATEST state. See the note above. */
  sample(at: Date): ClipSample;
  /** Monotonic milliseconds, for reporting how long rendering took. */
  now(): number;
  /** Wall-clock time: the anchor the footage timeline is placed against. */
  wallClock(): Date;
  /**
   * Draw the closing card over the final frame: one image per page, and how
   * long each is held.
   *
   * REQUIRED, deliberately. Optional would mean a caller could record a clip
   * with no caveats in it by simply not supplying one — the exact gap this
   * closes. As a required dependency the type will not let that happen.
   */
  renderEndCard(
    lastFrame: CaptureResult,
    provenance: ClipProvenance,
    fps: number,
  ): Promise<Array<{ frame: CaptureResult; holdMs: number }>>;
}

/**
 * How the end card closes the clip.
 *
 * `read` holds each page long enough to read it. `poster` holds each page for
 * one frame — every page, so every caveat, is still in the clip — for a
 * promotional post that closes on a still or uses it as its poster frame (Mecha
 * Jono's ask). Neither drops a caveat; that is the one thing no option does.
 */
export type EndCardMode = 'read' | 'poster';
export const END_CARD_MODES: readonly EndCardMode[] = ['read', 'poster'];

export interface RecordClipOptions {
  /** How the end card closes the clip. Default `read`. */
  endCard?: EndCardMode;
  /** When the clip drives time through `applyTime`: the window it sweeps. */
  replay?: ClipReplay;
  /** When the clip sweeps the shared moment through `applyTime`: the span (schema 5). */
  sweep?: ClipSweep;
  /** Output frame rate. A choice, not a measurement — see the header. */
  fps?: number;
  /** Settling time at each keyframe during warm-up. */
  settleMs?: number;
  /** Sample the world every this many frames. */
  sampleEveryFrames?: number;
  /** The frames draw country names; the record says so (clip schema 7). Set by the caller, which draws them. */
  countryNames?: boolean;
  /** One mark style on every layer, set by the caller (clip schema 9; plan H4). */
  markStyle?: MarkerStyle;
  /** Two layers side by side, by their ids, drawn by the caller in each half (clip schema 12; D-CM, CM3). */
  compare?: { left: string; right: string; labels?: { left: string; right: string } };
  /** The playlist the frames tour, with the captions the caller draws into them (clip schema 8; BP15). */
  tour?: ClipTour;
  /** A story shown, each step with its span (clip schema 14; D-ST): its track drives the layers. */
  story?: ClipStory;
  /** The most frames: MAX_FRAMES unless a story's clip asks for its own, at most STORY_FRAMES_LIMIT (ST7). */
  maxFrames?: number;
  /** False: every frame handed to `onFrame` and not kept, but the last, so a long clip is not held whole (ST8). */
  keepFrames?: boolean;
}

export interface RecordedClip {
  /**
   * The whole video: footage, then the end card.
   *
   * For i < stats.footageFrames, frame i depicts track time i/fps exactly.
   * The rest carry the caveats. They are in the same array on purpose —
   * assembling the video includes them because assembling it includes
   * everything; leaving them out takes a deliberate truncation.
   */
  frames: CaptureResult[];
  fps: number;
  provenance: ClipProvenance;
  stats: {
    /** Total, footage plus end card. */
    frames: number;
    footageFrames: number;
    endCardFrames: number;
    endCardPages: number;
    /** Footage length, excluding the end card. */
    durationMs: number;
    /** Wall time rendering took. Differs from durationMs by the machine's speed. */
    renderMs: number;
    warmedKeyframes: number;
  };
}

export class ClipRecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipRecordingError';
  }
}

export const DEFAULT_FPS = 30;
export const DEFAULT_SETTLE_MS = 1500;
/**
 * The most frames one call will render. Every frame crosses the automation
 * boundary as an encoded image, so an unbounded clip is an unbounded payload.
 * 30 s at 30 fps; longer footage is several clips, and should be.
 */
export const MAX_FRAMES = 900;
/** A story's clip may ask for up to a minute at 30 fps (D-ST, ST7); no other clip may. */
export const STORY_FRAMES_LIMIT = 1800;

export async function recordGlobeClip(
  track: CameraTrack,
  deps: RecordClipDeps,
  options: RecordClipOptions = {},
): Promise<RecordedClip> {
  const fps = options.fps ?? DEFAULT_FPS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const endCard = options.endCard ?? 'read';
  if (!END_CARD_MODES.includes(endCard)) {
    throw new ClipRecordingError(`endCard must be one of ${END_CARD_MODES.join(', ')}, got ${String(endCard)}.`);
  }

  if (!Number.isFinite(fps) || fps <= 0 || fps > 60) {
    throw new ClipRecordingError(`fps must be in (0, 60], got ${fps}.`);
  }

  // Frame 0 at t=0 and the last frame exactly on the final keyframe.
  const frameCount = Math.round((track.durationMs / 1000) * fps) + 1;
  // A story's clip may run to a minute (ST7); every other clip keeps the 900-frame limit.
  const maxFrames = options.story && options.maxFrames ? Math.min(options.maxFrames, STORY_FRAMES_LIMIT) : MAX_FRAMES;
  if (frameCount > maxFrames) {
    throw new ClipRecordingError(
      `${frameCount} frames exceeds the ${maxFrames}-frame limit — every frame crosses the `
      + 'automation boundary as an image. Split the footage into shorter clips.',
    );
  }
  const keepFrames = options.keepFrames !== false;
  let handed = 0;
  /** A frame made: handed to the encoder, and kept unless the caller streams them. */
  const made = async (frame: CaptureResult) => {
    await deps.onFrame?.(frame, handed);
    handed += 1;
    if (keepFrames) frames.push(frame);
  };
  let lastFootage: CaptureResult | null = null;
  const sampleEvery = options.sampleEveryFrames ?? Math.max(1, Math.round(fps / 2));

  // ── warm the whole path before frame 0 ──
  for (const keyframe of track.keyframes) {
    await deps.applyPose(keyframe, settleMs);
  }

  const startedAt = deps.wallClock();
  const t0 = deps.now();
  const frames: CaptureResult[] = [];
  const samples: ClipSample[] = [];

  /*
   * Samples are placed on the FOOTAGE timeline: a sample taken while frame i
   * was rendered is stamped at the moment frame i depicts. That is what makes
   * a caveat's "0:03–0:04" mean frames 90–120 of the file, rather than three
   * seconds into a render that took forty.
   */
  const footageMoment = (i: number) => new Date(startedAt.getTime() + (i / fps) * 1000);

  for (let i = 0; i < frameCount; i++) {
    const tMs = Math.min((i / fps) * 1000, track.durationMs);
    await deps.applyTime?.(tMs);
    await deps.applyPose(track.at(tMs));
    lastFootage = deps.captureFrame(tMs);
    await made(lastFootage);
    if (i % sampleEvery === 0 || i === frameCount - 1) {
      samples.push(deps.sample(footageMoment(i)));
    }
  }

  const durationMs = ((frameCount - 1) / fps) * 1000;
  const renderMs = deps.now() - t0;
  const provenance = buildClipProvenance(samples, {
    startedAt,
    endedAt: new Date(startedAt.getTime() + durationMs),
    tracks: [
      'camera',
      ...(options.replay ? ['time' as const] : []),
      ...(options.sweep ? ['moment' as const] : []),
      ...(options.tour ? ['tour' as const] : []),
      ...(options.story ? ['story' as const] : []),
    ],
    ...(options.replay ? { replay: options.replay } : {}),
    ...(options.sweep ? { sweep: options.sweep } : {}),
    ...(options.countryNames ? { countryNames: true as const } : {}),
    ...(options.markStyle ? { markStyle: options.markStyle } : {}),
    ...(options.compare ? { compare: options.compare } : {}),
    ...(options.tour ? { tour: options.tour } : {}),
    ...(options.story ? { story: options.story } : {}),
    renderedOverMs: renderMs,
  });

  // ── the caveats, as frames of the video itself ──
  const last = lastFootage as CaptureResult;
  const pages = await deps.renderEndCard(last, provenance, fps);
  if (!pages.length) {
    throw new ClipRecordingError(
      'The end card produced no pages. A clip is not returned without its caveats in it — that '
      + 'is the gap the end card exists to close.',
    );
  }
  let endCardFrames = 0;
  for (const { frame, holdMs } of pages) {
    if (frame.width !== last.width || frame.height !== last.height) {
      throw new ClipRecordingError(
        `An end card page is ${frame.width}x${frame.height} and the footage is ${last.width}x${last.height}. `
        + 'Every frame of a video must match; a mismatched card would be rescaled or rejected by the encoder.',
      );
    }
    // Held by repetition: at a constant frame rate, that is what "hold" is.
    const hold = endCard === 'poster' ? 1 : Math.max(1, Math.round((holdMs / 1000) * fps));
    for (let k = 0; k < hold; k++) await made(frame);
    endCardFrames += hold;
  }

  return {
    frames,
    fps,
    provenance,
    stats: {
      frames: handed,
      footageFrames: frameCount,
      endCardFrames,
      endCardPages: pages.length,
      durationMs,
      renderMs,
      warmedKeyframes: track.keyframes.length,
    },
  };
}
