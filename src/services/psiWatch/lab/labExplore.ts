/**
 * The lab's exploration (decision D-PW, PW4, PW10, PW94, PW95): a kind of sky event's moments across an event set's
 * open record, a window about each, and the events those windows hold, beside the counts the same windows hold under
 * random time shifts. Exploration only: no p-value, no verdict, nothing that reads as a result. The years Mecha Jono
 * holds back for their sealed tests stay out (PW75, `withheld.ts`): a window touching them, or running past the
 * record's ends, is not counted, and the shifts move the windows through the open record alone.
 *
 * The shifts are circular on the open record laid end to end, so every shift keeps every window and the same number of
 * days; drawn from a fixed seed, so the same exploration draws the same picture.
 */
import type { EventSet } from '../timestream/eventSets';
import { WITHHELD } from '../timestream/withheld';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A window about each moment: from `before` units before it to `after` units after it. */
export interface LabWindow {
  before: number;
  after: number;
  unit: 'day' | 'hour';
}

export interface LabExploration {
  /** The moments found across the open record. */
  moments: number;
  /** The windows counted: wholly inside the open record. */
  windows: number;
  /** The windows left out: touching the held-back years or past the record's ends. */
  leftOut: number;
  /** The events the windows hold, each counted once however many windows hold it. */
  observed: number;
  /** The counts under each time shift. */
  shifted: number[];
  /** Their mean: what windows that long hold, placed anywhere in the open record. */
  usual: number;
  /** The open record's days, and its first and last moments, ms. */
  openDays: number;
  fromMs: number;
  untilMs: number;
}

/** Shifts drawn, as PW95 has it. */
export const LAB_SHIFTS = 1000;
const SEED = 0x5eed_c0de;

/** A small, fixed, seeded generator (mulberry32): the same picture from the same exploration. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The open record: the set's days, its last day whole, less the held-back years; spans in time order, ms. */
export function openSpans(set: Pick<EventSet, 'id' | 'fromMs' | 'untilMs'>): Array<{ fromMs: number; untilMs: number }> {
  let spans = [{ fromMs: set.fromMs, untilMs: set.untilMs + DAY_MS }];
  for (const held of WITHHELD[set.id]) {
    spans = spans.flatMap((s) => {
      if (held.untilMs <= s.fromMs || held.fromMs >= s.untilMs) return [s];
      return [
        ...(held.fromMs > s.fromMs ? [{ fromMs: s.fromMs, untilMs: held.fromMs }] : []),
        ...(held.untilMs < s.untilMs ? [{ fromMs: held.untilMs, untilMs: s.untilMs }] : []),
      ];
    });
  }
  return spans;
}

/** The first index whose value is at least `x`. */
function lowerBound(sorted: Float64Array | number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Events in a set of half-open intervals on the laid-out record, each event once. */
function countIn(events: Float64Array, intervals: Array<[number, number]>): number {
  intervals.sort((x, y) => x[0] - y[0]);
  let count = 0;
  let reach = -Infinity;
  for (const [s, e] of intervals) {
    const from = Math.max(s, reach);
    if (e > from) count += lowerBound(events, e) - lowerBound(events, from);
    reach = Math.max(reach, e);
  }
  return count;
}

/** The exploration of `moments` (ms) against `set`, a window about each. */
export function explore(set: EventSet, moments: readonly number[], window: LabWindow, shifts = LAB_SHIFTS): LabExploration {
  const spans = openSpans(set);
  // The open record laid end to end: each span's start, on the record and on the laid-out line.
  const starts: number[] = [];
  let length = 0;
  for (const s of spans) { starts.push(length); length += s.untilMs - s.fromMs; }
  const laid = (ms: number): number | null => {
    for (let i = 0; i < spans.length; i++) if (ms >= spans[i].fromMs && ms < spans[i].untilMs) return starts[i] + (ms - spans[i].fromMs);
    return null;
  };
  const unit = window.unit === 'hour' ? HOUR_MS : DAY_MS;
  const before = window.before * unit;
  const after = window.after * unit;
  // A window counts only wholly inside one open span.
  const windows: Array<[number, number]> = [];
  let leftOut = 0;
  for (const m of moments) {
    const s = m - before;
    const e = m + after;
    const span = spans.findIndex((sp) => s >= sp.fromMs && e <= sp.untilMs);
    if (span < 0 || e <= s) { leftOut++; continue; }
    windows.push([starts[span] + (s - spans[span].fromMs), starts[span] + (e - spans[span].fromMs)]);
  }
  const laidEvents: number[] = [];
  for (const ms of set.ms) { const at = laid(ms); if (at !== null) laidEvents.push(at); }
  const events = Float64Array.from(laidEvents.sort((x, y) => x - y));
  const observed = countIn(events, windows.map(([s, e]) => [s, e]));
  const random = seeded(SEED);
  const shifted: number[] = [];
  for (let k = 0; k < shifts && windows.length && length > 0; k++) {
    const d = random() * length;
    const moved: Array<[number, number]> = [];
    for (const [s, e] of windows) {
      const ns = (s + d) % length;
      const ne = ns + (e - s);
      if (ne <= length) moved.push([ns, ne]);
      else moved.push([ns, length], [0, ne - length]);
    }
    shifted.push(countIn(events, moved));
  }
  return {
    moments: moments.length,
    windows: windows.length,
    leftOut,
    observed,
    shifted,
    usual: shifted.length ? shifted.reduce((n, c) => n + c, 0) / shifted.length : 0,
    openDays: length / DAY_MS,
    fromMs: spans[0]?.fromMs ?? set.fromMs,
    untilMs: spans[spans.length - 1]?.untilMs ?? set.untilMs,
  };
}

/** The shifted counts in bins for a histogram: `bins` equal steps from the least to the most, the observed among them. */
export function histogram(shifted: readonly number[], observed: number, bins = 24): { from: number; step: number; counts: number[] } {
  const lo = Math.min(observed, ...shifted);
  const hi = Math.max(observed, ...shifted);
  const step = Math.max(1, Math.ceil((hi - lo + 1) / bins));
  const counts = new Array<number>(Math.max(1, Math.ceil((hi - lo + 1) / step))).fill(0);
  for (const c of shifted) counts[Math.floor((c - lo) / step)]++;
  return { from: lo, step, counts };
}
