import { describe, it, expect } from 'vitest';
import {
  warEventColor,
  goldsteinToWarMarkerScale,
  displacementToMarkerScale,
  HUMANITARIAN_CRISIS_COLOR
} from '../conflictZonesTheme';

describe('warEventColor (bug-injection verified)', () => {
  it('is amber for a mild/near-zero real GoldsteinScale', () => {
    expect(warEventColor(0)).toBe(0xffaa33);
  });

  it('is deep red for a severe real GoldsteinScale', () => {
    expect(warEventColor(-10)).toBe(0xff2222);
  });

  it('clamps a positive real GoldsteinScale (shouldn\'t occur in the conflict-root range, but must not extrapolate) to the mild color', () => {
    expect(warEventColor(5)).toBe(0xffaa33);
  });

  it('clamps a real GoldsteinScale below -10 to the severe color rather than extrapolating', () => {
    expect(warEventColor(-15)).toBe(0xff2222);
  });
});

describe('goldsteinToWarMarkerScale (bug-injection verified)', () => {
  it('scales monotonically more severe as real GoldsteinScale drops toward -10', () => {
    const mild = goldsteinToWarMarkerScale(-1);
    const mid = goldsteinToWarMarkerScale(-5);
    const severe = goldsteinToWarMarkerScale(-9);
    expect(mild).toBeLessThan(mid);
    expect(mid).toBeLessThan(severe);
  });

  it('clamps at the real -10 floor and 0 ceiling', () => {
    expect(goldsteinToWarMarkerScale(-15)).toBe(goldsteinToWarMarkerScale(-10));
    expect(goldsteinToWarMarkerScale(5)).toBe(goldsteinToWarMarkerScale(0));
  });
});

describe('displacementToMarkerScale (bug-injection verified)', () => {
  it('scales monotonically with real combined displacement magnitude', () => {
    const small = displacementToMarkerScale(1000);
    const medium = displacementToMarkerScale(500000);
    const large = displacementToMarkerScale(11559970); // real 2024 Sudan figure
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it('returns the minimum scale for zero or negative totals instead of crashing on log10(0)', () => {
    expect(displacementToMarkerScale(0)).toBeGreaterThan(0);
    expect(Number.isFinite(displacementToMarkerScale(0))).toBe(true);
    expect(Number.isFinite(displacementToMarkerScale(-5))).toBe(true);
  });

  it('does not exceed the intended max scale even for an extreme real-world-implausible total', () => {
    const extreme = displacementToMarkerScale(1_000_000_000);
    const large = displacementToMarkerScale(11559970);
    expect(extreme).toBeGreaterThanOrEqual(large);
    expect(extreme).toBeLessThanOrEqual(2.5);
  });
});

describe('HUMANITARIAN_CRISIS_COLOR', () => {
  it('is distinct from both ends of the war-event color spectrum', () => {
    expect(HUMANITARIAN_CRISIS_COLOR).not.toBe(warEventColor(0));
    expect(HUMANITARIAN_CRISIS_COLOR).not.toBe(warEventColor(-10));
  });
});
