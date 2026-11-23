/**
 * Which labels IntelWeb draws (decision D-IW, IW10): hubs and collapsed clusters always; a note's
 * title on hover, when selected, or zoomed in close. A label that would overlap one already placed,
 * or a cluster's name, is left out, never stacked: they collided wherever notes gathered.
 */
import { describe, expect, it } from 'vitest';
import { labelBox, labelCandidates, placeLabels, ZOOM_FOR_NOTES, type LabelBox } from '../labelPlacement';
import type { IntelNode } from '../IntelGraph';

const node = (id: string, type: IntelNode['type'], x: number, y: number, title = id): IntelNode =>
  ({ id, type, confidence: 0.8, title, tags: [], metadata: {}, x, y });
const box = (id: string, x: number, y: number, priority = 0, width = 40): LabelBox => ({ id, x, y, width, height: 12, priority });

describe('which labels may be drawn', () => {
  const nodes = [node('ye', 'country', 0, 0), node('t', 'tag', 100, 0), node('c', 'cluster', 200, 0), node('n', 'report', 300, 0), node('s', 'stub', 400, 0)];
  const ids = (k: number, hovered: string | null = null, selected: string[] = []) =>
    labelCandidates(nodes, { k, hovered, selected: new Set(selected) }).map((c) => c.id).sort();

  it('hubs and collapsed clusters always', () => {
    expect(ids(0.3)).toEqual(['c', 't', 'ye']);
  });

  it('a note on hover or when selected', () => {
    expect(ids(0.3, 'n')).toEqual(['c', 'n', 't', 'ye']);
    expect(ids(0.3, null, ['s'])).toEqual(['c', 's', 't', 'ye']);
  });

  it('every node once zoomed in close', () => {
    expect(ids(ZOOM_FOR_NOTES)).toEqual(['c', 'n', 's', 't', 'ye']);
  });

  it('puts what the reader pointed at first, then clusters, then hubs by how many they join', () => {
    const joined = [node('a', 'tag', 0, 0), node('b', 'tag', 0, 0), node('c', 'cluster', 0, 0), node('n', 'report', 0, 0)];
    const degree = new Map([['a', 2], ['b', 9]]);
    const order = labelCandidates(joined, { k: 1, hovered: 'n', selected: new Set(), degree }).sort((x, y) => y.priority - x.priority).map((c) => c.id);
    expect(order).toEqual(['n', 'c', 'b', 'a']);
  });

  it('measures a label below its node, as wide as its words', () => {
    const b = labelBox({ id: 'x', x: 10, y: 20 }, 'Yemen', 8, 0);
    expect(b.x).toBe(10);
    expect(b.y).toBeGreaterThan(20 + 8);
    expect(b.width).toBeGreaterThan(5 * 5);
  });
});

describe('placing them', () => {
  it('keeps the first of two that would overlap, by priority, whatever order they come in', () => {
    expect([...placeLabels([box('low', 0, 0, 1), box('high', 10, 0, 5)], [])]).toEqual(['high']);
    expect([...placeLabels([box('high', 10, 0, 5), box('low', 0, 0, 1)], [])]).toEqual(['high']);
  });

  it('keeps both where they do not touch', () => {
    expect([...placeLabels([box('a', 0, 0), box('b', 100, 0)], [])].sort()).toEqual(['a', 'b']);
  });

  it('leaves out a label over a cluster\'s name', () => {
    expect([...placeLabels([box('a', 0, 0), box('b', 100, 0)], [box('name', 100, 4, 0, 60)])]).toEqual(['a']);
  });

  it('holds hundreds without stacking any', () => {
    const many = Array.from({ length: 400 }, (_, i) => box(`n${i}`, (i % 20) * 30, Math.floor(i / 20) * 10, i));
    const placed = [...placeLabels(many, [])].map((id) => many.find((b) => b.id === id)!);
    for (const a of placed) for (const b of placed) {
      if (a === b) continue;
      const apart = Math.abs(a.x - b.x) * 2 >= a.width + b.width || Math.abs(a.y - b.y) * 2 >= a.height + b.height;
      expect(apart).toBe(true);
    }
  });
});

describe('a node of no known size', () => {
  it('still has a box that can overlap, so its label is never stacked', () => {
    const b = labelBox({ id: 'x', x: 0, y: 0 }, 'Yemen', Number.NaN, 0);
    expect(Number.isFinite(b.y)).toBe(true);
    expect([...placeLabels([b, { ...b, id: 'y' }], [])]).toHaveLength(1);
  });
});
