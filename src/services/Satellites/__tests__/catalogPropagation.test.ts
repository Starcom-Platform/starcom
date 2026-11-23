/**
 * The whole satellite catalogue placed for a moment (D-GV GV2): SGP4 from OMM, in the globe's scene frame.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { json2satrec, propagate, gstime, eciToGeodetic } from 'satellite.js';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { propagateCatalog, satrecsOf, latLngOfPlaced, GLOBE_RADIUS_UNITS, EARTH_RADIUS_KM, type OmmRecord } from '../catalogPropagation';
import { mainThreadPropagator } from '../catalogPropagator';

// The ISS-like element set SatelliteDataManager's tests use, at times near its own epoch.
const ISS = {
  OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2024-01-01T00:00:00.000000', MEAN_MOTION: 15.4956,
  ECCENTRICITY: 0.0002571, INCLINATION: 51.6461, RA_OF_ASC_NODE: 208.4163, ARG_OF_PERICENTER: 69.9862,
  MEAN_ANOMALY: 25.2906, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 12345, BSTAR: 0.00040768, MEAN_MOTION_DOT: 0.00002182, MEAN_MOTION_DDOT: 0,
} as unknown as OmmRecord;
const AT = Date.parse('2024-01-01T00:30:00Z');

describe('propagateCatalog', () => {
  it('puts an object where latLngToGlobeWorld would, at its true height', () => {
    const satrecs = satrecsOf([ISS]);
    const out = new Float32Array(3);
    const heights = new Float32Array(1);
    propagateCatalog(satrecs, AT, out, heights);

    const satrec = json2satrec(ISS);
    const pv = propagate(satrec, new Date(AT));
    const geo = eciToGeodetic(pv.position as { x: number; y: number; z: number }, gstime(new Date(AT)));
    const expected = latLngToGlobeWorld(geo.latitude * 180 / Math.PI, geo.longitude * 180 / Math.PI, GLOBE_RADIUS_UNITS * (1 + geo.height / EARTH_RADIUS_KM));
    expect(out[0]).toBeCloseTo(expected.x, 3);
    expect(out[1]).toBeCloseTo(expected.y, 3);
    expect(out[2]).toBeCloseTo(expected.z, 3);
    // The ISS flies about 400 km up: about 106.3 scene units from the centre.
    expect(heights[0]).toBeGreaterThan(350);
    expect(heights[0]).toBeLessThan(450);
    const { lat } = latLngOfPlaced(out[0], out[1], out[2]);
    expect(Math.abs(lat)).toBeLessThanOrEqual(51.7);
  });

  it('hides an object it cannot read at the Earth\'s centre, at height NaN, and places the rest', () => {
    const broken = { ...ISS, MEAN_MOTION: 'not a number', NORAD_CAT_ID: 1 } as unknown as OmmRecord;
    const satrecs = satrecsOf([broken, ISS]);
    const out = new Float32Array(6);
    const heights = new Float32Array(2);
    propagateCatalog(satrecs, AT, out, heights);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    expect(Number.isNaN(heights[0])).toBe(true);
    expect(Math.hypot(out[3], out[4], out[5])).toBeGreaterThan(105);
  });

  it('moves an object about 7.7 km a second: a step of a second is a few hundredths of a scene unit', () => {
    const satrecs = satrecsOf([ISS]);
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    propagateCatalog(satrecs, AT, a);
    propagateCatalog(satrecs, AT + 1000, b);
    const km = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * EARTH_RADIUS_KM / GLOBE_RADIUS_UNITS;
    // Seen from the turning Earth, a little under the 7.7 km/s it flies.
    expect(km).toBeGreaterThan(6.5);
    expect(km).toBeLessThan(8.5);
  });
});

describe('the propagator on the page\'s thread', () => {
  it('loads the elements once, then gives the whole catalogue at each moment asked', async () => {
    const propagator = mainThreadPropagator();
    expect(await propagator.load([ISS, ISS])).toEqual({ loaded: 2, readable: 2 });
    const snapshots = await propagator.step([AT, AT + 1000]);
    expect(snapshots.timesMs).toEqual([AT, AT + 1000]);
    expect(snapshots.positions).toHaveLength(2);
    expect(snapshots.positions[0]).toHaveLength(6);
    expect(snapshots.heights).toHaveLength(2);
    expect(snapshots.positions[0][0]).not.toBe(snapshots.positions[1][0]);
  });
});
