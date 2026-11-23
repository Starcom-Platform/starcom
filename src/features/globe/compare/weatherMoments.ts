/**
 * Earth Weather now beside a forecast hour (D-CM, CM5): the hours the right half may be set ahead, as the forecast
 * strip names them (+6 h to +7 d), the two hours drawn, and each half's name.
 */
import { COMPARE_AHEAD_HOURS } from '../capture/shareHandleContract';
import { formatUtcDateTime, notThisYear } from '../../../utils/utcTime';

export { COMPARE_AHEAD_HOURS };

const HOUR = 3_600_000;

/** A forecast hour as the strip names it: "+6 h", "+1 d". */
export const aheadLabel = (hours: number): string => (hours % 24 === 0 ? `+${hours / 24} d` : `+${hours} h`);

/**
 * The two hours drawn: the moment shown (the shared cursor's while paused), or the hour while live, so the right half
 * stays put as the minutes pass; and so many hours after it.
 */
export function weatherHours(moment: number | null, ahead: number, now: number): { shownAt: number; thenAt: number } {
  const shownAt = moment ?? Math.floor(now / HOUR) * HOUR;
  return { shownAt, thenAt: shownAt + ahead * HOUR };
}

/** Each half's name: its hour, and "forecast" for an hour still to come; the left half while live is now. */
export function weatherHalfLabels(moment: number | null, hours: { shownAt: number; thenAt: number }, now: number): { left: string; right: string } {
  const named = (at: number) => `Earth Weather, ${formatUtcDateTime(at, { year: notThisYear(at) })}${at > now ? ', forecast' : ''}`;
  return { left: moment === null ? 'Earth Weather, now' : named(hours.shownAt), right: named(hours.thenAt) };
}
