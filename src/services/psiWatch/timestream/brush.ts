/**
 * The Timestream's brushed span (decision D-PW, PW50): a Shift-drag across the lanes picks a span, and what falls in
 * it is lit at full strength in the drawer, on the globe and in the panel, the rest dimmed but drawn. One span at a
 * time, kept until cleared; the drawer sets it, the globe and the panel read it.
 */
import { useSyncExternalStore } from 'react';

/** A brushed span, ms, from before until. */
export interface Brush { fromMs: number; untilMs: number }

let brush: Brush | null = null;
const listeners = new Set<() => void>();

export const getBrush = (): Brush | null => brush;

export function setBrush(next: Brush | null): void {
  const span = next && next.untilMs < next.fromMs ? { fromMs: next.untilMs, untilMs: next.fromMs } : next;
  if (span?.fromMs === brush?.fromMs && span?.untilMs === brush?.untilMs) return;
  brush = span;
  listeners.forEach((listener) => listener());
}

export function subscribeBrush(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useBrush = (): Brush | null => useSyncExternalStore(subscribeBrush, getBrush, getBrush);

/** Whether a span of time touches the brushed one; true with nothing brushed. */
export const inBrush = (span: Brush | null, fromMs: number, untilMs: number): boolean =>
  !span || (untilMs >= span.fromMs && fromMs <= span.untilMs);
