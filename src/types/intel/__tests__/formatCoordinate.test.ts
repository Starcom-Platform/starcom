/**
 * Coordinate display, at the precision the source actually claimed.
 *
 * `coordinateDecimalsFor` existed and was documented in exactly the terms that
 * matter — "it will often be a real address belonging to somebody uninvolved"
 * — and had ONE caller, a data path. No renderer consulted it. Every coordinate
 * on every surface was a hardcoded toFixed(2) or toFixed(4), so a 20km Navcom
 * cell centroid printed to about eleven metres.
 */
import { describe, it, expect } from 'vitest';
import {
  formatCoordinate,
  formatUncertainty,
  coordinateDecimalsFor,
  DEFAULT_GEO_PRECISION_M,
} from '../SourceObservation';

describe('formatCoordinate', () => {
  /**
   * The case the whole thing exists for. Navcom publishes kind-1911
   * observations as a geohash cell precisely so the observer's exact position
   * is not on the wire; 37.9754 is what toFixed(4) would have printed.
   */
  it('coarsens a 20km cell centroid to one decimal, not four', () => {
    expect(formatCoordinate(37.975431, 23.734152, 20_000)).toBe('38.0°, 23.7°');
  });

  it('prints a surveyed position at full precision', () => {
    expect(formatCoordinate(37.975431, 23.734152, 10)).toBe('37.9754°, 23.7342°');
  });

  it('steps with the documented uncertainty bands', () => {
    const lat = 12.3456789;
    expect(formatCoordinate(lat, lat, 100_000)).toBe('12°, 12°');
    expect(formatCoordinate(lat, lat, 20_000)).toBe('12.3°, 12.3°');
    expect(formatCoordinate(lat, lat, 1_000)).toBe('12.35°, 12.35°');
    expect(formatCoordinate(lat, lat, 100)).toBe('12.346°, 12.346°');
    expect(formatCoordinate(lat, lat, 10)).toBe('12.3457°, 12.3457°');
  });

  /**
   * "Omitted means the source did not say. It does NOT mean exact" —
   * SourceObservation's own words. An absent precision must land on the
   * conservative default, not on full resolution.
   */
  it('treats an unstated precision as the coarse default, not as exact', () => {
    const unstated = formatCoordinate(12.3456789, 12.3456789);
    expect(unstated).toBe(formatCoordinate(12.3456789, 12.3456789, DEFAULT_GEO_PRECISION_M));
    expect(coordinateDecimalsFor(undefined)).toBe(2);
    // Explicitly: NOT the four decimals every renderer used to print.
    expect(unstated).not.toBe('12.3457°, 12.3457°');
  });

  it('reports absence rather than printing a zero', () => {
    expect(formatCoordinate(undefined, 1)).toBe('—');
    expect(formatCoordinate(1, undefined)).toBe('—');
    expect(formatCoordinate(null, null)).toBe('—');
    expect(formatCoordinate(NaN, 1)).toBe('—');
    expect(formatCoordinate(1, Infinity)).toBe('—');
    expect(formatCoordinate(undefined, undefined, undefined, { absent: 'no position' })).toBe('no position');
  });

  it('keeps a real zero, which is a coordinate', () => {
    expect(formatCoordinate(0, 0, 10)).toBe('0.0000°, 0.0000°');
  });

  describe('uncertainty suffix', () => {
    it('appends the stated uncertainty when asked', () => {
      expect(formatCoordinate(38, 23.7, 20_000, { showUncertainty: true })).toBe('38.0°, 23.7° ±20 km');
      expect(formatCoordinate(38, 23.7, 150, { showUncertainty: true })).toBe('38.000°, 23.700° ±150 m');
    });

    /**
     * The important negative. Printing "±1 km" for an unstated precision would
     * present this module's assumption as the source's claim — inventing a
     * confidence statement, which is the error being fixed, pointed the other
     * way.
     */
    it('says nothing about uncertainty the source never stated', () => {
      const out = formatCoordinate(38, 23.7, undefined, { showUncertainty: true });
      expect(out).toBe('38.00°, 23.70°');
      expect(out).not.toMatch(/±/);
    });
  });
});

describe('formatUncertainty', () => {
  it('scales metres to kilometres', () => {
    expect(formatUncertainty(50)).toBe('±50 m');
    expect(formatUncertainty(999)).toBe('±999 m');
    expect(formatUncertainty(1_000)).toBe('±1 km');
    expect(formatUncertainty(1_500)).toBe('±1.5 km');
    expect(formatUncertainty(20_000)).toBe('±20 km');
    expect(formatUncertainty(1_000_000)).toBe('±1000 km');
  });

  it('emits nothing for a nonsense value rather than rendering it', () => {
    expect(formatUncertainty(-1)).toBe('');
    expect(formatUncertainty(NaN)).toBe('');
  });
});
