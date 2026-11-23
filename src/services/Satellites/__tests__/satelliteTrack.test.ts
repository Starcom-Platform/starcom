/**
 * A chosen satellite's orbit, ground track and footprint (D-GV GV2).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { json2satrec } from 'satellite.js';
import { satelliteTrack, periodMinutes } from '../satelliteTrack';
import { EARTH_RADIUS_KM, GLOBE_RADIUS_UNITS, type OmmRecord } from '../catalogPropagation';

const ISS = {
  OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: '2024-01-01T00:00:00.000000', MEAN_MOTION: 15.4956,
  ECCENTRICITY: 0.0002571, INCLINATION: 51.6461, RA_OF_ASC_NODE: 208.4163, ARG_OF_PERICENTER: 69.9862,
  MEAN_ANOMALY: 25.2906, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 12345, BSTAR: 0.00040768, MEAN_MOTION_DOT: 0.00002182, MEAN_MOTION_DDOT: 0,
} as unknown as OmmRecord;
const AT = Date.parse('2024-01-01T01:00:00Z');
const degreesBetween = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
  const r = Math.PI / 180;
  return Math.acos(Math.min(1, Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r))) / r;
};

describe('satelliteTrack', () => {
  const satrec = json2satrec(ISS);
  const track = satelliteTrack(satrec, AT)!;

  it('flies the ISS round in about 92.9 minutes, its footprint about 20° round the point beneath it', () => {
    expect(periodMinutes(satrec)).toBeCloseTo(1440 / 15.4956, 1);
    expect(track.footprintDeg).toBeGreaterThan(19);
    expect(track.footprintDeg).toBeLessThan(22);
    expect(track.footprintDeg).toBeCloseTo(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + track.now.heightKm)) * 180 / Math.PI, 6);
    for (const p of track.footprint) expect(degreesBetween(p, [track.now.lng, track.now.lat])).toBeCloseTo(track.footprintDeg, 3);
  });

  it('draws one orbit round now, at its height, nearly closed', () => {
    const points = track.orbit.length / 3;
    expect(points).toBeGreaterThan(170);
    for (let i = 0; i < points; i += 1) {
      const r = Math.hypot(track.orbit[i * 3], track.orbit[i * 3 + 1], track.orbit[i * 3 + 2]);
      expect(r).toBeGreaterThan(GLOBE_RADIUS_UNITS * 1.05);
      expect(r).toBeLessThan(GLOBE_RADIUS_UNITS * 1.08);
    }
    const first = track.orbit.slice(0, 3);
    const last = track.orbit.slice(-3);
    expect(Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2])).toBeLessThan(2);
  });

  it('runs the ground track one orbit either way, inside the latitudes the inclination reaches, every longitude in range', () => {
    expect(track.groundTrack.length).toBe(721);
    for (const [lng, lat] of track.groundTrack) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(52);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
    // The middle of the track is where it is now.
    const middle = track.groundTrack[360];
    expect(degreesBetween(middle, [track.now.lng, track.now.lat])).toBeLessThan(0.01);
  });
});
