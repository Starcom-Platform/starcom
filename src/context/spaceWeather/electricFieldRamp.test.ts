import { describe, it, expect } from 'vitest';
import { ELECTRIC_FIELD_RAMP, STRONG_OUTLIER, electricFieldSampleColor } from './electricFieldRamp';

/** WCAG relative luminance, 0 (black) to 1 (white). */
const luminance = ([r, g, b]: readonly number[]) => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const rgbOf = (css: string) => css.match(/\d+/g)!.slice(0, 3).map(Number);
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the electric-field ramp', () => {
  it('gets brighter at every step up in rank — the one thing a brightness ramp promises', () => {
    const dimToBright = [...ELECTRIC_FIELD_RAMP].reverse().map((s) => luminance(s.rgb));
    for (let i = 1; i < dimToBright.length; i++) {
      expect(dimToBright[i]).toBeGreaterThan(dimToBright[i - 1] * 1.5);
    }
  });

  it('keeps every colour a reader must tell apart well apart, which the old palette did not', () => {
    // The defect this replaces: 'top 10%' and 'below median' were 25/255 apart.
    const colours = [...ELECTRIC_FIELD_RAMP.map((s) => s.rgb), STRONG_OUTLIER.rgb];
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        expect(distance(colours[i], colours[j])).toBeGreaterThan(90);
      }
    }
    expect(distance([255, 165, 0], [255, 140, 0])).toBeLessThan(90); // the old pair fails this bar
  });

  it('gives each colour one meaning and each meaning one colour', () => {
    const meanings = [...ELECTRIC_FIELD_RAMP.map((s) => s.meaning), STRONG_OUTLIER.meaning];
    expect(new Set(meanings).size).toBe(meanings.length);
  });

  it('bands by rank at the edges of each band', () => {
    expect(electricFieldSampleColor(100, false, 1).meaning).toBe('top 10% of samples');
    expect(electricFieldSampleColor(90, false, 1).meaning).toBe('top 10% of samples');
    expect(electricFieldSampleColor(89.9, false, 1).meaning).toBe('top 30%');
    expect(electricFieldSampleColor(70, false, 1).meaning).toBe('top 30%');
    expect(electricFieldSampleColor(50, false, 1).meaning).toBe('top half');
    expect(electricFieldSampleColor(49.9, false, 1).meaning).toBe('bottom half');
    expect(electricFieldSampleColor(0, false, 1).meaning).toBe('bottom half');
  });

  it('draws a strong outlier off the ramp, and a weak one in its band', () => {
    expect(electricFieldSampleColor(99, true, 1).meaning).toBe(STRONG_OUTLIER.meaning);
    expect(electricFieldSampleColor(3, true, 1).meaning).toBe('bottom half');
  });

  it('uses the same rule whatever dataset a sample came from, because it is never told one', () => {
    // The old rule switched on dataset below the median; this signature has no dataset.
    expect(electricFieldSampleColor.length).toBe(3);
  });

  it('carries the layer opacity and treats an unreadable rank as the bottom band', () => {
    const { color, meaning } = electricFieldSampleColor(Number.NaN, false, 0.8);
    expect(color).toBe(`rgba(${ELECTRIC_FIELD_RAMP[3].rgb.join(', ')}, 0.8)`);
    expect(meaning).toBe('bottom half');
    expect(rgbOf(color)).toEqual([...ELECTRIC_FIELD_RAMP[3].rgb]);
  });
});
