/**
 * The Sun as a body (decision K6): at its true size, where the globe's light comes from,
 * for the moment shown, fading in as the camera backs out. It replaced a Sun drawn at a
 * size and distance chosen per scale tier, smaller than Jupiter and 90° from the light.
 */
import * as THREE from 'three';
import { vi } from 'vitest';
import { SolarSunManager } from '../SolarSunManager';
import { subsolarDirectionWorld } from '../../globe-engine/globeLighting';
import { drawnDistance, drawnRadius, skyDirection } from '../bodyPlacement';
import { CORONA_RADII, SUN_SURFACE_BRIGHTNESS, type CoronaMaterial, type SunSurfaceMaterial } from '../sunAppearance';
import { phaseSeconds, releaseMotion, stillMotion } from '../../globe-engine/captureClock';
import * as Astronomy from 'astronomy-engine';

const AT = new Date('2026-10-07T06:00:00Z');
const sphereRadius = (mesh: THREE.Mesh | null) => (mesh?.geometry as THREE.SphereGeometry).parameters.radius;

describe('SolarSunManager', () => {
  let scene: THREE.Scene;
  let sun: SolarSunManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    sun = new SolarSunManager(scene);
  });

  afterEach(() => {
    sun.dispose();
  });

  describe('the body', () => {
    test('is built at its true size on the globe\'s scale: 10,920 units, 109 Earths', () => {
      expect(sphereRadius(sun.getSunMesh())).toBeCloseTo(drawnRadius(695_700), 6);
      expect(sphereRadius(sun.getSunMesh()) / 100).toBeCloseTo(109.2, 1);
      expect(sun.getCurrentState().currentRadius).toBeCloseTo(drawnRadius(695_700), 6);
    });

    test('adds the Sun, its corona and its flare to the scene, all hidden', () => {
      expect(scene.children.map((child) => child.name)).toEqual(['sun', 'sun-corona', 'sun-flare']);
      expect(scene.children.every((child) => !child.visible)).toBe(true);
      expect(sun.isVisible()).toBe(false);
    });

    test('adds no light: the globe\'s own rig lights the Earth', () => {
      expect(scene.children.some((child) => child instanceof THREE.Light)).toBe(false);
    });
  });

  describe('where it is drawn (SS1, SS4)', () => {
    test('sits exactly where the globe\'s light comes from, at its drawn distance', () => {
      sun.placeAt(AT);
      const position = sun.getSunMesh()!.position;
      expect(THREE.MathUtils.radToDeg(position.clone().normalize().angleTo(subsolarDirectionWorld(AT)))).toBeLessThan(1e-4);
      expect(position.length()).toBeCloseTo(drawnDistance(skyDirection(Astronomy.Body.Sun, AT).trueUnits), 3);
      expect(position.length() / 100).toBeGreaterThan(1170);
      expect(position.length() / 100).toBeLessThan(1210);
    });

    test('moves with the moment: six hours later the light, and the Sun, have turned a quarter round', () => {
      sun.placeAt(AT);
      const before = sun.getSunMesh()!.position.clone();
      sun.placeAt(new Date(AT.getTime() + 6 * 3_600_000));
      const after = sun.getSunMesh()!.position.clone();
      expect(THREE.MathUtils.radToDeg(before.angleTo(after))).toBeGreaterThan(80);
      expect(THREE.MathUtils.radToDeg(before.angleTo(after))).toBeLessThan(100);
    });

    test('reports where it is', () => {
      sun.placeAt(AT);
      expect(sun.getCurrentState().currentPosition.distanceTo(sun.getSunMesh()!.position)).toBe(0);
    });
  });

  describe('how much of it is drawn (SS3)', () => {
    test('draws nothing at 0, all of it at 1, and fades between', () => {
      sun.setShown(0);
      expect(sun.getSunMesh()!.visible).toBe(false);
      sun.setShown(0.4);
      expect(sun.getSunMesh()!.visible).toBe(true);
      expect((sun.getSunMesh()!.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.4, 6);
      sun.setShown(1);
      expect((sun.getSunMesh()!.material as THREE.MeshBasicMaterial).opacity).toBe(1);
    });

    test('reports when it starts and stops being drawn, and only then', () => {
      const changed = vi.fn();
      sun.onStateChange(changed);
      sun.setShown(0.2);
      sun.setShown(0.7);
      sun.setShown(0);
      expect(changed).toHaveBeenCalledTimes(2);
      expect(changed.mock.calls[0][0].isVisible).toBe(true);
      expect(changed.mock.calls[1][0].isVisible).toBe(false);
    });

    test('hands out a copy of its state, not its own', () => {
      sun.placeAt(AT);
      const state = sun.getCurrentState();
      state.currentPosition.set(0, 0, 0);
      state.isVisible = true;
      expect(sun.getCurrentState().currentPosition.length()).toBeGreaterThan(100_000);
      expect(sun.isVisible()).toBe(false);
    });
  });

  describe('how it looks (step 5)', () => {
    const corona = () => scene.getObjectByName('sun-corona') as THREE.Mesh<THREE.PlaneGeometry, CoronaMaterial>;
    const flare = () => scene.getObjectByName('sun-flare') as THREE.Mesh;
    const cameraAt = (distanceFromEarth: number) => {
      const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 3e6);
      camera.position.copy(sun.getCurrentState().currentPosition).normalize().multiplyScalar(-distanceFromEarth);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      return camera;
    };

    beforeEach(() => {
      sun.placeAt(AT);
      sun.setShown(1);
    });

    test('draws its surface brighter than white, so a bloom that takes only that takes the Sun', () => {
      const material = sun.getSunMesh()!.material as SunSurfaceMaterial;
      expect(material.uniforms.brightness.value).toBe(SUN_SURFACE_BRIGHTNESS);
      expect(SUN_SURFACE_BRIGHTNESS).toBeGreaterThan(1);
    });

    test('has a corona that faces the camera, four radii across from its centre, drawn after the surface', () => {
      expect(corona().visible).toBe(true);
      expect(corona().position.distanceTo(sun.getSunMesh()!.position)).toBe(0);
      expect(corona().material.uniforms.size.value).toBeCloseTo(drawnRadius(695_700) * CORONA_RADII, 6);
      expect(corona().frustumCulled).toBe(false);
      expect(corona().renderOrder).toBeGreaterThan(sun.getSunMesh()!.renderOrder);
    });

    test('fades the corona out as the camera comes to the surface', () => {
      const centre = sun.getCurrentState().currentPosition;
      const radius = sun.getCurrentState().currentRadius;
      sun.view(centre.clone().add(new THREE.Vector3(0, 0, radius * 5)));
      expect(corona().material.uniforms.opacity.value).toBe(1);
      sun.view(centre.clone().add(new THREE.Vector3(0, 0, radius * 1.1)));
      expect(corona().material.uniforms.opacity.value).toBe(0);
    });

    test('stands the flare just in front of the surface, toward the camera', () => {
      const camera = cameraAt(2_000);
      sun.view(camera.position, camera, 900);
      const centre = sun.getCurrentState().currentPosition;
      const lift = flare().position.clone().sub(centre);
      expect(lift.length() / sun.getCurrentState().currentRadius).toBeCloseTo(1.02, 6);
      expect(lift.normalize().dot(camera.position.clone().sub(centre).normalize())).toBeCloseTo(1, 9);
    });

    test('makes the flare as strong as the disc is large: full near the Earth, none from the farthest reach', () => {
      const strengthAt = (distance: number) => {
        const camera = cameraAt(distance);
        sun.view(camera.position, camera, 900);
        return sun.getFlareStrength();
      };
      expect(strengthAt(2_000)).toBeGreaterThan(0.9);
      expect(strengthAt(1_700_000)).toBeLessThan(0.01);
    });

    test('holds its surface and corona still for a capture, at the phase of its moment', () => {
      const still = Date.UTC(2026, 9, 7, 12, 0, 0);
      stillMotion(still);
      sun.view(new THREE.Vector3(0, 0, 5000));
      releaseMotion();
      expect((sun.getSunMesh()!.material as SunSurfaceMaterial).uniforms.time.value).toBe(phaseSeconds(still));
      expect(corona().material.uniforms.time.value).toBe(phaseSeconds(still));
    });
  });

  describe('lifecycle', () => {
    test('removes everything it added, once', () => {
      sun.dispose();
      expect(scene.children).toHaveLength(0);
      expect(() => sun.dispose()).not.toThrow();
      expect(() => { sun.placeAt(AT); sun.setShown(1); }).not.toThrow();
    });
  });
});
