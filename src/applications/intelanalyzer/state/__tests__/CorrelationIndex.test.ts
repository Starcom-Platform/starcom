import { describe, it, expect } from 'vitest';
import { CorrelationIndex } from '../CorrelationIndex';
import { computeLocationConflicts, computeCorroboratedFindings } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

const BASE = Date.parse('2026-08-01T00:00:00Z');

function ev(overrides: Partial<Event> & { id: string }): Event {
  return {
    title: 'e', timestamp: new Date(BASE).toISOString(), category: 'GENERAL', tags: [],
    lat: 0, lon: 0, confidence: 0.8, sourceType: 'OBSERVATION', sourceId: overrides.id,
    entityRefs: ['Acme Corp'], ...overrides,
  } as Event;
}

/** Two sources agreeing on a place, within window and distance. */
const corroborating: Event[] = [
  ev({ id: 'a1', sourceId: 'src-a', lat: 10, lon: 10, timestamp: new Date(BASE).toISOString() }),
  ev({ id: 'b1', sourceId: 'src-b', lat: 10.1, lon: 10.1, timestamp: new Date(BASE + 3_600_000).toISOString() }),
];

/** Two sources placing the same entity far apart, within window. */
const conflicting: Event[] = [
  ev({ id: 'c1', sourceId: 'src-c', lat: 10, lon: 10, entityRefs: ['Beta Ltd'], timestamp: new Date(BASE).toISOString() }),
  ev({ id: 'd1', sourceId: 'src-d', lat: 40, lon: 40, entityRefs: ['Beta Ltd'], timestamp: new Date(BASE + 3_600_000).toISOString() }),
];

describe('CorrelationIndex — agrees with the batch functions', () => {
  it('produces the same conflicts as a full recompute', () => {
    const all = [...corroborating, ...conflicting];
    const index = new CorrelationIndex();
    index.add(all);

    expect(index.conflicts()).toEqual(computeLocationConflicts(all));
  });

  it('produces the same findings as a full recompute', () => {
    const all = [...corroborating, ...conflicting];
    const index = new CorrelationIndex();
    index.add(all);

    expect(index.findings()).toEqual(computeCorroboratedFindings(all));
  });

  it('agrees whether events arrive in one batch or several', () => {
    const all = [...corroborating, ...conflicting];

    const oneShot = new CorrelationIndex();
    oneShot.add(all);

    const incremental = new CorrelationIndex();
    for (const e of all) incremental.add([e]);

    expect(incremental.findings()).toEqual(oneShot.findings());
    expect(incremental.conflicts()).toEqual(oneShot.conflicts());
  });

  it('keeps corroboration and contradiction mutually exclusive', () => {
    const index = new CorrelationIndex();
    index.add(conflicting);

    expect(index.conflicts().length).toBeGreaterThan(0);
    // Beta Ltd has an unresolved conflict, so it must not also publish as agreed.
    expect(index.findings().find(f => f.entityRef === 'Beta Ltd')).toBeUndefined();
  });
});

describe('incremental recomputation', () => {
  it('marks only the entities an update touches as dirty', () => {
    const index = new CorrelationIndex();
    index.add([...corroborating, ...conflicting]);
    index.findings(); // compute everything
    expect(index.stats().dirtyEntities).toBe(0);

    index.add([ev({ id: 'a2', sourceId: 'src-e', lat: 10.05, lon: 10.05, entityRefs: ['Acme Corp'] })]);

    // Acme Corp only. Beta Ltd's answer cannot have changed.
    expect(index.stats().dirtyEntities).toBe(1);
  });

  it('ignores a re-delivered event, since polled sources repeat themselves', () => {
    const index = new CorrelationIndex();
    index.add(corroborating);
    const before = index.findings();

    index.add(corroborating); // same poll again

    expect(index.stats().events).toBe(2);
    // Repetition must never look like additional corroboration.
    expect(index.findings()).toEqual(before);
    expect(index.findings()[0]?.sourceCount).toBe(2);
  });

  it('costs far less to add one event than to rebuild from scratch', () => {
    const many: Event[] = [];
    for (let i = 0; i < 4000; i++) {
      many.push(ev({
        id: `e${i}`, sourceId: `s${i % 40}`,
        lat: (i % 90), lon: (i % 180),
        entityRefs: [`Entity ${i % 25}`],
        timestamp: new Date(BASE + (i % 300) * 3_600_000).toISOString(),
      }));
    }

    const index = new CorrelationIndex();
    index.add(many);
    index.findings();

    const t0 = performance.now();
    index.add([ev({ id: 'new-1', sourceId: 'src-new', entityRefs: ['Entity 3'], lat: 5, lon: 5 })]);
    index.findings();
    const incremental = performance.now() - t0;

    const t1 = performance.now();
    computeCorroboratedFindings(many);
    const full = performance.now() - t1;

    // The whole point: cost is proportional to what changed, not to corpus size.
    expect(incremental).toBeLessThan(full);
  }, 300_000);
});

describe('bounded working set', () => {
  it('evicts oldest events first once the cap is exceeded', () => {
    const index = new CorrelationIndex(10);
    for (let i = 0; i < 15; i++) {
      index.add([ev({ id: `x${i}`, sourceId: `s${i}`, timestamp: new Date(BASE + i * 60_000).toISOString() })]);
    }

    const stats = index.stats();
    expect(stats.events).toBeLessThanOrEqual(10);
    expect(stats.evicted).toBeGreaterThan(0);
  });

  it('keeps the recent picture, which is the window corroboration actually uses', () => {
    const index = new CorrelationIndex(5);
    for (let i = 0; i < 10; i++) {
      index.add([ev({ id: `x${i}`, sourceId: `s${i}`, timestamp: new Date(BASE + i * 60_000).toISOString() })]);
    }
    // Survivors must be the newest, not an arbitrary subset.
    expect(index.stats().events).toBe(5);
  });

  it('drops an entity entirely when all of its events age out', () => {
    const index = new CorrelationIndex(3);
    index.add([ev({ id: 'old1', sourceId: 's1', entityRefs: ['Gone Corp'], timestamp: new Date(BASE).toISOString() })]);
    for (let i = 0; i < 5; i++) {
      index.add([ev({ id: `new${i}`, sourceId: `s${i}`, entityRefs: ['Present Corp'], timestamp: new Date(BASE + (i + 10) * 60_000).toISOString() })]);
    }

    expect(index.stats().entities).toBe(1);
  });

  it('reset replaces the working set rather than merging into it', () => {
    const index = new CorrelationIndex();
    index.add(corroborating);
    index.reset(conflicting);

    expect(index.stats().events).toBe(2);
    expect(index.findings().find(f => f.entityRef === 'Acme Corp')).toBeUndefined();
  });
});
