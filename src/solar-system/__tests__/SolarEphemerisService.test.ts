import { computeSolarEphemeris } from '../SolarEphemerisService';

describe('SolarEphemerisService', () => {
  test('computes subsolar latitude near equinox around UTC noon', () => {
    const date = new Date('2025-03-20T12:00:00Z');
    const eph = computeSolarEphemeris(date);

    expect(Math.abs(eph.subsolarLatitudeDeg)).toBeLessThan(2.5);
    expect(Number.isFinite(eph.subsolarLongitudeDeg)).toBe(true);
    expect(eph.subsolarLongitudeDeg).toBeGreaterThanOrEqual(-180);
    expect(eph.subsolarLongitudeDeg).toBeLessThanOrEqual(180);
  });
});
