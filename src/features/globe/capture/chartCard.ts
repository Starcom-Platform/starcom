/**
 * An event chart on a card (decision D-PW, PW87; the owner, 11 Nov: the globe at the item's place with the wheel inset,
 * asked by `card.chart` on any shot): the chart for a moment and a place, the sky at the cursor beside it, drawn as the
 * panel draws it (chartWheelGeometry.ts) over a corner of the picture, and stated in the card's text and record: the
 * moments, the place, the closest aspects across, the frame, houses and orbs.
 */
import { biWheel, type BiWheel } from '../../../services/psiWatch/astro/biWheel';
import { DEFAULT_FRAME, type ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES } from '../../../styles/tokens';
import { WHEEL_MARGIN, WHEEL_SIZE, WHEEL_TEXT_SIZE, wheelShapes, type WheelTone } from '../../psi/chartWheelGeometry';
import type { ShareCardTheme } from './drawShareCard';

export interface ChartAsk {
  /** When it happened, unix seconds, and where. */
  at: number;
  lat: number;
  lng: number;
  title?: string;
  /** The sky outside, unix seconds: the card's moment unless said. */
  cursorAt?: number;
  frame?: ZodiacFrame;
}

/** As drawn: every part stated, so the same shot draws the same chart. */
export interface ChartDrawn { at: number; lat: number; lng: number; title?: string; cursorAt: number; frame: ZodiacFrame }

export interface CardChart {
  drawn: ChartDrawn;
  wheel: BiWheel;
}

/** The chart a card draws: the event's, and the sky at the card's moment unless the shot names another. */
export function chartForCard(ask: ChartAsk, cardAtS: number): CardChart {
  const drawn: ChartDrawn = {
    at: ask.at, lat: ask.lat, lng: ask.lng, ...(ask.title ? { title: ask.title } : {}),
    cursorAt: ask.cursorAt ?? cardAtS, frame: ask.frame ?? DEFAULT_FRAME,
  };
  return {
    drawn,
    wheel: biWheel(new Date(drawn.at * 1000), { lat: drawn.lat, lng: drawn.lng }, new Date(drawn.cursorAt * 1000), { frame: drawn.frame }),
  };
}

/** What a card states of its chart (capture schema 38). */
export interface ChartProvenance {
  title: string | null;
  atS: number;
  place: { lat: number; lng: number };
  cursorAtS: number;
  frame: ZodiacFrame;
  frameName: string;
  houses: string | null;
  orbs: string;
  /** The closest aspects across, at most five. */
  across: Array<{ then: string; now: string; kind: string; orb: number; applying: boolean }>;
  /** What the chart could not give. */
  caveats: string[];
  /** The text column's lines. */
  lines: string[];
}

const ACROSS_IN_RECORD = 5;
const ACROSS_IN_TEXT = 3;
const KIND_WORD: Record<string, string> = { conjunction: 'conjunct', opposition: 'opposite' };
const bodyWord = (body: string) => (body === 'NorthNode' ? 'North Node' : body);
const placeWords = ({ lat, lng }: { lat: number; lng: number }) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}° ${lng >= 0 ? 'E' : 'W'}`;

export function chartProvenance(chart: CardChart): ChartProvenance {
  const { drawn, wheel } = chart;
  const across = wheel.across.slice(0, ACROSS_IN_RECORD).map((a) => ({
    then: a.then, now: a.now, kind: a.kind, orb: Math.round(a.orb * 10) / 10, applying: a.applying,
  }));
  const lines = [
    `Event chart. Inside: ${drawn.title ? `${drawn.title}, ` : ''}${formatUtcDateTime(drawn.at * 1000, { year: true })}, ${placeWords(drawn)}.`,
    `Outside: the sky at ${formatUtcDateTime(drawn.cursorAt * 1000, { year: true })}.`,
    ...across.slice(0, ACROSS_IN_TEXT).map((a) =>
      `${bodyWord(a.now)} now ${KIND_WORD[a.kind] ?? a.kind} ${bodyWord(a.then)} then, ${a.orb}°${a.applying ? ', applying' : ''}.`),
    `${wheel.then.frameName}; ${wheel.then.housesName ?? 'no'} houses; ${wheel.then.orbsName}.`,
  ];
  return {
    title: drawn.title ?? null,
    atS: drawn.at,
    place: { lat: drawn.lat, lng: drawn.lng },
    cursorAtS: drawn.cursorAt,
    frame: drawn.frame,
    frameName: wheel.then.frameName,
    houses: wheel.then.housesName ?? null,
    orbs: wheel.then.orbsName,
    across,
    caveats: [...wheel.then.caveats],
    lines,
  };
}

interface Rect { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The wheel's share of the picture's shorter side. */
export const CHART_INSET_SHARE = 0.52;

/** The wheel's square over a corner of the picture: the first of the lower corners, then the upper, clear of `avoid`. */
export function layoutChartInset(picture: Rect, avoid: readonly Rect[], padding: number): Rect {
  const side = Math.round(CHART_INSET_SHARE * Math.min(picture.width, picture.height));
  const margin = Math.round(padding / 2);
  const left = picture.x + margin;
  const right = picture.x + picture.width - margin - side;
  const top = picture.y + margin;
  const bottom = picture.y + picture.height - margin - side;
  const corners: Rect[] = [[left, bottom], [right, bottom], [left, top], [right, top]].map(([x, y]) => ({ x, y, width: side, height: side }));
  return corners.find((c) => !avoid.some((a) => overlaps(c, a))) ?? corners[0];
}

/** The wheel drawn over its square: a dark backing, then the shapes, in the card's own colours. */
export function drawChartInset(ctx: CanvasRenderingContext2D, rect: Rect, chart: CardChart, theme: ShareCardTheme): void {
  const shapes = wheelShapes(chart.wheel);
  const scale = rect.width / (WHEEL_SIZE + 2 * WHEEL_MARGIN);
  const x0 = rect.x + WHEEL_MARGIN * scale;
  const y0 = rect.y + WHEEL_MARGIN * scale;
  const X = (x: number) => x0 + x * scale;
  const Y = (y: number) => y0 + y * scale;
  const tone: Record<WheelTone, string> = { rule: theme.rule, ruleSoft: theme.rule, quiet: theme.detail, heading: theme.heading, now: DATA_SCALES.psiWatch };
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = theme.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  for (const c of shapes.circles) {
    ctx.globalAlpha = c.tone === 'ruleSoft' ? 0.6 : 1;
    ctx.strokeStyle = tone[c.tone];
    ctx.beginPath();
    ctx.arc(X(shapes.centre), Y(shapes.centre), c.r * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const l of shapes.lines) {
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.strokeStyle = tone[l.tone];
    ctx.lineWidth = Math.max(1, l.width * scale);
    ctx.setLineDash(l.dashed ? [4 * scale, 3 * scale] : []);
    ctx.beginPath();
    ctx.moveTo(X(l.x1), Y(l.y1));
    ctx.lineTo(X(l.x2), Y(l.y2));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = `600 ${Math.max(10, Math.round(WHEEL_TEXT_SIZE * scale))}px ${theme.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of shapes.texts) {
    ctx.fillStyle = tone[t.tone];
    ctx.fillText(t.text, X(t.x), Y(t.y));
  }
  ctx.restore();
}
