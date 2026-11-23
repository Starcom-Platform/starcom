/**
 * Earth Weather's moment as its key and a card say it (decision D-W, step
 * 5a): the hour the weather is drawn for, a forecast called one. Times go
 * through the shared formatter, in UTC marked Z (decision D-E).
 */
import { formatUtcDateTime } from '../../../utils/utcTime';

/** While live, the moment moves with the clock: the weather is weighed again each minute. */
export const WEATHER_CLOCK_MS = 60e3;

/** "for 6 Oct 22:12Z", or "forecast for 7 Oct 06:00Z" for a moment still to come. */
export function weatherWhen(at: number, now: number): string {
  return `${at > now + WEATHER_CLOCK_MS ? 'forecast for' : 'for'} ${formatUtcDateTime(at)}`;
}
