import { describe, it, expect } from 'vitest';
import { computeLocationConflicts, computeCorroboratedFindings } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

/**
 * A finding without a time cannot be placed on a timeline, scrubbed, or aged.
 * Corroboration and contradiction both span MOMENTS, so both carry a range
 * rather than a point — collapsing agreement-across-time to a single instant
 * would assert a precision the evidence does not have.
 */

const at = (iso: string) => Date.parse(iso);

const mk = (id: string, lat: number, lon: number, iso: string, entity = 'Subject'): Event => ({
  id, title: id, timestamp: new Date(at(iso)).toISOString(), category: 'G', tags: [],
  lat, lon, confidence: 0.8, sourceType: 'REPORT', sourceId: id, entityRefs: [entity],
} as Event);

describe('corroborated findings carry the span of their evidence', () => {
  it('derives the range from the earliest and latest contributing observation', () => {
    const [finding] = computeCorroboratedFindings([
      mk('a', 10, 10, '2026-08-20T02:00:00Z'),
      mk('b', 10.1, 10.1, '2026-08-20T05:00:00Z'),
      mk('c', 10.05, 10.05, '2026-08-20T09:00:00Z'),
    ]);

    expect(finding.observedFrom).toBe('2026-08-20T02:00:00.000Z');
    expect(finding.observedTo).toBe('2026-08-20T09:00:00.000Z');
  });

  it('emits a real range, not a collapsed instant', () => {
    const [finding] = computeCorroboratedFindings([
      mk('a', 10, 10, '2026-08-20T02:00:00Z'),
      mk('b', 10.1, 10.1, '2026-08-20T08:00:00Z'),
    ]);
    expect(finding.observedFrom).not.toBe(finding.observedTo);
  });

  it('is UTC ISO 8601, so the range is comparable across sources', () => {
    const [finding] = computeCorroboratedFindings([
      mk('a', 10, 10, '2026-08-20T02:00:00Z'),
      mk('b', 10.1, 10.1, '2026-08-20T05:00:00Z'),
    ]);
    expect(finding.observedFrom).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(finding.observedTo).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});

describe('contradictions carry both moments', () => {
  it('records the earlier observation first', () => {
    const [conflict] = computeLocationConflicts([
      mk('a', 48.85, 2.35, '2026-08-20T03:00:00Z'),
      mk('b', 35.68, 139.69, '2026-08-20T04:00:00Z'),
    ]);

    expect(conflict.observedFrom).toBe('2026-08-20T03:00:00.000Z');
    expect(conflict.observedTo).toBe('2026-08-20T04:00:00.000Z');
    // The absolute times must agree with the relative gap already reported.
    expect(conflict.hoursApart).toBe(1);
  });
});
