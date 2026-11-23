import { describe, it, expect } from 'vitest';
import type { TimelineItem } from '../../adapters/timelineAdapter';
import { timelineSpan, timelineStats } from '../timelineSummary';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => ({ startTime: new Date(ms) });

describe('timelineSpan', () => {
  it('pads a tenth of the span on each side', () => {
    const first = Date.UTC(2026, 6, 9);
    expect(timelineSpan([at(first), at(first + 60 * DAY)])).toEqual({ start: first - 6 * DAY, end: first + 66 * DAY });
  });

  it('pads at least an hour, so a tight cluster still has room', () => {
    const first = Date.UTC(2026, 6, 9, 23);
    expect(timelineSpan([at(first), at(first + 10 * 60_000)])).toEqual({ start: first - HOUR, end: first + 10 * 60_000 + HOUR });
    expect(timelineSpan([at(first)])).toEqual({ start: first - HOUR, end: first + HOUR });
  });

  it('reads times given as strings, and skips times it cannot read', () => {
    const first = Date.UTC(2026, 6, 9);
    expect(timelineSpan([{ startTime: new Date(first).toISOString() }, { startTime: 'not a date' }, at(first + 10 * DAY)]))
      .toEqual({ start: first - DAY, end: first + 11 * DAY });
  });

  it('has no span when no event has a readable time', () => {
    expect(timelineSpan([])).toBeNull();
    expect(timelineSpan([{ startTime: 'not a date' }])).toBeNull();
  });

  it('handles more events than a spread call can take', () => {
    const first = Date.UTC(2026, 0, 1);
    const many = Array.from({ length: 500_000 }, (_, i) => at(first + i * 60_000));
    expect(timelineSpan(many)?.start).toBeLessThan(first);
  });
});

describe('timelineStats', () => {
  const item = (type: string, importance: number, startTime: Date) =>
    ({ id: `${type}-${importance}`, title: '', type, importance, startTime }) as unknown as TimelineItem;

  it('counts every event by type, by UTC month and by importance', () => {
    const stats = timelineStats([
      item('attack', 70, new Date(Date.UTC(2026, 6, 31, 23, 30))),
      item('attack', 69, new Date(Date.UTC(2026, 7, 1, 0, 30))),
      item('detection', 30, new Date(Date.UTC(2026, 7, 2))),
      item('detection', 29, new Date(Date.UTC(2026, 7, 3))),
    ]);

    expect(stats).toEqual({
      totalEvents: 4,
      eventsByType: { attack: 2, detection: 2 },
      eventsByMonth: { '2026-07': 1, '2026-08': 3 },
      eventsImportance: { high: 1, medium: 2, low: 1 },
    });
  });

  it('counts an event whose time cannot be read, in no month, rather than failing the whole count', () => {
    const stats = timelineStats([item('attack', 50, new Date('not a date'))]);
    expect(stats.totalEvents).toBe(1);
    expect(stats.eventsByMonth).toEqual({});
  });
});
