import { describe, it, expect } from 'vitest';
import { netrunnerAdapter, NetRunnerAdapter, NETRUNNER_SOURCE } from '../adapters/netrunnerAdapter';
import { runAdapterContract } from '../adapters/adapterContract';
import { clampObservedTrust } from '../createObservation';
import { deriveObservationWeight } from '../deriveWeight';
import type { Intel } from '../../../../models/Intel/Intel';

const NOW = new Date('2026-08-20T00:00:00Z');

const intel = [
  {
    id: 'intel-1',
    source: 'OSINT',
    reliability: 'C',
    timestamp: Date.parse('2026-08-18T00:00:00Z'),
    collectedBy: 'bot-alpha',
    latitude: 51.5,
    longitude: -0.12,
    location: 'London',
    data: {},
    tags: ['domain'],
    qualityAssessment: {},
  },
] as unknown as Intel[];

describe('NetRunnerAdapter', () => {
  runAdapterContract(netrunnerAdapter, intel);

  it('maps a collection record into a located observation', () => {
    const [obs] = netrunnerAdapter.toObservations(intel).observations;
    expect(obs.id).toBe('netrunner-osint:intel-1');
    expect(obs.method).toBe('collected');
    expect(obs.geo).toEqual({ lat: 51.5, lon: -0.12 });
    expect(obs.claim.attribute).toBe('osint_osint');
  });
});

describe('a collector cannot grade itself upward', () => {
  it('clamps a self-reported grade better than the source baseline back to the baseline', () => {
    // NetRunner's baseline is C. A bot claiming its own output is grade A is
    // making exactly the assertion derived weight exists to refuse.
    expect(clampObservedTrust('C', 'A')).toBe('C');
    expect(clampObservedTrust('C', 'B')).toBe('C');
  });

  it('keeps a self-reported grade that is worse than the baseline', () => {
    // Downward is real information — a collector has no incentive to invent
    // that its own output is degraded.
    expect(clampObservedTrust('C', 'E')).toBe('E');
  });

  it("maps NetRunner's off-scale 'X' (deception suspected) to the worst grade, not to nothing", () => {
    expect(clampObservedTrust('C', 'X' as never)).toBe('F');
  });

  it('produces no weight advantage from an inflated self-report', () => {
    const inflated = netrunnerAdapter.toObservations([{ ...intel[0], reliability: 'A' }] as unknown as Intel[]).observations[0];
    const honest = netrunnerAdapter.toObservations(intel).observations[0];

    expect(deriveObservationWeight(inflated, inflated.observedTrust ?? 'F', { now: NOW }))
      .toBe(deriveObservationWeight(honest, honest.observedTrust ?? 'F', { now: NOW }));
  });

  it('does lower the weight when the collector reports its own output as degraded', () => {
    const degraded = netrunnerAdapter.toObservations([{ ...intel[0], reliability: 'E' }] as unknown as Intel[]).observations[0];
    const normal = netrunnerAdapter.toObservations(intel).observations[0];

    expect(deriveObservationWeight(degraded, degraded.observedTrust ?? 'F', { now: NOW }))
      .toBeLessThan(deriveObservationWeight(normal, normal.observedTrust ?? 'F', { now: NOW }));
  });
});

describe('NetRunner as the sixth source', () => {
  it('carries its own grade and method, distinct from the open-data feeds', () => {
    expect(NETRUNNER_SOURCE.trustBaseline).toBe('C');
    expect(NETRUNNER_SOURCE.kind).toBe('osint-bot');
  });

  it('drops a record with no attributable subject rather than inventing one', () => {
    const { observations, dropped } = new NetRunnerAdapter().toObservations([
      { id: 'x', source: 'OSINT', timestamp: Date.now(), data: {}, tags: [] },
    ] as unknown as Intel[]);

    expect(observations).toHaveLength(0);
    expect(dropped[0].reason).toContain('attribute');
  });
});
