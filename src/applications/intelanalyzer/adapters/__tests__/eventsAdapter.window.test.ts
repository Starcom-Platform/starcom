/**
 * IntelAnalyzer's time filter matches an event by overlap, placed by its event
 * time where its record states one (decision D-E). Each view compared one instant.
 */
import { describe, it, expect } from 'vitest';
import { eventInTimeRange, eventRecordTime, placedByWritten } from '../eventsAdapter';

const DAY = 86_400_000;
const ev = (over: { timestamp?: string; timeBasis?: 'event' | 'written'; timeEndMs?: number; timePrecisionMs?: number }) => ({
  timestamp: '2026-07-01T00:00:00.000Z',
  ...over,
});
const range = (from: string, to: string) => ({ start: new Date(from), end: new Date(to) });

describe('eventInTimeRange', () => {
  it('keeps an event whose span meets the range anywhere, not only at its start', () => {
    const span = ev({ timeBasis: 'event', timeEndMs: Date.parse('2026-07-10T00:00:00Z'), timePrecisionMs: DAY });
    expect(eventInTimeRange(span, range('2026-07-05T00:00:00Z', '2026-07-05T01:00:00Z'))).toBe(true);
    expect(eventInTimeRange(span, range('2026-07-11T00:00:00Z', '2026-07-11T01:00:00Z'))).toBe(false);
  });

  it('reads an observation, which states no basis, as its event time, a day wide when no precision is given', () => {
    expect(eventRecordTime(ev({}))?.basis).toBe('event');
    expect(eventInTimeRange(ev({}), range('2026-07-01T20:00:00Z', '2026-07-01T21:00:00Z'))).toBe(true);
  });

  it('takes a written time as the instant it names', () => {
    expect(eventInTimeRange(ev({ timeBasis: 'written' }), range('2026-07-01T00:00:00Z', '2026-07-01T01:00:00Z'))).toBe(true);
    expect(eventInTimeRange(ev({ timeBasis: 'written' }), range('2026-07-01T00:00:00.001Z', '2026-07-01T01:00:00Z'))).toBe(false);
  });

  it('drops an event whose time cannot be read', () => {
    expect(eventInTimeRange(ev({ timestamp: 'not a date' }), range('2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z'))).toBe(false);
  });
});

describe('placedByWritten', () => {
  it('counts the events placed by when their record was written', () => {
    expect(placedByWritten([{ timeBasis: 'written' }, { timeBasis: 'event' }, {}, { timeBasis: 'written' }])).toBe(2);
  });
});
