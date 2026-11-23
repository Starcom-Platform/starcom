import { describe, it, expect } from 'vitest';
import { computeLocationConflicts, computeCorroboratedFindings } from '../correlationUtils';
import { supportsWindow, DEFAULT_TIME_PRECISION_MS } from '../../../../types/intel/SourceObservation';
import type { Event } from '../../adapters/eventsAdapter';

/**
 * A source that only knows WHEN to within a week cannot support a claim about
 * a 24-hour window.
 *
 * 240 of 1795 events in a current UCDP release are imprecise — a few days, a
 * week, a month, a year. Before this, all of them corroborated and contradicted
 * inside the window as though timed to the second, inventing precision the
 * source had explicitly declined to claim.
 */

const DAY = 24 * 60 * 60 * 1000;
const mk = (id: string, lat: number, lon: number, hours: number, precisionMs?: number): Event => ({
  id, title: id, timestamp: new Date(Date.parse('2026-08-20T00:00:00Z') + hours * 3600e3).toISOString(),
  category: 'G', tags: [], lat, lon, confidence: 0.8, sourceType: 'OBSERVATION',
  sourceId: id, entityRefs: ['Subject'],
  ...(precisionMs !== undefined ? { timePrecisionMs: precisionMs } : {}),
} as Event);

describe('supportsWindow', () => {
  it('accepts precision at or finer than the window', () => {
    expect(supportsWindow(DAY, DAY)).toBe(true);
    expect(supportsWindow(60_000, DAY)).toBe(true);
  });

  it('rejects precision coarser than the window', () => {
    expect(supportsWindow(7 * DAY, DAY)).toBe(false);
    expect(supportsWindow(365 * DAY, DAY)).toBe(false);
  });

  it('treats unstated precision as a day, not an instant', () => {
    // A date with no time is a day, not a midnight.
    expect(DEFAULT_TIME_PRECISION_MS).toBe(DAY);
    expect(supportsWindow(undefined, DAY)).toBe(true);
    expect(supportsWindow(undefined, 3600_000)).toBe(false);
  });
});

describe('imprecise observations cannot corroborate within the window', () => {
  it('corroborates two day-precise observations', () => {
    const findings = computeCorroboratedFindings([
      mk('a', 10, 10, 0, DAY), mk('b', 10.1, 10.1, 1, DAY),
    ]);
    expect(findings).toHaveLength(1);
  });

  it('refuses to corroborate when one side is only known to within a month', () => {
    const findings = computeCorroboratedFindings([
      mk('a', 10, 10, 0, DAY), mk('b', 10.1, 10.1, 1, 30 * DAY),
    ]);
    // "Sometime in June" and "at 02:00 on the 20th" cannot establish that they
    // happened within 24 hours of each other.
    expect(findings).toHaveLength(0);
  });
});

describe('imprecise observations cannot contradict within the window', () => {
  it('flags a contradiction between two day-precise observations', () => {
    const conflicts = computeLocationConflicts([
      mk('a', 48.85, 2.35, 0, DAY), mk('b', 35.68, 139.69, 1, DAY),
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it('refuses when one side is only known to within a week', () => {
    const conflicts = computeLocationConflicts([
      mk('a', 48.85, 2.35, 0, DAY), mk('b', 35.68, 139.69, 1, 7 * DAY),
    ]);
    // Being in Paris on Tuesday and Tokyo "sometime this week" is not a
    // contradiction.
    expect(conflicts).toHaveLength(0);
  });

  it('still works for sources that state no precision, preserving prior behaviour', () => {
    const conflicts = computeLocationConflicts([
      mk('a', 48.85, 2.35, 0), mk('b', 35.68, 139.69, 1),
    ]);
    expect(conflicts).toHaveLength(1);
  });
});
