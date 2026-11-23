/**
 * The windows Raver Watch offers on the shared timeline (the owner's decision
 * of 2026-10-01: the timeline reaches forward). Tonight is the next twelve
 * hours, as Mecha Jono's "Tonight" card counts it. This weekend is Friday 00:00
 * to Monday 06:00 in each event's own time zone (raver-nights.md, RN11), so its
 * window spans every zone's, Thursday 10:00Z to Monday 18:00Z, the same for
 * every viewer, from now if it has begun (RN11a). The next seven days match how
 * far ahead events are drawn.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { tonight, thisWeekend, nextDays, weekendFridayOf, ownWeekend } from '../raverWatchWindows';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Wednesday 30 Sep 2026, 12:00Z.
const WED_NOON_Z = Date.UTC(2026, 8, 30, 12, 0);
// Friday 2 Oct 2026, the weekend's own date.
const FRI_2_OCT = Date.UTC(2026, 9, 2);

describe('Raver Watch windows', () => {
  it('Tonight: from now, the next twelve hours', () => {
    expect(tonight(WED_NOON_Z)).toEqual({ start: WED_NOON_Z, end: WED_NOON_Z + 12 * HOUR });
  });

  it('This weekend, seen from midweek: Friday 00:00 where it comes first to Monday 06:00 where it comes last', () => {
    // UTC+14 reaches Friday at Thu 10:00Z; UTC−12 leaves Monday 06:00 at Mon 18:00Z.
    expect(thisWeekend(WED_NOON_Z)).toEqual({ start: Date.UTC(2026, 9, 1, 10), end: Date.UTC(2026, 9, 5, 18) });
  });

  it('This weekend, seen during it: from now until Monday 18:00Z', () => {
    const thuNoon = Date.UTC(2026, 9, 1, 12);
    expect(thisWeekend(thuNoon)).toEqual({ start: thuNoon, end: Date.UTC(2026, 9, 5, 18) });
    const satNoon = Date.UTC(2026, 9, 3, 12);
    expect(thisWeekend(satNoon)).toEqual({ start: satNoon, end: Date.UTC(2026, 9, 5, 18) });
    // Monday morning in Los Angeles is still the weekend there.
    const monAfternoonZ = Date.UTC(2026, 9, 5, 17);
    expect(thisWeekend(monAfternoonZ)).toEqual({ start: monAfternoonZ, end: Date.UTC(2026, 9, 5, 18) });
  });

  it('This weekend, seen on Thursday before any zone has reached Friday: from Thursday 10:00Z', () => {
    expect(thisWeekend(Date.UTC(2026, 9, 1, 9))).toEqual({ start: Date.UTC(2026, 9, 1, 10), end: Date.UTC(2026, 9, 5, 18) });
  });

  it('This weekend, seen after every zone has left it: the next one', () => {
    expect(thisWeekend(Date.UTC(2026, 9, 5, 18))).toEqual({ start: Date.UTC(2026, 9, 8, 10), end: Date.UTC(2026, 9, 12, 18) });
  });

  it('The next seven days, from now', () => {
    expect(nextDays(WED_NOON_Z, 7)).toEqual({ start: WED_NOON_Z, end: WED_NOON_Z + 7 * DAY });
  });
});

describe('Which weekend a window is', () => {
  it('names the Friday of a weekend window, whole or begun', () => {
    expect(weekendFridayOf(thisWeekend(WED_NOON_Z))).toBe(FRI_2_OCT);
    expect(weekendFridayOf(thisWeekend(Date.UTC(2026, 9, 3, 12)))).toBe(FRI_2_OCT);
  });

  it('is no weekend for any other window', () => {
    expect(weekendFridayOf(tonight(WED_NOON_Z))).toBeNull();
    expect(weekendFridayOf(nextDays(WED_NOON_Z, 7))).toBeNull();
    // Ending Monday 18:00Z but reaching back before the weekend: a window dragged by hand.
    expect(weekendFridayOf({ start: WED_NOON_Z, end: Date.UTC(2026, 9, 5, 18) })).toBeNull();
  });
});

describe('An event\'s own weekend', () => {
  it('is Friday 00:00 to Monday 06:00 in its own time zone', () => {
    // Auckland keeps daylight time from 27 Sep 2026: UTC+13.
    expect(ownWeekend(FRI_2_OCT, 'Pacific/Auckland')).toEqual({ start: Date.UTC(2026, 9, 1, 11), end: Date.UTC(2026, 9, 4, 17) });
    expect(ownWeekend(FRI_2_OCT, 'Europe/London')).toEqual({ start: Date.UTC(2026, 9, 1, 23), end: Date.UTC(2026, 9, 5, 5) });
    expect(ownWeekend(FRI_2_OCT, 'America/Los_Angeles')).toEqual({ start: Date.UTC(2026, 9, 2, 7), end: Date.UTC(2026, 9, 5, 13) });
  });

  it('lies inside the window at both ends of the world', () => {
    const span = thisWeekend(WED_NOON_Z);
    expect(ownWeekend(FRI_2_OCT, 'Pacific/Kiritimati')?.start).toBe(span.start);
    expect(ownWeekend(FRI_2_OCT, 'Etc/GMT+12')?.end).toBe(span.end);
  });

  it('follows a change of the clocks inside it', () => {
    // The UK leaves summer time on Sunday 25 Oct 2026: Friday 00:00 is BST, Monday 06:00 is GMT.
    expect(ownWeekend(Date.UTC(2026, 9, 23), 'Europe/London')).toEqual({ start: Date.UTC(2026, 9, 22, 23), end: Date.UTC(2026, 9, 26, 6) });
  });

  it('is unknown for a zone this browser does not know', () => {
    expect(ownWeekend(FRI_2_OCT, 'Mars/Olympus_Mons')).toBeNull();
  });
});
