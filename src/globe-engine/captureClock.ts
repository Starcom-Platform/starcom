/**
 * Motion held still while a capture renders (decision IM23).
 *
 * Every card and clip frame holds the pulsing glows at rest, and the clouds and
 * the space-weather shaders at the phase of the capture's moment, so the same
 * shot makes the same picture, which golden cards compare. The globe on screen
 * keeps moving: a capture stills motion around its own render and releases it
 * before the live view draws again.
 *
 * Like the replay clock: one value, set before the frame, read by each moving
 * thing as it draws (onBeforeRender), or told through a hook when it is moved by
 * a loop of its own, as the clouds are.
 */

export interface StillHook {
  /** Hold still at the phase of this moment, in ms since the epoch. */
  still(atMs: number): void;
  /** Move on as before. */
  release(): void;
}

let stilled: number | null = null;
let stills = 0;
const hooks = new Set<StillHook>();

/** The moment motion is held at, in ms since the epoch, or null while it moves. */
export function stilledAt(): number | null {
  return stilled;
}

/**
 * How many times motion has been held still: one more for each card and each clip
 * frame, so a clip frame is told from the live renders around it, and from the frame
 * before at the same moment.
 */
export function stillSerial(): number {
  return stills;
}

export function stillMotion(atMs: number): void {
  stilled = atMs;
  stills += 1;
  for (const hook of hooks) hook.still(atMs);
}

export function releaseMotion(): void {
  if (stilled === null) return;
  stilled = null;
  for (const hook of hooks) hook.release();
}

/** Captures under way that span many renders: a clip, between its frames. */
let spanning = 0;

/**
 * Holds the globe's look for a capture that spans many renders, as a clip does, until the
 * function returned is called. Nothing that changes how the globe looks lands between two
 * of its frames: the 8K maps wait for it (useGlobeSharpMaps). A single capture needs no
 * hold: it renders and reads in one go, with nothing able to land in between.
 */
export function holdForCapture(): () => void {
  spanning += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    spanning -= 1;
  };
}

/** Whether a capture spanning many renders, a clip, is under way: its frames follow on from each other. */
export function clipUnderWay(): boolean {
  return spanning > 0;
}

/** Whether a capture is under way: a render held still, or a clip between its frames. */
export function captureUnderWay(): boolean {
  return stilled !== null || spanning > 0;
}

/** Registers a moving thing moved by a loop of its own; returns how to leave. */
export function onStill(hook: StillHook): () => void {
  hooks.add(hook);
  return () => { hooks.delete(hook); };
}

/**
 * A phase for a moment, in seconds into a period: what a shader's `time` is set
 * to while stilled. Kept within an hour, as a float32 holds that to well under
 * a millisecond; the whole epoch in seconds it holds only to about two minutes.
 */
export function phaseSeconds(atMs: number, periodS = 3600): number {
  return (atMs / 1000) % periodS;
}
