/**
 * RLSH geocode confidence, in units a renderer can act on.
 *
 * RLSHPopup displayed `geoConfidence` as a badge in three places — so it told
 * the reader "City" — and printed the coordinate beside it with toFixed(4),
 * about eleven metres. The two disagreed, and the number is the one people
 * copy out.
 *
 * These positions are city centroids: 197 markers over 107 distinct
 * coordinates, so San Diego is one pin standing for fourteen people. Four
 * decimals names a specific building none of them live in.
 */
import { describe, it, expect } from 'vitest';
import { rlshGeoPrecisionM, type RLSHGeoConfidence } from '../RLSHOverlay';
import { coordinateDecimalsFor, formatCoordinate } from '../../types/intel/SourceObservation';

const ALL: RLSHGeoConfidence[] = ['exact', 'city', 'region', 'country', 'unknown'];

describe('rlshGeoPrecisionM', () => {
  it('covers every confidence value', () => {
    for (const c of ALL) {
      expect(Number.isFinite(rlshGeoPrecisionM(c))).toBe(true);
      expect(rlshGeoPrecisionM(c)).toBeGreaterThan(0);
    }
  });

  it('is monotonic — vaguer confidence never yields a tighter radius', () => {
    const ordered: RLSHGeoConfidence[] = ['exact', 'city', 'region', 'country'];
    for (let i = 1; i < ordered.length; i++) {
      expect(rlshGeoPrecisionM(ordered[i])).toBeGreaterThanOrEqual(rlshGeoPrecisionM(ordered[i - 1]));
    }
  });

  /**
   * 'unknown' is the COARSEST, not the default. An unstated geocode confidence
   * on a third-party wiki scrape is the least trustworthy case; sorting it
   * anywhere but last would read silence as reassurance.
   */
  it('treats unknown as no better than country level', () => {
    expect(rlshGeoPrecisionM('unknown')).toBeGreaterThanOrEqual(rlshGeoPrecisionM('country'));
  });

  it('resolves city confidence to at most one decimal — never four', () => {
    expect(coordinateDecimalsFor(rlshGeoPrecisionM('city'))).toBeLessThanOrEqual(1);
  });

  /**
   * The San Diego case, end to end. 32.7157, -117.1611 is the city centroid;
   * printed to four decimals it is an address downtown.
   */
  it('does not print a city centroid as a street address', () => {
    const shown = formatCoordinate(32.715736, -117.161087, rlshGeoPrecisionM('city'));
    expect(shown).toBe('32.7°, -117.2°');
    expect(shown).not.toContain('32.7157');
  });

  it('still gives a wiki "exact" position sub-kilometre display, not survey precision', () => {
    const dp = coordinateDecimalsFor(rlshGeoPrecisionM('exact'));
    expect(dp).toBeGreaterThanOrEqual(2);
    expect(dp).toBeLessThanOrEqual(3);
  });
});
