/**
 * The War & Conflict Brief's days on the timeline (theatre-lens.md, TL8): a day
 * for each day read, coloured by that brief's worst war tier, which a click
 * picks. Published by the globe, which reads the briefs, for the timeline, which
 * draws in another part of the page.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  briefCalendarDays, publishBriefCalendar, getBriefCalendar, subscribeBriefCalendar,
} from '../briefCalendar';
import type { WarConflictBrief } from '../warConflictBrief';

const brief = (day: string, count: number, theatres: WarConflictBrief['theatres']): WarConflictBrief => ({
  day, count, theatres, noTheatre: 0, ids: [], title: '', lines: [],
});
const colours = { major_war: '#f00', minor_war: '#f80', conflict: '#fb0', skirmish: '#ff8' } as const;

describe('the brief\'s days', () => {
  beforeEach(() => publishBriefCalendar(null));

  it('gives each day read its worst war\'s colour, and says the day in words', () => {
    const briefs: Record<string, WarConflictBrief> = {
      '2026-10-09': brief('2026-10-09', 12, [
        { slug: 'russia-ukraine', name: 'Russia–Ukraine war', count: 5, tier: 'major_war' },
        { slug: 'sudan', name: 'Sudanese civil war', count: 7, tier: 'minor_war' },
      ]),
      '2026-10-08': brief('2026-10-08', 1, [{ slug: 'haiti', name: 'Haiti gang war', count: 1, tier: null }]),
    };
    const days = briefCalendarDays(['2026-10-09', '2026-10-08', '2026-10-07'], (d) => briefs[d!] ?? null, (tier) => colours[tier]);
    expect(days).toEqual([
      { day: '2026-10-09', color: '#f00', title: 'War & Conflict Brief, 9 Oct 2026: 12 items; worst, Russia–Ukraine war, a major war' },
      { day: '2026-10-08', color: null, title: 'War & Conflict Brief, 8 Oct 2026: 1 item; on no war\'s list' },
    ]);
  });

  it('is held for the timeline, which hears each change, and cleared', () => {
    const heard = vi.fn();
    const stop = subscribeBriefCalendar(heard);
    const calendar = { days: [], chosen: '2026-10-09', pick: vi.fn() };
    publishBriefCalendar(calendar);
    expect(getBriefCalendar()).toBe(calendar);
    publishBriefCalendar(null);
    expect(getBriefCalendar()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    publishBriefCalendar(calendar);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
