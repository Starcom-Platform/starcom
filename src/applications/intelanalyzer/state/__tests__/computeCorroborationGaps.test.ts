/**
 * computeCorroborationGaps — the analysis -> collection loop-back.
 *
 * The corroboration pass computes independence for every claim, keeps what
 * clears two feeds, and discards the rest mid-pass. That discarded set is
 * exactly the list of claims one more source would upgrade, which is the
 * question that actually sends an analyst back out to collect. These tests
 * pin the boundary conditions where "needs a second source" would otherwise
 * quietly misdescribe something that is really a conflict, an outlier, or
 * already corroborated.
 */
import { describe, it, expect } from 'vitest';
import { computeCorroborationGaps, computeCorroboratedFindings } from '../correlationUtils';
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

const claim = (attribute: string, value: string) => ({ claim: { attribute, value } });

describe('computeCorroborationGaps', () => {
  it('reports a claim carried by exactly one feed', () => {
    const gaps = computeCorroborationGaps([
      makeEvent({
        sourceId: 'registry-a', entityRefs: ['Acme Corp'],
        ...claim('jurisdiction', 'Berlin'),
      }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      entityRef: 'Acme Corp',
      attribute: 'jurisdiction',
      value: 'Berlin',
      sourceId: 'registry-a',
    });
  });

  it('reports NOTHING once a second independent feed agrees — that is corroboration, not a gap', () => {
    const events = [
      makeEvent({ sourceId: 'registry-a', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin') }),
      makeEvent({ sourceId: 'registry-b', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin') }),
    ];

    expect(computeCorroborationGaps(events)).toHaveLength(0);
    // And the corroboration pass claims it, so the two never both speak.
    expect(computeCorroboratedFindings(events).length).toBeGreaterThan(0);
  });

  it('stays silent when two lone sources disagree — that is a contest, not a missing source', () => {
    // Reporting each side as "needs corroboration" would hide that they
    // contradict each other, which is a different problem with a different fix.
    const gaps = computeCorroborationGaps([
      makeEvent({ sourceId: 'registry-a', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin') }),
      makeEvent({ sourceId: 'registry-b', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Munich') }),
    ]);

    expect(gaps).toHaveLength(0);
  });

  it('does not count a republisher as a second feed', () => {
    // Same independence rule as corroboration: a feed that derives from
    // another collapses into its upstream, so this is still one source.
    const gaps = computeCorroborationGaps([
      makeEvent({ sourceId: 'registry-a', feedId: 'registry-a', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin') }),
      makeEvent({
        sourceId: 'aggregator', feedId: 'aggregator', derivesFrom: ['registry-a'],
        entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin'),
      }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].attribute).toBe('jurisdiction');
  });

  it('reports each thin attribute of the same entity separately', () => {
    const gaps = computeCorroborationGaps([
      makeEvent({ sourceId: 'registry-a', entityRefs: ['Acme Corp'], ...claim('jurisdiction', 'Berlin') }),
      makeEvent({ sourceId: 'registry-a', entityRefs: ['Acme Corp'], ...claim('industry', 'logistics') }),
    ]);

    expect(gaps.map(g => g.attribute).sort()).toEqual(['industry', 'jurisdiction']);
  });

  it('carries the mock flag, so a gap over fabricated data is distinguishable', () => {
    const [gap] = computeCorroborationGaps([
      makeEvent({ sourceId: 'registry-a', entityRefs: ['Acme Corp'], isMock: true, ...claim('jurisdiction', 'Berlin') }),
    ]);

    expect(gap.isMock).toBe(true);
  });

  it('returns most-recently-observed first, so the freshest thin claim leads', () => {
    const gaps = computeCorroborationGaps([
      makeEvent({ sourceId: 'a', entityRefs: ['Old Corp'], timestamp: '2026-01-01T00:00:00.000Z', ...claim('jurisdiction', 'Berlin') }),
      makeEvent({ sourceId: 'b', entityRefs: ['New Corp'], timestamp: '2026-06-01T00:00:00.000Z', ...claim('jurisdiction', 'Paris') }),
    ]);

    expect(gaps.map(g => g.entityRef)).toEqual(['New Corp', 'Old Corp']);
  });

  it('skips an entity with an unresolved location conflict', () => {
    // A contested subject is a different problem, already surfaced as a
    // conflict; calling it a collection gap would misdescribe it.
    const gaps = computeCorroborationGaps([
      makeEvent({ sourceId: 'a', entityRefs: ['John Smith'], lat: 40.7128, lon: -74.0060, timestamp: '2026-06-01T08:00:00.000Z' }),
      makeEvent({ sourceId: 'b', entityRefs: ['John Smith'], lat: 34.0522, lon: -118.2437, timestamp: '2026-06-01T14:00:00.000Z' }),
      makeEvent({ sourceId: 'c', entityRefs: ['John Smith'], ...claim('jurisdiction', 'Berlin') }),
    ]);

    expect(gaps).toHaveLength(0);
  });

  it('returns nothing for events that assert no claim at all', () => {
    expect(computeCorroborationGaps([
      makeEvent({ sourceId: 'a', entityRefs: ['Acme Corp'] }),
    ])).toHaveLength(0);
  });
});
