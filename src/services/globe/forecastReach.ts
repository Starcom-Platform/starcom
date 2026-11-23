/**
 * How far ahead the timeline reaches (docs/missions/01-architecture-decisions/space-weather-visualization.md,
 * SW19). Each layer that forecasts publishes the last moment it has a forecast for, while it is shown;
 * the timeline, drawn in another part of the page, reaches the farthest, as the brief's days reach it
 * (warConflict/briefCalendar.ts). The intel's own range is not touched: the timeline's steps are taken
 * from it (decision D-E).
 */

export interface ForecastReach {
  /** The last moment forecast, ms. */
  until: number;
  /** What forecasts it, as a person would name it. */
  by: string;
}

const reaches = new Map<string, ForecastReach>();
let farthest: ForecastReach | null = null;
const listeners = new Set<() => void>();

/** A layer's reach while it is shown, or null once it is not. */
export function publishForecastReach(key: string, reach: ForecastReach | null): void {
  if (reach) reaches.set(key, reach);
  else reaches.delete(key);
  let next: ForecastReach | null = null;
  for (const r of reaches.values()) if (!next || r.until > next.until) next = r;
  if (next?.until === farthest?.until && next?.by === farthest?.by) return;
  farthest = next;
  listeners.forEach((listener) => listener());
}

/** The farthest reach, stable between changes, for useSyncExternalStore. */
export function getForecastReach(): ForecastReach | null {
  return farthest;
}

export function subscribeForecastReach(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only: no layer reaching ahead. */
export function resetForecastReachForTest(): void {
  reaches.clear();
  farthest = null;
  listeners.forEach((listener) => listener());
}
