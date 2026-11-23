import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeoEventsDataProvider, type USGSEarthquakeData } from '../GeoEventsDataProvider';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

const eonetResponse = (events: unknown[]) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: () => Promise.resolve({ title: 'EONET Events', events })
});

const baseFeatureProps = {
  mag: 5,
  place: 'Test Place',
  time: 1_700_000_000_000,
  updated: 1_700_000_100_000,
  tz: 0,
  url: 'https://example.com',
  detail: 'detail',
  felt: null,
  cdi: null,
  mmi: null,
  alert: null,
  status: 'reviewed',
  tsunami: 0,
  sig: 500,
  net: 'us',
  code: 'abc',
  ids: 'abc',
  sources: 'us',
  types: 'earthquake',
  nst: null,
  dmin: null,
  rms: 1,
  gap: null,
  magType: 'mb',
  type: 'earthquake',
  title: 'M 5 - Test'
};

describe('GeoEventsDataProvider.transformUSGSToNaturalEvents', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const provider = new GeoEventsDataProvider();

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('drops malformed features and logs errors while preserving valid events', () => {
    const payload: USGSEarthquakeData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'valid-1',
          geometry: { type: 'Point', coordinates: [-122.5, 37.5, 10] },
          properties: { ...baseFeatureProps, mag: 5.2, sig: 400, title: 'M 5.2 - Valid' }
        },
        {
          type: 'Feature',
          id: 'missing-geometry',
          geometry: { type: 'Point', coordinates: [] as unknown as [number, number, number] },
          properties: baseFeatureProps
        },
        {
          type: 'Feature',
          id: 'bad-coords',
          geometry: { type: 'Point', coordinates: [Number.NaN, Number.POSITIVE_INFINITY, 5] as [number, number, number] },
          properties: { ...baseFeatureProps, sig: 250 }
        }
      ]
    };

    const events = provider.transformUSGSToNaturalEvents(payload);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'valid-1',
      lat: 37.5,
      lng: -122.5,
      source: 'USGS',
      intensity: 400,
      magnitude: 5.2,
      // Real fields from the fixture's own coordinates[2]/properties.tsunami — both
      // previously fetched and silently dropped without being mapped through.
      depthKm: 10,
      tsunami: false,
      // Its page at USGS, which a click on its mark links to (C5).
      sourceUrl: 'https://example.com'
    });
    expect(new Date(events[0]?.timestamp ?? '').getUTCFullYear()).toBe(2023);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('maps a real tsunami-flagged quake correctly (properties.tsunami === 1)', () => {
    const payload: USGSEarthquakeData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'tsunami-quake',
          geometry: { type: 'Point', coordinates: [141.0, 38.3, 29] },
          properties: { ...baseFeatureProps, mag: 9.0, tsunami: 1, title: 'M 9.0 - Tsunami-generating quake' }
        }
      ]
    };

    const events = provider.transformUSGSToNaturalEvents(payload);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ depthKm: 29, tsunami: true });
  });

  it("keeps a quake's detail only where its types name a ShakeMap (D-EQ, EQ11)", () => {
    const detail = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us7000tv4i.geojson';
    const payload: USGSEarthquakeData = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'shaken', geometry: { type: 'Point', coordinates: [-75, 3, 10] }, properties: { ...baseFeatureProps, detail, types: ',dyfi,origin,shakemap,' } },
        { type: 'Feature', id: 'plain', geometry: { type: 'Point', coordinates: [-75, 3, 10] }, properties: { ...baseFeatureProps, detail, types: ',origin,phase-data,' } },
      ]
    };
    const [shaken, plain] = provider.transformUSGSToNaturalEvents(payload);
    expect(shaken.shakeMapDetailUrl).toBe(detail);
    expect(plain.shakeMapDetailUrl).toBeUndefined();
  });

  it('leaves depthKm undefined when coordinates has no third element, rather than fabricating a depth', () => {
    const payload: USGSEarthquakeData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'no-depth',
          geometry: { type: 'Point', coordinates: [10, 20] as unknown as [number, number, number] },
          properties: baseFeatureProps
        }
      ]
    };

    const events = provider.transformUSGSToNaturalEvents(payload);

    expect(events).toHaveLength(1);
    expect(events[0].depthKm).toBeUndefined();
  });
});

