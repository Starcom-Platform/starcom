/**
 * Labels in the graph (decision D-IW, IW10): hubs and clusters always, a note's title on hover; a
 * label that would overlap another is left out, never stacked. Nodes are pinned, so where each
 * stands is known.
 */
import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine2D, type GraphClusters } from '../GraphEngine2D';
import type { IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const pinned = (id: string, type: IntelNode['type'], x: number, y: number): IntelNode =>
  ({ id, type, confidence: 0.8, title: id, tags: [], metadata: {}, x, y, fx: x, fy: y });

const Harness: React.FC<{ nodes: IntelNode[]; clusters?: GraphClusters }> = ({ nodes, clusters }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges: [] }} physics={physics as never} selectedNodes={[]} clusters={clusters} />
    </div>
  );
};

const shown = (container: HTMLElement) => [...container.querySelectorAll('g.node-group')]
  .filter((g) => (g.querySelector('text.node-label') as SVGElement | null)?.style.display !== 'none')
  .map((g) => g.querySelector('text.node-label')!.textContent);

describe('GraphEngine2D: labels', () => {
  const sized: Array<[string, PropertyDescriptor | undefined]> = [];
  beforeEach(() => {
    for (const [prop, value] of [['clientWidth', 400], ['clientHeight', 300]] as const) {
      sized.push([prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)]);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    }
  });
  afterEach(() => {
    for (const [prop, descriptor] of sized.splice(0)) if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  });

  it('names a hub, and keeps a note\'s title for when it is pointed at', () => {
    const { container } = render(<Harness nodes={[pinned('Yemen', 'country', 300, 100), pinned('a note', 'report', 100, 100)]} />);
    expect(shown(container)).toEqual(['Yemen']);
    fireEvent.mouseOver(container.querySelectorAll('g.node-group')[1]);
    expect(shown(container).sort()).toEqual(['Yemen', 'a note']);
  });

  it('draws one of two hubs\' names that would stack, not both', () => {
    const { container } = render(<Harness nodes={[pinned('#war_map', 'tag', 200, 150), pinned('#conflict', 'tag', 204, 152)]} />);
    expect(shown(container)).toHaveLength(1);
  });

  it('leaves out a label that would lie over a cluster\'s name', () => {
    // One cluster, so its name is at the pane's middle, 200 by 150; a hub pinned just above it.
    const clusters: GraphClusters = { of: new Map([['n', 'alpha']]), names: new Map([['alpha', 'Alpha cluster']]) };
    const { container } = render(<Harness nodes={[pinned('n', 'report', 50, 50), pinned('#war_map', 'tag', 200, 130), pinned('#far', 'tag', 350, 40)]} clusters={clusters} />);
    expect(shown(container)).toEqual(['#far']);
  });

  it('draws a note\'s category as the globe\'s icon for it, and no emoji (IW12)', () => {
    const conflict = { ...pinned('war note', 'report', 100, 100), metadata: { intelCategory: 'conflict' } };
    const plain = pinned('plain note', 'report', 300, 100);
    const { container } = render(<Harness nodes={[conflict, plain]} />);
    const [first, second] = [...container.querySelectorAll('g.node-group')];
    // The swords' first stroke, as symbolRegistry draws conflict.
    expect(first.querySelector('g.node-glyph polyline')?.getAttribute('points')).toBe('14.5 17.5 3 6 3 3 6 3 17.5 14.5');
    expect(first.querySelector('text.node-icon')).toBeNull();
    expect(second.querySelector('g.node-glyph')).toBeNull();
  });

  // On the build a stub and a raw note were the same grey disc with the same page icon.
  it('rings what is named but not held here with dashes, and nothing else', () => {
    const stub = pinned('A note not held here', 'stub', 100, 100);
    const away = { ...pinned('Mission package', 'mission', 200, 100), metadata: { held: false } };
    const held = { ...pinned('Held package', 'mission', 300, 100), metadata: { held: true } };
    const raw = pinned('raw note', 'report', 100, 200);
    const { container } = render(<Harness nodes={[stub, away, held, raw]} />);
    const dashes = [...container.querySelectorAll('g.node-group circle')].map((c) => c.getAttribute('stroke-dasharray'));
    expect(dashes.map(Boolean)).toEqual([true, true, false, false]);
  });
});

