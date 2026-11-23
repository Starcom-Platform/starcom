import { describe, it, expect } from 'vitest';
import { deriveObservationWeight, explainWeight, DEFAULT_HALF_LIFE_DAYS } from '../deriveWeight';

const NOW = new Date('2026-08-20T00:00:00Z');
const at = (iso: string) => ({ timestamp: iso, method: 'measured' as const });

describe('deriveObservationWeight — weight is derived, never declared', () => {
  it('is deterministic for the same observation, source, and instant', () => {
    const obs = at('2026-08-20T00:00:00Z');
    const a = deriveObservationWeight(obs, 'B', { now: NOW });
    const b = deriveObservationWeight(obs, 'B', { now: NOW });
    expect(a).toBe(b);
  });

  it('ranks a more trusted source above a less trusted one, all else equal', () => {
    const obs = at('2026-08-20T00:00:00Z');
    expect(deriveObservationWeight(obs, 'A', { now: NOW }))
      .toBeGreaterThan(deriveObservationWeight(obs, 'D', { now: NOW }));
  });

  it('ranks a direct method above an indirect one, all else equal', () => {
    const measured = { timestamp: NOW.toISOString(), method: 'measured' as const };
    const derived = { timestamp: NOW.toISOString(), method: 'derived' as const };
    expect(deriveObservationWeight(measured, 'B', { now: NOW }))
      .toBeGreaterThan(deriveObservationWeight(derived, 'B', { now: NOW }));
  });

  it('decays with age — an old observation is worth less than a fresh one', () => {
    const fresh = deriveObservationWeight(at('2026-08-20T00:00:00Z'), 'A', { now: NOW });
    const old = deriveObservationWeight(at('2024-08-20T00:00:00Z'), 'A', { now: NOW });
    expect(old).toBeLessThan(fresh);
  });

  it('halves at exactly one half-life', () => {
    const fresh = deriveObservationWeight(at(NOW.toISOString()), 'A', { now: NOW });
    const oneHalfLifeAgo = new Date(NOW.getTime() - DEFAULT_HALF_LIFE_DAYS * 86_400_000).toISOString();
    const aged = deriveObservationWeight(at(oneHalfLifeAgo), 'A', { now: NOW });
    expect(aged).toBeCloseTo(fresh / 2, 3);
  });

  it('does not reward a future-dated observation', () => {
    // Clock skew and bad timezones are common in open data. A future
    // timestamp must not produce a weight above a current one.
    const future = deriveObservationWeight(at('2027-08-20T00:00:00Z'), 'A', { now: NOW });
    const current = deriveObservationWeight(at(NOW.toISOString()), 'A', { now: NOW });
    expect(future).toBeLessThanOrEqual(current);
  });

  it('always lands in 0..1', () => {
    for (const trust of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      for (const iso of ['2026-08-20T00:00:00Z', '2010-01-01T00:00:00Z', '2027-01-01T00:00:00Z']) {
        const w = deriveObservationWeight(at(iso), trust, { now: NOW });
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it('decomposes into its inputs, so a weight can be checked rather than trusted', () => {
    const detail = explainWeight(at('2026-02-20T00:00:00Z'), 'B', { now: NOW });

    expect(detail.trust).toBe(0.8); // shared table, not a second invented one
    expect(detail.method).toBe(1.0);
    expect(detail.halfLifeDays).toBe(DEFAULT_HALF_LIFE_DAYS);
    expect(detail.basis).toBe('derived');
    expect(detail.algorithmVersion).toBe(1);
    expect(detail.ageDays).toBeGreaterThan(180);
    // The stated components must actually reconstruct the stated weight.
    expect(detail.trust * detail.method * detail.decay).toBeCloseTo(detail.weight, 3);
  });

  it('honours a caller-supplied half-life instead of forcing the default', () => {
    const obs = at('2026-06-20T00:00:00Z');
    const fast = deriveObservationWeight(obs, 'A', { now: NOW, halfLifeDays: 7 });
    const slow = deriveObservationWeight(obs, 'A', { now: NOW, halfLifeDays: 3650 });
    expect(fast).toBeLessThan(slow);
  });
});

describe('one reliability table, not two', () => {
  it('uses the same Admiralty weights as computeReportConfidence', async () => {
    const { RELIABILITY_WEIGHT } = await import('../../confidence/reliabilityWeight');
    const detail = explainWeight(
      { timestamp: NOW.toISOString(), method: 'measured' },
      'C',
      { now: NOW },
    );
    // A C-graded observation and a C-graded report must be commensurable —
    // they get compared to each other inside computeLocationConflicts.
    expect(detail.trust).toBe(RELIABILITY_WEIGHT.C);
  });

  it('treats an unknown grade as F rather than as trustworthy', async () => {
    const { reliabilityWeight, RELIABILITY_WEIGHT } = await import('../../confidence/reliabilityWeight');
    expect(reliabilityWeight(undefined)).toBe(RELIABILITY_WEIGHT.F);
  });
});
