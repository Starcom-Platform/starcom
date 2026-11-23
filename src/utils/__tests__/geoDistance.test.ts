import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, estimateUtcOffsetHours } from '../geoDistance';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it('returns ~343km between London and Paris (known reference distance)', () => {
    const km = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(km).toBeGreaterThan(340);
    expect(km).toBeLessThan(346);
  });

  it('returns ~20015km (half Earth circumference) between antipodal points', () => {
    const km = haversineDistanceKm(0, 0, 0, 180);
    expect(km).toBeGreaterThan(20000);
    expect(km).toBeLessThan(20040);
  });
});

describe('estimateUtcOffsetHours', () => {
  it('is 0 at the prime meridian', () => {
    expect(estimateUtcOffsetHours(0)).toBe(0);
  });

  it('rounds to +5 at longitude 75 (5 * 15)', () => {
    expect(estimateUtcOffsetHours(75)).toBe(5);
  });

  it('rounds to -8 at longitude -122 (US Pacific coast)', () => {
    expect(estimateUtcOffsetHours(-122)).toBe(-8);
  });
});