describe('GeoEventsDataProvider - NASA EONET wildfires/volcanoes', () => {
  let provider: GeoEventsDataProvider;

  beforeEach(() => {
    provider = new GeoEventsDataProvider();
    mockFetch.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a real-shaped EONET wildfire event, using the latest geometry point and carrying size as intensity (not magnitude)', async () => {
    mockFetch.mockResolvedValueOnce(eonetResponse([
      {
        id: 'EONET_22614',
        title: 'Wildfire PLAINS, San Luis Obispo, California',
        description: '21 Miles NW from McKittrick, CA',
        closed: null,
        categories: [{ id: 'wildfires', title: 'Wildfires' }],
        sources: [{ id: 'IRWIN', url: 'https://irwin.doi.gov/observer/incidents/x' }],
        geometry: [
          { date: '2026-08-10T00:00:00Z', type: 'Point', coordinates: [-121.0, 34.0], magnitudeValue: 100, magnitudeUnit: 'acres' },
          { date: '2026-08-12T15:36:00Z', type: 'Point', coordinates: [-120.001456, 35.416592], magnitudeValue: 2500, magnitudeUnit: 'acres' }
        ]
      }
    ]));

    const result = await provider.fetchData('wildfires-eonet');

    expect(result).toEqual([
      {
        id: 'EONET_22614',
        lat: 35.416592,
        lng: -120.001456,
        type: 'wildfire',
        intensity: 2500,
        timestamp: '2026-08-12T15:36:00Z',
        description: 'Wildfire PLAINS, San Luis Obispo, California',
        source: 'NASA EONET (IRWIN)',
        sourceUrl: 'https://irwin.doi.gov/observer/incidents/x'
      }
    ]);
    // magnitude must stay unset — classifySeverity()'s thresholds are Richter-scale-like
    // (>=6 catastrophic), and acreage values would misclassify almost every real fire.
    expect((result as Array<{ magnitude?: number }>)[0].magnitude).toBeUndefined();
  });

  it('names the agency each fire came from: EONET carries GDACS fires as well as IRWIN ones', async () => {
    mockFetch.mockResolvedValueOnce(eonetResponse([
      {
        id: 'EONET_9001', title: 'Wildfire in Angola', description: null, closed: null,
        categories: [{ id: 'wildfires', title: 'Wildfires' }],
        sources: [{ id: 'GDACS', url: 'https://www.gdacs.org/report.aspx?eventtype=WF&eventid=1027004' }],
        geometry: [{ date: '2026-10-15T00:00:00Z', type: 'Point', coordinates: [17.9, -11.2], magnitudeValue: null, magnitudeUnit: null }]
      },
      {
        id: 'EONET_9002', title: 'No source at all', description: null, closed: null,
        categories: [], sources: [],
        geometry: [{ date: '2026-10-15T00:00:00Z', type: 'Point', coordinates: [10, 10] }]
      }
    ]));

    const [gdacsFire, unsourced] = await provider.fetchData('wildfires-eonet') as Array<{ source?: string; sourceUrl?: string }>;
    expect(gdacsFire.source).toBe('NASA EONET (GDACS)');
    expect(gdacsFire.sourceUrl).toBe('https://www.gdacs.org/report.aspx?eventtype=WF&eventid=1027004');
    expect(unsourced.source).toBe('NASA EONET');
    expect(unsourced).not.toHaveProperty('sourceUrl');
  });

  it('drops wildfire events with missing or non-finite coordinates instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce(eonetResponse([
      { id: 'no-geometry', title: 'Bad event', description: null, closed: null, categories: [], sources: [], geometry: [] },
      { id: 'nan-coords', title: 'Bad coords', description: null, closed: null, categories: [], sources: [], geometry: [{ date: 'x', type: 'Point', coordinates: [NaN, 10] }] }
    ]));

    const result = await provider.fetchData('wildfires-eonet');
    expect(result).toEqual([]);
  });

  it('maps a real-shaped EONET volcano event as real (non-mock) data', async () => {
    mockFetch.mockResolvedValueOnce(eonetResponse([
      {
        id: 'EONET_20710',
        title: 'Nevados del Chillan Volcano, Chile',
        description: null,
        closed: null,
        categories: [{ id: 'volcanoes', title: 'Volcanoes' }],
        sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/volcano.cfm?vn=357070' }],
        geometry: [
          { date: '2026-06-15T00:00:00Z', type: 'Point', coordinates: [-71.378, -36.868], magnitudeValue: null, magnitudeUnit: null }
        ]
      }
    ]));

    const result = await provider.fetchData('volcanoes');

    expect(result).toEqual([
      {
        id: 'EONET_20710',
        name: 'Nevados del Chillan Volcano, Chile',
        lat: -36.868,
        lng: -71.378,
        status: 'active',
        last_eruption: '2026-06-15T00:00:00Z',
        source: 'Smithsonian GVP via NASA EONET',
        sourceUrl: 'https://volcano.si.edu/volcano.cfm?vn=357070',
        isMock: false
      }
    ]);
  });

  it('falls back to last-known-good data when a later EONET fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(eonetResponse([
      {
        id: 'EONET_1',
        title: 'Etna',
        description: null,
        closed: null,
        categories: [],
        sources: [],
        geometry: [{ date: '2026-08-01T00:00:00Z', type: 'Point', coordinates: [15.004, 37.734] }]
      }
    ]));
    const first = await provider.fetchData('volcanoes');
    expect(first).toHaveLength(1);

    // Persistent rejection (not -Once): fetchJsonWithDiagnostics retries once by
    // default, so a single queued rejection would only cover the first attempt and
    // leave the retry hitting the mock's default (undefined) return value instead.
    mockFetch.mockRejectedValue(new Error('network down'));
    const second = await provider.fetchData('volcanoes');

    expect(second).toEqual(first);
  });

  it('throws when a fetch fails and there is no prior cached data', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(provider.fetchData('wildfires-eonet')).rejects.toThrow();
  });
});

