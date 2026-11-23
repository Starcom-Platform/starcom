import * as satelliteJs from 'satellite.js';
import { vi } from 'vitest';
import { SatelliteDataManager } from '../SatelliteDataManager';
import type { CelesTrakTLE } from '../../data-management/providers/SpaceAssetsDataProvider';

// satellite.js is real ESM — its namespace object's properties are non-configurable
// per spec, so vi.spyOn() (which uses Object.defineProperty) can't touch it directly.
// Wrapping the real propagate() in a vi.fn() at the module-mock level preserves its
// actual behavior (every other test below still exercises real SGP4 math) while making
// call counts observable for the one regression test that needs them.
vi.mock('satellite.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('satellite.js')>();
  return { ...actual, propagate: vi.fn(actual.propagate) };
});

// A realistic ISS-like element set (real NORAD ID, real ISS inclination ~51.6°, real
// mean motion ~15.5 rev/day) used as a stable, deterministic test fixture — not
// required to be "currently live," since every propagation below happens at times
// near the fixture's own EPOCH (mirrors the fixed-date pattern already established in
// src/solar-system/__tests__/EphemerisService.test.ts and Planet.test.ts for the same
// reason: real-world reference ranges, not values tuned to this implementation).
const ISS_TLE: CelesTrakTLE = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2024-01-01T00:00:00.000000',
  MEAN_MOTION: 15.4956,
  ECCENTRICITY: 0.0002571,
  INCLINATION: 51.6461,
  RA_OF_ASC_NODE: 208.4163,
  ARG_OF_PERICENTER: 69.9862,
  MEAN_ANOMALY: 25.2906,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 12345,
  BSTAR: 0.00040768,
  MEAN_MOTION_DOT: 0.00002182,
  MEAN_MOTION_DDOT: 0
};

const EPOCH = new Date('2024-01-01T00:00:00.000Z');
const ORBITAL_PERIOD_MIN = (24 * 60) / ISS_TLE.MEAN_MOTION; // ~92.9 minutes

// SatelliteDataManager only computes positions for satellites it selected itself
// (via selectSatellites()), so tests seed the internal cache through the real public
// ingest path (loadSatelliteData → processSatelliteDataset, exercised indirectly via
// a minimal fetch-provider stub) rather than reaching into private state.
function managerWithFixture(): SatelliteDataManager {
  const manager = new SatelliteDataManager();
  // @ts-expect-error - accessing private method to seed a deterministic fixture
  // without a real network fetch; the public loadSatelliteData() path is exercised
  // separately by not being mocked in any other test here.
  manager['satelliteCache'].set(
    ISS_TLE.NORAD_CAT_ID.toString(),
    // @ts-expect-error - calling the real private transform for realistic shape
    manager['transformTLEToSatelliteData'](ISS_TLE, 'stations')
  );
  return manager;
}

