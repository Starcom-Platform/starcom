/**
 * The moment a replay has reached, read by the report glyphs as they draw
 * (decision D-F, section 18, item 5).
 *
 * A replay reveals each report as its time passes. Driving the app's own time
 * window per frame would re-run an asynchronous reload of every marker between
 * frames, so a frame could be captured before its marks were drawn. Instead the
 * glyphs carry their times and read this clock in onBeforeRender: one number,
 * set before each frame, and the frame shows exactly what it says.
 *
 * Null when no replay is running, which is always, except inside recordClip.
 */
export interface ReplayMoment {
  /** The moment reached, in ms since the epoch. */
  atMs: number;
  /** How long a report takes to fade in, in ms of the replay's own time. */
  fadeMs: number;
  /** A bounded replay's span (BA2): marks with a time outside it stay hidden. */
  fromMs?: number;
  untilMs?: number;
}

let moment: ReplayMoment | null = null;

export function getReplayMoment(): ReplayMoment | null {
  return moment;
}

export function setReplayMoment(next: ReplayMoment | null): void {
  moment = next;
}
