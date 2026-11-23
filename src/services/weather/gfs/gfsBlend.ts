/**
 * A field at a moment between two of the model's steps (decision D-W, WX10):
 * whether the steps in hand answer a moment, how far between them it lies,
 * and the value at a place, blended as the shaders blend it. The hover and
 * the colour beneath it agree because both blend the same two steps by the
 * same weight.
 */
import { valueAt, type GriddedValues } from './gfsGrid';
import type { GfsField } from './gfsClient';

/** The two steps' hours, and where the first came from: what deciding the moment needs. */
type Hours = { before: Pick<GfsField, 'valid' | 'source'>; after: Pick<GfsField, 'valid'> };

const STEP_MS = 3 * 3600e3;

/**
 * Whether the steps in hand answer a moment: when it lies from the first
 * hour to the second; for one step, on its own hour; and, read from PacIOOS
 * as the nearest hour alone, while that hour is still the nearest.
 */
export function blendCovers(blend: Hours, at: number): boolean {
  const first = blend.before.valid.getTime(), second = blend.after.valid.getTime();
  if (blend.before.source === 'pacioos') return Math.round(at / STEP_MS) * STEP_MS === first;
  return first === second ? at === first : at >= first && at <= second;
}

/** How far from the first hour to the second a moment lies: 0 at the first, 1 at the second, 0 for one step. */
export function blendWeight(blend: Hours, at: number): number {
  const first = blend.before.valid.getTime(), second = blend.after.valid.getTime();
  if (first === second) return 0;
  return Math.min(Math.max((at - first) / (second - first), 0), 1);
}

/** The value at a place for a weight, as the shader blends the two steps; null where either has none. */
export function blendValueAt(blend: { before: GriddedValues; after: GriddedValues }, weight: number, lat: number, lng: number): number | null {
  const first = valueAt(blend.before, lat, lng);
  if (first === null || Number.isNaN(first)) return null;
  if (weight === 0) return first;
  const second = valueAt(blend.after, lat, lng);
  if (second === null || Number.isNaN(second)) return null;
  return first + (second - first) * weight;
}
