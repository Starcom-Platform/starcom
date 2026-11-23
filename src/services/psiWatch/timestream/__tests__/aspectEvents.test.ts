/**
 * The aspect lane's events (decision D-PW, PW42): found in the lanes' own columns, on the sky catalogue's orbs, so a
 * window matches the one Mecha Jono's catalogue gives the same sky event; and stacked into rows without touching.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { skyColumns } from '../skyColumns';
import { aspectEvents, stackEvents, type AspectEvent } from '../aspectEvents';

const MIN = 60_000;
// The kit's Moon–Mars square: exact 27 Oct 2026 02:18:06Z, its window from 26 Oct 21:10:48Z to 27 Oct 07:24:35Z.
const EXACT = Date.UTC(2026, 9, 27, 2, 18, 6);
const FROM = Date.UTC(2026, 9, 26, 21, 10, 48);
const UNTIL = Date.UTC(2026, 9, 27, 7, 24, 35);

describe('the aspect lane', () => {
  it('finds the Moon–Mars square where the sky catalogue has it, its window to a few minutes', () => {
    const view = { startMs: Date.UTC(2026, 9, 26, 12), spanMs: 24 * 60 * MIN };
    const sky = skyColumns(view, 288, ['Moon', 'Mars'], 'galactic');
    const square = aspectEvents(sky, view).find((e) => e.kind === 'square');
    expect(square).toBeDefined();
    expect(Math.abs(square!.exactMs - EXACT)).toBeLessThan(3 * MIN);
    expect(Math.abs(square!.fromMs - FROM)).toBeLessThan(8 * MIN);
    expect(Math.abs(square!.untilMs - UNTIL)).toBeLessThan(8 * MIN);
    expect(square!.exactInView).toBe(true);
    expect([square!.fromEdge, square!.untilEdge]).toEqual([false, false]);
  });

  it('says which edges of a window are the view\'s own, where the aspect ran past them', () => {
    // From the square's exact moment on: in orb at the view's start, its end inside.
    const view = { startMs: EXACT, spanMs: 12 * 60 * MIN };
    const square = aspectEvents(skyColumns(view, 144, ['Moon', 'Mars'], 'galactic'), view).find((e) => e.kind === 'square')!;
    expect([square.fromEdge, square.untilEdge]).toEqual([true, false]);
    expect(Math.abs(square.untilMs - UNTIL)).toBeLessThan(8 * MIN);
  });

  it('is the same in either frame, since an aspect is a distance between two bodies', () => {
    const view = { startMs: Date.UTC(2026, 9, 26, 12), spanMs: 24 * 60 * MIN };
    const kinds = (frame: 'galactic' | 'tropical') => aspectEvents(skyColumns(view, 96, ['Sun', 'Moon', 'Mars', 'Saturn'], frame), view)
      .map((e) => `${e.a}-${e.b} ${e.kind} ${Math.round(e.exactMs / MIN)}`);
    expect(kinds('galactic')).toEqual(kinds('tropical'));
  });

  it('stacks events into rows that never overlap, and counts what does not fit', () => {
    const e = (from: number, until: number): AspectEvent => ({ a: 'Sun', b: 'Moon', kind: 'trine', fromMs: from, untilMs: until, exactMs: from, exactInView: true, fromEdge: false, untilEdge: false });
    const { placed, hidden } = stackEvents([e(0, 10), e(5, 15), e(11, 20), e(6, 8)], 2);
    expect(placed.map((p) => p.row)).toEqual([0, 1, 0]);
    expect(hidden).toBe(1);
  });
});
