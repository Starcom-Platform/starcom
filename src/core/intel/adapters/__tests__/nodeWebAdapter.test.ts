/**
 * NodeWebAdapter now backed by the unified Intel substrate
 * (IntelWorkspaceManager + relationships) instead of storageOrchestrator/
 * intelDataStore — the fix for NodeWeb having zero real persistence before
 * this phase. Mocks IntelWorkspaceManager directly since the adapter now
 * talks to it, not a query-options-based store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IntelItemUI } from '../../../../types/intel/IntelItemUI';
import type { IntelRelationshipUI } from '../../../../types/intel/IntelRelationship';

const { ensureInitialized, getIntelItems, getIntelItem, addIntelItem, updateIntelItem,
  getRelationships, getRelationshipsForEntity, addRelationship, removeRelationship } = vi.hoisted(() => ({
  ensureInitialized: vi.fn(),
  getIntelItems: vi.fn(),
  getIntelItem: vi.fn(),
  addIntelItem: vi.fn(),
  updateIntelItem: vi.fn(),
  getRelationships: vi.fn(),
  getRelationshipsForEntity: vi.fn(),
  addRelationship: vi.fn(),
  removeRelationship: vi.fn()
}));

vi.mock('../../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: {
    ensureInitialized, getIntelItems, getIntelItem, addIntelItem, updateIntelItem,
    getRelationships, getRelationshipsForEntity, addRelationship, removeRelationship
  }
}));

import { nodeWebAdapter } from '../nodeWebAdapter';

function makeItem(overrides: Partial<IntelItemUI> = {}): IntelItemUI {
  return {
    id: 'item-1', title: 'Suspicious Domain', type: 'DOMAIN',
    source: 'netrunner', reliability: 'B', confidence: 0.8, tags: ['phishing'], categories: [],
    content: 'observed C2 traffic', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    verified: true, version: 1,
    ...overrides
  };
}

function makeRelationship(overrides: Partial<IntelRelationshipUI> = {}): IntelRelationshipUI {
  return {
    id: 'rel-1', type: 'resolves_to', sourceId: 'item-1', targetId: 'item-2',
    confidence: 70, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'operative', tags: [], metadata: {},
    ...overrides
  };
}

describe('NodeWebAdapter', () => {
  beforeEach(() => {
    ensureInitialized.mockReset().mockResolvedValue(undefined);
    getIntelItems.mockReset().mockReturnValue([]);
    getIntelItem.mockReset().mockReturnValue(null);
    addIntelItem.mockReset();
    updateIntelItem.mockReset();
    getRelationships.mockReset().mockReturnValue([]);
    getRelationshipsForEntity.mockReset().mockReturnValue([]);
    addRelationship.mockReset();
    removeRelationship.mockReset();
  });

  describe('getGraphData', () => {
    it('transforms real IntelItemUI/IntelRelationshipUI records into graph nodes/edges', async () => {
      getIntelItems.mockReturnValue([makeItem({ id: 'item-1' }), makeItem({ id: 'item-2', type: 'IP_ADDRESS' })]);
      getRelationships.mockReturnValue([makeRelationship()]);

      const graph = await nodeWebAdapter.getGraphData();

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0]).toMatchObject({ id: 'item-1', label: 'Suspicious Domain', type: 'DOMAIN' });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toMatchObject({ id: 'rel-1', from: 'item-1', to: 'item-2', type: 'resolves_to' });
    });

    it('excludes relationships whose endpoints are filtered out of the node set', async () => {
      getIntelItems.mockReturnValue([makeItem({ id: 'item-1', type: 'PERSON' })]);
      getRelationships.mockReturnValue([makeRelationship({ sourceId: 'item-1', targetId: 'item-2' })]);

      const graph = await nodeWebAdapter.getGraphData([{ property: 'type', operator: 'equals', value: 'PERSON' }]);

      expect(graph.nodes).toHaveLength(1);
      // item-2 was never in the item list to begin with, so the edge referencing it must be dropped.
      expect(graph.edges).toHaveLength(0);
    });

    it('handles storage errors honestly — returns an empty graph, not a crash', async () => {
      getIntelItems.mockImplementation(() => { throw new Error('storage unavailable'); });
      const graph = await nodeWebAdapter.getGraphData();
      expect(graph).toEqual({ nodes: [], edges: [] });
    });
  });

  describe('getGraphStats', () => {
    it('aggregates real node/edge type counts', async () => {
      getIntelItems.mockReturnValue([
        makeItem({ id: 'item-1', type: 'DOMAIN' }),
        makeItem({ id: 'item-2', type: 'DOMAIN' }),
        makeItem({ id: 'item-3', type: 'PERSON' })
      ]);
      getRelationships.mockReturnValue([]);

      const stats = await nodeWebAdapter.getGraphStats();
      expect(stats.totalNodes).toBe(3);
      expect(stats.nodeTypes).toEqual({ DOMAIN: 2, PERSON: 1 });
    });
  });

  describe('addNode', () => {
    it('maps a Partial<NodeEntity> onto a real, persisted IntelItemUI', async () => {
      addIntelItem.mockReturnValue(makeItem({ id: 'new-node' }));

      const id = await nodeWebAdapter.addNode({ title: 'New Actor', nodeType: 'THREAT_ACTOR', tags: ['apt'] });

      expect(id).toBe('new-node');
      expect(addIntelItem).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Actor', type: 'THREAT_ACTOR', tags: ['apt']
      }));
    });

    it('maps the deliberate-deception reliability rating (X) down to F rather than widening the canonical scale', async () => {
      addIntelItem.mockReturnValue(makeItem());
      await nodeWebAdapter.addNode({ title: 'Suspect', reliability: 'X' });
      expect(addIntelItem).toHaveBeenCalledWith(expect.objectContaining({ reliability: 'F' }));
    });

    /*
     * These two used to cover a cast plus a default: NodeEntity's 7-value
     * ClassificationLevel was narrowed to the canonical 4-value type with
     * `?? 'UNCLASSIFIED'` behind it. That default was itself a fix for an
     * earlier version which hardcoded 'UNCLASSIFIED' and dropped whatever the
     * caller passed — so the pair existed to pin "carry the caller's value,
     * and only default when there is none".
     *
     * Both ladders are gone. The axes are the same type on both sides of this
     * adapter, so there is no cast to get wrong and no default to invent: the
     * property is carried, and absence stays absence.
     */
    it("carries the caller's handling axes through untouched", async () => {
      addIntelItem.mockReturnValue(makeItem());
      await nodeWebAdapter.addNode({
        title: 'Marked Node', visibility: 'private', sensitivity: 'protected',
      } as never);
      expect(addIntelItem).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'private', sensitivity: 'protected' }),
      );
    });

    it('invents no marking when the caller supplies none', async () => {
      addIntelItem.mockReturnValue(makeItem());
      await nodeWebAdapter.addNode({ title: 'Unmarked Node' });
      const passed = addIntelItem.mock.calls[0][0];
      expect(passed.visibility).toBeUndefined();
      expect(passed.sensitivity).toBeUndefined();
    });
  });

  describe('addEdge', () => {
    it('persists a real relationship when sourceId/targetId are present', async () => {
      addRelationship.mockReturnValue(makeRelationship({ id: 'new-edge' }));
      const id = await nodeWebAdapter.addEdge({ type: 'owns', sourceId: 'a', targetId: 'b' });
      expect(id).toBe('new-edge');
      expect(addRelationship).toHaveBeenCalledWith(expect.objectContaining({ type: 'owns', sourceId: 'a', targetId: 'b' }));
    });

    it("carries the edge's stated author through, rather than leaving the workspace to ensure an identity", async () => {
      addRelationship.mockReturnValue(makeRelationship({ id: 'seeded-edge' }));
      await nodeWebAdapter.addEdge({ type: 'owns', sourceId: 'a', targetId: 'b', createdBy: 'intel-analyst' });
      expect(addRelationship).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'intel-analyst' }));
    });

    it('refuses to create a dangling edge with no real endpoints', async () => {
      const id = await nodeWebAdapter.addEdge({ type: 'owns' });
      expect(id).toBeNull();
      expect(addRelationship).not.toHaveBeenCalled();
    });
  });

  describe('deleteNode', () => {
    it('removes relationships referencing the deleted node', async () => {
      getRelationshipsForEntity.mockReturnValue([makeRelationship({ id: 'rel-1' }), makeRelationship({ id: 'rel-2' })]);
      const result = await nodeWebAdapter.deleteNode('item-1');
      expect(result).toBe(true);
      expect(removeRelationship).toHaveBeenCalledWith('rel-1');
      expect(removeRelationship).toHaveBeenCalledWith('rel-2');
    });
  });
});
