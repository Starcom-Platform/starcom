import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import {
  bodyFromPlanetName,
  earthFromSun,
  getHeliocentricDistanceAU,
  kmToGlobeUnits,
  sampleGeocentricOrbit,
  sampleHeliocentricOrbit,
  AU_KM,
  EARTH_RADIUS_KM,
  GLOBE_UNITS_PER_EARTH_RADIUS,
  GLOBE_UNITS_PER_AU,
} from '../EphemerisService';

// A fixed date keeps every assertion deterministic. Real-world reference ranges below
// are the standard published bounds for each body (perihelion/aphelion-class distances),
// not values tuned to whatever this implementation happens to output.
const FIXED_DATE = new Date('2026-08-10T12:00:00Z');

describe('bodyFromPlanetName', () => {
  test('maps known planet names to astronomy-engine bodies', () => {
    expect(bodyFromPlanetName('mercury')).toBe(Astronomy.Body.Mercury);
    expect(bodyFromPlanetName('Venus')).toBe(Astronomy.Body.Venus); // case-insensitive
    expect(bodyFromPlanetName('EARTH')).toBe(Astronomy.Body.Earth);
    expect(bodyFromPlanetName('mars')).toBe(Astronomy.Body.Mars);
    expect(bodyFromPlanetName('neptune')).toBe(Astronomy.Body.Neptune);
  });

  test('returns null for unknown names', () => {
    expect(bodyFromPlanetName('pluto')).toBeNull();
    expect(bodyFromPlanetName('')).toBeNull();
  });
});

describe('getHeliocentricDistanceAU', () => {
  test('Earth is within its real perihelion/aphelion range', () => {
    const dist = getHeliocentricDistanceAU(Astronomy.Body.Earth, FIXED_DATE);
    expect(dist).toBeGreaterThan(0.983);
    expect(dist).toBeLessThan(1.017);
  });

  test('differs from geocentric distance for a distant planet (catches Helio/Geo mix-ups)', () => {
    const helio = getHeliocentricDistanceAU(Astronomy.Body.Mars, FIXED_DATE);
    const geo = Astronomy.GeoVector(Astronomy.Body.Mars, FIXED_DATE, true).Length();
    // These should never be equal in practice; a bug that accidentally called
    // HelioVector for both distanceFromSun and position would make them coincide.
    expect(Math.abs(helio - geo)).toBeGreaterThan(0.05);
  });
});

describe('scale constants', () => {
  test('GLOBE_UNITS_PER_AU is the literal extension of GLOBE_UNITS_PER_EARTH_RADIUS to AU', () => {
    const expected = (AU_KM / EARTH_RADIUS_KM) * GLOBE_UNITS_PER_EARTH_RADIUS;
    expect(GLOBE_UNITS_PER_AU).toBeCloseTo(expected, 6);
  });

});

describe('kmToGlobeUnits', () => {
  test('one Earth radius maps to GLOBE_UNITS_PER_EARTH_RADIUS scene units', () => {
    expect(kmToGlobeUnits(EARTH_RADIUS_KM)).toBeCloseTo(GLOBE_UNITS_PER_EARTH_RADIUS, 6);
  });

  test('the real Moon radius produces a visually plausible (non-degenerate) size', () => {
    const moonRadiusUnits = kmToGlobeUnits(1737.4);
    // Real Moon/Earth radius ratio is ~0.273; against a 100-unit-radius globe that's ~27 units
    expect(moonRadiusUnits).toBeGreaterThan(20);
    expect(moonRadiusUnits).toBeLessThan(35);
  });
});

describe('earthFromSun', () => {
  test('puts the Earth within its real perihelion/aphelion range of the Sun', () => {
    const dist = earthFromSun(FIXED_DATE).length();
    expect(dist).toBeGreaterThan(0.983);
    expect(dist).toBeLessThan(1.017);
  });
});

describe('sampleGeocentricOrbit (correct for Earth-primary bodies, e.g. the Moon)', () => {
  test('returns segments + 1 points, each within the Moon\'s real perigee and apogee', () => {
    const points = sampleGeocentricOrbit(Astronomy.Body.Moon, 27.321661, 16, FIXED_DATE);
    expect(points).toHaveLength(17);
    for (const p of points) {
      expect(p.length() * AU_KM).toBeGreaterThan(356000);
      expect(p.length() * AU_KM).toBeLessThan(407000);
    }
  });

  test('first and last points are close (one full sidereal month closes the loop)', () => {
    const points = sampleGeocentricOrbit(Astronomy.Body.Moon, 27.321661, 32, FIXED_DATE);
    // Not exactly equal (real orbital precession), but small relative to the Moon's
    // ~0.0026 AU orbital radius.
    expect(points[0].distanceTo(points[points.length - 1])).toBeLessThan(0.0002);
  });

  test('sampling a PLANET period geocentrically does NOT close the loop (regression guard)', () => {
    // A planet's natural frame is heliocentric, not geocentric — sampling from the Earth
    // across a full planet period folds in the Earth's own orbital motion during that
    // span, turning what should be a closed ellipse into an open loop. This is exactly
    // why geocentric and heliocentric sampling are split; if it silently stopped being
    // true, orbit paths would look wrong again.
    const points = sampleGeocentricOrbit(Astronomy.Body.Venus, 224.7, 32, FIXED_DATE);
    expect(points[0].distanceTo(points[points.length - 1])).toBeGreaterThan(0.5);
  });
});

describe('sampleHeliocentricOrbit (correct for planets)', () => {
  test('returns segments + 1 points', () => {
    expect(sampleHeliocentricOrbit(Astronomy.Body.Mercury, 87.97, 16, FIXED_DATE)).toHaveLength(17);
  });

  test('first and last points are close (one full planet period closes the ellipse)', () => {
    const points = sampleHeliocentricOrbit(Astronomy.Body.Venus, 224.7, 32, FIXED_DATE);
    // Not exactly equal (real orbits precess/perturb slightly), but close relative to
    // Venus' ~0.72 AU orbital radius.
    expect(points[0].distanceTo(points[points.length - 1])).toBeLessThan(0.05);
  });

  test('samples a genuinely varying (non-circular) path, not a synthetic fixed-radius circle', () => {
    // Mercury has real eccentricity ~0.206, so its distance from the Sun varies measurably.
    const distances = sampleHeliocentricOrbit(Astronomy.Body.Mercury, 87.97, 64, FIXED_DATE).map((p) => p.length());
    expect(Math.max(...distances) / Math.min(...distances)).toBeGreaterThan(1.05);
  });

  test('measured from the Earth at the epoch, its first point is where the planet is seen then', () => {
    // At t = epoch, heliocentric(body) - heliocentric(Earth) is the geocentric vector for
    // the same instant, but for light-time (minutes for Mars), which is small.
    const points = sampleHeliocentricOrbit(Astronomy.Body.Mars, 686.98, 8, FIXED_DATE);
    const fromEarth = points[0].clone().sub(earthFromSun(FIXED_DATE));
    const seen = Astronomy.GeoVector(Astronomy.Body.Mars, FIXED_DATE, false);
    expect(fromEarth.distanceTo(new THREE.Vector3(seen.x, seen.y, seen.z))).toBeLessThan(0.01);
  });
});
