/**
 * The Timestream's view of time (decision D-PW, PW37–PW38): a span from a start, zoomed from an hour to a century
 * about the point under the pointer, panned by a share of its width, and held inside the sky catalogue's years. As
 * Cosmic Cypher's Timestream has it (`LaneContainer.tsx`: wheel steps of ×1.2, one hour to 100 years), in UTC.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

export const MIN_SPAN_MS = HOUR;
export const MAX_SPAN_MS = 100 * YEAR;
/** One wheel step's zoom, in or out. */
export const ZOOM_STEP = 1.2;
/** The years the view may show: the sky catalogue's, 1930 to 2035 (PW37). */
export const VIEW_FROM_MS = Date.UTC(1930, 0, 1);
export const VIEW_UNTIL_MS = Date.UTC(2036, 0, 1);

export interface TimeView {
  startMs: number;
  spanMs: number;
}

/** Cosmic Cypher's zoom presets, and a decade and a century beyond them. */
export const ZOOM_PRESETS = [
  { id: '8h', spanMs: 8 * HOUR },
  { id: '24h', spanMs: DAY },
  { id: '3d', spanMs: 3 * DAY },
  { id: '7d', spanMs: 7 * DAY },
  { id: '30d', spanMs: 30 * DAY },
  { id: '4mo', spanMs: 122 * DAY },
  { id: '1y', spanMs: YEAR },
  { id: '10y', spanMs: 10 * YEAR },
  { id: '100y', spanMs: MAX_SPAN_MS },
] as const;
export type ZoomPresetId = (typeof ZOOM_PRESETS)[number]['id'];

/** The view a drawer opens on: a week, the cursor a third of the way in, so more of what comes is in sight. */
export const DEFAULT_SPAN_MS = 7 * DAY;
export const CURSOR_FRACTION = 1 / 3;

/** A view kept to its limits: its span between an hour and a century, its whole inside the catalogue's years. */
export function clampView({ startMs, spanMs }: TimeView): TimeView {
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, spanMs), VIEW_UNTIL_MS - VIEW_FROM_MS);
  const start = Math.min(VIEW_UNTIL_MS - span, Math.max(VIEW_FROM_MS, startMs));
  return { startMs: start, spanMs: span };
}

/** A view of a span with a moment at a given share of its width. */
export const viewAround = (ms: number, spanMs: number, fraction = CURSOR_FRACTION): TimeView =>
  clampView({ startMs: ms - spanMs * fraction, spanMs });

/** The moment at a share of the view's width (0 its left edge, 1 its right). */
export const msAt = (view: TimeView, fraction: number): number => view.startMs + fraction * view.spanMs;

/** Where a moment stands across the view, as a share of its width; outside 0–1 when out of sight. */
export const fractionAt = (view: TimeView, ms: number): number => (ms - view.startMs) / view.spanMs;

/** The view zoomed by `factor` (above 1 shows more time) about the moment at `anchor`, a share of its width. */
export function zoomAbout(view: TimeView, factor: number, anchor: number): TimeView {
  const at = msAt(view, anchor);
  const spanMs = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, view.spanMs * factor));
  return clampView({ startMs: at - anchor * spanMs, spanMs });
}

/** The view moved by a share of its width: positive shows later time. */
export const panBy = (view: TimeView, fraction: number): TimeView =>
  clampView({ startMs: view.startMs + fraction * view.spanMs, spanMs: view.spanMs });

/** The view keeping its span, moved only as far as it takes to bring a moment into sight, with a margin. */
export function follow(view: TimeView, ms: number, margin = 0.05): TimeView {
  const at = fractionAt(view, ms);
  if (at >= margin && at <= 1 - margin) return view;
  return viewAround(ms, view.spanMs, at < margin ? margin : 1 - margin);
}
