/**
 * The span every view of the timeline shows runs to the last end, not only the
 * last start, so the timeline does not cut a bar off at its edge (decision D-E,
 * settled 2026-09-14 for step 7).
 */
import { describe, it, expect } from 'vitest';
import { timelineSpan } from '../timelineSummary';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 6, 1);

describe('timelineSpan: ends', () => {
  it('runs to an end after the last start, padded as a start is', () => {
    const span = timelineSpan([
      { startTime: new Date(t0), endTime: new Date(t0 + 30 * DAY) },
      { startTime: new Date(t0 + 10 * DAY) },
    ]);
    expect(span).toEqual({ start: t0 - 3 * DAY, end: t0 + 33 * DAY });
  });

  it('does not read an end before its own start, which a record does not have', () => {
    const span = timelineSpan([
      { startTime: new Date(t0 + 10 * DAY), endTime: new Date(t0 + 5 * DAY) },
      { startTime: new Date(t0) },
    ]);
    expect(span).toEqual({ start: t0 - DAY, end: t0 + 11 * DAY });
  });

  it('does not read an end it cannot parse', () => {
    const span = timelineSpan([
      { startTime: new Date(t0), endTime: 'not a date' },
      { startTime: new Date(t0 + 10 * DAY) },
    ]);
    expect(span).toEqual({ start: t0 - DAY, end: t0 + 11 * DAY });
  });
});
