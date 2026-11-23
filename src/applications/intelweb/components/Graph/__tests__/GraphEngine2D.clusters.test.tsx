/**
 * Clusters (decision D-IW, IW8): each grouped node is pulled toward its cluster's place, so notes
 * that share a country, a desk or a Zone gather, and each cluster says what it is.
 */
import React, { useRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine2D, type GraphClusters } from '../GraphEngine2D';
import { clusterCentres } from '../gravity';
import type { IntelEdge, IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const node = (id: string): IntelNode => ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {} });

const Harness: React.FC<{ nodes: IntelNode[]; clusters?: GraphClusters; edges?: IntelEdge[] }> = ({ nodes, clusters, edges = [] }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ width: 400, height: 300 }}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges }} physics={physics as never} selectedNodes={[]} clusters={clusters} />
    </div>
  );
};

const at = (group: Element) => {
  const m = group.getAttribute('transform')?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: NaN, y: NaN };
};
const mean = (ps: Array<{ x: number; y: number }>) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('GraphEngine2D: clusters', () => {
  // jsdom lays nothing out, so a pane measures 0 by 0 and every cluster's place is its middle.
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

  const ids = ['a1', 'b1', 'a2', 'b2', 'a3', 'b3'];
  const clusters: GraphClusters = {
    of: new Map(ids.map((id) => [id, id[0] === 'a' ? 'alpha' : 'beta'])),
    names: new Map([['alpha', 'Alpha'], ['beta', 'Beta']]),
  };

  it('gathers each cluster: every node nearer its own cluster than the other', async () => {
    const { container } = render(<Harness nodes={ids.map(node)} clusters={clusters} />);
    // Judged once the layout has run, not from where it starts.
    await new Promise((settled) => setTimeout(settled, 2500));
    await waitFor(() => {
      const placed = new Map([...container.querySelectorAll('g.node-group')].map((g, i) => [ids[i], at(g)]));
      const centre = (c: string) => mean(ids.filter((id) => clusters.of.get(id) === c).map((id) => placed.get(id)!));
      const [alpha, beta] = [centre('alpha'), centre('beta')];
      expect(dist(alpha, beta)).toBeGreaterThan(40);
      for (const id of ids) {
        const own = clusters.of.get(id) === 'alpha' ? alpha : beta;
        const other = own === alpha ? beta : alpha;
        expect(dist(placed.get(id)!, own)).toBeLessThan(dist(placed.get(id)!, other));
      }
    }, { timeout: 4000 });
  });

  /*
   * Measured on an 800 by 600 pane, sixty notes in six clusters: with the Charge slider's push a
   * quarter as strong while grouped, each cluster held within 50 to 56 px of its middle; at full
   * strength, 91 to 122 px, running into the next.
   */
  it('holds each cluster together, its notes near its middle', async () => {
    for (const [prop, value] of [['clientWidth', 800], ['clientHeight', 600]] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    }
    const many = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const six: GraphClusters = { of: new Map(many.map((id, i) => [id, `c${i % 6}`])), names: new Map() };
    const { container } = render(<Harness nodes={many.map(node)} clusters={six} />);
    await new Promise((settled) => setTimeout(settled, 3000));
    await waitFor(() => {
      const placed = [...container.querySelectorAll('g.node-group')].map(at);
      for (let c = 0; c < 6; c++) {
        const members = placed.filter((_, i) => i % 6 === c);
        const middle = mean(members);
        for (const p of members) expect(dist(p, middle)).toBeLessThan(80);
      }
    }, { timeout: 6000 });
  }, 10000);

  it('places a node in no cluster among what it links, not pulled to the middle', async () => {
    // alpha, the largest, takes the middle; the free node is linked only to beta's notes.
    const nodes = [...['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'].map(node), node('free')];
    const of = new Map(nodes.filter((n) => n.id !== 'free').map((n) => [n.id, n.id[0] === 'a' ? 'alpha' : 'beta']));
    const link = (target: string): IntelEdge => ({ id: `free-${target}`, source: 'free', target, type: 'reference', weight: 0.5, confidence: 0.8, metadata: {} });
    const { container } = render(<Harness nodes={nodes} clusters={{ of, names: new Map() }} edges={['b1', 'b2', 'b3'].map(link)} />);
    await waitFor(() => {
      const placed = new Map([...container.querySelectorAll('g.node-group')].map((g, i) => [nodes[i].id, at(g)]));
      const centre = (c: string) => mean([...of].filter(([, k]) => k === c).map(([id]) => placed.get(id)!));
      expect(dist(placed.get('free')!, centre('beta'))).toBeLessThan(dist(placed.get('free')!, centre('alpha')));
    }, { timeout: 4000 });
  });

  /*
   * On the build, 220 nodes in 27 clusters: the notes never reached their clusters' places, 200 to
   * 400 px out, because the Friction slider's damping cools the layout first. Started there, they
   * need not travel.
   */
  it('starts each node at its cluster\'s place, so it need not travel there', () => {
    const many = Array.from({ length: 40 }, (_, i) => `n${i}`);
    const ten: GraphClusters = { of: new Map(many.map((id, i) => [id, `c${i % 10}`])), names: new Map() };
    const nodes = many.map(node);
    render(<Harness nodes={nodes} clusters={ten} />);
    const centres = clusterCentres(new Map([...Array(10)].map((_, c) => [`c${c}`, 4])), 400, 300);
    for (const n of nodes) {
      expect(dist({ x: n.x!, y: n.y! }, centres.get(ten.of.get(n.id)!)!)).toBeLessThan(30);
    }
  });

  it('leaves a node the reader pinned where it is', () => {
    const pinned = { ...node('a1'), x: 5, y: 7, fx: 5, fy: 7 };
    render(<Harness nodes={[pinned, ...ids.slice(1).map(node)]} clusters={clusters} />);
    expect([pinned.x, pinned.y]).toEqual([5, 7]);
  });

  it('gives a cluster room for its size, past the pane if need be', () => {
    const centres = clusterCentres(new Map([['big', 40], ['small', 2]]), 400, 300);
    expect(dist(centres.get('big')!, centres.get('small')!)).toBeGreaterThanOrEqual(2 * 12 * Math.sqrt(40));
  });

  it('names each cluster above the nodes, readable over them', () => {
    const { container } = render(<Harness nodes={ids.map(node)} clusters={clusters} />);
    const label = container.querySelector('text.cluster-label')!;
    const groups = [...container.querySelectorAll('g.node-group')];
    // Drawn after the nodes, so on top of them, with a halo.
    expect(groups[groups.length - 1].compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.getAttribute('paint-order')).toBe('stroke');
  });

  it('fits the whole graph in the pane once it settles', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `n${i}`);
    const forty: GraphClusters = { of: new Map(many.map((id, i) => [id, `c${i % 10}`])), names: new Map() };
    const { container } = render(<Harness nodes={many.map(node)} clusters={forty} />);
    await waitFor(() => {
      const m = container.querySelector('svg > g')!.getAttribute('transform')?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/);
      expect(m).toBeTruthy();
      const [tx, ty, k] = m!.slice(1).map(Number);
      for (const g of container.querySelectorAll('g.node-group')) {
        const p = at(g);
        expect(tx + k * p.x).toBeGreaterThanOrEqual(0);
        expect(tx + k * p.x).toBeLessThanOrEqual(400);
        expect(ty + k * p.y).toBeGreaterThanOrEqual(0);
        expect(ty + k * p.y).toBeLessThanOrEqual(300);
      }
    }, { timeout: 9000 });
  }, 12000);

  it('names each cluster', () => {
    const { container } = render(<Harness nodes={ids.map(node)} clusters={clusters} />);
    expect([...container.querySelectorAll('text.cluster-label')].map((t) => t.firstChild?.textContent).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('draws no cluster names where nothing is grouped', () => {
    const { container } = render(<Harness nodes={ids.map(node)} />);
    expect(container.querySelectorAll('text.cluster-label')).toHaveLength(0);
  });
});
