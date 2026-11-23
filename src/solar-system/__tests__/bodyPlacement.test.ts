/**
 * Where each body is drawn (decision K6, record docs/missions/01-architecture-decisions/solar-system.md):
 * in its true direction from the Earth, in the globe's Earth-fixed frame, for the
 * moment shown; at its true size; at one scale for every distance but the Moon's, which is true (SS1, C32).
 */
import { describe, it, expect } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import {
  DRAWN_UNITS_PER_AU, MOON_MEAN_DISTANCE_UNITS, SKY_SCALE, bodyTurn, drawnDistance, drawnPosition, drawnRadius, orbitShown,
  placeInSky, skyDirection, skyFrame, sunDirectionFrom, sunInSky,
} from '../bodyPlacement';
import { subsolarDirectionWorld } from '../../globe-engine/globeLighting';
import { GLOBE_UNITS_PER_AU } from '../EphemerisService';
import { computeSolarEphemeris } from '../SolarEphemerisService';
import { globeWorldToLatLng, latLngToGlobeWorld } from '../../utils/globeCoordinates';
import { SOLAR_SYSTEM_EXTENT } from '../../components/Globe/globeAltitudes';

const degreesBetween = (a: THREE.Vector3, b: THREE.Vector3) => THREE.MathUtils.radToDeg(a.angleTo(b));
const MOMENTS = [
  '2026-03-20T14:46:00Z', // equinox
  '2026-06-21T08:24:00Z', // solstice
  '2026-10-07T06:00:00Z',
  '2026-12-21T20:50:00Z', // solstice
  '2027-02-22T23:59:00Z', // the last day of cohort 4
].map((iso) => new Date(iso));

describe('the drawn distance (SS1, one scale since C32)', () => {
  it('keeps the Moon\'s distance true', () => {
    expect(MOON_MEAN_DISTANCE_UNITS).toBeCloseTo(6033.6, 0);
    expect(drawnDistance(MOON_MEAN_DISTANCE_UNITS, Astronomy.Body.Moon)).toBeCloseTo(MOON_MEAN_DISTANCE_UNITS, 6);
  });

  it('draws every other distance at one scale: the Sun at about 1,190 Earth radii, as it stood, and 30 AU thirty times that', () => {
    expect(drawnDistance(GLOBE_UNITS_PER_AU) / 100).toBeCloseTo(1190, -1);
    expect(drawnDistance(GLOBE_UNITS_PER_AU)).toBeCloseTo(DRAWN_UNITS_PER_AU, 6);
    expect(drawnDistance(30 * GLOBE_UNITS_PER_AU) / drawnDistance(GLOBE_UNITS_PER_AU)).toBeCloseTo(30, 9);
  });

  it('keeps an orbit its true shape: an ellipse drawn about the Earth is the ellipse, scaled (C32)', () => {
    // Venus's path round the Sun, measured from the Earth as drawn: every point scaled alike, so the distance
    // between any two drawn points is the true distance times one factor, as under the old square root it was not.
    const frame = new THREE.Matrix4();
    const a = drawnPosition(new THREE.Vector3(0.28, 0, 0), frame);
    const b = drawnPosition(new THREE.Vector3(1.72, 0, 0), frame);
    const c = drawnPosition(new THREE.Vector3(1, 0.72, 0), frame);
    const ratio = (p: THREE.Vector3, q: THREE.Vector3, trueAu: number) => p.distanceTo(q) / (trueAu * GLOBE_UNITS_PER_AU);
    expect(ratio(a, b, 1.44)).toBeCloseTo(SKY_SCALE, 9);
    expect(ratio(a, c, Math.hypot(0.72, 0.72))).toBeCloseTo(SKY_SCALE, 9);
  });

  it('keeps Neptune at its farthest inside the extent the camera\'s reach frames', () => {
    // Neptune is farthest from the Earth at conjunction, which falls in March each year.
    let farthest = 0;
    for (let day = 0; day < 366; day++) {
      const at = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000);
      farthest = Math.max(farthest, skyDirection(Astronomy.Body.Neptune, at).trueUnits);
    }
    expect(farthest / GLOBE_UNITS_PER_AU).toBeGreaterThan(30.8);
    expect(drawnDistance(farthest)).toBeLessThan(SOLAR_SYSTEM_EXTENT);
  });
});

