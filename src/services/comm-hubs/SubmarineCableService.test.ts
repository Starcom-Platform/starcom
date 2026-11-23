import { describe, it, expect } from 'vitest';
import axios from 'axios';
import {
  parseCableGeoJson,
  parseLandingPointGeoJson,
  parseCableDetail,
  cableDetailUrl,
  CABLE_GEO_URL,
  LANDING_POINT_GEO_URL
} from './SubmarineCableService';
import cableGeoFixture from '../../testing/submarineCableGeoFixture.json';
import landingPointFixture from '../../testing/landingPointGeoFixture.json';

describe('parseCableGeoJson (bug-injection verified, fixture-based)', () => {
  it('extracts real path geometry, color, and name for a real cable', () => {
    const result = parseCableGeoJson(cableGeoFixture);
    const cable = result.get('2africa');
    expect(cable).toBeDefined();
    expect(cable!.name).toBe('2Africa');
    expect(cable!.color).toBe('#e63946');
    expect(cable!.paths).toHaveLength(1);
    expect(cable!.paths[0]).toEqual([[13.234, -8.839], [20.0, -5.0], [50.6, 26.2]]);
  });

  it('skips a feature with malformed (non-array) coordinates rather than crashing', () => {
    const result = parseCableGeoJson(cableGeoFixture);
    expect(result.has('no-geometry-cable')).toBe(false);
  });

  it('falls back to id when name is missing, rather than a blank label', () => {
    const result = parseCableGeoJson({
      features: [{ properties: { id: 'x' }, geometry: { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] } }]
    });
    expect(result.get('x')?.name).toBe('x');
  });

  it('returns an empty map for malformed top-level input rather than throwing', () => {
    expect(parseCableGeoJson(null)).toEqual(new Map());
    expect(parseCableGeoJson({})).toEqual(new Map());
  });

  it('merges multiple path segments for the same real cable id', () => {
    const result = parseCableGeoJson({
      features: [
        { properties: { id: 'x', name: 'X' }, geometry: { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] } },
        { properties: { id: 'x', name: 'X' }, geometry: { type: 'MultiLineString', coordinates: [[[5, 6], [7, 8]]] } }
      ]
    });
    expect(result.get('x')?.paths).toHaveLength(2);
  });

  it('accepts a plain LineString geometry (GeoJSON allows it for a single-segment cable), not just MultiLineString', () => {
    const result = parseCableGeoJson({
      features: [{ properties: { id: 'x', name: 'X' }, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }]
    });
    expect(result.get('x')?.paths).toEqual([[[1, 2], [3, 4]]]);
  });

  it('drops a degenerate 0-1 point segment rather than handing rendering a broken line', () => {
    const result = parseCableGeoJson({
      features: [{
        properties: { id: 'x', name: 'X' },
        geometry: { type: 'MultiLineString', coordinates: [[[1, 2]], [[3, 4], [5, 6]]] }
      }]
    });
    // Only the real 2-point segment survives; the 1-point segment is dropped.
    expect(result.get('x')?.paths).toEqual([[[3, 4], [5, 6]]]);
  });

  it('drops a cable feature entirely when every one of its segments is degenerate', () => {
    const result = parseCableGeoJson({
      features: [{ properties: { id: 'x', name: 'X' }, geometry: { type: 'MultiLineString', coordinates: [[[1, 2]]] } }]
    });
    expect(result.has('x')).toBe(false);
  });

  it('rejects a real point with a non-finite coordinate (NaN/Infinity pass typeof "number" but would corrupt THREE.js geometry)', () => {
    const result = parseCableGeoJson({
      features: [{
        properties: { id: 'x', name: 'X' },
        geometry: { type: 'MultiLineString', coordinates: [[[NaN, 2], [3, 4]], [[5, 6], [Infinity, 8]]] }
      }]
    });
    // Both segments contain a non-finite point, so both are rejected outright.
    expect(result.has('x')).toBe(false);
  });
});

describe('cableDetailUrl', () => {
  it('URL-encodes a real cable id, guarding against a stray character corrupting the path', () => {
    expect(cableDetailUrl('a/b')).toBe('https://raw.githubusercontent.com/mhdalitarhini/Submarine-Cables-Map/main/open_undersea_cable_map/codebase/data/cable/a%2Fb.json');
  });

  it('leaves a normal real slug id unchanged', () => {
    expect(cableDetailUrl('2africa')).toBe('https://raw.githubusercontent.com/mhdalitarhini/Submarine-Cables-Map/main/open_undersea_cable_map/codebase/data/cable/2africa.json');
  });
});

