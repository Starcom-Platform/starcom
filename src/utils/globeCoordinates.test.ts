import * as THREE from 'three';
import { Vector3 } from 'three';
import ThreeGlobe from 'three-globe';
import { latLngToGlobeLocal, normalizeLongitude, globeLocalToLatLng, latLngToGlobeWorld, globeWorldToLatLng } from './globeCoordinates';

const EPSILON = 1e-6;

describe('globeCoordinates — the globe mesh\'s local frame', () => {
  it('normalizes longitude into [-180, 180)', () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
    expect(normalizeLongitude(540)).toBe(-180);
  });

  it('maps cardinal lat/lng to expected unit vectors', () => {
    const primeMeridian = latLngToGlobeLocal(0, 0, 1);
    expect(primeMeridian.x).toBeCloseTo(1, 6);
    expect(primeMeridian.y).toBeCloseTo(0, 6);
    expect(primeMeridian.z).toBeCloseTo(0, 6);

    const east90 = latLngToGlobeLocal(0, 90, 1);
    expect(east90.x).toBeCloseTo(0, 6);
    expect(east90.y).toBeCloseTo(0, 6);
    expect(east90.z).toBeCloseTo(-1, 6);

    const northPole = latLngToGlobeLocal(90, 0, 1);
    expect(northPole.x).toBeCloseTo(0, 6);
    expect(northPole.y).toBeCloseTo(1, 6);
    expect(northPole.z).toBeCloseTo(0, 6);

    const west90 = latLngToGlobeLocal(0, -90, 1);
    expect(west90.x).toBeCloseTo(0, 6);
    expect(west90.y).toBeCloseTo(0, 6);
    expect(west90.z).toBeCloseTo(1, 6);

    const antiMeridian = latLngToGlobeLocal(0, 180, 1);
    expect(antiMeridian.x).toBeCloseTo(-1, 6);
    expect(antiMeridian.y).toBeCloseTo(0, 6);
    expect(antiMeridian.z).toBeCloseTo(0, 6);
  });

  it('round-trips lat/lng through vector conversion', () => {
    const cases = [
      { lat: 0, lng: 0, radius: 1 },
      { lat: 37.7749, lng: -122.4194, radius: 100 },
      { lat: -33.8688, lng: 151.2093, radius: 250 },
      { lat: 64.1265, lng: -21.8174, radius: 42 },
      { lat: -12.0464, lng: -77.0428, radius: 73 }
    ];

    for (const current of cases) {
      const vector = latLngToGlobeLocal(current.lat, current.lng, current.radius);
      const result = globeLocalToLatLng(vector, current.radius);

      expect(result.lat).toBeCloseTo(current.lat, 6);
      expect(normalizeLongitude(result.lng)).toBeCloseTo(normalizeLongitude(current.lng), 6);
    }
  });

  it('preserves position for pick-to-marker conversion flow', () => {
    const picked = new Vector3(34.2, 72.9, -55.4).normalize().multiplyScalar(100);

    const pickedLatLng = globeLocalToLatLng(picked, 100);
    const markerPosition = latLngToGlobeLocal(pickedLatLng.lat, pickedLatLng.lng, 100);

    expect(markerPosition.distanceTo(picked)).toBeLessThan(EPSILON);
  });

  it('derives radius from vector length when omitted', () => {
    const point = new Vector3(0, 2, 0);
    const result = globeLocalToLatLng(point);

    expect(result.lat).toBeCloseTo(90, 6);
    expect(Math.abs(result.lng)).toBeLessThan(EPSILON);
  });

  it('keeps pole vectors on Y axis for any longitude', () => {
    const northPoleAt120E = latLngToGlobeLocal(90, 120, 1);
    const southPoleAt45W = latLngToGlobeLocal(-90, -45, 1);

    expect(northPoleAt120E.x).toBeCloseTo(0, 6);
    expect(northPoleAt120E.y).toBeCloseTo(1, 6);
    expect(northPoleAt120E.z).toBeCloseTo(0, 6);

    expect(southPoleAt45W.x).toBeCloseTo(0, 6);
    expect(southPoleAt45W.y).toBeCloseTo(-1, 6);
    expect(southPoleAt45W.z).toBeCloseTo(0, 6);
  });
});

/*
 * The frame that matters for anything a layer adds to the scene, checked against the
 * library that draws the globe — not against itself. Until 2026-09-11 the only function
 * here was the local one, and every test above passed while satellites, cyber threats,
 * submarine cables, weather, gauges, volcanoes and aurora were all drawn 90° east.
 */
describe('globeCoordinates — the scene\'s frame, against three-globe itself', () => {
  const globe = new ThreeGlobe();
  const cases: Array<[number, number]> = [
    [0, 0], [0, 90], [0, -90], [0, 180], [51.5, -0.1], [40, -100], [-33.9, 151.2], [64.1, -21.8], [-54.8, -68.3], [89, 45],
  ];

  it('puts every point exactly where react-globe.gl\'s getCoords does', () => {
    for (const [lat, lng] of cases) {
      const truth = globe.getCoords(lat, lng, 0.02);
      const ours = latLngToGlobeWorld(lat, lng, 102);
      expect(ours.distanceTo(new Vector3(truth.x, truth.y, truth.z))).toBeLessThan(1e-6);
    }
  });

  it('reads back the lat/lng three-globe itself would', () => {
    for (const [lat, lng] of cases) {
      const truth = globe.getCoords(lat, lng, 0);
      const back = globeWorldToLatLng(new Vector3(truth.x, truth.y, truth.z));
      expect(back.lat).toBeCloseTo(lat, 6);
      if (Math.abs(lat) < 89.9) expect(normalizeLongitude(back.lng - lng)).toBeCloseTo(0, 6);
    }
  });

  it('is the local frame turned the way three-globe turns its globe mesh', () => {
    // The fact the local frame rests on: three-globe rotates the mesh -90° about y.
    const mesh = globe.children.flatMap(function all(o): THREE.Object3D[] { return [o, ...o.children.flatMap(all)]; })
      .find((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.SphereGeometry);
    expect(mesh?.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
    const turn = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    for (const [lat, lng] of cases) {
      expect(latLngToGlobeLocal(lat, lng, 100).applyMatrix4(turn).distanceTo(latLngToGlobeWorld(lat, lng, 100))).toBeLessThan(1e-9);
    }
  });

  it('is not the local frame: the two differ by 90° of longitude', () => {
    expect(latLngToGlobeWorld(0, 0, 1).angleTo(latLngToGlobeLocal(0, 0, 1))).toBeCloseTo(Math.PI / 2, 9);
  });
});
