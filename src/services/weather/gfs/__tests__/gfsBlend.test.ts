/**
 * A field at a moment between two of the model's steps (decision D-W, WX10):
 * whether the steps in hand answer a moment, how far between them it lies,
 * and the value at a place, blended as the shaders blend it.
 */
import { describe, it, expect } from 'vitest';
import { blendCovers, blendWeight, blendValueAt } from '../gfsBlend';
import type { GfsBlend, GfsField } from '../gfsClient';

const H = 3600e3;
const T21 = Date.parse('2026-10-05T21:00:00Z');

/** A 1° field holding one value everywhere. */
function field(valid: number, value: number, source: GfsField['source'] = 'aws'): GfsField {
  return {
    field: 'tmp2m', source, run: source === 'aws' ? new Date(valid - 3 * H) : null, step: source === 'aws' ? 3 : null,
    valid: new Date(valid), units: 'K',
    grid: { ni: 360, nj: 181, la1: 90, lo1: 0, la2: -90, lo2: 359, di: 1, dj: 1 },
    values: new Float32Array(360 * 181).fill(value),
  };
}
const pair = (a: GfsField, b: GfsField, at: number): GfsBlend => ({ at: new Date(at), before: a, after: b, weight: 0 });

describe('blendCovers', () => {
  const blend = pair(field(T21, 280), field(T21 + 3 * H, 286), T21 + H);

  it('answers every moment from the first hour to the second, and none outside', () => {
    expect(blendCovers(blend, T21)).toBe(true);
    expect(blendCovers(blend, T21 + 1.5 * H)).toBe(true);
    expect(blendCovers(blend, T21 + 3 * H)).toBe(true);
    expect(blendCovers(blend, T21 - 1)).toBe(false);
    expect(blendCovers(blend, T21 + 3 * H + 1)).toBe(false);
  });

  it('answers only its own hour when it is one step, read on that hour', () => {
    const one = field(T21, 280);
    expect(blendCovers(pair(one, one, T21), T21)).toBe(true);
    expect(blendCovers(pair(one, one, T21), T21 + 60e3)).toBe(false);
  });

  it('answers, read from PacIOOS as the nearest hour alone, while that hour is still the nearest', () => {
    const one = field(T21, 280, 'pacioos');
    expect(blendCovers(pair(one, one, T21), T21 + 1.4 * H)).toBe(true);
    expect(blendCovers(pair(one, one, T21), T21 - 1.4 * H)).toBe(true);
    expect(blendCovers(pair(one, one, T21), T21 + 1.6 * H)).toBe(false);
  });
});

describe('blendWeight', () => {
  it('is how far from the first hour to the second the moment lies', () => {
    const blend = pair(field(T21, 280), field(T21 + 3 * H, 286), T21);
    expect(blendWeight(blend, T21)).toBe(0);
    expect(blendWeight(blend, T21 + H)).toBe(1 / 3);
    expect(blendWeight(blend, T21 + 3 * H)).toBe(1);
    // Never past either end.
    expect(blendWeight(blend, T21 + 4 * H)).toBe(1);
    expect(blendWeight(blend, T21 - H)).toBe(0);
  });

  it('is 0 for one step', () => {
    const one = field(T21, 280);
    expect(blendWeight(pair(one, one, T21), T21 + H)).toBe(0);
  });
});

describe('blendValueAt', () => {
  it('blends the two steps\' values at a place as the shader does', () => {
    const blend = pair(field(T21, 280), field(T21 + 3 * H, 286), T21);
    expect(blendValueAt(blend, 0, 10, 20)).toBe(280);
    expect(blendValueAt(blend, 0.5, 10, 20)).toBe(283);
    expect(blendValueAt(blend, 1, 10, 20)).toBe(286);
  });

  it('says nothing where either step has no value', () => {
    const blend = pair(field(T21, 280), field(T21 + 3 * H, Number.NaN), T21);
    expect(blendValueAt(blend, 0.5, 10, 20)).toBeNull();
    // At weight 0 the second step is not read at all.
    expect(blendValueAt(blend, 0, 10, 20)).toBe(280);
  });
});