describe('parseLandingPointGeoJson (bug-injection verified, fixture-based)', () => {
  it('extracts real coordinates and the real is_tbd flag', () => {
    const result = parseLandingPointGeoJson(landingPointFixture);
    expect(result).toHaveLength(2); // the malformed third feature is skipped
    const manama = result.find((p) => p.id === 'manama-bahrain');
    expect(manama).toEqual({ id: 'manama-bahrain', name: 'Manama, Bahrain', longitude: 50.6, latitude: 26.2, isTbd: true });
  });

  it('defaults isTbd to false when the field is absent, not undefined', () => {
    const result = parseLandingPointGeoJson(landingPointFixture);
    const luanda = result.find((p) => p.id === 'luanda-angola');
    expect(luanda?.isTbd).toBe(false);
  });

  it('skips a feature with missing coordinates rather than crashing', () => {
    const result = parseLandingPointGeoJson(landingPointFixture);
    expect(result.find((p) => p.id === 'missing-coords')).toBeUndefined();
  });

  it('rejects a real point with a non-finite coordinate', () => {
    const result = parseLandingPointGeoJson({
      features: [{ properties: { id: 'x', name: 'X' }, geometry: { type: 'Point', coordinates: [NaN, 5] } }]
    });
    expect(result).toEqual([]);
  });

  it('deduplicates a real duplicate feature id, keeping the first occurrence', () => {
    const result = parseLandingPointGeoJson({
      features: [
        { properties: { id: 'x', name: 'First' }, geometry: { type: 'Point', coordinates: [1, 2] } },
        { properties: { id: 'x', name: 'Duplicate' }, geometry: { type: 'Point', coordinates: [9, 9] } }
      ]
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'x', name: 'First', longitude: 1, latitude: 2, isTbd: false });
  });
});

describe('parseCableDetail (bug-injection verified) — isPlanned derived from rfsYear, not the source\'s stale flag', () => {
  it('treats a cable with a past real rfsYear as active (not planned)', () => {
    const result = parseCableDetail({ id: 'ace', rfs_year: 2012 }, 2026);
    expect(result?.isPlanned).toBe(false);
  });

  it('treats a cable with a future real rfsYear as planned', () => {
    const result = parseCableDetail({ id: 'future-cable', rfs_year: 2028 }, 2026);
    expect(result?.isPlanned).toBe(true);
  });

  it('does NOT trust the source\'s own stale is_planned field — verified live it lags rfsYear', () => {
    // Real-world case verified live: 2Africa (rfs_year 2023) shows is_planned: true in the
    // source even though it's genuinely active by 2026 — the field is frozen at scrape time.
    const result = parseCableDetail({ id: '2africa', rfs_year: 2023, is_planned: true }, 2026);
    expect(result?.isPlanned).toBe(false);
  });

  it('treats a missing rfsYear as an honest unknown — planned, not assumed active', () => {
    const result = parseCableDetail({ id: 'unknown-cable' }, 2026);
    expect(result?.isPlanned).toBe(true);
  });

  it('extracts real owners, length, and landing points with countries', () => {
    const result = parseCableDetail({
      id: '2africa',
      length: '45,000 km',
      owners: 'Meta, China Mobile, MTN',
      rfs_year: 2023,
      landing_points: [{ id: 'luanda-angola', name: 'Luanda, Angola', country: 'Angola' }]
    }, 2026);
    expect(result?.length).toBe('45,000 km');
    expect(result?.owners).toBe('Meta, China Mobile, MTN');
    expect(result?.landingPoints).toEqual([{ id: 'luanda-angola', name: 'Luanda, Angola', country: 'Angola' }]);
  });

  it('skips a malformed landing point entry rather than including a broken record', () => {
    const result = parseCableDetail({
      id: 'x',
      landing_points: [{ id: 'ok', name: 'OK Point', country: 'Testland' }, { id: 123, name: null }]
    }, 2026);
    expect(result?.landingPoints).toEqual([{ id: 'ok', name: 'OK Point', country: 'Testland' }]);
  });

  it('returns null for input with no real id', () => {
    expect(parseCableDetail({ name: 'X' }, 2026)).toBeNull();
    expect(parseCableDetail(null, 2026)).toBeNull();
  });
});

describe('submarine cable data sources — real live reachability (not mocked)', () => {
  it('both real geo files are still reachable and correctly shaped', async () => {
    const [cableRes, landingRes] = await Promise.all([
      axios.get(CABLE_GEO_URL, { timeout: 20000 }),
      axios.get(LANDING_POINT_GEO_URL, { timeout: 20000 })
    ]);

    expect(cableRes.status).toBe(200);
    expect(landingRes.status).toBe(200);

    const cables = parseCableGeoJson(cableRes.data);
    const landingPoints = parseLandingPointGeoJson(landingRes.data);

    // Real counts verified during this session's research: 521-525 cables, 1,413 landing
    // points. Loose bounds here (not an exact match) since the source can add/remove
    // entries between verification and CI run — the point is confirming it's still a real,
    // substantial dataset, not pinning an exact snapshot.
    expect(cables.size).toBeGreaterThan(400);
    expect(landingPoints.length).toBeGreaterThan(1000);
  }, 30000);

  it('a real, well-known cable (2Africa) still resolves with real per-cable detail', async () => {
    const response = await axios.get('https://raw.githubusercontent.com/mhdalitarhini/Submarine-Cables-Map/main/open_undersea_cable_map/codebase/data/cable/2africa.json', { timeout: 15000 });
    const detail = parseCableDetail(response.data, new Date().getFullYear());
    expect(detail?.owners).toContain('Meta');
    expect(detail?.rfsYear).toBe(2023);
  }, 20000);
});
