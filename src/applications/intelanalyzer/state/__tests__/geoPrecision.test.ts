/**
 * A position known to within 20km must not behave like a surveyed one.
 *
 * This is the spatial twin of a guard that already existed for time. The
 * timePrecisionMs check beside it carries the argument: "a source that only
 * knows WHEN to within a week cannot support a claim about a 24-hour window…
 * asserting either from them invents precision the source explicitly declined
 * to claim." Nothing said the same about WHERE.
 *
 * It matters now because Navcom's kind-1911 observations are published as a
 * coarse geohash cell ON PURPOSE, to protect the person who filed them. A cell
 * centroid is not where anybody stood, and treating it as a point produces two
 * distinct failures: invented contradictions between cells, and a published
 * coordinate asserting an address the observer withheld.
 */
import { describe, it, expect } from 'vitest';
import {
  supportsSeparation, coordinateDecimalsFor, DEFAULT_GEO_PRECISION_M,
} from '../../../../types/intel/SourceObservation';
import { publishablePosition, buildPositionIndex } from '../correlationUtils';

describe('supportsSeparation', () => {
  it('refuses a separation claim two coarse cells cannot support', () => {
    // Two ±20km cells 30km apart: the true positions could be co-located.
    expect(supportsSeparation(20_000, 20_000, 30)).toBe(false);
  });

  it('allows one that survives the combined uncertainty', () => {
    // 20km + 20km = 40km of doubt, and they are 100km apart.
    expect(supportsSeparation(20_000, 20_000, 100)).toBe(true);
  });

  it('adds the uncertainties, because either could be wrong toward the other', () => {
    // 45km apart, 25km of combined doubt -> supported. 50km of doubt -> not.
    expect(supportsSeparation(20_000, 5_000, 45)).toBe(true);
    expect(supportsSeparation(20_000, 30_000, 45)).toBe(false);
  });

  it('treats an unstated precision as coarse, not exact', () => {
    // A coordinate with no stated uncertainty is one somebody wrote down, not
    // one somebody surveyed. Assuming exactness is what invents contradictions.
    expect(DEFAULT_GEO_PRECISION_M).toBeGreaterThan(0);
    expect(supportsSeparation(undefined, undefined, 0.5)).toBe(false);
  });
});

describe('coordinateDecimalsFor', () => {
  it('prints a 20km cell to about ten kilometres, not eleven metres', () => {
    // Four decimals reads as surveyed. From a 20km cell those digits assert a
    // position the observer deliberately did not give.
    expect(coordinateDecimalsFor(20_000)).toBeLessThanOrEqual(1);
  });

  it('keeps full precision for a genuinely surveyed position', () => {
    expect(coordinateDecimalsFor(5)).toBe(4);
  });

  it('never prints more precision as uncertainty grows', () => {
    const uncertainties = [5, 100, 1_000, 20_000, 100_000];
    const dps = uncertainties.map(coordinateDecimalsFor);
    for (let i = 1; i < dps.length; i++) {
      expect(dps[i]).toBeLessThanOrEqual(dps[i - 1]);
    }
  });

  it('rounds a centroid to something that does not name a building', () => {
    const dp = coordinateDecimalsFor(20_000);
    const shown = Number((37.774929).toFixed(dp));
    // 0.1 degrees is ~11km. The published number must not resolve an address.
    expect(Math.abs(shown - 37.774929)).toBeGreaterThan(0.001);
  });
});

describe('where a single event is drawn', () => {
  it('rounds to the precision the source stated, as a corroboration is', () => {
    expect(publishablePosition({ lat: 51.507351, lon: -0.127758, geoPrecisionM: 20_000 })).toEqual({ lat: 51.5, lon: -0.1 });
    expect(publishablePosition({ lat: 51.507351, lon: -0.127758, geoPrecisionM: 10 })).toEqual({ lat: 51.5074, lon: -0.1278 });
  });

  it('treats an unstated precision as the default, not as surveyed', () => {
    expect(publishablePosition({ lat: 51.507351, lon: -0.127758 })).toEqual({ lat: 51.51, lon: -0.13 });
  });

  it('has no position rather than an invented one', () => {
    expect(publishablePosition({ lat: null, lon: 2 })).toBeUndefined();
    expect(publishablePosition({ lat: Number.NaN, lon: 2 })).toBeUndefined();
  });

  it('indexes each source by its first positioned event, rounded — what contradiction marks are placed at', () => {
    const index = buildPositionIndex([
      { sourceId: 'a', lat: null, lon: null },
      { sourceId: 'a', lat: 48.858370, lon: 2.294481, geoPrecisionM: 5_000 },
      { sourceId: 'a', lat: 10, lon: 10 },
      { sourceId: 'b', lat: 40.689247, lon: -74.044502, geoPrecisionM: 50 },
    ]);
    expect(index.get('a')).toEqual({ lat: 48.9, lon: 2.3 });
    expect(index.get('b')).toEqual({ lat: 40.689, lon: -74.045 });
  });
});