describe('true sizes (K6)', () => {
  it('draws every body on the globe\'s scale: one Earth radius is 100', () => {
    expect(drawnRadius(6371)).toBeCloseTo(100, 6);
    expect(drawnRadius(695_700)).toBeCloseTo(10_920, -1); // the Sun
    expect(drawnRadius(69_911)).toBeCloseTo(1097, 0); // Jupiter
    expect(drawnRadius(1737.4)).toBeCloseTo(27.3, 1); // the Moon
  });
});

describe('the frame and the moment (SS4)', () => {
  it('turns without stretching: the frame is a rotation', () => {
    const frame = skyFrame(MOMENTS[2]);
    const [x, y, z] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    frame.extractBasis(x, y, z);
    for (const axis of [x, y, z]) expect(axis.length()).toBeCloseTo(1, 12);
    expect(x.dot(y)).toBeCloseTo(0, 12);
    expect(frame.determinant()).toBeCloseTo(1, 12);
  });

  it('agrees with the right-ascension route: longitude = RA - GMST, latitude = declination', () => {
    for (const at of MOMENTS) {
      for (const body of [Astronomy.Body.Moon, Astronomy.Body.Venus, Astronomy.Body.Jupiter, Astronomy.Body.Neptune]) {
        const time = Astronomy.MakeTime(at);
        const ofDate = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), Astronomy.GeoVector(body, time, true));
        const { ra, dec } = Astronomy.EquatorFromVector(ofDate);
        const byRa = latLngToGlobeWorld(dec, ra * 15 - computeSolarEphemeris(at).gmstDeg, 1);
        // Compared as unit vectors: an angle this small is below what acos can resolve.
        expect(skyDirection(body, at).direction.distanceTo(byRa)).toBeLessThan(1e-12);
      }
    }
  });

  it('puts the drawn Sun exactly where the globe\'s light comes from', () => {
    for (const at of MOMENTS) {
      expect(degreesBetween(sunInSky(at).clone().normalize(), subsolarDirectionWorld(at))).toBeLessThan(1e-4);
    }
  });

  it('finds the Sun by the planets\' route within a twentieth of a degree of the light, so the two frames agree', () => {
    for (const at of MOMENTS) {
      expect(degreesBetween(skyDirection(Astronomy.Body.Sun, at).direction, subsolarDirectionWorld(at))).toBeLessThan(0.05);
    }
  });

  it('turns the sky with the Earth: the same body a sidereal hour later is 15 degrees round the axis', () => {
    const at = MOMENTS[2];
    const later = new Date(at.getTime() + 3_590_170); // one sidereal hour
    const a = skyDirection(Astronomy.Body.Jupiter, at).direction;
    const b = skyDirection(Astronomy.Body.Jupiter, later).direction;
    // The latitude stays; the longitude under the body moves west by 15 degrees.
    const [pa, pb] = [globeWorldToLatLng(a, 1), globeWorldToLatLng(b, 1)];
    expect(pb.lat).toBeCloseTo(pa.lat, 1);
    const moved = ((pa.lng - pb.lng) + 540) % 360 - 180;
    expect(moved).toBeCloseTo(15, 0);
  });

  it('draws any point from the Earth by the same turn and the same compression as a body', () => {
    const at = MOMENTS[1];
    const v = Astronomy.GeoVector(Astronomy.Body.Mars, Astronomy.MakeTime(at), true);
    const drawn = drawnPosition(new THREE.Vector3(v.x, v.y, v.z), skyFrame(at));
    expect(drawn.distanceTo(placeInSky(Astronomy.Body.Mars, at))).toBeLessThan(1e-6);
  });

  it('places a body at its true direction and its drawn distance', () => {
    const at = MOMENTS[2];
    const { direction, trueUnits } = skyDirection(Astronomy.Body.Moon, at);
    const placed = placeInSky(Astronomy.Body.Moon, at);
    expect(degreesBetween(placed.clone().normalize(), direction)).toBeLessThan(1e-6);
    expect(placed.length()).toBeCloseTo(drawnDistance(trueUnits, Astronomy.Body.Moon), 3);
    expect(placed.length()).toBeCloseTo(trueUnits, 3);
    // The Moon's true distance stays between perigee and apogee.
    expect(trueUnits / 100 * 6371).toBeGreaterThan(356_000);
    expect(trueUnits / 100 * 6371).toBeLessThan(407_000);
  });
});

