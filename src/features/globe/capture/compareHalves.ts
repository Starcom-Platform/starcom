/**
 * A card's picture of two layers side by side, its halves named (D-CM, CM3; OR35): the line where the halves meet, at
 * the screen's middle as it falls in the card's window, and a label in each half naming its layer, at the picture's
 * top. A window wholly on one side of the middle names that half alone.
 */
import { CYAN, GUNMETAL } from '../../../styles/tokens';

export interface PictureRect { x: number; y: number; width: number; height: number }

/** Where a label stands in a picture, for a test or a layout to read: its box. */
export interface HalfLabel { text: string; x: number; y: number; width: number; height: number }

/** The labels' boxes for a picture split `at` (0 to 1 of its width), measured by `measure`. */
export function compareHalfLabels(
  rect: PictureRect, at: number, left: string, right: string,
  measure: (text: string) => number, px: number,
): { lineX: number | null; labels: HalfLabel[] } {
  const split = Math.min(1, Math.max(0, at));
  const lineX = split > 0 && split < 1 ? rect.x + split * rect.width : null;
  const pad = Math.round(px * 0.6);
  const gap = Math.round(px * 0.7);
  const height = Math.round(px * 1.9);
  const y = rect.y + gap;
  const box = (text: string) => measure(text) + 2 * pad;
  const labels: HalfLabel[] = [];
  const mid = rect.x + split * rect.width;
  if (split > 0) {
    const width = box(left);
    labels.push({ text: left, x: Math.max(rect.x + gap, mid - gap - width), y, width, height });
  }
  if (split < 1) {
    const width = box(right);
    labels.push({ text: right, x: Math.min(rect.x + rect.width - gap - width, mid + gap), y, width, height });
  }
  return { lineX, labels };
}

/** Draws the line and the labels over a card's picture. */
export function drawCompareHalves(
  ctx: CanvasRenderingContext2D, rect: PictureRect, at: number, left: string, right: string,
  style: { fontFamily: string; px: number },
): void {
  const px = Math.max(11, Math.round(style.px));
  ctx.save();
  ctx.font = `600 ${px}px ${style.fontFamily}`;
  const { lineX, labels } = compareHalfLabels(rect, at, left, right, (t) => ctx.measureText(t).width, px);
  if (lineX !== null) {
    ctx.strokeStyle = CYAN[400];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, rect.y);
    ctx.lineTo(lineX, rect.y + rect.height);
    ctx.stroke();
  }
  ctx.textBaseline = 'middle';
  for (const label of labels) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = GUNMETAL[950];
    ctx.fillRect(label.x, label.y, label.width, label.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = CYAN[400];
    ctx.lineWidth = 1;
    ctx.strokeRect(label.x + 0.5, label.y + 0.5, label.width - 1, label.height - 1);
    ctx.fillStyle = GUNMETAL[100];
    ctx.fillText(label.text, label.x + Math.round(px * 0.6), label.y + label.height / 2);
  }
  ctx.restore();
}
