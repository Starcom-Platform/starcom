/**
 * The node graph says when it read its data (plan item 8.3, block B2).
 *
 * Its footer said "GRAPH LIVE" whenever it held a node, and it reads its data
 * once, when it opens. It also said "ZOOM: 100%", which nothing changes.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const data = vi.hoisted(() => ({
  value: {
    graph: { nodes: [], edges: [] },
    stats: { totalNodes: 0, totalEdges: 0, nodeTypes: {} as Record<string, number> },
    loading: false,
    error: null as string | null,
    readAt: null as number | null,
    applyFilters: async () => {}, refreshData: async () => {},
    addNode: async () => null, updateNode: async () => false, deleteNode: async () => false, addEdge: async () => null,
  },
}));
vi.mock('../../../../core/intel/hooks/useNodeWebData', () => ({ useNodeWebData: () => data.value }));
vi.mock('../../../../hooks/useUnifiedGlobalCommand', () => ({ useGlobalCommand: () => ({ state: {} }) }));

import NodeGraphView from '../NodeGraphView';

const node = { id: 'n1', label: 'Berth 4', type: 'location' };

describe('NodeGraphView, its status', () => {
  beforeEach(() => {
    data.value = { ...data.value, graph: { nodes: [node], edges: [] } as never, stats: { totalNodes: 1, totalEdges: 0, nodeTypes: { location: 1 } }, loading: false, error: null, readAt: Date.parse('2026-10-01T10:31:00Z') };
  });

  it('says when it read, not that it is live', () => {
    render(<NodeGraphView />);
    expect(screen.getByText('READ 10:31Z')).toBeTruthy();
    expect(screen.queryByText(/GRAPH LIVE/)).toBeNull();
    expect(screen.queryByText(/ZOOM/)).toBeNull();
  });

  it('says it could not read, when it could not', () => {
    data.value = { ...data.value, error: 'store unavailable', readAt: null };
    render(<NodeGraphView />);
    expect(screen.getByText('COULD NOT READ')).toBeTruthy();
  });
});
