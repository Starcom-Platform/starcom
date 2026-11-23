/**
 * The Busy lane (decision D-PW, PW52, PW67): every window open at a moment, its curve summed with every other's, each
 * counting 1 at its exact moment whatever its kind. The sky's own aspects come from the lanes' columns, weighed as
 * the sky catalogue weighs its windows (2^−(orb/h)², h a third of the cap); Mecha Jono's other windows (lunar
 * distance, nodes, ingresses, stations, focus windows) from their profiles. A window the columns already hold, an
 * aspect between two of the ten bodies, is counted from the columns alone, once. Each part says how often its kind
 * recurs (`recurrence.ts`), for the hover.
 *
 * Wider views keep the slow (PW51): from a year, aspects between Mars and the bodies beyond it and windows recurring
 * no more than yearly; from a decade, Jupiter outward and the decade's.
 */
import { ASTRO_BODIES, type AstroBody } from '../astro/sky';
import { ASPECT_KINDS, orbOf, type AspectName } from '../astro/aspects';
import { windowWeightAt } from '../windowProfile';
import { columnMs, type SkyColumns } from './skyColumns';
import type { TimeView } from './timeView';
import type { PsiLaneItem } from './psiLanes';
import { pairRecurrence } from './recurrence';

const YEAR_MS = 365.25 * 86_400_000;

/** What a view keeps by its span: everything, the slow pairs (Mars outward), or the outer (Jupiter outward). */
export type SkyLod = 'all' | 'slow' | 'outer';
/** From a year's view the slow, as the 1y zoom shows; from a decade's the outer. */
export const skyLod = (spanMs: number): SkyLod => (spanMs >= 0.99 * 10 * YEAR_MS ? 'outer' : spanMs >= 0.99 * YEAR_MS ? 'slow' : 'all');

const SLOW: Record<SkyLod, ReadonlySet<AstroBody>> = {
  all: new Set(ASTRO_BODIES),
  slow: new Set(['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']),
  outer: new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']),
};
/** A window's least recurrence, days, for a view to keep it. */
const LEAST_RECURRENCE: Record<SkyLod, number> = { all: 0, slow: 365, outer: 3652 };

/** Whether a view of this kind keeps an aspect between these two bodies. */
export const keepsPair = (lod: SkyLod, a: AstroBody, b: AstroBody): boolean => SLOW[lod].has(a) && SLOW[lod].has(b);

/** Whether a view of this kind keeps a note's window in Busy and the windows lane. */
export const keepsWindow = (lod: SkyLod, item: PsiLaneItem): boolean =>
  lod === 'all' || (item.recurrenceDays ?? 0) >= LEAST_RECURRENCE[lod];

/** What is open at a moment, how much it weighs there (its curve) and how often its kind recurs, days. */
export type BusyPart =
  | { kind: 'aspect'; a: AstroBody; b: AstroBody; aspect: AspectName; weight: number; recurrenceDays?: number }
  | { kind: 'window'; address: string; title: string; weight: number; recurrenceDays?: number };

const apart = (x: number, y: number) => {
  const d = Math.abs(x - y) % 360;
  return d > 180 ? 360 - d : d;
};

interface PairKind { ia: number; ib: number; a: AstroBody; b: AstroBody; name: AspectName; angle: number; cap: number; recurrenceDays?: number }

function pairKinds(sky: SkyColumns, lod: SkyLod): PairKind[] {
  const index = new Map(sky.bodies.map((b, i) => [b, i]));
  const bodies = ASTRO_BODIES.filter((b) => index.has(b) && SLOW[lod].has(b));
  const out: PairKind[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      for (const kind of ASPECT_KINDS) {
        if (!kind.major) continue;
        const cap = orbOf(kind, 'catalogue', bodies[i], bodies[j]);
        if (cap <= 0) continue;
        const recurrenceDays = pairRecurrence(bodies[i], bodies[j], kind.angle);
        out.push({
          ia: index.get(bodies[i])!, ib: index.get(bodies[j])!, a: bodies[i], b: bodies[j], name: kind.name, angle: kind.angle, cap,
          ...(recurrenceDays !== undefined ? { recurrenceDays } : {}),
        });
      }
    }
  }
  return out;
}

/** The notes' windows Busy counts itself: those the columns do not hold, kept by the view. */
const ownWindows = (items: readonly PsiLaneItem[], lod: SkyLod) =>
  items.filter((item) => item.lane === 'windows' && item.window && !item.aspect && !item.onSkyEvent && keepsWindow(lod, item));

/** Every part open at one column, heaviest first. */
export function busyPartsAt(sky: SkyColumns, view: TimeView, items: readonly PsiLaneItem[], col: number, lod: SkyLod = skyLod(view.spanMs)): BusyPart[] {
  const n = sky.bodies.length;
  const parts: BusyPart[] = [];
  for (const p of pairKinds(sky, lod)) {
    const dev = Math.abs(apart(sky.longitudes[col * n + p.ia], sky.longitudes[col * n + p.ib]) - p.angle);
    if (dev <= p.cap) {
      parts.push({
        kind: 'aspect', a: p.a, b: p.b, aspect: p.name, weight: Math.pow(2, -((dev / (p.cap / 3)) ** 2)),
        ...(p.recurrenceDays !== undefined ? { recurrenceDays: p.recurrenceDays } : {}),
      });
    }
  }
  const unix = columnMs(view, sky.columns, col) / 1000;
  for (const item of ownWindows(items, lod)) {
    const w = windowWeightAt(item.window!, unix);
    // A band has no curve: it holds at full strength from edge to edge.
    const weight = w === null ? (unix >= item.window!.from && unix <= item.window!.until ? 1 : 0) : w;
    if (weight > 0) {
      parts.push({
        kind: 'window', address: item.address, title: item.title, weight,
        ...(item.recurrenceDays !== undefined ? { recurrenceDays: item.recurrenceDays } : {}),
      });
    }
  }
  return parts.sort((x, y) => y.weight - x.weight);
}

/** Busy at every column of a view. */
export function busyColumns(sky: SkyColumns, view: TimeView, items: readonly PsiLaneItem[], lod: SkyLod = skyLod(view.spanMs)): Float32Array {
  const n = sky.bodies.length;
  const values = new Float32Array(sky.columns);
  for (const p of pairKinds(sky, lod)) {
    const h = p.cap / 3;
    for (let col = 0; col < sky.columns; col++) {
      const dev = Math.abs(apart(sky.longitudes[col * n + p.ia], sky.longitudes[col * n + p.ib]) - p.angle);
      if (dev <= p.cap) values[col] += Math.pow(2, -((dev / h) ** 2));
    }
  }
  for (const item of ownWindows(items, lod)) {
    const w = item.window!;
    for (let col = 0; col < sky.columns; col++) {
      const unix = columnMs(view, sky.columns, col) / 1000;
      if (unix < w.from || unix > w.until) continue;
      values[col] += windowWeightAt(w, unix) ?? 1;
    }
  }
  return values;
}

/** The busiest column, or -1 for none. */
export function busiestColumn(values: Float32Array): number {
  let best = -1;
  for (let col = 0; col < values.length; col++) if (values[col] > 0 && (best < 0 || values[col] > values[best])) best = col;
  return best;
}
