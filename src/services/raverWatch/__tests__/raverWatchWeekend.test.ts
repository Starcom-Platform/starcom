/**
 * This weekend, event by event (raver-nights.md, RN11, RN11a; the owner,
 * 2026-10-18): Friday 00:00 to Monday 06:00 in each event's own time zone. The
 * window spans every zone's, Thursday 10:00Z to Monday 18:00Z; a scene event in
 * it is drawn only when it starts in its own town's weekend, so a Thursday night
 * in London is not this weekend though a Friday evening in Auckland, Thursday
 * in Los Angeles, is. Every other layer sees the whole span, and so does an
 * event whose zone this browser does not know (the stated fallback).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RaverWatchItem } from '../raverWatch';
import { standsAt, notDrawn, type RaverWatchMoment } from '../raverWatchView';
import { thisWeekend, tonight } from '../raverWatchWindows';

const HOUR = 3_600;
const at = (ms: number) => ms / 1000;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'DrugCheckAlerts', title: 'A warning', source: 'A lab',
  validFrom: at(Date.UTC(2026, 8, 20)), validUntil: at(Date.UTC(2026, 9, 20)), content: 'words', level: 'amber', ...over,
});
/** A scene event starting at `startMs`, five hours long, listed in `zone`. */
const night = (startMs: number, zone: string, over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
  id: `31923:pk:raver-scene-event-${startMs}`, d: `raver-scene-event-${startMs}`, layer: 'SceneEvents', level: undefined,
  title: 'A night', source: '19hz.info', validFrom: at(startMs) - 14 * 24 * HOUR, validUntil: at(startMs) + 5 * HOUR,
  start: at(startMs), end: at(startMs) + 5 * HOUR, startTzid: zone, location: 'A town', ...over,
});
const momentOf = (window: { start: number; end: number }): RaverWatchMoment => ({
  atS: at(window.end), window: { fromS: at(window.start), untilS: at(window.end) },
});
// Wednesday 30 Sep 2026: the weekend of Friday 2 October ahead.
const WEEKEND = momentOf(thisWeekend(Date.UTC(2026, 8, 30, 12)));

describe('a scene event, this weekend', () => {
  it('is drawn when it starts in its own town\'s weekend', () => {
    // Fri 2 Oct 22:00 in Los Angeles, 05:00Z on the 3rd.
    expect(standsAt(night(Date.UTC(2026, 9, 3, 5), 'America/Los_Angeles'), WEEKEND)).toBe(true);
    // Fri 2 Oct 19:00 in Auckland: 06:00Z, still Thursday in Los Angeles.
    expect(standsAt(night(Date.UTC(2026, 9, 2, 6), 'Pacific/Auckland'), WEEKEND)).toBe(true);
    // Mon 5 Oct 01:00 in Los Angeles: Sunday night there, 08:00Z.
    expect(standsAt(night(Date.UTC(2026, 9, 5, 8), 'America/Los_Angeles'), WEEKEND)).toBe(true);
  });

  it('is not drawn on a weeknight where it is, though its night overlaps the window', () => {
    // Thu 1 Oct 23:00 in London is 22:00Z: inside the window, and Thursday there.
    expect(standsAt(night(Date.UTC(2026, 9, 1, 22), 'Europe/London'), WEEKEND)).toBe(false);
    // Mon 5 Oct 07:00 in Los Angeles, 14:00Z: Monday morning is over there.
    expect(standsAt(night(Date.UTC(2026, 9, 5, 14), 'America/Los_Angeles'), WEEKEND)).toBe(false);
  });

  it('once the weekend has begun, is drawn while its night runs on past now', () => {
    // Saturday 3 Oct 23:00Z: a London night from 22:00 BST (21:00Z) is still on.
    const begun = momentOf(thisWeekend(Date.UTC(2026, 9, 3, 23)));
    expect(standsAt(night(Date.UTC(2026, 9, 3, 21), 'Europe/London'), begun)).toBe(true);
  });

  it('falls back to the window for a zone this browser does not know', () => {
    expect(standsAt(night(Date.UTC(2026, 9, 1, 22), 'Mars/Olympus_Mons'), WEEKEND)).toBe(true);
  });

  it('is judged by the window alone in any other window', () => {
    const thursdayTonight = momentOf(tonight(Date.UTC(2026, 9, 1, 20)));
    expect(standsAt(night(Date.UTC(2026, 9, 1, 22), 'Europe/London'), thursdayTonight)).toBe(true);
  });
});

describe('every other layer, this weekend', () => {
  it('sees the whole span, Thursday 10:00Z to Monday 18:00Z', () => {
    const thursday = item({ validFrom: at(Date.UTC(2026, 9, 1, 12)), validUntil: at(Date.UTC(2026, 9, 1, 20)) });
    expect(standsAt(thursday, WEEKEND)).toBe(true);
    const mondayEvening = item({ validFrom: at(Date.UTC(2026, 9, 5, 17)), validUntil: at(Date.UTC(2026, 9, 6)) });
    expect(standsAt(mondayEvening, WEEKEND)).toBe(true);
  });
});

describe('what the key says this weekend', () => {
  it('counts the events outside their own town\'s weekend apart from those not begun or ended', () => {
    const counts = notDrawn([
      night(Date.UTC(2026, 9, 1, 22), 'Europe/London'),
      night(Date.UTC(2026, 9, 5, 14), 'America/Los_Angeles'),
      night(Date.UTC(2026, 9, 3, 5), 'America/Los_Angeles'),
      // The weekend after: not begun.
      night(Date.UTC(2026, 9, 10, 5), 'America/Los_Angeles'),
    ], WEEKEND, () => true);
    expect(counts).toMatchObject({ outsideWeekend: 2, notYet: 1, ended: 0 });
  });
});
