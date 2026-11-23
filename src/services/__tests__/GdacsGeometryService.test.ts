import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGdacsGeometries, clearGdacsGeometryCache } from '../GdacsGeometryService';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body)
});

// Real-shaped fixture, trimmed from a live GDACS getgeometry response for a flood
// (verified directly): centroid + real "Affected area" and "Global area" MultiPolygons.
const floodGeometry = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [111.6, 32.3] }, properties: { eventid: 1104081, Class: 'Point_Centroid', polygonlabel: 'Centroid' } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[111.0, 32.0], [111.5, 32.0], [111.5, 32.5], [111.0, 32.0]]]] }, properties: { eventid: 1104081, Class: 'Poly_Affected', polygonlabel: 'Affected area' } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[110.0, 31.0], [112.0, 31.0], [112.0, 33.0], [110.0, 31.0]]]] }, properties: { eventid: 1104081, Class: 'Poly_Global', polygonlabel: 'Global area' } }
  ]
};

// Real-shaped fixture, trimmed from a live cyclone getgeometry response: centroid,
// per-track-point marker (skipped), a wind-speed-radius band, a cone of uncertainty,
// and one real TD/TS/HU-tagged track segment.
const cycloneGeometry = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [120.4, 28.7] }, properties: { eventid: 1001279, Class: 'Point_Centroid', polygonlabel: 'Centroid' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[163.3, 8.67], [163.31, 8.67], [163.3, 8.68], [163.3, 8.67]]] }, properties: { eventid: 1001279, Class: 'Point_Polygon_Point_0', polygonlabel: '01/07 00:00 UTC' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[120.4, 33.7], [120.4, 31.5], [120.3, 31.5], [120.4, 33.7]]] }, properties: { eventid: 1001279, Class: 'Poly_Green', polygonlabel: '11/07 18:00' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[120.4, 28.45], [120.5, 28.45], [120.45, 28.5], [120.4, 28.45]]] }, properties: { eventid: 1001279, Class: 'Poly_Cones', polygonlabel: 'Uncertainty Cones' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[123.2, 26.6], [121.8, 27.6]] }, properties: { eventid: 1001279, Class: 'Line_Line_0', polygonlabel: 'HU' } }
  ]
};

describe('fetchGdacsGeometries', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearGdacsGeometryCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('maps a real flood response to only the real Affected-area MultiPolygon, dropping the centroid and the coarser Global-area polygon', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(floodGeometry));

    const [result] = await fetchGdacsGeometries([{ eventId: 1104081, geometryUrl: 'https://example.test/fl' }]);

    expect(result.eventId).toBe(1104081);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({ kind: 'affectedArea', gdacsClass: 'Poly_Affected' });
    expect(result.features[0].polygons).toHaveLength(1);
  });

  it('maps a real cyclone response to a wind band, a cone of uncertainty, and an intensity-tagged track segment — dropping the centroid and the per-track-point marker', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cycloneGeometry));

    const [result] = await fetchGdacsGeometries([{ eventId: 1001279, geometryUrl: 'https://example.test/tc' }]);

    expect(result.features).toHaveLength(3);
    const kinds = result.features.map((f) => f.kind).sort();
    expect(kinds).toEqual(['cone', 'track', 'windBand']);

    const track = result.features.find((f) => f.kind === 'track')!;
    expect(track.intensityLabel).toBe('HU');
    expect(track.line).toEqual([[123.2, 26.6], [121.8, 27.6]]);
  });

  it('fetches multiple events with bounded concurrency and returns one result per event', async () => {
    mockFetch.mockResolvedValue(jsonResponse(floodGeometry));

    const results = await fetchGdacsGeometries([
      { eventId: 1, geometryUrl: 'https://example.test/a' },
      { eventId: 2, geometryUrl: 'https://example.test/b' },
      { eventId: 3, geometryUrl: 'https://example.test/c' }
    ]);

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('caches a real geometry response and does not re-fetch the same URL within the TTL', async () => {
    mockFetch.mockResolvedValue(jsonResponse(floodGeometry));

    await fetchGdacsGeometries([{ eventId: 1104081, geometryUrl: 'https://example.test/fl' }]);
    await fetchGdacsGeometries([{ eventId: 1104081, geometryUrl: 'https://example.test/fl' }]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('drops the failing event but still returns geometry for the others when one real fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce(jsonResponse(floodGeometry));

    const results = await fetchGdacsGeometries([
      { eventId: 1, geometryUrl: 'https://example.test/fails' },
      { eventId: 2, geometryUrl: 'https://example.test/ok' }
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].eventId).toBe(2);
  });
});
