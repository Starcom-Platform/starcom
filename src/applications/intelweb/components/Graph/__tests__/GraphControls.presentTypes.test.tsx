/**
 * IntelWeb's graph controls offer what the graph holds (critique audit of
 * 2026-10-01, section 7; plan block F, item 4).
 *
 * The filters listed five node types and three edge types whatever the graph
 * held. Nothing produces event or source nodes, or temporal edges, so three of
 * those boxes could never match anything, and a reader unticking them saw
 * nothing change. The node and edge counts were shown three times; the
 * header's stays.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphControls } from '../GraphControls';
import { GraphContext, type GraphContextValue } from '../GraphContext';

const baseFilters = { confidenceRange: [0.3, 1] as [number, number], nodeTypes: ['report'], edgeTypes: ['reference'] };

const value = (over: Partial<GraphContextValue>): GraphContextValue => ({
  filters: baseFilters,
  setFilters: () => {},
  physics: { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 } as never,
  setPhysics: () => {},
  graphMode: '2d',
  setGraphMode: () => {},
  frozen: false,
  setFrozen: () => {},
  nodeCount: 3,
  edgeCount: 0,
  timestamps: [new Date('2026-09-10T00:00:00Z')],
  vaultHash: 'vault-test',
  fullGraph: null,
  activeGraph: null,
  isolateState: { rootId: null, depth: 1, active: false },
  applyIsolate: () => {},
  clearIsolate: () => {},
  sizingMode: 'degree',
  setSizingMode: () => {},
  ...over,
});

const renderControls = (over: Partial<GraphContextValue>) =>
  render(
    <GraphContext.Provider value={value(over)}>
      <GraphControls />
    </GraphContext.Provider>
  );

describe('GraphControls: the filters offer the types the graph holds', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('vault-test.ui.controlsOpen', '1');
  });

  const graph = {
    nodes: [{ id: 'a', type: 'report' }, { id: 'b', type: 'report' }, { id: 'c', type: 'location' }],
    edges: [{ id: 'e', source: 'a', target: 'c', type: 'spatial' }],
  };

  it('a box for each node and edge type present, with how many, and none for the rest', () => {
    renderControls({ fullGraph: graph as never, activeGraph: graph as never });
    expect(screen.getByRole('checkbox', { name: /report \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /location \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /spatial \(1\)/ })).toBeInTheDocument();
    for (const absent of [/^event/, /^source/, /^entity/, /^temporal/, /^reference/]) {
      expect(screen.queryByRole('checkbox', { name: absent }), String(absent)).not.toBeInTheDocument();
    }
  });

  it('keeps a box for a type the reader has filtered out, so it can be ticked back', () => {
    const shown = { nodes: graph.nodes.filter((n) => n.type === 'report'), edges: [] };
    renderControls({ fullGraph: graph as never, activeGraph: shown as never, filters: { ...baseFilters, nodeTypes: ['report'] } });
    expect(screen.getByRole('checkbox', { name: /location \(1\)/ })).not.toBeChecked();
  });

  it('shows the counts once, in the graph\'s header, not again here', () => {
    renderControls({ fullGraph: graph as never, activeGraph: graph as never });
    expect(screen.queryByTitle('Nodes')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edges')).not.toBeInTheDocument();
  });
});
