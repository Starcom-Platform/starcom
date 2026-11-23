/**
 * The Timestream strip in a card (decision D-PW, PW62, PW77; the kit's "profile curve under the cursor",
 * `schemas_psi.md` §3.6): a band under the picture, drawn by the card itself from the drawer's own data, so a card
 * draws it with the drawer closed. By default the card's moment ±3 days, with Windows (each window's weight curve,
 * the card's own event lit), Kp (each 3-hour value, as the Kp lane draws it) and the event's bodies (each lane in
 * its sign's element colour in the chart's frame, Cosmic Cypher's colours, PW41). The card's moment is marked; a span
 * held back for Mecha Jono's sealed tests draws as a quiet band (PW75).
 */
import { kpBars, type KpBar, type KpRecord } from '../../../services/psiWatch/timestream/kp';
import { skyColumns, type LaneBody } from '../../../services/psiWatch/timestream/skyColumns';
import { windowWeightAt } from '../../../services/psiWatch/windowProfile';
import { WITHHELD } from '../../../services/psiWatch/timestream/withheld';
import type { PsiLaneItem } from '../../../services/psiWatch/timestream/psiLanes';
import type { ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { creditLine, CREDITS } from './sourceCredits';
import type { TimestreamProvenance } from './shareCardProvenance';

const DAY_MS = 86_400_000;
export const STRIP_LANES = ['windows', 'kp', 'bodies'] as const;
export type StripLane = (typeof STRIP_LANES)[number];
/** The span a card's strip shows unless it asks for another: its moment, three days either side (PW77). */
export const STRIP_HALF_SPAN_MS = 3 * DAY_MS;
/** The widest a strip may ask for: a month and a half either side. */
export const STRIP_MAX_SPAN_MS = 92 * DAY_MS;
/** Columns the strip is computed at: finer than any card draws it. */
export const STRIP_COLUMNS = 480;

export interface StripWindow {
  address: string;
  title: string;
  /** The card's own event, or the window on it: drawn brighter. */
  lit: boolean;
  /** Its weight each column, 0–1; NaN where it holds and has no profile to read a weight from. */
  weights: Float32Array;
}

export interface StripModel {
  fromMs: number;
  untilMs: number;
  /** The card's moment, marked. */
  atMs: number;
  lanes: StripLane[];
  columns: number;
  windows: StripWindow[];
  kp: KpBar[];
  /** The years held back for sealed tests that the span touches, on the Kp lane (PW75). */
  held: Array<{ fromMs: number; untilMs: number; years: string }>;
  bodies: Array<{ body: LaneBody; longitudes: Float32Array; retrograde: Uint8Array }>;
  frame: ZodiacFrame;
}

export interface StripInput {
  atMs: number;
  fromMs?: number;
  untilMs?: number;
  lanes?: readonly StripLane[];
  items: readonly PsiLaneItem[];
  /** The address of the card's own event, and of the sky event a window is on, drawn lit. */
  lit?: readonly string[];
  kp: KpRecord | null;
  bodies: readonly LaneBody[];
  frame: ZodiacFrame;
  columns?: number;
}

/** A strip's span, from its moment: ±3 days unless it says otherwise, never wider than three months. */
export function stripSpan(atMs: number, fromMs?: number, untilMs?: number): { fromMs: number; untilMs: number } {
  const from = fromMs ?? atMs - STRIP_HALF_SPAN_MS;
  const until = untilMs ?? atMs + STRIP_HALF_SPAN_MS;
  if (!(until > from)) throw new Error('A strip runs from before until: its from is before its until.');
  if (until - from > STRIP_MAX_SPAN_MS) throw new Error('A strip spans at most 92 days: a card cannot show a wider one legibly.');
  return { fromMs: from, untilMs: until };
}

export function stripModel(input: StripInput): StripModel {
  const { fromMs, untilMs } = stripSpan(input.atMs, input.fromMs, input.untilMs);
  const columns = input.columns ?? STRIP_COLUMNS;
  const lanes = [...(input.lanes ?? STRIP_LANES)];
  const view = { startMs: fromMs, spanMs: untilMs - fromMs };
  const msAt = (col: number) => fromMs + ((col + 0.5) / columns) * (untilMs - fromMs);
  const lit = new Set(input.lit ?? []);
  const windows = lanes.includes('windows')
    ? input.items.filter((item) => item.lane === 'windows' && item.window && item.untilMs >= fromMs && item.fromMs <= untilMs).map((item) => {
      const weights = new Float32Array(columns);
      for (let col = 0; col < columns; col++) {
        const w = windowWeightAt(item.window!, msAt(col) / 1000);
        weights[col] = w === null ? NaN : w;
      }
      return { address: item.address, title: item.title, lit: lit.has(item.address) || (item.onSkyEvent !== undefined && lit.has(item.onSkyEvent)), weights };
    })
    : [];
  const kp = lanes.includes('kp') && input.kp ? kpBars(input.kp, view, 'slots') : [];
  const held = lanes.includes('kp') ? WITHHELD.storms.filter((w) => w.fromMs < untilMs && w.untilMs > fromMs) : [];
  const sky = lanes.includes('bodies') && input.bodies.length ? skyColumns(view, columns, input.bodies, input.frame) : null;
  const bodies = sky ? input.bodies.map((body, b) => {
    const longitudes = new Float32Array(columns);
    const retrograde = new Uint8Array(columns);
    for (let col = 0; col < columns; col++) {
      longitudes[col] = sky.longitudes[col * input.bodies.length + b];
      retrograde[col] = sky.retrograde[col * input.bodies.length + b];
    }
    return { body, longitudes, retrograde };
  }) : [];
  return {
    fromMs, untilMs, atMs: input.atMs, lanes, columns, windows, kp, held: held.map((w) => ({ ...w })), bodies, frame: input.frame,
  };
}

/** What a card's record says of its strip (schema 31), its sources as the Data line names them. */
export function timestreamProvenance(model: StripModel): TimestreamProvenance {
  const credits = [
    ...(model.lanes.includes('windows') && model.windows.length ? [creditLine(CREDITS.jplDe440s)] : []),
    ...(model.lanes.includes('kp') && model.kp.length ? [creditLine(CREDITS.gfzKp), creditLine(CREDITS.noaaSwpc)] : []),
    ...(model.bodies.length ? [creditLine(CREDITS.astronomyEngine)] : []),
  ];
  return {
    fromS: Math.floor(model.fromMs / 1000), untilS: Math.ceil(model.untilMs / 1000), atS: Math.round(model.atMs / 1000),
    lanes: [...model.lanes], bodies: model.bodies.map((b) => b.body), frame: model.frame, windows: model.windows.length, credits,
  };
}
