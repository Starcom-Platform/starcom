/**
 * The years Mecha Jono asks be kept out of Echoes and the alignment chart (their notes of 27 Oct on the handoff doc's
 * Psi thread, corrected the same day): the years their sealed tests are scored on. A sealed test is read once, and
 * seeing its years against the sky before that read would unblind it. Each span stays out until Mecha Jono posts in
 * that thread that it is released; the events lane, the Finder and the sky events themselves are not affected.
 */
import type { EventSetId } from './eventSets';

export interface Withheld { fromMs: number; untilMs: number; years: string }

export const WITHHELD: Record<EventSetId, readonly Withheld[]> = {
  // Rung 2's 91 tests (ucdp_exact 2015–2025).
  conflict: [{ fromMs: Date.UTC(2015, 0, 1), untilMs: Date.UTC(2026, 0, 1), years: '2015–2025' }],
  // Mars's stations against kp_storm 1966–2025.
  storms: [{ fromMs: Date.UTC(1966, 0, 1), untilMs: Date.UTC(2026, 0, 1), years: '1966–2025' }],
  // Mars's stations against comcat_m55 2000–2024.
  quakes: [{ fromMs: Date.UTC(2000, 0, 1), untilMs: Date.UTC(2025, 0, 1), years: '2000–2024' }],
};

/** A set's open record: how many of its events fall outside its withheld years, and over how many days. */
export function openRecord(set: { id: EventSetId; ms: Float64Array; fromMs: number; untilMs: number }): { events: number; days: number } {
  const DAY = 86_400_000;
  const held = WITHHELD[set.id];
  let events = 0;
  for (const ms of set.ms) if (!held.some((w) => ms >= w.fromMs && ms < w.untilMs)) events++;
  const end = set.untilMs + DAY;
  const heldDays = held.reduce((n, w) => n + Math.max(0, Math.min(w.untilMs, end) - Math.max(w.fromMs, set.fromMs)), 0) / DAY;
  return { events, days: (end - set.fromMs) / DAY - heldDays };
}

/** Whether a span, ms, touches a set's withheld years. */
export const touchesWithheld = (id: EventSetId, fromMs: number, untilMs: number): boolean =>
  WITHHELD[id].some((w) => fromMs < w.untilMs && untilMs > w.fromMs);
