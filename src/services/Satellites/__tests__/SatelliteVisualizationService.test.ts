/**
 * What the Satellites layer is handed to draw — and what it must never be.
 *
 * ─── WHY THESE TESTS EXIST ─────────────────────────────────────────────────
 *
 * getSatelliteData() used to answer any failure with three hardcoded
 * satellites at fixed points on the ground, which the hook drew and captioned
 * as a successful load. Observed live on 2026-09-11: CelesTrak refused a load,
 * the card said so, and a minute later — on the hook's refresh check — the
 * caveat was gone, the catalogue stamped as fresh, and the service logging
 * "FALLBACK MODE".
 *
 * The second test is the same defect in a quieter form: every record started
 * at lat 0, lng 0 "to be updated", and one whose orbit could not be propagated
 * never was.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SatelliteVisualizationService } from '../SatelliteVisualizationService';
import { SpaceAssetsDataProvider, type CelesTrakTLE } from '../../data-management/providers/SpaceAssetsDataProvider';
import type { GpCache } from '../../data-management/providers/CelesTrakCacheStore';

/** Real ISS elements at a fixed epoch — the fixture SatelliteDataManager.test.ts uses. */
const ISS_TLE: CelesTrakTLE = {
  OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2024-01-01T00:00:00.000000',
  MEAN_MOTION: 15.4956, ECCENTRICITY: 0.0002571, INCLINATION: 51.6461, RA_OF_ASC_NODE: 208.4163,
  ARG_OF_PERICENTER: 69.9862, MEAN_ANOMALY: 25.2906, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 12345, BSTAR: 0.00040768,
  MEAN_MOTION_DOT: 0.00002182, MEAN_MOTION_DDOT: 0,
};
/** An element set SGP4 cannot propagate: eccentricity ≥ 1 is not an orbit. */
const UNPROPAGATABLE: CelesTrakTLE = {
  ...ISS_TLE, OBJECT_NAME: 'OBJECT UNPROPAGATABLE', OBJECT_ID: '2024-999A', NORAD_CAT_ID: 99999, ECCENTRICITY: 1.5,
};
const NEAR_EPOCH = new Date('2024-01-01T01:00:00.000Z');

/** The layer's real ingest path, fed by a stubbed network and no persistent cache. */
function serviceFed(groups: Record<string, unknown>) {
  const service = new SatelliteVisualizationService();
  // Same provider class without IndexedDB, so one test's download is not the next one's cache.
  const noCache: GpCache = { get: async () => null, set: async () => {} };
  (service as unknown as { dataManager: { spaceAssetsProvider: unknown } }).dataManager.spaceAssetsProvider =
    new SpaceAssetsDataProvider({ celesTrakCache: noCache, now: () => NEAR_EPOCH.getTime() });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = groups[/GROUP=([\w-]+)/.exec(url)?.[1] ?? ''];
    if (body === undefined) return { ok: false, status: 503, text: async () => '', json: async () => ({}) };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  }));
  return service;
}

describe('SatelliteVisualizationService.getSatelliteData', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NEAR_EPOCH);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('fails when the catalogue cannot be loaded — it does not hand back stand-ins', async () => {
    const service = serviceFed({}); // every group: 503

    await expect(service.getSatelliteData()).rejects.toThrow(/503/);
  });

  it('returns only satellites it could place — none parked at 0°N 0°E', async () => {
    const service = serviceFed({ active: [ISS_TLE, UNPROPAGATABLE], stations: [ISS_TLE], 'gps-ops': [] });

    const satellites = await service.getSatelliteData();

    // Not vacuous: the unpropagatable object WAS selected to be drawn…
    const selected = (service as unknown as { selectedSatellites: string[] }).selectedSatellites;
    expect(selected).toContain('99999');
    // …and is withheld for having no position, while the ISS comes through placed.
    expect(satellites.map((s) => s.id)).toEqual(['25544']);
    expect(Math.abs(satellites[0].lat)).toBeLessThanOrEqual(ISS_TLE.INCLINATION + 0.01);
    expect(satellites[0].lat === 0 && satellites[0].lng === 0).toBe(false);
  });

  it('loads the debris clouds as debris, each piece knowing its breakup, and loads without one CelesTrak refuses', async () => {
    const fengyun = { ...ISS_TLE, OBJECT_NAME: 'FENGYUN 1C DEB', OBJECT_ID: '1999-025AB', NORAD_CAT_ID: 29228 };
    const cosmos = { ...ISS_TLE, OBJECT_NAME: 'COSMOS 2251 DEB', OBJECT_ID: '1993-036X', NORAD_CAT_ID: 33772 };
    // Iridium 33's group is not served: a 503.
    const service = serviceFed({
      active: [ISS_TLE], stations: [ISS_TLE], 'gps-ops': [],
      'fengyun-1c-debris': [fengyun], 'cosmos-2251-debris': [cosmos],
    });

    await service.getSatelliteData();

    const byId = new Map(service.catalogue().map((s) => [s.id, s]));
    expect(byId.get('29228')).toMatchObject({ type: 'debris', debrisOf: 'debris-fengyun-1c' });
    // Not "communication", as its name alone would read.
    expect(byId.get('33772')).toMatchObject({ type: 'debris', debrisOf: 'debris-cosmos-2251' });
    expect(byId.get('25544')?.debrisOf).toBeUndefined();
    expect(byId.size).toBe(3);
  });
});
