// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { EcoHistoryStore } from '../EcoHistoryStore';
import type { NaturalEvent } from '../../GeoEventsService';

const makeEvent = (id: string): NaturalEvent => ({
  id,
  lat: 10,
  lng: 20,
  type: 'earthquake',
  magnitude: 5.5,
  timestamp: new Date().toISOString(),
  source: 'USGS'
});

describe('EcoHistoryStore', () => {
  let store: EcoHistoryStore;

  beforeEach(async () => {
    store = new EcoHistoryStore();
    await store.clear();
  });

  it('appends a real snapshot and retrieves it by time range', async () => {
    const before = Date.now();
    await store.appendSnapshot([makeEvent('eq-1'), makeEvent('eq-2')]);

    const snapshots = await store.getSnapshotsSince(before);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].eventCount).toBe(2);
    expect(snapshots[0].data).toHaveLength(2);
    expect(snapshots[0].data[0].id).toBe('eq-1');
    expect(snapshots[0].timestamp).toBeGreaterThanOrEqual(before);
  });

  it('excludes snapshots strictly before the requested time', async () => {
    await store.appendSnapshot([makeEvent('old')]);
    const cutoff = Date.now() + 1000; // strictly after the snapshot just written

    const snapshots = await store.getSnapshotsSince(cutoff);
    expect(snapshots).toHaveLength(0);
  });

  it('prunes snapshots older than a cutoff without touching newer ones', async () => {
    await store.appendSnapshot([makeEvent('a')]);
    const cutoff = Date.now() + 10;
    await new Promise((r) => setTimeout(r, 20));
    await store.appendSnapshot([makeEvent('b')]);

    await store.pruneOlderThan(cutoff);

    const remaining = await store.getSnapshotsSince(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].data[0].id).toBe('b');
  });

  it('clear() removes every snapshot', async () => {
    await store.appendSnapshot([makeEvent('x')]);
    await store.clear();

    const remaining = await store.getSnapshotsSince(0);
    expect(remaining).toHaveLength(0);
  });

  it('evicts the oldest snapshots (FIFO) once a real cap is exceeded', async () => {
    // maxSnapshots is constructor-configurable specifically so this can exercise real
    // eviction with a handful of rows instead of needing thousands of real writes.
    const smallStore = new EcoHistoryStore(3);
    await smallStore.clear();

    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await smallStore.appendSnapshot([makeEvent(id)]);
      await new Promise((r) => setTimeout(r, 2)); // distinct timestamps (keyPath)
    }

    const remaining = await smallStore.getSnapshotsSince(0);
    expect(remaining).toHaveLength(3);
    // Oldest two ('a', 'b') evicted; newest three survive, in insertion order.
    expect(remaining.map((s) => s.data[0].id)).toEqual(['c', 'd', 'e']);
  });
});
