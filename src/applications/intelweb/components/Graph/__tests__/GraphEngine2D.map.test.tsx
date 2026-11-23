/**
 * The Map drawn (decision D-IW, IW13, step 6): a note with a point held at it, notes stating only a
 * country gathered around it, the world's borders under them, and the strip of notes with no place named.
 */
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine2D, type GraphMap } from '../GraphEngine2D';
import { mapLayout, project } from '../mapLayout';
import type { IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const node = (id: string, type: IntelNode['type'], metadata: Record<string, unknown> = {}): IntelNode =>
  ({ id, type, confidence: 0.8, title: id, tags: [], metadata, size: 0 });

const Harness: React.FC<{ nodes: IntelNode[]; map: GraphMap }> = ({ nodes, map }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges: [] }} physics={physics as never} selectedNodes={[]} map={map} />
    </div>
  );
};

describe('GraphEngine2D: the Map', () => {
  const sized: Array<[string, PropertyDescriptor | undefined]> = [];
  beforeEach(() => {
    for (const [prop, value] of [['clientWidth', 1000], ['clientHeight', 600]] as const) {
      sized.push([prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)]);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    }
  });
  afterEach(() => {
    for (const [prop, descriptor] of sized.splice(0)) if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  });

  const yemen = { lat: 15.5, lng: 47.5 };
  const nodes = [
    node('pointed', 'report', { coordinates: [15.35, 44.2] }),
    ...Array.from({ length: 6 }, (_, i) => node(`ye${i}`, 'report', { jurisdictions: ['ye'] })),
    node('countries/ye.md', 'country', { key: 'ye' }),
    node('nowhere', 'report'),
  ];
  const borders = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[40, 10], [50, 20]] } }] };
  const map = (): GraphMap => ({ layout: mapLayout(nodes, (c) => (c === 'ye' ? yemen : null)), borders, unplacedLabel: 'No place stated' });

  it('holds a note with a point at its point, and gathers the rest around their country', async () => {
    render(<Harness nodes={nodes} map={map()} />);
    await new Promise((settled) => setTimeout(settled, 1500));
    const pointed = nodes[0];
    const at = project(15.35, 44.2);
    expect(Math.hypot(pointed.x! - at.x, pointed.y! - at.y)).toBeLessThan(6);
    const centre = project(yemen.lat, yemen.lng);
    for (const n of nodes.filter((x) => x.id.startsWith('ye'))) expect(Math.hypot(n.x! - centre.x, n.y! - centre.y)).toBeLessThan(60);
  });

  it('draws the world\'s borders under the notes, and names the strip of notes with no place', () => {
    const { container } = render(<Harness nodes={nodes} map={map()} />);
    expect(container.querySelectorAll('path.map-border').length).toBeGreaterThan(0);
    expect(container.querySelector('text.map-unplaced')?.textContent).toBe('No place stated');
  });

  it('draws without borders while they load', () => {
    const { container } = render(<Harness nodes={nodes} map={{ ...map(), borders: null }} />);
    expect(container.querySelectorAll('path.map-border')).toHaveLength(0);
    expect(container.querySelectorAll('g.node-group')).toHaveLength(nodes.length);
  });

  // On the build the Map opened at full size, the Americas filling the pane and the rest out of sight.
  it('opens with the whole world in view', () => {
    const { container } = render(<Harness nodes={nodes} map={map()} />);
    const m = container.querySelector('svg > g')!.getAttribute('transform')?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/);
    expect(m).toBeTruthy();
    const [tx, , k] = m!.slice(1).map(Number);
    expect(tx).toBeGreaterThanOrEqual(0);
    expect(tx + k * 1440).toBeLessThanOrEqual(1000);
  });
});

