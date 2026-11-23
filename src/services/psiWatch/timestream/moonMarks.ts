/**
 * The Moon's lane past a few months (decision D-PW, PW51): its sign changes every two and a half days, too fast for a
 * lane's pixels, so the lane becomes what means something at that scale. New and full moons to three years; past
 * that, where even those are finer than a pixel, the eclipses alone, solar and lunar, each with its kind. The angles,
 * which turn every day, are drawn plain past two months.
 */
import * as Astronomy from 'astronomy-engine';
import type { TimeView } from './timeView';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

export type MoonForm = 'lane' | 'phases' | 'eclipses';
/** The Moon's form by a view's span: its lane to four months, then new and full moons, then eclipses past three years. */
export const moonForm = (spanMs: number): MoonForm => (spanMs > 3 * YEAR ? 'eclipses' : spanMs > 123 * DAY ? 'phases' : 'lane');
/** The angles drawn plain past two months. */
export const anglesPlain = (spanMs: number): boolean => spanMs > 61 * DAY;

export interface MoonMark {
  ms: number;
  kind: 'new' | 'full' | 'solar' | 'lunar';
  /** An eclipse's kind, as astronomy-engine names it: total, annular, hybrid, partial, penumbral. */
  sub?: string;
}

/** The marks a view's Moon lane draws in its form, in time order. */
export function moonMarks(view: TimeView, form: MoonForm = moonForm(view.spanMs)): MoonMark[] {
  const from = new Date(view.startMs);
  const until = view.startMs + view.spanMs;
  const marks: MoonMark[] = [];
  if (form === 'phases') {
    let at = Astronomy.MakeTime(from);
    for (;;) {
      const quarter = Astronomy.SearchMoonQuarter(at);
      const ms = quarter.time.date.getTime();
      if (ms > until) break;
      if (quarter.quarter === 0 || quarter.quarter === 2) marks.push({ ms, kind: quarter.quarter === 0 ? 'new' : 'full' });
      at = quarter.time.AddDays(1);
    }
  } else if (form === 'eclipses') {
    for (let e = Astronomy.SearchGlobalSolarEclipse(from); e.peak.date.getTime() <= until; e = Astronomy.NextGlobalSolarEclipse(e.peak)) {
      marks.push({ ms: e.peak.date.getTime(), kind: 'solar', sub: e.kind });
    }
    for (let e = Astronomy.SearchLunarEclipse(from); e.peak.date.getTime() <= until; e = Astronomy.NextLunarEclipse(e.peak)) {
      marks.push({ ms: e.peak.date.getTime(), kind: 'lunar', sub: e.kind });
    }
  }
  return marks.sort((a, b) => a.ms - b.ms);
}
