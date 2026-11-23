/**
 * A card's picture of two layers side by side, its halves named (D-CM, CM3; OR35): the line at the screen's middle
 * in the card's window, a label each side of it at the top, kept inside the picture; a window wholly on one side
 * names that half alone, with no line.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { compareHalfLabels } from '../compareHalves';

const RECT = { x: 0, y: 0, width: 600, height: 400 };
const measure = (t: string) => t.length * 8;

describe('the halves named on a card', () => {
  it('draws the line where the halves meet and a label each side of it', () => {
    const { lineX, labels } = compareHalfLabels(RECT, 0.5, 'Eco Disasters', 'Earth Weather', measure, 13);
    expect(lineX).toBe(300);
    expect(labels.map((l) => l.text)).toEqual(['Eco Disasters', 'Earth Weather']);
    expect(labels[0].x + labels[0].width).toBeLessThan(300);
    expect(labels[1].x).toBeGreaterThan(300);
  });

  it('keeps a label inside the picture when the line stands near its edge', () => {
    const { labels } = compareHalfLabels(RECT, 0.05, 'Eco Disasters', 'Earth Weather', measure, 13);
    expect(labels[0].x).toBeGreaterThanOrEqual(0);
    expect(labels[1].x + labels[1].width).toBeLessThanOrEqual(600);
  });

  it('names one half alone, with no line, for a window wholly on one side', () => {
    expect(compareHalfLabels(RECT, 0, 'L', 'R', measure, 13)).toMatchObject({ lineX: null, labels: [{ text: 'R' }] });
    expect(compareHalfLabels(RECT, 1, 'L', 'R', measure, 13)).toMatchObject({ lineX: null, labels: [{ text: 'L' }] });
  });
});
