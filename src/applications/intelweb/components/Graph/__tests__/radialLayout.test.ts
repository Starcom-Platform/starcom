/**
 * IntelWeb's Radial (decision D-IW, IW14): the node chosen at the middle, what it links to in a ring
 * one step out and a ring two steps out, each ring in spokes by group, a group's spoke on the same
 * bearing in both rings.
 */
import { describe, expect, it } from 'vitest';
import { radialLayout, RADIAL_RINGS } from '../radialLayout';

const edges = [
  ['hub', 'a'], ['hub', 'b'], ['hub', 'c'], ['hub', 'd'],
  ['a', 'a2'], ['c', 'c2'],
  ['a2', 'far'],
].map(([source, target]) => ({ source, target }));
const groupOf = new Map([['a', 'ye'], ['b', 'sa'], ['c', 'ye'], ['d', 'ye'], ['a2', 'ye'], ['c2', 'sa']]);

const at = (p: { x: number; y: number }) => ({ r: Math.hypot(p.x, p.y), angle: Math.atan2(p.y, p.x) });

describe('the Radial', () => {
  const out = radialLayout('hub', edges, (id) => groupOf.get(id) ?? '');

  it('puts the node chosen at the middle', () => {
    expect(out.places.get('hub')).toEqual({ x: 0, y: 0 });
  });

  it('puts what it links to one step out, and what those link to two steps out', () => {
    for (const id of ['a', 'b', 'c', 'd']) expect(at(out.places.get(id)!).r).toBeCloseTo(RADIAL_RINGS[0], 6);
    for (const id of ['a2', 'c2']) expect(at(out.places.get(id)!).r).toBeCloseTo(RADIAL_RINGS[1], 6);
  });

  it('draws nothing further than two steps', () => {
    expect(out.places.has('far')).toBe(false);
    expect(out.beyond).toBe(1);
  });

  it('gives each group a spoke: its nodes side by side on each ring, the largest group first', () => {
    expect(out.sectors.map((s) => s.key)).toEqual(['ye', 'sa']);
    const ye = out.sectors[0];
    for (const id of ['a', 'c', 'd', 'a2']) {
      const { angle } = at(out.places.get(id)!);
      const turn = ((angle - ye.from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      expect(turn).toBeLessThanOrEqual(ye.to - ye.from + 1e-9);
    }
  });

  it('places the chosen node alone when it links to nothing', () => {
    const alone = radialLayout('solo', [], () => '');
    expect([...alone.places.keys()]).toEqual(['solo']);
    expect(alone.sectors).toEqual([]);
  });
});
