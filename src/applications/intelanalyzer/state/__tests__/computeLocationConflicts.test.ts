/**
 * computeLocationConflicts — Phase 2 (roadmap: "contradiction detection,
 * phase 1"). Structured-field conflicts only: the same entity placed in
 * two locations too far apart, too close in time, to plausibly be the
 * same person/thing.
 */
import { describe, it, expect } from 'vitest';
import { computeLocationConflicts } from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    title: 'Event',
    timestamp: '2026-06-01T12:00:00.000Z',
    category: 'general',
    tags: [],
    sourceType: 'REPORT',
    sourceId: `report-${Math.random().toString(36).slice(2)}`,
    entityRefs: [],
    ...overrides
  };
}

describe('computeLocationConflicts', () => {
  it('flags the same entity placed far apart within a short time window', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }), // NYC
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z' }) // LA, 6h later
    ];

    const conflicts = computeLocationConflicts(events);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entity).toBe('John Smith');
    expect(conflicts[0].distanceKm).toBeGreaterThan(3000);
  });

  it('does NOT flag the same entity in different places far apart in time — entities legitimately move', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-01-01T00:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T00:00:00.000Z' }) // 5 months later
    ];

    expect(computeLocationConflicts(events)).toHaveLength(0);
  });

  it('does NOT flag nearby locations within the same city as conflicting', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['Acme Corp'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['Acme Corp'], lat: 40.7580, lon: -73.9855, timestamp: '2026-06-01T09:00:00.000Z' }) // a few km away
    ];

    expect(computeLocationConflicts(events)).toHaveLength(0);
  });

  it('does not flag the same report/item referencing itself twice', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060 })
    ];

    expect(computeLocationConflicts(events)).toHaveLength(0);
  });

  it('is case/punctuation insensitive to entity naming (reuses normalizeEntityName)', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['john smith.'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z' })
    ];

    expect(computeLocationConflicts(events)).toHaveLength(1);
  });

  it('genuinely different entities in different places are never flagged', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['Jane Doe'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z' })
    ];

    expect(computeLocationConflicts(events)).toHaveLength(0);
  });

  it('skips events with no location entirely, rather than crashing', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'] }), // no lat/lon
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437 })
    ];

    expect(() => computeLocationConflicts(events)).not.toThrow();
    expect(computeLocationConflicts(events)).toHaveLength(0);
  });

  it('strength (phase 2) is the minimum confidence of the two sides, not their average', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z', confidence: 0.95 }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z', confidence: 0.2 })
    ];

    const conflicts = computeLocationConflicts(events);

    expect(conflicts[0].strength).toBe(0.2); // min, not (0.95+0.2)/2
  });

  it('a conflict between two well-corroborated sources sorts ahead of one where either side is weak', () => {
    const events = [
      // Strong-vs-strong conflict — entity "A"
      makeEvent({ sourceId: 'a1', entityRefs: ['Strong Entity'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z', confidence: 0.9 }),
      makeEvent({ sourceId: 'a2', entityRefs: ['Strong Entity'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T09:00:00.000Z', confidence: 0.85 }),
      // Strong-vs-weak conflict — entity "B" — larger raw distance, but weaker strength
      makeEvent({ sourceId: 'b1', entityRefs: ['Weak Entity'], lat: 51.5072, lon: -0.1276, timestamp: '2026-06-01T08:00:00.000Z', confidence: 0.9 }),
      makeEvent({ sourceId: 'b2', entityRefs: ['Weak Entity'], lat: -33.8688, lon: 151.2093, timestamp: '2026-06-01T09:00:00.000Z', confidence: 0.1 })
    ];

    const conflicts = computeLocationConflicts(events);

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].entity).toBe('Strong Entity'); // higher strength sorts first
    expect(conflicts[0].strength).toBeGreaterThan(conflicts[1].strength);
  });

  it('defaults strength to 0.5 when confidence is missing on either side, not 0 or 1', () => {
    const events = [
      makeEvent({ sourceId: 'report-a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z', confidence: undefined }),
      makeEvent({ sourceId: 'report-b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z', confidence: undefined })
    ];

    const conflicts = computeLocationConflicts(events);
    expect(conflicts[0].strength).toBe(0.5);
  });
});
