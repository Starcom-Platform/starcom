import { describe, it, expect } from 'vitest';
import { selectGdacsGeometryCandidates, toPolygonFeatures, toLineFeature, allowedGdacsFeatureKindsForTier } from '../useGlobeGdacsGeometry';
import type { GdacsGeometryFeature } from '../../../../services/GdacsGeometryService';

describe('selectGdacsGeometryCandidates', () => {
  const base = { type: 'flood', severityBucket: 'major', gdacsEventId: 1, gdacsGeometryUrl: 'https://example.test/1' };

  it('selects a real major-severity flood/drought/hurricane event with geometry info', () => {
    expect(selectGdacsGeometryCandidates([base])).toEqual([{ eventId: 1, geometryUrl: 'https://example.test/1' }]);
  });

  it('excludes earthquakes and wildfires — GDACS geometry only exists for flood/drought/hurricane', () => {
    const eq = { ...base, type: 'earthquake' };
    const wf = { ...base, type: 'wildfire' };
    expect(selectGdacsGeometryCandidates([eq, wf])).toEqual([]);
  });

  it('excludes minor-severity (real GDACS Green alertlevel) events to bound fetch cost', () => {
    expect(selectGdacsGeometryCandidates([{ ...base, severityBucket: 'minor' }])).toEqual([]);
  });

  it('includes catastrophic severity alongside major', () => {
    expect(selectGdacsGeometryCandidates([{ ...base, severityBucket: 'catastrophic' }])).toHaveLength(1);
  });

  it('excludes events missing a real gdacsEventId or gdacsGeometryUrl', () => {
    expect(selectGdacsGeometryCandidates([{ ...base, gdacsEventId: undefined }])).toEqual([]);
    expect(selectGdacsGeometryCandidates([{ ...base, gdacsGeometryUrl: undefined }])).toEqual([]);
  });

  it('deduplicates by real gdacsEventId (a hazard can appear more than once in the raw event list)', () => {
    const result = selectGdacsGeometryCandidates([base, { ...base }, { ...base, type: 'hurricane' }]);
    expect(result).toHaveLength(1);
  });
});

describe('allowedGdacsFeatureKindsForTier', () => {
  it('shows only the track line at far zoom (tier 0) — centroid is already rendered elsewhere', () => {
    const allowed = allowedGdacsFeatureKindsForTier(0);
    expect(allowed.has('track')).toBe(true);
    expect(allowed.has('affectedArea')).toBe(false);
    expect(allowed.has('windBand')).toBe(false);
    expect(allowed.has('cone')).toBe(false);
  });

  it('adds the real affected-area extent at medium zoom (tier 1), still without wind bands/cone', () => {
    const allowed = allowedGdacsFeatureKindsForTier(1);
    expect(allowed.has('track')).toBe(true);
    expect(allowed.has('affectedArea')).toBe(true);
    expect(allowed.has('windBand')).toBe(false);
    expect(allowed.has('cone')).toBe(false);
  });

  it('shows full detail — wind bands and forecast cone — only at close zoom (tier 2)', () => {
    const allowed = allowedGdacsFeatureKindsForTier(2);
    expect(allowed.has('track')).toBe(true);
    expect(allowed.has('affectedArea')).toBe(true);
    expect(allowed.has('windBand')).toBe(true);
    expect(allowed.has('cone')).toBe(true);
  });
});

describe('toPolygonFeatures', () => {
  it('flattens a real MultiPolygon feature into one PolygonFeature per constituent polygon', () => {
    const feature: GdacsGeometryFeature = {
      kind: 'affectedArea',
      gdacsClass: 'Poly_Affected',
      polygons: [
        [[[1, 1], [2, 1], [2, 2], [1, 1]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]]
      ]
    };
    const result = toPolygonFeatures(feature, 42);
    expect(result).toHaveLength(2);
    expect(result[0].rings).toEqual(feature.polygons![0]);
    expect(result[1].rings).toEqual(feature.polygons![1]);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('returns an empty array for a track feature with no polygons', () => {
    const feature: GdacsGeometryFeature = { kind: 'track', gdacsClass: 'Line_Line_0', line: [[1, 1], [2, 2]] };
    expect(toPolygonFeatures(feature, 1)).toEqual([]);
  });
});

describe('toLineFeature', () => {
  it('carries a real track line through with a stable id shape', () => {
    const feature: GdacsGeometryFeature = { kind: 'track', gdacsClass: 'Line_Line_3', line: [[10, 20], [11, 21]], intensityLabel: 'HU' };
    const result = toLineFeature(feature, 99);
    expect(result?.coordinates).toEqual([[10, 20], [11, 21]]);
    expect(result?.id).toContain('gdacs-99-Line_Line_3');
  });

  it('returns null for a polygon feature with no line', () => {
    const feature: GdacsGeometryFeature = { kind: 'cone', gdacsClass: 'Poly_Cones', polygons: [[[[1, 1], [2, 2], [3, 3]]]] };
    expect(toLineFeature(feature, 1)).toBeNull();
  });
});
