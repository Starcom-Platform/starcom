/**
 * How the timeline draws one event (decision D-E, settled 2026-09-14 for step 7,
 * docs/missions/01-architecture-decisions/time-model.md).
 *
 * A pin at its start, and a bar to its end when it has one; a span thinner than
 * the pin reads as a pin. A time known less closely than the pin is wide at this
 * zoom is rough: the window it could fall in is drawn faintly from the time,
 * behind a hollow pin. An estimate with no stated width draws a hollow pin and no
 * window. The timeline drew every event as a pin at its start, whatever its end
 * or how closely it was known.
 */
import { precisionWidthMs, type RecordTime } from '../../../services/intel/recordTime';

/** A pin's radius, in canvas pixels. */
export const PIN_RADIUS = 6;

/** Where the time axis is drawn, in canvas pixels, and the times at its two ends. */
export interface TimelineAxis {
  left: number;
  width: number;
  min: number;
  max: number;
}

export interface EventMark {
  /** The pin, at the event's start. */
  x: number;
  /** Where the bar to the event's end stops, when it has an end. */
  barEndX: number | null;
  /** Where its faint window stops, when its time is rough at this zoom. */
  roughEndX: number | null;
  /** Rough at this zoom, or estimated. */
  hollow: boolean;
}

/** How one event is drawn on an axis, or null when it falls outside it. */
export function eventMark(time: RecordTime, isEstimated: boolean, axis: TimelineAxis): EventMark | null {
  const span = axis.max - axis.min;
  if (!(span > 0)) return null;
  const right = axis.left + axis.width;
  const toX = (t: number) => axis.left + ((t - axis.min) / span) * axis.width;
  const x = toX(time.start);
  if (x < axis.left || x > right) return null;
  const upTo = (t: number) => Math.min(right, toX(t));

  const widthMs = precisionWidthMs(time);
  const rough = (widthMs / span) * axis.width > 2 * PIN_RADIUS;
  return {
    x,
    barEndX: time.statedEnd === undefined ? null : upTo(time.statedEnd),
    roughEndX: rough ? upTo((time.statedEnd ?? time.start) + widthMs) : null,
    hollow: rough || isEstimated,
  };
}
