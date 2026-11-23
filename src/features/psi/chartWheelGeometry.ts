/**
 * An event chart's wheel as shapes (decision D-PW, PW60, PW86, PW87): one geometry for the screen's SVG and a card's
 * canvas, so a card's wheel is the wheel the panel showed. The zodiac's twelve signs round the rim, in the chart's frame;
 * the cursor's sky on the outer ring; the event's bodies on the inner ring, inside its houses, the Ascendant at the left
 * and the Midheaven above; through the middle, a chord for each aspect across, solid for the easy ones, dashed for the
 * hard, as bright as it is near exact. In a square of WHEEL_SIZE units with WHEEL_MARGIN round it for the angles' names.
 */
import type { BiWheel } from '../../services/psiWatch/astro/biWheel';
import type { ChartPoint } from '../../services/psiWatch/astro/chart';
import { SIGNS } from '../../services/psiWatch/astro/frames';

export const WHEEL_SIZE = 340;
/** Room round the rim for the angles' names, which stand just outside it. */
export const WHEEL_MARGIN = 22;
const C = WHEEL_SIZE / 2;
const R_RIM = 166;
const R_SIGNS = 146;
/** The cursor's ring: ticks just inside the signs, labels within them. */
const R_NOW = 144;
const R_NOW_LABEL = 131;
/** Between the two rings. */
const R_SPLIT = 122;
/** The event's ring: ticks just inside the split, labels within them. */
const R_THEN = 118;
const R_THEN_LABEL = 105;
const R_CHORDS = 80;
/** How close two bodies' labels may stand on a ring before they are spread, degrees. */
const LABEL_GAP_DEG = 8;
const HARD = new Set(['opposition', 'square', 'semi-square', 'sesquiquadrate', 'quincunx']);
const TEXT_SIZE = 11;

/** Astrology's usual two-letter marks, the same in every language: the lists beside the wheel name each in full. */
export const BODY_MARKS: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mercury: 'Me', Venus: 'Ve', Mars: 'Ma', Jupiter: 'Ju', Saturn: 'Sa', Uranus: 'Ur', Neptune: 'Ne', Pluto: 'Pl', NorthNode: 'NN',
};
const SIGN_MARKS = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];

/** What a shape is drawn in: each drawing maps these to its own colours. */
export type WheelTone = 'rule' | 'ruleSoft' | 'quiet' | 'heading' | 'now';

export interface WheelCircle { r: number; tone: WheelTone }
export interface WheelLine { x1: number; y1: number; x2: number; y2: number; tone: WheelTone; width: number; dashed?: boolean; opacity?: number }
export interface WheelText { x: number; y: number; text: string; tone: WheelTone; id?: 'asc' | 'mc' }

export interface WheelShapes {
  centre: number;
  circles: WheelCircle[];
  lines: WheelLine[];
  texts: WheelText[];
}

/** A longitude's place on the wheel: the Ascendant at the left, the zodiac running anticlockwise. */
const at = (lon: number, asc: number, r: number): [number, number] => {
  const a = ((180 + lon - asc) * Math.PI) / 180;
  return [C + r * Math.cos(a), C - r * Math.sin(a)];
};

/** Where each body's label stands: at its longitude, spread apart where bodies crowd, in order. */
export function spreadLabels(lons: readonly number[], gap = LABEL_GAP_DEG): number[] {
  const order = lons.map((lon, i) => ({ lon: ((lon % 360) + 360) % 360, i })).sort((a, b) => a.lon - b.lon);
  const placed = order.map((o) => o.lon);
  for (let pass = 0; pass < 3; pass += 1) {
    for (let k = 1; k < placed.length; k += 1) if (placed[k] - placed[k - 1] < gap) placed[k] = placed[k - 1] + gap;
  }
  const out = new Array<number>(lons.length);
  order.forEach((o, k) => { out[o.i] = placed[k]; });
  return out;
}

function ring(points: readonly ChartPoint[], asc: number, r: number, rLabel: number, tone: WheelTone, shapes: WheelShapes): void {
  const labels = spreadLabels(points.map((p) => p.lon));
  points.forEach((p, i) => {
    const [x1, y1] = at(p.lon, asc, r - 6);
    const [x2, y2] = at(p.lon, asc, r + 2);
    const [lx, ly] = at(labels[i], asc, rLabel);
    shapes.lines.push({ x1, y1, x2, y2, tone, width: 1.5 });
    shapes.texts.push({ x: lx, y: ly, text: `${BODY_MARKS[p.body] ?? p.body}${p.retrograde ? 'ʀ' : ''}`, tone });
  });
}

/** The wheel's shapes, in WHEEL_SIZE units. */
export function wheelShapes(wheel: BiWheel): WheelShapes {
  const { then, now, across } = wheel;
  const asc = then.angles?.asc ?? 0;
  const cusps = then.houses && 'cusps' in then.houses ? then.houses.cusps : null;
  const shapes: WheelShapes = {
    centre: C,
    circles: [
      { r: R_RIM, tone: 'rule' }, { r: R_SIGNS, tone: 'rule' }, { r: R_SPLIT, tone: 'ruleSoft' }, { r: R_CHORDS, tone: 'ruleSoft' },
    ],
    lines: [],
    texts: [],
  };
  SIGNS.forEach((_, k) => {
    const [x1, y1] = at(k * 30, asc, R_SIGNS);
    const [x2, y2] = at(k * 30, asc, R_RIM);
    const [tx, ty] = at(k * 30 + 15, asc, (R_SIGNS + R_RIM) / 2);
    shapes.lines.push({ x1, y1, x2, y2, tone: 'rule', width: 1 });
    shapes.texts.push({ x: tx, y: ty, text: SIGN_MARKS[k], tone: 'quiet' });
  });
  cusps?.forEach((cusp, k) => {
    const [x1, y1] = at(cusp, asc, R_CHORDS);
    const [x2, y2] = at(cusp, asc, R_SPLIT);
    const angle = k % 3 === 0;
    const [nx, ny] = at(cusp + ((cusps[(k + 1) % 12] - cusp + 360) % 360) / 2, asc, R_CHORDS + 8);
    shapes.lines.push({ x1, y1, x2, y2, tone: angle ? 'heading' : 'rule', width: angle ? 1.5 : 0.8 });
    shapes.texts.push({ x: nx, y: ny, text: String(k + 1), tone: 'quiet' });
  });
  if (then.angles) {
    const [ax, ay] = at(then.angles.asc, asc, R_RIM + 12);
    const [mx, my] = at(then.angles.mc, asc, R_RIM + 10);
    shapes.texts.push({ x: ax, y: ay, text: 'ASC', tone: 'heading', id: 'asc' }, { x: mx, y: my, text: 'MC', tone: 'heading', id: 'mc' });
  }
  const lonOf = (points: readonly ChartPoint[], body: string) => points.find((p) => p.body === body)?.lon ?? 0;
  for (const a of across) {
    const [x1, y1] = at(lonOf(then.points, a.then), asc, R_CHORDS);
    const [x2, y2] = at(lonOf(now.points, a.now), asc, R_CHORDS);
    shapes.lines.push({ x1, y1, x2, y2, tone: 'now', width: 1.2, dashed: HARD.has(a.kind), opacity: 0.25 + 0.65 * a.weight });
  }
  ring(now.points, asc, R_NOW, R_NOW_LABEL, 'now', shapes);
  ring(then.points, asc, R_THEN, R_THEN_LABEL, 'heading', shapes);
  return shapes;
}

/** The type size of the wheel's words, in WHEEL_SIZE units. */
export const WHEEL_TEXT_SIZE = TEXT_SIZE;
