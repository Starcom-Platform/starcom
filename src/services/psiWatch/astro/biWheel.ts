/**
 * An event chart, then and now (decision D-PW, PW60, PW85–PW87): the event's chart for when and where it happened,
 * inside; the sky at the shared cursor, outside, in the same frame and placed in the event's houses; and the aspects
 * across, each between one of the event's bodies and one of the cursor's. Both are in one frame (the Galactic Centre's
 * by default, PW5), so a body's place then and its place now are measured alike.
 */
import { ASPECT_KINDS, orbOf, separation, type AspectKind, type AspectName, type OrbScheme } from './aspects';
import { chartAt, DEFAULT_ORBS, type Chart, type ChartOptions, type ChartPoint } from './chart';
import { houseOf } from './houses';
import type { AstroPoint } from './sky';

export interface CrossAspect {
  /** The event's body, and the cursor's. */
  then: AstroPoint;
  now: AstroPoint;
  kind: AspectName;
  angle: number;
  /** How far from exact, degrees. */
  orb: number;
  /** 0–1, as a chart's aspects weigh theirs. */
  weight: number;
  /** The cursor's body closing on exact: the orb is shrinking as the cursor moves on. */
  applying: boolean;
}

export interface BiWheel {
  then: Chart;
  /** The sky at the cursor, each body with its house in the event's houses where the event has them. */
  now: Chart;
  across: CrossAspect[];
}

/**
 * Every aspect across, tightest first: each pair of one body then and one now takes the one aspect it stands closest
 * to within its orb, so wide orbs never count a pair twice. The event's bodies stand still; the cursor's move.
 */
export function aspectsAcross(then: readonly ChartPoint[], now: readonly ChartPoint[], scheme: OrbScheme): CrossAspect[] {
  const found: CrossAspect[] = [];
  for (const p of then) {
    for (const q of now) {
      const apart = separation(p.lon, q.lon);
      let best: { kind: AspectKind; orb: number; cap: number } | null = null;
      for (const kind of ASPECT_KINDS) {
        const orb = Math.abs(apart - kind.angle);
        const cap = orbOf(kind, scheme, p.body, q.body);
        if (cap > 0 && orb <= cap && (!best || orb < best.orb)) best = { kind, orb, cap };
      }
      if (!best) continue;
      const later = separation(p.lon, q.lon + q.speed / 24);
      found.push({
        then: p.body, now: q.body, kind: best.kind.name, angle: best.kind.angle, orb: best.orb,
        weight: Math.pow(2, -((best.orb / (best.cap / 3)) ** 2)),
        applying: Math.abs(later - best.kind.angle) < best.orb,
      });
    }
  }
  return found.sort((x, y) => x.orb - y.orb);
}

/** The event's chart and the cursor's sky, in one frame, and the aspects across. */
export function biWheel(eventAt: Date, place: { lat: number; lng: number }, cursorAt: Date, options: ChartOptions = {}): BiWheel {
  const then = chartAt(eventAt, place, options);
  const sky = chartAt(cursorAt, place, options);
  const cusps = then.houses && 'cusps' in then.houses ? then.houses.cusps : null;
  // The cursor's bodies in the event's houses: where the sky now falls in the chart then.
  const points = sky.points.map(({ house: _house, ...point }) => (cusps ? { ...point, house: houseOf(point.lon, cusps) } : point));
  const now: Chart = { ...sky, points };
  return { then, now, across: aspectsAcross(then.points, now.points, options.orbs ?? DEFAULT_ORBS) };
}
