import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchNaturalEvents, __resetNaturalEventsCacheForTests } from '../GeoEventsService';
import type { USGSEarthquakeData } from '../data-management/providers/GeoEventsDataProvider';
import { __setPayload as setMockPayload } from '../data-management/providerRegistry';

vi.mock('../data-management/providerRegistry', () => {
  let mockPayload: unknown;
  return {
    __setPayload: (payload: unknown) => {
      mockPayload = payload;
    },
    DataManagerHelpers: class {
      // eslint-disable-next-line class-methods-use-this
      async getNaturalEventsData() {
        return mockPayload;
      }
    },
    createConfiguredDataManager: vi.fn().mockResolvedValue({})
  };
});

describe('GeoEventsService fetchNaturalEvents transformer', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetNaturalEventsCacheForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setMockPayload(undefined);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('normalizes USGS, volcano, and wildfire payloads', async () => {
    const usgsPayload: USGSEarthquakeData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'eq-1',
          properties: {
            mag: 5.2,
            place: 'Test Quake 1',
            time: 1_700_000_000_000,
            updated: 1_700_000_100_000,
            tz: 0,
            url: 'https://example.com/1',
            detail: 'detail-1',
            felt: null,
            cdi: null,
            mmi: null,
            alert: null,
            status: 'reviewed',
            tsunami: 0,
            sig: 400,
            net: 'us',
            code: 'eq1',
            ids: 'eq1',
            sources: 'us',
            types: 'earthquake',
            nst: null,
            dmin: null,
            rms: 1,
            gap: null,
            magType: 'mb',
            type: 'earthquake',
            title: 'M 5.2 - Test Quake'
          },
          geometry: {
            type: 'Point',
            coordinates: [-122.5, 37.5, 10]
          }
        },
        {
          type: 'Feature',
          id: 'eq-2',
          properties: {
            mag: 6.1,
            place: 'Test Quake 2',
            time: 1_700_000_500_000,
            updated: 1_700_000_600_000,
            tz: 0,
            url: 'https://example.com/2',
            detail: 'detail-2',
            felt: null,
            cdi: null,
            mmi: null,
            alert: null,
            status: 'reviewed',
            tsunami: 1,
            sig: 600,
            net: 'us',
            code: 'eq2',
            ids: 'eq2',
            sources: 'us',
            types: 'earthquake',
            nst: null,
            dmin: null,
            rms: 1,
            gap: null,
            magType: 'mw',
            type: 'earthquake',
            title: 'M 6.1 - Test Quake 2'
          },
          geometry: {
            type: 'Point',
            coordinates: [140.7, -35.2, 30]
          }
        }
      ]
    };

    setMockPayload({
      earthquakes: usgsPayload,
      volcanoes: [
        {
          id: 'etna',
          name: 'Mount Etna',
          lat: 37.734,
          lng: 15.004,
          elevation: 3350,
          type: 'Stratovolcano',
          status: 'active',
          last_eruption: '2023-09-10',
          country: 'Italy',
          region: 'Sicily'
        }
      ],
      wildfires: [
        { id: 'fire-1', lat: 10, lng: 10, type: 'wildfire', intensity: 320, timestamp: '2024-01-01T00:00:00Z' },
        { id: 'fire-bad', lat: NaN, lng: 1, type: 'wildfire' }
      ]
    });

    const events = await fetchNaturalEvents({ timeoutMs: 2000 });

    expect(events).toHaveLength(4);
    expect(events).toMatchInlineSnapshot(`
      [
        {
          "depthKm": 10,
          "description": "M 5.2 - Test Quake",
          "id": "eq-1",
          "intensity": 400,
          "lat": 37.5,
          "lng": -122.5,
          "magnitude": 5.2,
          "source": "USGS",
          "sourceUrl": "https://example.com/1",
          "status": "reviewed",
          "timestamp": "2023-11-14T22:13:20.000Z",
          "tsunami": false,
          "type": "earthquake",
        },
        {
          "depthKm": 30,
          "description": "M 6.1 - Test Quake 2",
          "id": "eq-2",
          "intensity": 600,
          "lat": -35.2,
          "lng": 140.7,
          "magnitude": 6.1,
          "source": "USGS",
          "sourceUrl": "https://example.com/2",
          "status": "reviewed",
          "timestamp": "2023-11-14T22:21:40.000Z",
          "tsunami": true,
          "type": "earthquake",
        },
        {
          "description": "Mount Etna",
          "id": "etna",
          "isMock": true,
          "lat": 37.734,
          "lng": 15.004,
          "source": "volcano-mock",
          "status": "active",
          "timestamp": "2023-09-10T00:00:00.000Z",
          "type": "volcano",
        },
        {
          "id": "fire-1",
          "intensity": 320,
          "lat": 10,
          "lng": 10,
          "timestamp": "2024-01-01T00:00:00Z",
          "type": "wildfire",
        },
      ]
    `);

    const quakes = events.filter((e) => e.type === 'earthquake');
    expect(quakes).toHaveLength(2);
    expect(quakes[0].magnitude).toBe(5.2);
    expect(quakes[0].source).toBe('USGS');
    expect(new Date(quakes[0].timestamp ?? '').getFullYear()).toBe(2023);

    const volcanoes = events.filter((e) => e.type === 'volcano');
    expect(volcanoes).toHaveLength(1);
    expect(volcanoes[0].isMock).toBe(true);
    expect(volcanoes[0].description).toContain('Etna');

    const fires = events.filter((e) => e.type === 'wildfire');
    expect(fires).toHaveLength(1); // invalid wildfire filtered out
    expect(fires[0].lat).toBe(10);
  });

  it("keeps a volcano's page at its source, for a click on its mark to link to (C5)", async () => {
    setMockPayload({
      volcanoes: [
        { id: 'EONET_20710', name: 'Nevados del Chillan', lat: -36.868, lng: -71.378, status: 'active', source: 'Smithsonian GVP via NASA EONET', sourceUrl: 'https://volcano.si.edu/volcano.cfm?vn=357070', isMock: false },
        { id: 'EONET_1', name: 'Etna', lat: 37.734, lng: 15.004, status: 'active', source: 'Smithsonian GVP via NASA EONET', isMock: false },
      ]
    });

    const [chillan, etna] = await fetchNaturalEvents();
    expect(chillan.sourceUrl).toBe('https://volcano.si.edu/volcano.cfm?vn=357070');
    expect(etna).not.toHaveProperty('sourceUrl');
  });

  it('handles malformed payloads defensively', async () => {
    setMockPayload({
      earthquakes: 'not geojson',
      volcanoes: null,
      wildfires: [{ id: 'wf', lat: 'bad', lng: 5 }]
    });

    const events = await fetchNaturalEvents({ timeoutMs: 2000 });

    expect(events).toHaveLength(0);
    // Only earthquakes ('not geojson') is malformed data worth an error. volcanoes:
    // null is treated as "no data provided" (an early, silent return by design, not
    // malformed input), and the one bad wildfire entry is dropped by the lat/lng
    // finite-number filter without its own log call.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and drops unsupported hazard types', async () => {
    setMockPayload({
      meteorShowers: [
        {
          id: 'meteor-1',
          lat: 12,
          lng: 34,
          type: 'meteor'
        }
      ],
      earthquakes: undefined,
      volcanoes: undefined,
      wildfires: undefined
    });

    const events = await fetchNaturalEvents({ timeoutMs: 2000 });

    expect(events).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
