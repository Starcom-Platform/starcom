/**
 * The window the quakes show now, as a moment comparison holds it (D-CM, CM4): the paused window, or while live the
 * time bar's range's (the last day, 7 or 30 days), as the quakes' own read works it out (quakeWindowFor).
 */
import { quakeWindowFor } from '../../../services/quakes/quakeWindow';
import { timebarRange } from '../timebar/timebarRange';

export function quakeWindowShown(paused: { start: number; end: number } | null, now = Date.now()): { from: number; until: number } {
  const w = quakeWindowFor({ range: timebarRange(), paused, now });
  return { from: w.from, until: w.until };
}
