/**
 * The aspect lane's events (decision D-PW, PW42; Cosmic Cypher's `AspectEventLane`): over a view, each pair of the
 * ten bodies' major aspects while in orb, from the columns the lanes already hold, with their exact moments. The orbs
 * are the sky catalogue's (PW13, `astro/aspects.ts`), so a window here is the one a sky event names.
 */
import { ASTRO_BODIES, type AstroBody } from '../astro/sky';
import { ASPECT_KINDS, orbOf, type AspectName, type OrbScheme } from '../astro/aspects';
import { columnMs, type SkyColumns } from './skyColumns';
import type { TimeView } from './timeView';

export interface AspectEvent {
  a: AstroBody;
  b: AstroBody;
  kind: AspectName;
  /** While in orb, and its exact moment, ms; clipped to the view where it runs past an edge. */
  fromMs: number;
  untilMs: number;
  exactMs: number;
  /** Whether its exact moment falls inside the view. */
  exactInView: boolean;
  /** Whether it was in orb already at the view's start, or still at its end: that edge is the view's, not its own. */
  fromEdge: boolean;
  untilEdge: boolean;
}

/** How far apart two longitudes stand, 0–180°. */
const apart = (x: number, y: number) => {
  const d = Math.abs(x - y) % 360;
  return d > 180 ? 360 - d : d;
};

/** Every major aspect between two of the ten bodies while in orb across a view's columns, in time order. */
export function aspectEvents(sky: SkyColumns, view: TimeView, scheme: OrbScheme = 'catalogue'): AspectEvent[] {
  const n = sky.bodies.length;
  const index = new Map(sky.bodies.map((b, i) => [b, i]));
  const bodies = ASTRO_BODIES.filter((b) => index.has(b));
  const at = (col: number) => columnMs(view, sky.columns, col);
  const events: AspectEvent[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]; const b = bodies[j];
      const ia = index.get(a)!; const ib = index.get(b)!;
      for (const kind of ASPECT_KINDS) {
        if (!kind.major) continue;
        const orb = orbOf(kind, scheme, a, b);
        if (orb <= 0) continue;
        let start = -1; let best = -1; let bestDev = Infinity;
        const close = (end: number) => {
          // The exact moment between the closest column and its nearer neighbour, by the deviations' slope.
          let exactMs = at(best);
          const prev = best > 0 ? Math.abs(apart(sky.longitudes[(best - 1) * n + ia], sky.longitudes[(best - 1) * n + ib]) - kind.angle) : Infinity;
          const next = best < sky.columns - 1 ? Math.abs(apart(sky.longitudes[(best + 1) * n + ia], sky.longitudes[(best + 1) * n + ib]) - kind.angle) : Infinity;
          const step = view.spanMs / sky.columns;
          if (Number.isFinite(prev) && Number.isFinite(next)) {
            const denom = prev - 2 * bestDev + next;
            if (denom > 1e-9) exactMs += Math.max(-0.5, Math.min(0.5, (prev - next) / (2 * denom))) * step;
          }
          events.push({
            a, b, kind: kind.name, fromMs: at(start) - step / 2, untilMs: at(end) + step / 2, exactMs,
            exactInView: exactMs >= view.startMs && exactMs <= view.startMs + view.spanMs,
            fromEdge: start === 0, untilEdge: end === sky.columns - 1,
          });
        };
        for (let col = 0; col < sky.columns; col++) {
          const dev = Math.abs(apart(sky.longitudes[col * n + ia], sky.longitudes[col * n + ib]) - kind.angle);
          if (dev <= orb) {
            if (start < 0) { start = col; bestDev = Infinity; }
            if (dev < bestDev) { bestDev = dev; best = col; }
          } else if (start >= 0) {
            close(col - 1);
            start = -1;
          }
        }
        if (start >= 0) close(sky.columns - 1);
      }
    }
  }
  return events.sort((x, y) => x.exactMs - y.exactMs);
}

/** Rows for a lane: each event in the first row it fits without touching another, up to `rows`; the rest counted. */
export function stackEvents<T extends { fromMs: number; untilMs: number }>(events: readonly T[], rows: number): { placed: { event: T; row: number }[]; hidden: number } {
  const ends: number[] = [];
  const placed: { event: T; row: number }[] = [];
  let hidden = 0;
  for (const event of [...events].sort((x, y) => x.fromMs - y.fromMs)) {
    let row = ends.findIndex((end) => end < event.fromMs);
    if (row < 0 && ends.length < rows) row = ends.length;
    if (row < 0) { hidden++; continue; }
    ends[row] = event.untilMs;
    placed.push({ event, row });
  }
  return { placed, hidden };
}
