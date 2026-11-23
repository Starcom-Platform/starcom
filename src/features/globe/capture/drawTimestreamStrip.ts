/**
 * Drawing the Timestream strip on a card (decision D-PW, PW62, PW77): a UTC ruler; Windows, each window's weight
 * curve filled in Psi Watch's aqua, the card's own brighter; Kp, each value a bar in the Kp lane's colours, the
 * expected ones outlined; each body a lane in its sign's element colour (Cosmic Cypher's, PW41), hatched where it
 * moves backward; the card's moment a line through them all. Nothing in words but the lanes' names and the ruler.
 */
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { utcTimeTicks } from '../../../utils/utcTime';
import { kpColour } from '../../../components/PsiWatch/Timestream/KpLane';
import { CLASSIC_ELEMENTS, type ElementColours } from '../../../components/PsiWatch/Timestream/laneRenderer';
import type { Drawable2D, ShareCardTheme } from './drawShareCard';
import type { StripModel } from './timestreamStrip';

export interface StripRect { x: number; y: number; width: number; height: number }

/** The expected Kp values, outlined as the Kp lane draws them. */
const EXPECTED = new Set(['predicted', 'outlook']);
const STORM_KP = 5;

/** A sign's element colour, blended from each sign's middle to the next one's, as the lanes' gradient is. */
export function elementColour(longitude: number, palette: ElementColours = CLASSIC_ELEMENTS): string {
  const order = [palette.fire, palette.earth, palette.air, palette.water];
  const shifted = (((longitude - 15) % 360) + 360) % 360;
  const segment = shifted / 30;
  const a = Math.floor(segment) % 12;
  const t = segment - Math.floor(segment);
  const from = order[a & 3];
  const to = order[((a + 1) % 12) & 3];
  const channel = (i: number) => Math.round((from[i] + (to[i] - from[i]) * t) * 255).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** The lanes' heights within the strip: Windows the tallest, then Kp, then the bodies sharing what is left. */
export function stripLanes(model: StripModel, rect: StripRect, rulerPx: number): Array<{ lane: string; y: number; height: number; body?: number }> {
  const inner = rect.height - rulerPx;
  const parts: Array<{ lane: string; weight: number; body?: number }> = [];
  if (model.lanes.includes('windows')) parts.push({ lane: 'windows', weight: 3 });
  if (model.lanes.includes('kp')) parts.push({ lane: 'kp', weight: 2.2 });
  model.bodies.forEach((_, i) => parts.push({ lane: 'body', weight: 1.2, body: i }));
  const total = parts.reduce((n, p) => n + p.weight, 0) || 1;
  let y = rect.y + rulerPx;
  return parts.map((p) => {
    const height = Math.floor((p.weight / total) * inner);
    const out = { lane: p.lane, y, height, ...(p.body !== undefined ? { body: p.body } : {}) };
    y += height;
    return out;
  });
}

export function drawTimestreamStrip(ctx: Drawable2D, rect: StripRect, model: StripModel, theme: ShareCardTheme, fontPx: number): void {
  const span = model.untilMs - model.fromMs;
  const xAt = (ms: number) => rect.x + ((ms - model.fromMs) / span) * rect.width;
  const colWidth = rect.width / model.columns;
  const rulerPx = Math.round(fontPx * 1.5);

  ctx.fillStyle = GUNMETAL[950];
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // The ruler: UTC calendar ticks through every lane, their labels along the top.
  ctx.textBaseline = 'top';
  ctx.font = `${fontPx}px ${theme.fontFamily}`;
  for (const tick of utcTimeTicks(model.fromMs, model.untilMs, Math.max(3, Math.round(rect.width / 150)))) {
    const x = Math.round(xAt(tick.at));
    ctx.fillStyle = GUNMETAL[800];
    ctx.fillRect(x, rect.y + rulerPx - 4, 1, rect.height - rulerPx + 4);
    ctx.fillStyle = theme.footer;
    ctx.fillText(tick.label, x + 3, rect.y + 3);
  }

  const lanes = stripLanes(model, rect, rulerPx);
  const label = (text: string, y: number) => {
    const width = Math.ceil(text.length * fontPx * 0.56) + 8;
    ctx.fillStyle = `${GUNMETAL[950]}d9`;
    ctx.fillRect(rect.x, y + 1, width, fontPx + 4);
    ctx.fillStyle = theme.legend;
    ctx.fillText(text, rect.x + 4, y + 3);
  };

  for (const lane of lanes) {
    ctx.fillStyle = GUNMETAL[800];
    ctx.fillRect(rect.x, lane.y, rect.width, 1);
    if (lane.lane === 'windows') {
      const base = lane.y + lane.height - 2;
      const top = lane.height - 4;
      // The others first, then the card's own over them.
      for (const window of [...model.windows].sort((a, b) => Number(a.lit) - Number(b.lit))) {
        ctx.beginPath();
        ctx.moveTo(rect.x, base);
        for (let col = 0; col < model.columns; col++) {
          const w = window.weights[col];
          const share = Number.isNaN(w) ? 0.35 : w;
          ctx.lineTo(rect.x + (col + 0.5) * colWidth, base - share * top);
        }
        ctx.lineTo(rect.x + rect.width, base);
        ctx.fillStyle = `${DATA_SCALES.psiWatch}${window.lit ? 'b3' : '40'}`;
        ctx.fill();
        if (window.lit) {
          ctx.strokeStyle = DATA_SCALES.psiWatch;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      label('Windows', lane.y);
    } else if (lane.lane === 'kp') {
      const floor = lane.y + lane.height - 2;
      const inner = lane.height - 4;
      ctx.fillStyle = GUNMETAL[700];
      ctx.fillRect(rect.x, Math.round(floor - (STORM_KP / 9) * inner), rect.width, 1);
      for (const bar of model.kp) {
        const x0 = xAt(Math.max(bar.fromMs, model.fromMs));
        const x1 = xAt(Math.min(bar.untilMs, model.untilMs));
        const width = Math.max(1.5, x1 - x0 - (x1 - x0 > 3 ? 1 : 0));
        const h = Math.max(1, ((bar.kp ?? 0) / 9) * inner);
        const colour = kpColour(bar.kp ?? 0);
        if (EXPECTED.has(bar.basis)) {
          ctx.fillStyle = `${colour}2e`;
          ctx.fillRect(x0, floor - h, width, h);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0 + 0.5, floor);
          ctx.lineTo(x0 + 0.5, floor - h + 0.5);
          ctx.lineTo(x0 + width - 0.5, floor - h + 0.5);
          ctx.lineTo(x0 + width - 0.5, floor);
          ctx.stroke();
        } else {
          ctx.fillStyle = colour;
          ctx.fillRect(x0, floor - h, width, h);
        }
      }
      // The years held back for sealed tests: a quiet hatched band where the values would be (PW75).
      for (const held of model.held) {
        const x0 = xAt(Math.max(held.fromMs, model.fromMs));
        const x1 = xAt(Math.min(held.untilMs, model.untilMs));
        ctx.fillStyle = GUNMETAL[900];
        ctx.fillRect(x0, lane.y + 1, x1 - x0, lane.height - 1);
        ctx.fillStyle = GUNMETAL[800];
        for (let x = x0; x < x1; x += 6) ctx.fillRect(x, lane.y + 1, 2, lane.height - 1);
        ctx.fillStyle = theme.footer;
        ctx.fillText(`${held.years} held back`, x0 + 4, lane.y + lane.height / 2 - fontPx / 2);
      }
      label('Kp', lane.y);
    } else if (lane.body !== undefined) {
      const body = model.bodies[lane.body];
      for (let col = 0; col < model.columns; col++) {
        const lon = body.longitudes[col];
        if (Number.isNaN(lon)) continue;
        const x = rect.x + col * colWidth;
        ctx.fillStyle = elementColour(lon);
        ctx.fillRect(x, lane.y + 1, colWidth + 0.6, lane.height - 1);
        // Backward: darkened every other pixel row, as the lane hatches it.
        if (body.retrograde[col]) {
          ctx.fillStyle = `${GUNMETAL[950]}99`;
          for (let y = lane.y + 1; y < lane.y + lane.height; y += 3) ctx.fillRect(x, y, colWidth + 0.6, 1);
        }
      }
      label(`${body.body}${model.frame === 'galactic' ? ' (GC)' : ''}`, lane.y);
    }
  }

  // The card's moment, through every lane.
  if (model.atMs >= model.fromMs && model.atMs <= model.untilMs) {
    const x = Math.round(xAt(model.atMs));
    ctx.fillStyle = GUNMETAL[950];
    ctx.fillRect(x - 2, rect.y + rulerPx - 4, 4, rect.height - rulerPx + 4);
    ctx.fillStyle = GUNMETAL[100];
    ctx.fillRect(x - 1, rect.y + rulerPx - 4, 2, rect.height - rulerPx + 4);
  }

  // A hairline above, as between the picture and the text.
  ctx.fillStyle = theme.rule;
  ctx.fillRect(rect.x, rect.y, rect.width, 1);
}
