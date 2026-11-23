import 'fake-indexeddb/auto'; // jsdom has no IndexedDB; scoped to this file only (see setupVitest.ts note)
import { describe, it, expect, beforeEach } from 'vitest';
import { storageOrchestrator } from '../storageOrchestrator';
import type { BaseEntity, Relationship } from '../../types/intelDataModels';

// Regression coverage for the relationship CRUD gap found while fixing netRunnerAdapter.ts:
// getRelationship/updateRelationship/deleteRelationship/queryRelationships didn't exist at
// any layer of the storage stack before this — only create + get-by-entity-id existed.
describe('storageOrchestrator — relationship CRUD', () => {
  let sourceId: string;
  let targetId: string;

  beforeEach(async () => {
    const source = await storageOrchestrator.storeEntity<BaseEntity>({
      id: `entity-src-${Date.now()}-${Math.random()}`,
      type: 'test_entity',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'test',
      metadata: {},
      tags: []
    });
    const target = await storageOrchestrator.storeEntity<BaseEntity>({
      id: `entity-tgt-${Date.now()}-${Math.random()}`,
      type: 'test_entity',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'test',
      metadata: {},
      tags: []
    });
    expect(source.success).toBe(true);
    expect(target.success).toBe(true);
    sourceId = source.data!.id;
    targetId = target.data!.id;
  });

  it('creates, gets, updates, queries, and deletes a relationship (full round-trip)', async () => {
    const createResult = await storageOrchestrator.createRelationship({
      type: 'test_relationship',
      sourceId,
      targetId,
      confidence: 70,
      tags: ['round-trip-test'],
      metadata: {}
    });
    expect(createResult.success).toBe(true);
    const relationshipId = createResult.data!.id;

    // getRelationship
    const getResult = await storageOrchestrator.getRelationship<Relationship>(relationshipId);
    expect(getResult.success).toBe(true);
    expect(getResult.data?.sourceId).toBe(sourceId);
    expect(getResult.data?.confidence).toBe(70);

    // updateRelationship
    const updateResult = await storageOrchestrator.updateRelationship<Relationship>(relationshipId, {
      confidence: 95
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.confidence).toBe(95);

    const getAfterUpdate = await storageOrchestrator.getRelationship<Relationship>(relationshipId);
    expect(getAfterUpdate.data?.confidence).toBe(95);

    // queryRelationships
    const queryResult = await storageOrchestrator.queryRelationships<Relationship>({
      types: ['test_relationship']
    });
    expect(queryResult.success).toBe(true);
    expect(queryResult.data?.some(r => r.id === relationshipId)).toBe(true);

    // deleteRelationship
    const deleteResult = await storageOrchestrator.deleteRelationship(relationshipId);
    expect(deleteResult.success).toBe(true);

    const getAfterDelete = await storageOrchestrator.getRelationship<Relationship>(relationshipId);
    expect(getAfterDelete.success).toBe(false);
  });

  it('getRelationship returns a failure result for a nonexistent id', async () => {
    const result = await storageOrchestrator.getRelationship('does-not-exist');
    expect(result.success).toBe(false);
  });

  it('updateRelationship returns a failure result for a nonexistent id', async () => {
    const result = await storageOrchestrator.updateRelationship('does-not-exist', { confidence: 50 });
    expect(result.success).toBe(false);
  });
});
