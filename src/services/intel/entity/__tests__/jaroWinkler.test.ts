import { describe, it, expect } from 'vitest';
import { jaroWinklerSimilarity } from '../jaroWinkler';

describe('jaroWinklerSimilarity', () => {
  it('identical strings score 1', () => {
    expect(jaroWinklerSimilarity('john smith', 'john smith')).toBe(1);
  });

  it('completely disjoint strings score low', () => {
    expect(jaroWinklerSimilarity('abc', 'xyz')).toBeLessThan(0.3);
  });

  it('either string empty scores 0', () => {
    expect(jaroWinklerSimilarity('', 'abc')).toBe(0);
    expect(jaroWinklerSimilarity('abc', '')).toBe(0);
  });

  it('matches the canonical MARTHA/MARHTA reference value (~0.961)', () => {
    // The single most commonly cited Jaro-Winkler worked example — a real
    // check against the published algorithm, not just internal consistency.
    expect(jaroWinklerSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.961, 2);
  });

  it('rewards a shared prefix more than the same edit distance elsewhere in the string', () => {
    // "John Smith" vs "Jon Smith" (prefix mostly shared, one char dropped
    // early) should score higher than "John Smith" vs "John Smitq" would
    // for an equivalent single-character difference at the end — Winkler's
    // whole point is prefix-weighting.
    const prefixShared = jaroWinklerSimilarity('johnson', 'johnsen');
    const noPrefixBonus = jaroWinklerSimilarity('nsonjoh', 'esonjoh'); // same edit, no shared prefix
    expect(prefixShared).toBeGreaterThan(noPrefixBonus);
  });

  it('is symmetric', () => {
    expect(jaroWinklerSimilarity('kitten', 'sitting')).toBeCloseTo(jaroWinklerSimilarity('sitting', 'kitten'), 10);
  });
});
