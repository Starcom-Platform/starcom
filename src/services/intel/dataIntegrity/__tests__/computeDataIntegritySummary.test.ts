import { describe, it, expect } from 'vitest';
import { computeDataIntegritySummary } from '../computeDataIntegritySummary';

describe('computeDataIntegritySummary', () => {
  it('returns all-zero, ratio 0 (not NaN) for an empty observation set', () => {
    const result = computeDataIntegritySummary([]);
    expect(result).toEqual({ totalObservations: 0, realCount: 0, mockCount: 0, realRatio: 0 });
  });

  it('counts real vs mock correctly and computes the ratio from real observations', () => {
    const result = computeDataIntegritySummary([
      { isMock: false }, { isMock: false }, { isMock: false },
      { isMock: true }
    ]);
    expect(result.totalObservations).toBe(4);
    expect(result.realCount).toBe(3);
    expect(result.mockCount).toBe(1);
    expect(result.realRatio).toBe(0.75);
  });

  it('an instance running entirely on fallback data reports realRatio: 0, not a misleadingly reassuring number', () => {
    const result = computeDataIntegritySummary([{ isMock: true }, { isMock: true }]);
    expect(result.realRatio).toBe(0);
  });

  it('an instance with only real data reports realRatio: 1', () => {
    const result = computeDataIntegritySummary([{ isMock: false }, { isMock: false }]);
    expect(result.realRatio).toBe(1);
  });
});