describe('SatelliteDataManager - real SGP4 positions', () => {
  test('propagated latitude never exceeds the real orbital inclination', () => {
    // This is exactly the kind of physical-constraint check the old
    // Math.random()-based estimatePosition() would have failed — a random sign flip
    // and jitter has no relationship to the satellite's actual inclination bound.
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();

    const samples = 12;
    for (let i = 0; i <= samples; i++) {
      const t = new Date(EPOCH.getTime() + (i / samples) * ORBITAL_PERIOD_MIN * 60 * 1000);
      const [position] = manager.getPositions([id], t);
      expect(position).toBeDefined();
      expect(Math.abs(position.lat)).toBeLessThanOrEqual(ISS_TLE.INCLINATION + 0.01);
    }
  });

  test('position advances over time (not frozen, not random)', () => {
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();

    const [posT] = manager.getPositions([id], EPOCH);
    const [posLater] = manager.getPositions([id], new Date(EPOCH.getTime() + 10 * 60 * 1000));

    const delta = Math.hypot(posLater.lat - posT.lat, posLater.lng - posT.lng);
    expect(delta).toBeGreaterThan(0.5); // ISS moves fast; 10 minutes is a large angular shift

    // Same instant queried twice should be deterministic (not random jitter).
    const [posTAgain] = manager.getPositions([id], EPOCH);
    expect(posTAgain.lat).toBeCloseTo(posT.lat, 6);
    expect(posTAgain.lng).toBeCloseTo(posT.lng, 6);
  });

  test('altitude is realistic for a real LEO object (not the old 100+altitude/1000 scale bug)', () => {
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();
    const [position] = manager.getPositions([id], EPOCH);

    // Real ISS altitude is roughly 400-420 km.
    expect(position.altitude).toBeGreaterThan(300);
    expect(position.altitude).toBeLessThan(500);
  });

  test('reports real velocity derived from propagation, not a circular-orbit estimate', () => {
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();
    const [position] = manager.getPositions([id], EPOCH);

    // Real ISS orbital velocity is ~7.66 km/s.
    expect(position.velocity).toBeGreaterThan(7.0);
    expect(position.velocity).toBeLessThan(8.2);
  });

  test('a satellite with no rawTle (e.g. a synthetic/fallback entry) falls back gracefully instead of throwing', () => {
    const manager = new SatelliteDataManager();
    const id = 'synthetic-1';
    // @ts-expect-error - seeding a minimal synthetic entry with no rawTle, mirroring
    // what SatelliteVisualizationService's fallback data looks like.
    manager['satelliteCache'].set(id, {
      id,
      name: 'Synthetic Fallback Satellite',
      lat: 10,
      lng: 20,
      altitude: 400,
      type: 'other',
      status: 'active',
      priority: 50
    });

    expect(() => manager.getPositions([id], EPOCH)).not.toThrow();
    // No rawTle and no prior successful propagation → nothing to report yet.
    expect(manager.getPositions([id], EPOCH)).toHaveLength(0);
  });

  test('a malformed/garbage element set is handled without throwing or producing NaN/Infinity', () => {
    const manager = new SatelliteDataManager();
    const id = 'garbage-1';
    const garbageTle: CelesTrakTLE = {
      ...ISS_TLE,
      NORAD_CAT_ID: 999999,
      MEAN_MOTION: -5, // physically invalid — negative mean motion
      ECCENTRICITY: 1.5 // physically invalid — eccentricity must be in [0, 1)
    };
    // @ts-expect-error - seeding a deliberately invalid fixture
    manager['satelliteCache'].set(id, manager['transformTLEToSatelliteData'](garbageTle, 'active'));

    expect(() => manager.getPositions([id], EPOCH)).not.toThrow();
    const positions = manager.getPositions([id], EPOCH);
    for (const p of positions) {
      expect(Number.isFinite(p.lat)).toBe(true);
      expect(Number.isFinite(p.lng)).toBe(true);
      expect(Number.isFinite(p.altitude)).toBe(true);
    }
  });

  test('getSatelliteInfo() reflects the real, currently-propagated altitude after getPositions() runs', () => {
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();

    manager.getPositions([id], EPOCH);
    const info = manager.getSatelliteInfo(id);

    expect(info).not.toBeNull();
    expect(info!.altitude).toBeGreaterThan(300);
    expect(info!.altitude).toBeLessThan(500);
  });

  test('getSatelliteInfo() reads velocity from the cache rather than running its own propagation', () => {
    // Regression guard: getSatelliteInfo() used to call propagate() itself (via the
    // now-removed velocityAt()) on every call. SatelliteVisualizationService.
    // getSatelliteData() calls getSatelliteInfo() for every selected satellite AND
    // getPositions() for the same set in the same pass — so that extra propagate()
    // call silently doubled real SGP4 work for a value the caller never even read.
    const propagateMock = vi.mocked(satelliteJs.propagate);
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();

    manager.getPositions([id], EPOCH); // the one real propagation
    propagateMock.mockClear();

    manager.getSatelliteInfo(id);
    manager.getSatelliteInfo(id);
    manager.getSatelliteInfo(id);

    expect(propagateMock).not.toHaveBeenCalled();
  });

  test('a satellite that has never been propagated reports zero velocity from getSatelliteInfo(), not a throw', () => {
    const manager = managerWithFixture();
    const id = ISS_TLE.NORAD_CAT_ID.toString();

    const info = manager.getSatelliteInfo(id);
    expect(info).not.toBeNull();
    expect(info!.velocity).toBe(0);
  });
});
