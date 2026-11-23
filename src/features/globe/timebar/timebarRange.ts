/**
 * The time bar's range, All or a span ending now (critique-2026-11-01, OR4; plan C1), kept in this browser and shared:
 * the bar sets it, and a layer that reads by the window shown follows it, as the quakes do (D-EQ, EQ14). History
 * (EQ15) runs the axis from 1900, or from 2150 BC, to now, and a moment chosen on it selects the decade, year or month
 * containing it.
 */
import { useSyncExternalStore } from 'react';

export const RANGE_PRESETS = [
  { id: 'all', label: 'All', ms: null },
  { id: '24h', label: '24 h', ms: days(1) },
  { id: '7d', label: '7 d', ms: days(7) },
  { id: '30d', label: '30 d', ms: days(30) },
  { id: '1y', label: '1 y', ms: days(365) },
  { id: 'history', label: 'History', ms: null },
] as const;
export type RangePresetId = (typeof RANGE_PRESETS)[number]['id'];
function days(n: number): number { return n * 86_400_000; }

const RANGE_KEY = 'starcom:timebar-range';
const listeners = new Set<() => void>();
let current: RangePresetId | null = null;

function read(): RangePresetId {
  try {
    const kept = localStorage.getItem(RANGE_KEY);
    return RANGE_PRESETS.some((p) => p.id === kept) ? (kept as RangePresetId) : 'all';
  } catch { return 'all'; }
}

/** The range chosen: All until one is picked. */
export function timebarRange(): RangePresetId {
  current ??= read();
  return current;
}

export function setTimebarRange(id: RangePresetId): void {
  current = id;
  try { localStorage.setItem(RANGE_KEY, id); } catch { /* kept for this page only */ }
  listeners.forEach((listener) => listener());
}

export function subscribeTimebarRange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTimebarRange(): RangePresetId {
  return useSyncExternalStore(subscribeTimebarRange, timebarRange, () => 'all');
}

// ── History (EQ15) ───────────────────────────────────────────────────────────
export type HistorySpan = '1900' | 'atlas';
export type HistoryUnit = 'decade' | 'year' | 'month';
export const HISTORY_UNITS: readonly HistoryUnit[] = ['decade', 'year', 'month'];
/** Where History's axis starts: 1900, USGS's catalogue; or 2150 BC, NOAA's atlas (astronomical year -2149). */
export function historyStart(span: HistorySpan): number {
  return span === 'atlas' ? historicalUtc(-2149) : Date.UTC(1900, 0, 1);
}

/** The earliest moment a window may start, unix seconds: the atlas's 2150 BC. The share handle takes it too. */
export const HISTORY_FLOOR_S = Math.floor(historicalUtc(-2149) / 1000);

/** A year's start, ms: Date.UTC maps years 0–99 to 1900–1999, so they are set on their own. */
export function historicalUtc(year: number, month = 0, day = 1): number {
  const d = new Date(Date.UTC(2000, month, day));
  d.setUTCFullYear(year);
  return d.getTime();
}

/** The decade, year or month containing a moment, as a window [start, end). */
export function historyWindowContaining(t: number, unit: HistoryUnit): { start: number; end: number } {
  const d = new Date(t);
  const year = d.getUTCFullYear();
  if (unit === 'month') return { start: historicalUtc(year, d.getUTCMonth()), end: historicalUtc(year, d.getUTCMonth() + 1) };
  if (unit === 'year') return { start: historicalUtc(year), end: historicalUtc(year + 1) };
  const decade = Math.floor(year / 10) * 10;
  return { start: historicalUtc(decade), end: historicalUtc(decade + 10) };
}

/** A year as people write it: 1964, 44 BC (astronomical 0 is 1 BC). */
export function yearWords(year: number): string {
  return year > 0 ? String(year) : `${1 - year} BC`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A History window's name: "the 1960s", "1964", "Mar 1964". */
export function historyWindowWords(window: { start: number; end: number }, unit: HistoryUnit): string {
  const d = new Date(window.start);
  const year = d.getUTCFullYear();
  if (unit === 'month') return `${MONTHS[d.getUTCMonth()]} ${yearWords(year)}`;
  if (unit === 'year') return yearWords(year);
  return year > 0 ? `the ${year}s` : `the decade from ${yearWords(year)}`;
}

let history: { span: HistorySpan; unit: HistoryUnit } | null = null;
const HISTORY_KEY = 'starcom:timebar-history';
function readHistory(): { span: HistorySpan; unit: HistoryUnit } {
  try {
    const kept = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null') as { span?: string; unit?: string } | null;
    return {
      span: kept?.span === 'atlas' ? 'atlas' : '1900',
      unit: HISTORY_UNITS.includes(kept?.unit as HistoryUnit) ? (kept?.unit as HistoryUnit) : 'year',
    };
  } catch { return { span: '1900', unit: 'year' }; }
}
/** History's span and unit: from 1900, a year, until chosen. */
export function timebarHistory(): { span: HistorySpan; unit: HistoryUnit } {
  history ??= readHistory();
  return history;
}
export function setTimebarHistory(next: Partial<{ span: HistorySpan; unit: HistoryUnit }>): void {
  history = { ...timebarHistory(), ...next };
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* kept for this page only */ }
  listeners.forEach((listener) => listener());
}
const DEFAULT_HISTORY = { span: '1900' as HistorySpan, unit: 'year' as HistoryUnit };
export function useTimebarHistory(): { span: HistorySpan; unit: HistoryUnit } {
  return useSyncExternalStore(subscribeTimebarRange, timebarHistory, () => DEFAULT_HISTORY);
}

/** Test-only. */
export function resetTimebarRangeForTests(): void {
  current = null;
  history = null;
}
