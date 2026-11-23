/**
 * The Radial drawn (decision D-IW, IW14, step 7): each node at its place around the one chosen, the
 * two rings drawn, each spoke named, the whole in view as it opens.
 */
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine2D, type GraphRadial } from '../GraphEngine2D';
import { radialLayout, RADIAL_RINGS } from '../radialLayout';
import type { IntelEdge, IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const node = (id: string): IntelNode => ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {}, size: 0 });
const edge = (source: string, target: string): IntelEdge => ({ id: `${source}-${target}`, source, target, type: 'reference', weight: 0.5, confidence: 0.8, metadata: {} });

const Harness: React.FC<{ nodes: IntelNode[]; edges: IntelEdge[]; radial: GraphRadial }> = ({ nodes, edges, radial }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges }} physics={physics as never} selectedNodes={[]} radial={radial} />
    </div>
  );
};

describe('GraphEngine2D: the Radial', () => {
  const sized: Array<[string, PropertyDescriptor | undefined]> = [];
  beforeEach(() => {
    for (const [prop, value] of [['clientWidth', 900], ['clientHeight', 700]] as const) {
      sized.push([prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)]);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    }
  });
  afterEach(() => {
    for (const [prop, descriptor] of sized.splice(0)) if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  });

  const nodes = ['hub', 'a', 'b', 'a2'].map(node);
  const edges = [edge('hub', 'a'), edge('hub', 'b'), edge('a', 'a2')];
  const groups = new Map([['a', 'ye'], ['b', 'sa'], ['a2', 'ye']]);
  const radial = (): GraphRadial => ({ layout: radialLayout('hub', edges, (id) => groups.get(id) ?? ''), names: new Map([['ye', 'Yemen'], ['sa', 'Saudi Arabia']]) });

  it('starts each node at its place around the one chosen', () => {
    const r = radial();
    render(<Harness nodes={nodes} edges={edges} radial={r} />);
    for (const n of nodes) {
      const place = r.layout.places.get(n.id)!;
      expect(Math.hypot(n.x! - place.x, n.y! - place.y)).toBeLessThan(6);
    }
  });

  it('draws the two rings and names each spoke', () => {
    const { container } = render(<Harness nodes={nodes} edges={edges} radial={radial()} />);
    expect([...container.querySelectorAll('circle.radial-ring')].map((c) => Number(c.getAttribute('r')))).toEqual([...RADIAL_RINGS]);
    expect([...container.querySelectorAll('text.radial-sector')].map((t) => t.textContent)).toEqual(['Yemen', 'Saudi Arabia']);
  });

  it('opens with both rings in view', () => {
    const { container } = render(<Harness nodes={nodes} edges={edges} radial={radial()} />);
    const m = container.querySelector('svg > g')!.getAttribute('transform')?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/);
    const [tx, ty, k] = m!.slice(1).map(Number);
    expect(tx - k * RADIAL_RINGS[1]).toBeGreaterThanOrEqual(0);
    expect(ty + k * RADIAL_RINGS[1]).toBeLessThanOrEqual(700);
  });
});
