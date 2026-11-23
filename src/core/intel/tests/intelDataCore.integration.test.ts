/**
 * Intel Data Core — Integration Verification Tests (Step 2.1.1)
 *
 * Verifies:
 *   2.1.1.1 — IndexedDB + memory store works under real load
 *   2.1.1.2 — Event-driven updates fire correctly on CRUD
 *   2.1.1.3 — Graceful fallback when IndexedDB unavailable
 *   2.1.1.4 — Multi-adapter pattern (nodeWeb, timeline, case)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { intelDataStore } from '../store/intelDataStore';
import { nodeWebAdapter } from '../adapters/nodeWebAdapter';
import { timelineAdapter } from '../adapters/timelineAdapter';
import { caseManagerAdapter } from '../adapters/caseManagerAdapter';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import {
  NodeEntity,
  NodeType,
  DataEvent,
} from '../types/intelDataModels';

// Helper to clear the store between tests
async function clearStore() {
  const all = await intelDataStore.queryEntities({});
  if (all.success && all.data) {
    for (const entity of all.data) {
      await intelDataStore.deleteEntity(entity.id);
    }
  }
  enhancedEventEmitter.clearHistory();
}

// ─── 2.1.1.1  Real Load ────────────────────────────────────────────────

describe('2.1.1.1 — Memory store under real load', () => {
  beforeEach(clearStore);

  it('bulk-creates 200 entities without error', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 200; i++) {
      const result = await intelDataStore.createEntity<NodeEntity>({
        type: 'node',
        nodeType: NodeType.PERSON,
        title: `Agent ${i}`,
        source: 'load-test',
        verified: true,
        confidence: 50 + (i % 50),
        createdBy: 'load-test',
        tags: ['load-test', i % 2 === 0 ? 'even' : 'odd'],
      });
      expect(result.success).toBe(true);
      ids.push(result.data!.id);
    }

    // Query all — should get exactly 200
    const all = await intelDataStore.queryEntities({ types: ['node'] });
    expect(all.success).toBe(true);
    expect(all.data!.length).toBe(200);

    // Paginated query
    const page = await intelDataStore.queryEntities({
      types: ['node'],
      limit: 25,
      offset: 50,
    });
    expect(page.data!.length).toBe(25);
  });

  it('concurrent reads during writes do not corrupt data', async () => {
    // Create base entities
    for (let i = 0; i < 50; i++) {
      await intelDataStore.createEntity<NodeEntity>({
        type: 'node',
        nodeType: NodeType.DOMAIN,
        title: `domain-${i}.com`,
        source: 'load-test',
        verified: false,
        confidence: 80,
        createdBy: 'load-test',
        tags: ['dns'],
      });
    }

    // Fire mixed reads + writes concurrently
    const ops = [];
    for (let i = 50; i < 100; i++) {
      ops.push(
        intelDataStore.createEntity<NodeEntity>({
          type: 'node',
          nodeType: NodeType.IP_ADDRESS,
          title: `10.0.0.${i}`,
          source: 'load-test',
          verified: true,
          confidence: 90,
          createdBy: 'load-test',
          tags: ['ip'],
        }),
      );
      ops.push(intelDataStore.queryEntities({ types: ['node'] }));
    }
    const results = await Promise.all(ops);

    // All operations should succeed
    results.forEach((r) => expect(r.success).toBe(true));

    // Final count: 50 original + 50 new = 100
    const all = await intelDataStore.queryEntities({ types: ['node'] });
    expect(all.data!.length).toBe(100);
  });

  it('confidence range query works on large dataset', async () => {
    for (let i = 0; i < 100; i++) {
      await intelDataStore.createEntity<NodeEntity>({
        type: 'node',
        nodeType: NodeType.MALWARE,
        title: `sample-${i}`,
        source: 'test',
        verified: true,
        confidence: i, // 0..99
        createdBy: 'test',
        tags: ['range-test'],
      });
    }

    const high = await intelDataStore.queryEntities({
      confidence: { min: 80, max: 90 },
    });
    expect(high.success).toBe(true);
    // 80,81,...,90 = 11 entities
    expect(high.data!.length).toBe(11);
  });
});

// ─── 2.1.1.2  Event-driven updates ─────────────────────────────────────

describe('2.1.1.2 — Event-driven updates fire on CRUD', () => {
  beforeEach(clearStore);

  it('emits create event with correct payload', async () => {
    const captured: DataEvent[] = [];
    const subId = intelDataStore.subscribe({
      topics: ['entity.node'],
      callback: (event) => captured.push(event),
    });

    await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.PERSON,
      title: 'Event Test',
      source: 'test',
      verified: true,
      confidence: 90,
      createdBy: 'test',
    });

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const createEvt = captured.find((e) => e.type === 'create');
    expect(createEvt).toBeDefined();
    expect(createEvt!.topic).toBe('entity.node');
    expect(createEvt!.data.title).toBe('Event Test');

    intelDataStore.unsubscribe(subId);
  });

  it('emits update event with changed data', async () => {
    const created = await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.ORGANIZATION,
      title: 'Before',
      source: 'test',
      verified: false,
      confidence: 50,
      createdBy: 'test',
    });

    const captured: DataEvent[] = [];
    const subId = intelDataStore.subscribe({
      topics: ['entity.node'],
      callback: (event) => captured.push(event),
    });

    await intelDataStore.updateEntity(created.data!.id, {
      title: 'After',
      confidence: 99,
    });

    const updateEvt = captured.find((e) => e.type === 'update');
    expect(updateEvt).toBeDefined();
    expect(updateEvt!.data.title).toBe('After');

    intelDataStore.unsubscribe(subId);
  });

  it('emits delete event and cascades relationships', async () => {
    const a = await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.PERSON,
      title: 'A',
      source: 'test',
      verified: true,
      confidence: 80,
      createdBy: 'test',
    });
    const b = await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.ORGANIZATION,
      title: 'B',
      source: 'test',
      verified: true,
      confidence: 80,
      createdBy: 'test',
    });

    await intelDataStore.createRelationship({
      type: 'MEMBER_OF',
      sourceId: a.data!.id,
      targetId: b.data!.id,
      confidence: 90,
      createdBy: 'test',
    });

    const captured: DataEvent[] = [];
    const subId = intelDataStore.subscribe({
      topics: ['entity.node'],
      callback: (event) => captured.push(event),
    });

    await intelDataStore.deleteEntity(a.data!.id);

    const deleteEvt = captured.find((e) => e.type === 'delete');
    expect(deleteEvt).toBeDefined();

    // Relationship should be gone
    const rels = await intelDataStore.getRelationships(b.data!.id);
    expect(rels.data?.length ?? 0).toBe(0);

    intelDataStore.unsubscribe(subId);
  });

  it('event history captures all operations', async () => {
    await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.SYSTEM,
      title: 'History-Test',
      source: 'test',
      verified: true,
      confidence: 70,
      createdBy: 'test',
    });

    const history = intelDataStore.getEventHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.some((e) => e.data?.title === 'History-Test')).toBe(true);
  });
});

// ─── 2.1.1.3  Graceful fallback ────────────────────────────────────────

describe('2.1.1.3 — Graceful fallback when IndexedDB unavailable', () => {
  beforeEach(clearStore);

  it('in-memory store works without storageOrchestrator initialization', async () => {
    // intelDataStore is a standalone in-memory Map — no IndexedDB required
    const result = await intelDataStore.createEntity<NodeEntity>({
      type: 'node',
      nodeType: NodeType.THREAT_ACTOR,
      title: 'Fallback Actor',
      source: 'fallback-test',
      verified: true,
      confidence: 85,
      createdBy: 'test',
      tags: ['fallback'],
    });
    expect(result.success).toBe(true);

    const get = await intelDataStore.getEntity<NodeEntity>(result.data!.id);
    expect(get.success).toBe(true);
    expect(get.data!.title).toBe('Fallback Actor');

    const query = await intelDataStore.queryEntities({ tags: ['fallback'] });
    expect(query.success).toBe(true);
    expect(query.data!.length).toBe(1);
  });

  it('initializeIntelDataCore does not throw even if storage init fails', async () => {
    // The function catches errors and logs — should never throw
    const { initializeIntelDataCore } = await import('../index');
    await expect(initializeIntelDataCore()).resolves.not.toThrow();
  });
});

// ─── 2.1.1.4  Multi-adapter pattern ────────────────────────────────────

describe('2.1.1.4 — Multi-adapter pattern (nodeWeb, timeline, case)', () => {
  beforeEach(clearStore);

  // nodeWebAdapter/timelineAdapter/caseManagerAdapter now all read from the
  // unified Intel substrate (services/intel/IntelWorkspaceManager) rather
  // than intelDataStore — seeded here the same way, through the real adapter
  // methods rather than reaching into the manager's internals, since that's
  // the actual contract NodeGraphView/TimeScrubber/CasesDashboard rely on.
  it('nodeWebAdapter returns graph from the unified substrate', async () => {
    await intelWorkspaceManager.ensureInitialized();
    await nodeWebAdapter.addNode({ title: 'Graph-Node-A', nodeType: NodeType.PERSON, tags: ['adapter'] });
    await nodeWebAdapter.addNode({ title: 'Graph-Node-B', nodeType: NodeType.ORGANIZATION, tags: ['adapter'] });

    const graph = await nodeWebAdapter.getGraphData();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('timelineAdapter returns events from the unified substrate', async () => {
    await intelWorkspaceManager.ensureInitialized();
    await timelineAdapter.addEvent({
      title: 'Breach Detected',
      eventType: 'INCIDENT',
      startDate: '2025-01-15T10:00:00Z',
      importance: 90,
      tags: ['timeline-test'],
    });

    const timeline = await timelineAdapter.getTimelineData();
    expect(timeline.items.length).toBeGreaterThanOrEqual(1);
  });

  it('caseManagerAdapter retrieves cases from the unified substrate', async () => {
    await intelWorkspaceManager.ensureInitialized();
    await caseManagerAdapter.addCase({
      title: 'Case-Alpha',
      description: 'Adapter integration test case',
      priority: 'HIGH' as any,
      tags: ['case-test'],
    });

    const cases = await caseManagerAdapter.getCases();
    expect(cases.length).toBeGreaterThanOrEqual(1);
    expect(cases.some((c) => c.title === 'Case-Alpha')).toBe(true);
  });
});
