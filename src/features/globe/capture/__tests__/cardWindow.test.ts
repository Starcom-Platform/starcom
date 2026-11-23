/**
 * The part of the view a card shows (block I, item 2; globe record, section
 * 21): its window, in the canvas's pixels, which the capture then renders at
 * the card's own resolution.
 *
 *   'planet'  the padded planet at the card's shape, whole, reaching past the
 *             canvas where the planet does: the planet is never clipped.
 *   'view'    the same window where it fits in the canvas; where it does not,
 *             the largest window of the card's shape that does, centred on the
 *             planet: what the camera framed, which the framing maths assumes.
 *
 * Both agree whenever the padded planet fits in the canvas.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { cardWindow, CARD_FITS } from '../shareCardLayout';

const CANVAS = { width: 1400, height: 708 };
const bounds = (cx: number, cy: number, r: number) => ({ minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r, width: 2 * r, height: 2 * r });
const PAD = 0.12;

describe('a card\'s window', () => {
  it('names its two fits', () => {
    expect(CARD_FITS).toEqual(['view', 'planet']);
  });

  it('is the padded planet at the card\'s shape when it fits in the canvas, whichever the fit', () => {
    const planet = bounds(700, 354, 200);
    for (const fit of CARD_FITS) {
      const w = cardWindow(planet, CANVAS, 1, PAD, fit);
      expect(w.width, fit).toBeCloseTo(400 * 1.24, 6);
      expect(w.height, fit).toBeCloseTo(400 * 1.24, 6);
      expect(w.x + w.width / 2, fit).toBeCloseTo(700, 6);
      expect(w.y + w.height / 2, fit).toBeCloseTo(354, 6);
    }
  });

  it('is the whole padded planet, past the canvas, for the planet fit', () => {
    // The floor: the planet is taller than the canvas.
    const w = cardWindow(bounds(700, 354, 440), CANVAS, 1, PAD, 'planet');
    expect(w.height).toBeCloseTo(880 * 1.24, 6);
    expect(w.y).toBeLessThan(0);
    expect(w.y + w.height).toBeGreaterThan(CANVAS.height);
  });

  it('is the largest window of the card\'s shape in the canvas, centred, for the view fit', () => {
    const square = cardWindow(bounds(700, 354, 440), CANVAS, 1, PAD, 'view');
    expect(square).toEqual({ x: 346, y: 0, width: 708, height: 708 });
    const wide = cardWindow(bounds(700, 354, 440), CANVAS, 1.91, PAD, 'view');
    expect(wide.height).toBeCloseTo(708, 6);
    expect(wide.width).toBeCloseTo(708 * 1.91, 6);
    expect(wide.y).toBeCloseTo(0, 6);
    const tall = cardWindow(bounds(700, 354, 440), CANVAS, 9 / 16, PAD, 'view');
    expect(tall.height).toBeCloseTo(708, 6);
    expect(tall.width).toBeCloseTo(708 * 9 / 16, 6);
  });

  it('keeps the view fit inside the canvas when the planet sits off-centre', () => {
    const w = cardWindow(bounds(150, 354, 440), CANVAS, 1, PAD, 'view');
    expect(w.x).toBe(0);
    expect(w.x + w.width).toBeLessThanOrEqual(CANVAS.width);
    expect(w.y).toBeGreaterThanOrEqual(0);
  });
});
