import * as THREE from 'three';
import { Moon } from '../components/Moon';
import { kmToGlobeUnits } from '../EphemerisService';
import { MOON_MEAN_DISTANCE_UNITS, placeInSky, sunDirectionFrom } from '../bodyPlacement';
import type { SunlitMaterial } from '../sunlitMaterial';
import * as Astronomy from 'astronomy-engine';

describe('Moon', () => {
  let scene: THREE.Scene;
  let moon: Moon;

  beforeEach(() => {
    scene = new THREE.Scene();
    moon = new Moon(scene);
  });

  afterEach(() => {
    moon.dispose();
  });

  test('adds a mesh and an orbital path to the scene', () => {
    // mesh + orbital path line, both added directly to the scene
    expect(scene.children.length).toBeGreaterThanOrEqual(2);
  });

  test('is hidden by default', () => {
    expect(moon.isVisible()).toBe(false);
  });

  test('has a real, non-degenerate physical size relative to the globe', () => {
    const mesh = scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const geometry = mesh.geometry as THREE.SphereGeometry;
    const radius = geometry.parameters.radius;
    expect(radius).toBeCloseTo(kmToGlobeUnits(1737.4), 3);
  });

  test('positions itself at its real current geocentric location on construction', () => {
    // Constructor should not leave the mesh at the origin — that was the original bug
    // (nothing called updateOrbitalPosition in production, so bodies never moved).
    const mesh = scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(mesh.position.length()).toBeGreaterThan(1000);
  });

  test('updatePosition places it where it is in the Earth\'s sky for the moment, about its true distance away', () => {
    const date = new Date('2025-06-01T00:00:00Z');
    moon.updatePosition(date);
    expect(moon.getPosition().distanceTo(placeInSky(Astronomy.Body.Moon, date))).toBeLessThan(1e-6);
    // The one distance the compression keeps: within a twentieth of its mean.
    expect(Math.abs(moon.getPosition().length() / MOON_MEAN_DISTANCE_UNITS - 1)).toBeLessThan(0.05);
  });

  test('keeps its near side to the Earth, and is lit from where the Sun is seen from it (step 3)', () => {
    const date = new Date('2025-06-01T00:00:00Z');
    moon.updatePosition(date);
    const mesh = scene.getObjectByName('moon') as THREE.Mesh;
    const nearSide = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
    const towardEarth = moon.getPosition().normalize().negate();
    expect(THREE.MathUtils.radToDeg(nearSide.angleTo(towardEarth))).toBeLessThan(10);
    const material = mesh.material as SunlitMaterial;
    expect(material.uniforms.sunDirection.value.distanceTo(sunDirectionFrom(Astronomy.Body.Moon, date))).toBeLessThan(1e-9);
  });

  test('setShown draws it, faded by how much', () => {
    moon.setShown(0.6);
    expect(moon.isVisible()).toBe(true);
    const mesh = scene.getObjectByName('moon') as THREE.Mesh;
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.6, 6);

    moon.setShown(0);
    expect(moon.isVisible()).toBe(false);
  });

  test('its orbit line circles the Earth through the Moon, and is drawn by how much it is shown', () => {
    // Over a day from when it was built, so the line is sampled for this moment.
    const date = new Date('2025-06-01T00:00:00Z');
    moon.updatePosition(date);
    const line = scene.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    const positions = line.geometry.getAttribute('position');
    const first = new THREE.Vector3().fromBufferAttribute(positions, 0);
    // Sampled from this moment, the line starts where the Moon is.
    expect(first.distanceTo(moon.getPosition())).toBeLessThan(1);
    expect(moon.getOrbitReach()).toBeGreaterThan(5_500);
    expect(moon.getOrbitReach()).toBeLessThan(6_500);

    moon.setOrbitShown(0);
    expect(moon.isOrbitalPathVisible()).toBe(false);
    moon.setOrbitShown(1);
    expect(moon.isOrbitalPathVisible()).toBe(true);
  });

  test('samples its orbit line again once the moment has moved on by more than a day', () => {
    const date = new Date('2025-06-01T00:00:00Z');
    moon.updatePosition(date);
    const later = new Date(date.getTime() + 10 * 86_400_000);
    moon.updatePosition(later);
    const line = scene.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    const first = new THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), 0);
    expect(first.distanceTo(moon.getPosition())).toBeLessThan(1);
  });

  test('dispose removes mesh and orbital path from the scene', () => {
    const childCountBefore = scene.children.length;
    expect(childCountBefore).toBeGreaterThan(0);

    moon.dispose();

    expect(scene.children.length).toBe(0);
  });

  test('dispose is idempotent', () => {
    expect(() => {
      moon.dispose();
      moon.dispose();
    }).not.toThrow();
  });

  test('updatePosition after dispose is a no-op, not a throw', () => {
    moon.dispose();
    expect(() => moon.updatePosition(new Date())).not.toThrow();
  });
});
