import { describe, it, expect } from 'vitest';
import { intelRelationshipService } from '../IntelRelationshipService';
import type { CreateIntelRelationshipInput } from '../../../types/intel/IntelRelationship';

describe('IntelRelationshipService', () => {
  it('createRelationship persists and is retrievable via getRelationshipsForEntity', async () => {
    const input: CreateIntelRelationshipInput = {
      type: 'owns',
      sourceId: 'entity-service-a',
      targetId: 'entity-service-b',
      confidence: 80
    };

    const created = await intelRelationshipService.createRelationship(input);
    expect(created.id).toBeTruthy();
    expect(created.confidence).toBe(80);

    const forA = await intelRelationshipService.getRelationshipsForEntity('entity-service-a');
    expect(forA.some(r => r.id === created.id)).toBe(true);

    const all = await intelRelationshipService.listRelationships();
    expect(all.some(r => r.id === created.id)).toBe(true);
  });

  it('updateRelationship and deleteRelationship round-trip through the service', async () => {
    const created = await intelRelationshipService.createRelationship({
      type: 'located_at',
      sourceId: 'entity-service-c',
      targetId: 'entity-service-d'
    });

    await intelRelationshipService.updateRelationship({ ...created, confidence: 15 });
    const updated = (await intelRelationshipService.listRelationships()).find(r => r.id === created.id);
    expect(updated?.confidence).toBe(15);

    await intelRelationshipService.deleteRelationship(created.id);
    const afterDelete = (await intelRelationshipService.listRelationships()).find(r => r.id === created.id);
    expect(afterDelete).toBeUndefined();
  });
});