describe('orbit lines (K6, step 2)', () => {
  it('draw none of an orbit until the camera has backed out to half its reach', () => {
    expect(orbitShown(0, 10_000)).toBe(0);
    expect(orbitShown(5_000, 10_000)).toBe(0);
  });

  it('draw all of it once the whole orbit is in view, at twice its reach', () => {
    expect(orbitShown(20_000, 10_000)).toBe(1);
    expect(orbitShown(1e6, 10_000)).toBe(1);
  });

  it('fade in smoothly between', () => {
    const shown = [6_000, 9_000, 12_000, 15_000, 18_000].map((d) => orbitShown(d, 10_000));
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(shown[0]).toBeGreaterThan(0);
    expect(shown[4]).toBeLessThan(1);
  });
});

describe('lit by the Sun, turned on its own axis (K6, step 3)', () => {
  /** The share of a body's disc lit as seen from the Earth, from the direction it is lit from. */
  const litShare = (body: Astronomy.Body, at: Date) => {
    const towardEarth = skyDirection(body, at).direction.negate();
    return (1 + sunDirectionFrom(body, at).dot(towardEarth)) / 2;
  };
  // Over a year and a half, so Venus goes from full to a thin crescent.
  const PHASE_MOMENTS = Array.from({ length: 19 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 30 * 86_400_000));

  it('shows Venus in its true phase, crescent to full, as seen from the Earth', () => {
    const shares = PHASE_MOMENTS.map((at) => {
      expect(litShare(Astronomy.Body.Venus, at)).toBeCloseTo(Astronomy.Illumination(Astronomy.Body.Venus, at).phase_fraction, 2);
      return litShare(Astronomy.Body.Venus, at);
    });
    expect(Math.min(...shares)).toBeLessThan(0.2);
    expect(Math.max(...shares)).toBeGreaterThan(0.9);
  });

  it('shows the Moon in its true phase', () => {
    for (const at of PHASE_MOMENTS) {
      expect(litShare(Astronomy.Body.Moon, at)).toBeCloseTo(Astronomy.Illumination(Astronomy.Body.Moon, at).phase_fraction, 2);
    }
  });

  it('turns a body\'s north to its own pole', () => {
    for (const at of MOMENTS) {
      for (const body of [Astronomy.Body.Mars, Astronomy.Body.Jupiter, Astronomy.Body.Saturn, Astronomy.Body.Uranus]) {
        const axis = Astronomy.RotationAxis(body, Astronomy.MakeTime(at));
        const pole = new THREE.Vector3(axis.north.x, axis.north.y, axis.north.z).applyMatrix4(skyFrame(at));
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(bodyTurn(body, at)).distanceTo(pole)).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps the Moon\'s near side to the Earth, within its libration', () => {
    for (const at of PHASE_MOMENTS) {
      const nearSide = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyTurn(Astronomy.Body.Moon, at));
      const towardEarth = placeInSky(Astronomy.Body.Moon, at).normalize().negate();
      expect(degreesBetween(nearSide, towardEarth)).toBeLessThan(10);
    }
  });
});
