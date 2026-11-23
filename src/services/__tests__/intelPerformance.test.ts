// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntelDataStore,
  INTEL_PERFORMANCE_BUDGETS,
  INTEL_STORE_LIMITS,
} from '../../core/intel/store/intelDataStore';

// ---------------------------------------------------------------------------
// Helper: generate a test entity
// ---------------------------------------------------------------------------
function makeEntity(index: number) {
  return {
    id: `ent-${index}`,
    type: 'intel-report',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { idx: index },
    tags: ['test', `batch-${Math.floor(index / 100)}`],
  };
}

describe('IntelDataStore — Performance & Capacity', () => {
  let store: IntelDataStore;

  beforeEach(() => {
    store = new IntelDataStore();
  });

  // ---------- Budget constants exported ------------------------------------

  it('exports performance budget constants', () => {
    expect(INTEL_PERFORMANCE_BUDGETS.CREATE_REPORT_MS).toBe(50);
    expect(INTEL_PERFORMANCE_BUDGETS.RENDER_1000_MARKERS_MS).toBe(16);
  });

  it('exports store limit constants', () => {
    expect(INTEL_STORE_LIMITS.MAX_ENTITIES).toBe(5_000);
    expect(INTEL_STORE_LIMITS.EVICTION_BATCH).toBe(100);
  });

  // ---------- Single-report creation within budget -------------------------

  it('creates a report in under 50ms', async () => {
    const start = performance.now();
    await store.createEntity(makeEntity(1));
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(INTEL_PERFORMANCE_BUDGETS.CREATE_REPORT_MS);
  });

  // ---------- 1000-report load test ----------------------------------------

  it('creates 1000 reports within reasonable time', async () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      await store.createEntity(makeEntity(i));
    }
    const elapsed = performance.now() - start;

    expect(store.entityCount).toBe(1000);
    // 1000 × 50ms budget would be 50s; real in-memory should be well under 2s
    expect(elapsed).toBeLessThan(2000);
  });

  // ---------- Capacity: eviction triggers at MAX_ENTITIES ------------------

  it('evicts oldest entities when exceeding MAX_ENTITIES', async () => {
    // Fill to capacity + 1
    const cap = INTEL_STORE_LIMITS.MAX_ENTITIES;
    for (let i = 0; i < cap + 1; i++) {
      await store.createEntity(makeEntity(i));
    }

    // Should have evicted EVICTION_BATCH entries
    expect(store.entityCount).toBe(cap + 1 - INTEL_STORE_LIMITS.EVICTION_BATCH);
  });

  // ---------- LRU: recently-accessed entities survive eviction --------------

  it('keeps recently-accessed entities during eviction', async () => {
    const cap = INTEL_STORE_LIMITS.MAX_ENTITIES;
    for (let i = 0; i < cap; i++) {
      await store.createEntity(makeEntity(i));
    }

    // Access entity-0 (oldest created) to mark it recently used
    await store.getEntity('ent-0');

    // Trigger eviction by adding one more
    await store.createEntity(makeEntity(cap));

    // ent-0 should survive because we just accessed it
    const result = await store.getEntity('ent-0');
    expect(result.success).toBe(true);
  });

  // ---------- entityCount / relationshipCount accessors --------------------

  it('tracks entity and relationship counts', async () => {
    expect(store.entityCount).toBe(0);
    expect(store.relationshipCount).toBe(0);

    await store.createEntity(makeEntity(1));
    expect(store.entityCount).toBe(1);
  });

  // ---------- Delete cleans up access tracker ------------------------------

  it('delete removes entity from access tracker', async () => {
    await store.createEntity(makeEntity(42));
    expect(store.entityCount).toBe(1);

    await store.deleteEntity('ent-42');
    expect(store.entityCount).toBe(0);

    // Can create new entity with same id — no stale access entry
    await store.createEntity(makeEntity(42));
    expect(store.entityCount).toBe(1);
  });

  // ---------- Query 1000 entities ------------------------------------------

  it('queries 1000 entities by type within budget', async () => {
    for (let i = 0; i < 1000; i++) {
      await store.createEntity(makeEntity(i));
    }

    const start = performance.now();
    const result = await store.queryEntities({ types: ['intel-report'] });
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(result.data!.length).toBe(1000);
    // Query should complete in under 100ms for in-memory
    expect(elapsed).toBeLessThan(100);
  });
});
