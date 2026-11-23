// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { MitreAttackCacheStore } from '../MitreAttackCacheStore';
import type { MitreReferenceData } from '../../../types/MitreAttack';

const makeData = (fetchedAt: number = Date.now()): MitreReferenceData => ({
  groups: [{ id: 'intrusion-set--1', mitreId: 'G0001', name: 'Test Group', aliases: [], description: '', techniqueIds: [] }],
  techniques: [],
  malware: [],
  fetchedAt
});

describe('MitreAttackCacheStore', () => {
  let store: MitreAttackCacheStore;

  beforeEach(async () => {
    store = new MitreAttackCacheStore();
    await store.clear();
  });

  it('returns null when nothing has been cached yet', async () => {
    expect(await store.get()).toBeNull();
  });

  it('persists and retrieves the real filtered reference data', async () => {
    const data = makeData();
    await store.set(data);

    const result = await store.get();
    expect(result).toEqual(data);
  });

  it('is a single-slot cache: a second set() replaces the first, not appends', async () => {
    await store.set(makeData(1000));
    await store.set(makeData(2000));

    const result = await store.get();
    expect(result?.fetchedAt).toBe(2000);
  });

  it('clear() removes the cached data', async () => {
    await store.set(makeData());
    await store.clear();

    expect(await store.get()).toBeNull();
  });
});
