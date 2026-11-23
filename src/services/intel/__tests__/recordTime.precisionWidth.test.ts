/**
 * How wide the window each stated time starts is: the one width that both
 * matching and drawing use (decision D-E, settled 2026-09-14 for step 7).
 */
import { describe, it, expect } from 'vitest';
import { intelItemTime, overlapsWindow, precisionWidthMs, reportTime } from '../recordTime';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = Date.UTC(2026, 6, 27);

describe('precisionWidthMs', () => {
  it('is the stated precision of an event time', () => {
    expect(precisionWidthMs(reportTime({ startDate: new Date(at), timePrecisionMs: HOUR })!)).toBe(HOUR);
  });

  it('takes an event time with no stated precision as a day', () => {
    expect(precisionWidthMs(intelItemTime({ eventDate: new Date(at + 21 * HOUR) })!)).toBe(DAY);
  });

  it('gives a time a record was written no width', () => {
    expect(precisionWidthMs(reportTime({ createdAt: new Date(at) })!)).toBe(0);
  });

  it('is the width a window is matched by', () => {
    const time = intelItemTime({ eventDate: new Date(at) })!;
    const width = precisionWidthMs(time);
    expect(overlapsWindow(time, { start: at + width - 1, end: at + width + HOUR })).toBe(true);
    expect(overlapsWindow(time, { start: at + width, end: at + width + HOUR })).toBe(false);
  });
});
