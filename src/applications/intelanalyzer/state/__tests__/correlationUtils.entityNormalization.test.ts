/**
 * computeCooccurrence — Phase 1 (roadmap: "entity resolution, option A").
 * Same fix as IntelWebIntegrationService's entity registry, applied here
 * too: pairing previously keyed on the raw entityRefs string, so "John
 * Smith" and "john smith." would never co-occur with themselves across
 * two events even though they're the same entity.
 *
 * Note: eventsAdapter.ts currently hardcodes entityRefs: [] for every
 * real report/item (no entity-extraction feature exists yet), so this
 * function receives no real entity data in production today — this test
 * exercises the pure function directly with synthetic events, the same
 * way it'll actually be fed once extraction exists.
 */
import { describe, it, expect } from 'vitest';
import { computeCooccurrence } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    title: 'Event',
    timestamp: new Date().toISOString(),
    category: 'general',
    tags: [],
    sourceType: 'REPORT',
    sourceId: 'report-1',
    entityRefs: [],
    ...overrides
  };
}

describe('computeCooccurrence — entity name normalization', () => {
  it('treats "John Smith" and "john smith." as the same entity when pairing', () => {
    const events = [
      makeEvent({ entityRefs: ['John Smith', 'Acme Corp'] }),
      makeEvent({ entityRefs: ['john smith.', 'Acme Corp'] })
    ];

    const pairs = computeCooccurrence(events);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].count).toBe(2);
  });

  it('does not merge genuinely different entities', () => {
    const events = [
      makeEvent({ entityRefs: ['John Smith', 'Acme Corp'] }),
      makeEvent({ entityRefs: ['Jane Doe', 'Acme Corp'] })
    ];

    const pairs = computeCooccurrence(events);

    // Two distinct pairs: (John Smith, Acme Corp) and (Jane Doe, Acme Corp),
    // each only seen once — below the count >= 2 threshold, so neither
    // survives into the output. This asserts they were NOT incorrectly
    // merged into one pair with count 2.
    expect(pairs).toHaveLength(0);
  });

  it('the displayed pair uses a real spelling, not the all-lowercase normalized key', () => {
    const events = [
      makeEvent({ entityRefs: ['John Smith', 'Acme Corp'] }),
      makeEvent({ entityRefs: ['JOHN SMITH', 'ACME CORP'] })
    ];

    const pairs = computeCooccurrence(events);

    expect(pairs).toHaveLength(1);
    expect([pairs[0].a, pairs[0].b]).not.toContain('john smith');
    expect([pairs[0].a, pairs[0].b]).not.toContain('acme corp');
  });
});
