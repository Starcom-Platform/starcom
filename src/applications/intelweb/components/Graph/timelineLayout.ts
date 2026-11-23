/**
 * IntelWeb's Timeline (decision D-IW, IW2, step 5): each note across by when it happened, as D-E reads
 * its time (its event, else when it was written; the node says which); one row per group of the way
 * the notes are grouped, the largest first and the notes in no group last; a note stating no time in
 * a column of its own at the left of its row. Only notes: on a timeline a hub's meaning is its row.
 *
 * A few notes far before the rest (a tenth of them or fewer, before a gap wider than half the span)
 * stand in a column of their own, "Earlier", and the axis spans the rest: on the build one note from
 * March stretched it to seven months, and October's notes crowded its last few pixels.
 *
 * Pure: places, rows and the span shown, for the engine to draw toward and label.
 */
import type { IntelNode } from './IntelGraph';

/** Room at the left for the rows' names. */
export const TIMELINE_ROW_LABELS_WIDTH = 170;
/** Where a note stating no time stands: its own column, between the rows' names and the timed notes. */
const UNTIMED_COLUMN = 40;
const TOP = 60;
const RIGHT = 40;

export interface TimelineLayout {
  places: Map<string, { x: number; y: number }>;
  rows: Array<{ key: string; y: number }>;
  /** The x of the column of notes stating no time. */
  untimedX: number;
  /** The times shown, in ms; null when no note states one. */
  span: { from: number; until: number } | null;
  /** The notes far earlier than the rest, in their own column, and the latest of them; null when none. */
  earlier: { count: number; until: number; x: number } | null;
  /** Where the span's ends are drawn. */
  x0: number;
  x1: number;
}

const timeOf = (n: IntelNode): number | null =>
  (n.timestamp instanceof Date && Number.isFinite(n.timestamp.getTime()) ? n.timestamp.getTime() : null);

export function timelineLayout(nodes: readonly IntelNode[], rowOf: ReadonlyMap<string, string>, width: number, height: number): TimelineLayout {
  const notes = nodes.filter((n) => n.type === 'report');
  const sizes = new Map<string, number>();
  for (const n of notes) {
    const key = rowOf.get(n.id) ?? '';
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const keys = [...sizes.keys()].sort((a, b) => (a === '') !== (b === '') ? (a === '' ? 1 : -1) : sizes.get(b)! - sizes.get(a)! || a.localeCompare(b));
  const rowHeight = Math.max(44, (height - TOP - 20) / Math.max(1, keys.length));
  const rows = keys.map((key, i) => ({ key, y: TOP + rowHeight * (i + 0.5) }));
  const yOf = new Map(rows.map((r) => [r.key, r.y]));

  const sorted = notes.map(timeOf).filter((t): t is number => t !== null).sort((a, b) => a - b);
  let earlierCount = 0;
  if (sorted.length >= 4) {
    const full = sorted[sorted.length - 1] - sorted[0];
    let gap = 0;
    let gapAt = 0;
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > gap) { gap = sorted[i] - sorted[i - 1]; gapAt = i; }
    if (full > 0 && gap > full / 2 && gapAt <= Math.max(1, Math.floor(sorted.length / 10))) earlierCount = gapAt;
  }
  const span = sorted.length ? { from: sorted[earlierCount], until: sorted[sorted.length - 1] } : null;
  const untimedX = TIMELINE_ROW_LABELS_WIDTH + UNTIMED_COLUMN / 2;
  const earlierX = TIMELINE_ROW_LABELS_WIDTH + UNTIMED_COLUMN + 20;
  const earlier = earlierCount ? { count: earlierCount, until: sorted[earlierCount - 1], x: earlierX } : null;
  const x0 = earlierX + (earlier ? 60 : 0);
  const x1 = Math.max(x0 + 200, width - RIGHT);
  const xOf = (t: number) => (!span || span.until === span.from ? (x0 + x1) / 2 : x0 + ((t - span.from) / (span.until - span.from)) * (x1 - x0));

  const places = new Map<string, { x: number; y: number }>();
  for (const n of notes) {
    const t = timeOf(n);
    const x = t === null ? untimedX : earlier && t <= earlier.until ? earlier.x : xOf(t);
    places.set(n.id, { x, y: yOf.get(rowOf.get(n.id) ?? '')! });
  }
  return { places, rows, untimedX, span, earlier, x0, x1 };
}