const gdacsResponse = (features: unknown[]) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: () => Promise.resolve({ type: 'FeatureCollection', features })
});

const gdacsFeature = (overrides: {
  eventid: number;
  eventtype: 'FL' | 'DR' | 'TC';
  name: string;
  lng: number;
  lat: number;
  alertlevel: 'Green' | 'Orange' | 'Red';
}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [overrides.lng, overrides.lat] },
  properties: {
    eventid: overrides.eventid,
    episodeid: 3,
    eventtype: overrides.eventtype,
    name: overrides.name,
    country: 'Testland',
    fromdate: '2026-08-01T00:00:00',
    todate: '2026-08-10T00:00:00',
    alertlevel: overrides.alertlevel,
    alertscore: 2,
    severitydata: { severity: 100, severitytext: 'Test severity text', severityunit: 'unit' },
    url: {
      geometry: `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=${overrides.eventtype}&eventid=${overrides.eventid}&episodeid=3`,
      report: `https://www.gdacs.org/report.aspx?eventid=${overrides.eventid}&episodeid=3&eventtype=${overrides.eventtype}`
    }
  }
});

describe('GeoEventsDataProvider - GDACS floods/droughts/hurricanes', () => {
  let provider: GeoEventsDataProvider;

  beforeEach(() => {
    provider = new GeoEventsDataProvider();
    mockFetch.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a real-shaped GDACS flood feature, mapping Green/Orange/Red to minor/major/catastrophic', async () => {
    mockFetch.mockResolvedValueOnce(gdacsResponse([
      gdacsFeature({ eventid: 1104081, eventtype: 'FL', name: 'Flood in China', lng: 111.6474, lat: 32.2656, alertlevel: 'Orange' })
    ]));

    const result = await provider.fetchData('floods-gdacs');

    expect(result).toEqual([
      {
        id: 'gdacs-1104081',
        lat: 32.2656,
        lng: 111.6474,
        type: 'flood',
        intensity: 100,
        status: 'Orange',
        timestamp: '2026-08-10T00:00:00',
        description: 'Flood in China — Test severity text',
        source: 'GDACS',
        severityOverride: 'major',
        gdacsEventId: 1104081,
        gdacsGeometryUrl: 'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=FL&eventid=1104081&episodeid=3',
        sourceUrl: 'https://www.gdacs.org/report.aspx?eventid=1104081&episodeid=3&eventtype=FL'
      }
    ]);
  });

  it('filters droughts and hurricanes to only their own eventtype from the shared feed', async () => {
    mockFetch.mockResolvedValueOnce(gdacsResponse([
      gdacsFeature({ eventid: 1, eventtype: 'FL', name: 'A flood', lng: 1, lat: 1, alertlevel: 'Green' }),
      gdacsFeature({ eventid: 2, eventtype: 'DR', name: 'A drought', lng: 2, lat: 2, alertlevel: 'Red' }),
      gdacsFeature({ eventid: 3, eventtype: 'TC', name: 'A cyclone', lng: 3, lat: 3, alertlevel: 'Orange' })
    ]));

    const droughts = await provider.fetchData('droughts-gdacs');
    expect(droughts).toHaveLength(1);
    expect((droughts as Array<{ type: string; severityOverride: string }>)[0]).toMatchObject({ type: 'drought', severityOverride: 'catastrophic' });

    const hurricanes = await provider.fetchData('hurricanes-gdacs');
    expect(hurricanes).toHaveLength(1);
    expect((hurricanes as Array<{ type: string }>)[0]).toMatchObject({ type: 'hurricane' });
  });

  it('fetches the raw GDACS feed only once when floods/droughts/hurricanes are all requested', async () => {
    mockFetch.mockResolvedValue(gdacsResponse([
      gdacsFeature({ eventid: 1, eventtype: 'FL', name: 'A flood', lng: 1, lat: 1, alertlevel: 'Green' }),
      gdacsFeature({ eventid: 2, eventtype: 'DR', name: 'A drought', lng: 2, lat: 2, alertlevel: 'Green' }),
      gdacsFeature({ eventid: 3, eventtype: 'TC', name: 'A cyclone', lng: 3, lat: 3, alertlevel: 'Green' })
    ]));

    await provider.fetchData('floods-gdacs');
    await provider.fetchData('droughts-gdacs');
    await provider.fetchData('hurricanes-gdacs');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('drops GDACS features with missing or non-finite coordinates instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce(gdacsResponse([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [NaN, 10] }, properties: { eventid: 1, eventtype: 'FL', name: 'Bad', fromdate: 'x', todate: 'y', alertlevel: 'Green', alertscore: 1 } }
    ]));

    const result = await provider.fetchData('floods-gdacs');
    expect(result).toEqual([]);
  });
});
