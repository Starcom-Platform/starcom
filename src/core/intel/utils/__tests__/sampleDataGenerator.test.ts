/**
 * generateSampleData() (the "Operation Blackout" NodeWeb demo scenario, run
 * from App.tsx's loadIntelSampleData() on every dev/demo-mode load) used to
 * write into core/intel's storageOrchestrator/intelDataStore — but
 * NodeGraphView/nodeWebAdapter stopped reading from that store once NodeWeb
 * was migrated onto the unified Intel substrate. That left the demo graph
 * being generated into a store nobody renders: NodeGraphView would show
 * nothing. This locks in that it now writes through nodeWebAdapter instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { addNode, addEdge } = vi.hoisted(() => ({
  addNode: vi.fn(),
  addEdge: vi.fn()
}));

vi.mock('../../adapters/nodeWebAdapter', () => ({
  nodeWebAdapter: { addNode, addEdge }
}));

import { generateSampleData } from '../sampleDataGenerator';

describe('generateSampleData (Operation Blackout)', () => {
  beforeEach(() => {
    addNode.mockReset();
    addEdge.mockReset();
  });

  it('creates every scenario node through nodeWebAdapter.addNode, not the orphaned intelDataStore', async () => {
    addNode.mockImplementation(async (node: { title: string }) => `id-${node.title}`);

    await generateSampleData();

    expect(addNode).toHaveBeenCalled();
    expect(addNode.mock.calls.length).toBeGreaterThan(15); // 22 scenario nodes as of writing
    expect(addNode).toHaveBeenCalledWith(expect.objectContaining({ title: 'Shadow Collective', nodeType: 'THREAT_ACTOR' }));
  });

  it('wires scenario edges through nodeWebAdapter.addEdge using the real ids addNode returned', async () => {
    addNode.mockImplementation(async (node: { title: string }) => `id-${node.title}`);

    await generateSampleData();

    expect(addEdge).toHaveBeenCalled();
    // Shadow Collective -> DarkSpectre is one of the defined scenario edges.
    expect(addEdge).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'id-Shadow Collective',
      targetId: 'id-Viktor Petrov "DarkSpectre"',
      type: 'CONTROLS'
    }));
  });

  it('skips an edge (without throwing) when a node failed to persist', async () => {
    addNode.mockResolvedValue(null); // simulate every addNode call failing

    await expect(generateSampleData()).resolves.not.toThrow();
    expect(addEdge).not.toHaveBeenCalled();
  });
});
