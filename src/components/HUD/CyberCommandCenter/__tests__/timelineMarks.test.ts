/**
 * How the timeline draws one event: a pin at its start, a bar to its end, and a
 * faint window behind a hollow pin where its time is rough at this zoom (decision
 * D-E, settled 2026-09-14 for step 7).
 */
import { describe, it, expect } from 'vitest';
import { eventMark, PIN_RADIUS } from '../timelineMarks';
import { intelItemTime, reportTime } from '../../../../services/intel/recordTime';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const start = Date.UTC(2026, 6, 10);

/** The HUD timeline's axis, 700 canvas pixels from x 50, over this many days. */
const axisOver = (days: number) => ({ left: 50, width: 700, min: start, max: start + days * DAY });
/** Where a day falls on that axis. */
const xAt = (day: number, axisDays: number) => 50 + (day / axisDays) * 700;
const item = (fromDay: number, toDay?: number) =>
  intelItemTime({
    eventDate: new Date(start + fromDay * DAY),
    eventEndDate: toDay === undefined ? undefined : new Date(start + toDay * DAY),
  })!;

describe('eventMark', () => {
  it('draws an event with an end as a pin at its start and a bar to its end', () => {
    const mark = eventMark(item(10, 13), false, axisOver(69))!;
    expect(mark.x).toBeCloseTo(xAt(10, 69));
    expect(mark.barEndX).toBeCloseTo(xAt(13, 69));
  });

  it('stops a bar at the end of the axis', () => {
    expect(eventMark(item(60, 90), false, axisOver(69))!.barEndX).toBe(750);
  });

  it('draws no bar for an event without an end', () => {
    expect(eventMark(item(10), false, axisOver(69))!.barEndX).toBeNull();
  });

  it('keeps a day-wide time on a two-month axis a plain pin', () => {
    // A day is about 10 pixels there, narrower than the pin.
    expect((700 / 69)).toBeLessThan(2 * PIN_RADIUS);
    const mark = eventMark(item(10), false, axisOver(69))!;
    expect(mark.roughEndX).toBeNull();
    expect(mark.hollow).toBe(false);
  });

  it('draws a day-wide time on a two-week axis as rough: its day from the time, behind a hollow pin', () => {
    const mark = eventMark(item(5), false, axisOver(14))!;
    expect(mark.roughEndX).toBeCloseTo(xAt(6, 14));
    expect(mark.hollow).toBe(true);
  });

  it('runs a rough span’s window to its end, widened by how closely the end is known', () => {
    const mark = eventMark(item(2, 4), false, axisOver(14))!;
    expect(mark.barEndX).toBeCloseTo(xAt(4, 14));
    expect(mark.roughEndX).toBeCloseTo(xAt(5, 14));
  });

  it('uses a stated precision: an hour is rough on a day-long axis, and not on a two-week one', () => {
    const timeOfDay = reportTime({ startDate: new Date(start + 6 * HOUR), timePrecisionMs: HOUR })!;
    const onADay = eventMark(timeOfDay, false, { left: 50, width: 700, min: start, max: start + DAY })!;
    expect(onADay.hollow).toBe(true);
    expect(onADay.roughEndX).toBeCloseTo(50 + (7 / 24) * 700);

    expect(eventMark(timeOfDay, false, axisOver(14))!.hollow).toBe(false);
  });

  it('draws an estimate with no width as a hollow pin, with no window', () => {
    const mark = eventMark(item(10), true, axisOver(69))!;
    expect(mark.hollow).toBe(true);
    expect(mark.roughEndX).toBeNull();
  });

  it('does not draw an event outside the axis', () => {
    expect(eventMark(item(-1), false, axisOver(69))).toBeNull();
    expect(eventMark(item(70), false, axisOver(69))).toBeNull();
  });
});
