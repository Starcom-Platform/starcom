/**
 * A link joins the nodes drawn, whatever an earlier layout left in it (decision D-IW, step 1).
 *
 * d3's link force replaces an edge's ends with node objects the first time it lays the graph out,
 * and keeps any end that is already an object. IntelGraph hands the engine fresh node copies on
 * every render (degree, sizing) and the same edges, so every edge after the first layout pointed at
 * nodes no longer drawn: on the build, all 404 links bunched at the graph's corner and pulled
 * nothing, and the notes stayed an even disc however they were linked.
 */
import React, { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GraphEngine2D } from '../GraphEngine2D';
import type { IntelEdge, IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const node = (id: string): IntelNode => ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {} });

const Harness: React.FC<{ nodes: IntelNode[]; edges: IntelEdge[] }> = ({ nodes, edges }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ width: 400, height: 300 }}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges }} physics={physics as never} selectedNodes={[]} />
    </div>
  );
};

/** Where a node group is drawn, from its transform. */
const at = (group: Element) => {
  const m = group.getAttribute('transform')?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

describe('GraphEngine2D: links', () => {
  it('draws each link between its nodes as drawn, though an earlier layout left old node objects in it', async () => {
    const [a, b] = [node('a'), node('b')];
    // As an earlier layout leaves an edge: its ends replaced by that layout's node objects.
    const stale = { ...node('a'), x: 0, y: 0 };
    const staleB = { ...node('b'), x: 0, y: 0 };
    const edge: IntelEdge = { id: 'a-b', source: stale, target: staleB, type: 'reference', weight: 0.5, confidence: 0.8, metadata: {} };
    const { container } = render(<Harness nodes={[a, b]} edges={[edge]} />);

    await waitFor(() => {
      const groups = [...container.querySelectorAll('g.node-group')];
      const line = container.querySelector('line.edge')!;
      const [ax, ay] = at(groups[0])!;
      const [bx, by] = at(groups[1])!;
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(ax, 3);
      expect(Number(line.getAttribute('y1'))).toBeCloseTo(ay, 3);
      expect(Number(line.getAttribute('x2'))).toBeCloseTo(bx, 3);
      expect(Number(line.getAttribute('y2'))).toBeCloseTo(by, 3);
      expect(Math.hypot(ax, ay)).toBeGreaterThan(1);
    });
  });
});
