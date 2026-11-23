/**
 * The Timestream's jump keys (decision D-PW, PW63): N and P put the cursor on the next or the previous moment that
 * stands out, wherever it lies: a window's peak, an alert's start, a planet's station in the drawn sky, an eclipse,
 * the view's busiest moment, or a mark the operative pinned.
 */
import * as Astronomy from 'astronomy-engine';
import { NEVER_RETROGRADE, columnMs, type SkyColumns } from './skyColumns';
import type { TimeView } from './timeView';
import type { PsiLaneItem } from './psiLanes';

/** A target this near the cursor is where it stands, not the next. */
const SAME_MS = 60_000;
const YEAR_MS = 365.25 * 86_400_000;

/** The stations in a drawn sky: each column where a planet's motion turns. */
export function stationsIn(sky: SkyColumns, view: TimeView): number[] {
  const n = sky.bodies.length;
  const out: number[] = [];
  sky.bodies.forEach((body, b) => {
    if (NEVER_RETROGRADE.has(body)) return;
    for (let col = 1; col < sky.columns; col++) {
      if (sky.retrograde[col * n + b] !== sky.retrograde[(col - 1) * n + b]) out.push(columnMs(view, sky.columns, col));
    }
  });
  return out;
}

/** The nearest eclipse, solar or lunar, after a moment (dir 1) or before it (dir -1). */
export function eclipseNear(ms: number, dir: 1 | -1): number | null {
  if (dir === 1) {
    const from = new Date(ms + SAME_MS);
    return Math.min(Astronomy.SearchGlobalSolarEclipse(from).peak.date.getTime(), Astronomy.SearchLunarEclipse(from).peak.date.getTime());
  }
  // No search runs backward: walk forward from a year before, keeping the last that falls before the moment.
  let best: number | null = null;
  const start = new Date(ms - YEAR_MS);
  for (let e = Astronomy.SearchGlobalSolarEclipse(start); e.peak.date.getTime() < ms - SAME_MS; e = Astronomy.NextGlobalSolarEclipse(e.peak)) best = Math.max(best ?? -Infinity, e.peak.date.getTime());
  for (let e = Astronomy.SearchLunarEclipse(start); e.peak.date.getTime() < ms - SAME_MS; e = Astronomy.NextLunarEclipse(e.peak)) best = Math.max(best ?? -Infinity, e.peak.date.getTime());
  return best;
}

export interface JumpSources {
  items: readonly PsiLaneItem[];
  /** The drawn sky and its view, for its stations. */
  drawn?: { sky: SkyColumns; view: TimeView } | null;
  /** The view's busiest moment, ms. */
  busiestMs?: number | null;
  marks: readonly number[];
}

/** Every moment the keys may jump to, in time order. */
export function jumpTargets({ items, drawn, busiestMs, marks }: JumpSources): number[] {
  const targets = [
    ...items.flatMap((item) => (item.lane === 'windows' ? (item.peakMs !== undefined ? [item.peakMs] : []) : [item.fromMs])),
    ...(drawn ? stationsIn(drawn.sky, drawn.view) : []),
    ...(busiestMs !== undefined && busiestMs !== null ? [busiestMs] : []),
    ...marks,
  ];
  return [...new Set(targets)].sort((a, b) => a - b);
}

/** Where a jump from the cursor lands, the eclipses searched as well: the nearest target that way, or null. */
export function jumpFrom(cursorMs: number, dir: 1 | -1, targets: readonly number[]): number | null {
  const ahead = targets.filter((t) => (dir === 1 ? t > cursorMs + SAME_MS : t < cursorMs - SAME_MS));
  const nearest = ahead.length ? (dir === 1 ? ahead[0] : ahead[ahead.length - 1]) : null;
  const eclipse = eclipseNear(cursorMs, dir);
  if (nearest === null) return eclipse;
  if (eclipse === null) return nearest;
  return dir === 1 ? Math.min(nearest, eclipse) : Math.max(nearest, eclipse);
}
