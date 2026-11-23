/**
 * The War & Conflict Brief's days on the timeline (theatre-lens.md, TL8): a day for
 * each day read, coloured by that brief's worst war tier, which a click picks, and
 * so shows (TL4). The globe reads the briefs and publishes them here; the timeline,
 * drawn in another part of the page, draws them, as the key's legend store bridges
 * the layers and the card.
 */
import type { WarTier } from './warConflict';
import { TIER_WORDS, type WarConflictBrief } from './warConflictBrief';
import { formatUtcDate } from '../../utils/utcTime';

export interface BriefDay {
  /** The UTC day, YYYY-MM-DD. */
  day: string;
  /** Its worst war tier's colour, or null when none of its theatres is on a war's list. */
  color: string | null;
  /** The day in words, for its hover and its name. */
  title: string;
}

export interface BriefCalendar {
  days: readonly BriefDay[];
  /** The day the brief shows. */
  chosen: string;
  /** Shows that day's brief, and that day on the globe. */
  pick(day: string): void;
}

/** Each day read that has a brief, in the order given: its worst tier's colour, and the day in words. */
export function briefCalendarDays(
  days: readonly string[],
  briefOf: (day?: string) => WarConflictBrief | null,
  colorOf: (tier: WarTier) => string,
): BriefDay[] {
  return days.flatMap((day) => {
    const brief = briefOf(day);
    if (!brief) return [];
    // The brief orders its theatres worst war first, those on no war's list last.
    const worst = brief.theatres[0]?.tier ? brief.theatres[0] : null;
    const date = formatUtcDate(Date.parse(`${day}T00:00:00Z`), { year: true });
    const items = `${brief.count} ${brief.count === 1 ? 'item' : 'items'}`;
    return [{
      day,
      color: worst?.tier ? colorOf(worst.tier) : null,
      title: `War & Conflict Brief, ${date}: ${items}; ${worst?.tier ? `worst, ${worst.name}, ${TIER_WORDS[worst.tier]}` : 'on no war\'s list'}`,
    }];
  });
}

let current: BriefCalendar | null = null;
const listeners = new Set<() => void>();

/** The brief's days while War & Conflict is on, or null. */
export function publishBriefCalendar(next: BriefCalendar | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

/** Stable between publishes, for useSyncExternalStore. */
export function getBriefCalendar(): BriefCalendar | null {
  return current;
}

export function subscribeBriefCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
