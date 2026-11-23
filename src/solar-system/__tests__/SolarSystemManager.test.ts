/**
 * The solar system drawn round the globe (decision K6; record
 * docs/missions/01-architecture-decisions/solar-system.md): one render at a time, it
 * draws none of itself while the Earth's marks are whole, fades in as they go, and
 * places every body for the moment shown before drawing it. It replaced four scale
 * tiers that switched what was drawn by the camera's distance.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { SolarSystemManager, type SolarSystemState } from '../SolarSystemManager';
import { placeInSky, sunInSky } from '../bodyPlacement';

const AT = Date.UTC(2026, 9, 7, 6, 0, 0);
const DEFAULT_VIEW = new THREE.Vector3(0, 0, 350);
const FAR_OUT = new THREE.Vector3(0, 0, 400_000);

const build = () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(DEFAULT_VIEW);
  const manager = new SolarSystemManager(
    { scene, camera, globe: { scene: () => scene, camera: () => camera } },
    { enableSolarActivityIntegration: false },
  );
  return { scene, manager };
};
const meshNamed = (scene: THREE.Scene, name: string) => scene.getObjectByName(name) as THREE.Mesh;
const drawn = (scene: THREE.Scene) => {
  const names: string[] = [];
  scene.traverseVisible((object) => { if (object.name && object !== scene) names.push(object.name); });
  return names;
};

describe('SolarSystemManager', () => {
  let scene: THREE.Scene;
  let manager: SolarSystemManager;

  beforeEach(() => {
    ({ scene, manager } = build());
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('setup', () => {
    test('builds the Sun, seven planets and the Moon, none of them drawn', () => {
      expect(manager.isInitialized()).toBe(true);
      for (const name of ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon']) {
        expect(meshNamed(scene, name)).toBeInstanceOf(THREE.Mesh);
      }
      expect(drawn(scene)).toEqual([]);
      expect(manager.getShown()).toBe(0);
    });

    test('refuses to start without a scene, a camera and a globe', () => {
      expect(() => new SolarSystemManager({ scene: null, camera: null, globe: null } as never)).toThrow();
    });

    test('keeps the configuration it was given', () => {
      expect(manager.getConfig()).toMatchObject({ performanceMode: 'balanced', enableSolarActivityIntegration: false });
    });
  });

  describe('how much is drawn (SS3)', () => {
    test('draws nothing while the Earth\'s marks are whole, and does no work for it', () => {
      const place = vi.spyOn(manager, 'placeAt');
      for (let i = 0; i < 5; i++) manager.frame({ eye: DEFAULT_VIEW, shown: 0, atMs: AT + i * 2000 });
      expect(drawn(scene)).toEqual([]);
      expect(place).not.toHaveBeenCalled();
    });

    test('draws every body once shown, faded by how much', () => {
      manager.frame({ eye: FAR_OUT, shown: 0.5, atMs: AT });
      expect(drawn(scene)).toEqual(expect.arrayContaining(['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon']));
      expect((meshNamed(scene, 'jupiter').material as THREE.Material).opacity).toBeCloseTo(0.5, 6);
      expect((meshNamed(scene, 'sun').material as THREE.Material).opacity).toBeCloseTo(0.5, 6);
      expect(manager.getShown()).toBeCloseTo(0.5, 6);
    });

    test('hides it all again as the camera comes back in', () => {
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT });
      manager.frame({ eye: DEFAULT_VIEW, shown: 0, atMs: AT });
      expect(drawn(scene)).toEqual([]);
    });

    test('tells subscribers when the Sun starts and stops being drawn', () => {
      const states: SolarSystemState[] = [];
      manager.onStateChange((state) => states.push(state));
      expect(states).toHaveLength(1); // the current state, at once
      manager.frame({ eye: FAR_OUT, shown: 0.3, atMs: AT });
      manager.frame({ eye: FAR_OUT, shown: 0.9, atMs: AT });
      manager.frame({ eye: DEFAULT_VIEW, shown: 0, atMs: AT });
      expect(states.map((state) => state.sunState?.isVisible)).toEqual([false, true, false]);
      expect(states[1].cameraDistance).toBeCloseTo(400_000, 3);
      expect(states[1].planetaryInfo?.visiblePlanets).toBe(7);
    });
  });

  describe('when it is drawn for (SS4)', () => {
    test('places every body for the moment before drawing it', () => {
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT });
      const at = new Date(AT);
      expect(meshNamed(scene, 'sun').position.distanceTo(sunInSky(at))).toBeLessThan(1e-6);
      expect(meshNamed(scene, 'mars').position.distanceTo(placeInSky(Astronomy.Body.Mars, at))).toBeLessThan(1e-6);
      expect(meshNamed(scene, 'moon').position.distanceTo(placeInSky(Astronomy.Body.Moon, at))).toBeLessThan(1e-6);
    });

    test('holds a moment still: the same moment is not placed twice', () => {
      const place = vi.spyOn(manager, 'placeAt');
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT });
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT });
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT + 400 });
      expect(place).toHaveBeenCalledTimes(1);
    });

    test('moves on with a live moment once a second, and at once to a moment chosen on the timeline', () => {
      const place = vi.spyOn(manager, 'placeAt');
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT });
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT + 1000 });
      manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT - 6 * 3_600_000 });
      expect(place.mock.calls.map(([at]) => at.getTime())).toEqual([AT, AT + 1000, AT - 6 * 3_600_000]);
      expect(meshNamed(scene, 'sun').position.distanceTo(sunInSky(new Date(AT - 6 * 3_600_000)))).toBeLessThan(1e-6);
    });
  });

  describe('orbit lines', () => {
    const line = (color: number) => scene.children.find(
      (child) => child instanceof THREE.Line && (child.material as THREE.LineBasicMaterial).color.getHex() === color,
    ) as THREE.Line;

    test('draw the Moon\'s once the camera is out past it, and Neptune\'s only from far beyond', () => {
      manager.frame({ eye: new THREE.Vector3(0, 0, 20_000), shown: 1, atMs: AT });
      expect(line(0xb0b5bb).visible).toBe(true); // the Moon's
      expect(line(0x5b5ddf).visible).toBe(false); // Neptune's
      // At one scale (C32) Neptune is up to 3.7 million units out: its line shows from half that, all of it at twice.
      manager.frame({ eye: new THREE.Vector3(0, 0, 1_600_000), shown: 1, atMs: AT });
      expect(line(0x5b5ddf).visible).toBe(false);
      manager.frame({ eye: new THREE.Vector3(0, 0, 8_000_000), shown: 1, atMs: AT });
      expect(line(0x5b5ddf).visible).toBe(true);
    });
  });

  describe('markers and names (step 4)', () => {
    const farCamera = (distance = 8_000_000) => {
      const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 1.3e7);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      return camera;
    };
    const viewport = new THREE.Vector2(1400, 900);

    test('marks and names the bodies too small to see, the Earth among them, when it is shown', () => {
      const camera = farCamera();
      manager.frame({ eye: camera.position, shown: 1, atMs: AT, camera, viewport });
      for (const id of ['neptune', 'uranus', 'saturn', 'jupiter', 'sun', 'earth']) {
        expect(manager.isLabelDrawn(id, 'marker')).toBe(true);
      }
      expect(manager.isLabelDrawn('neptune', 'name')).toBe(true);
      // From the farthest reach, at one scale (C32), the inner system is a few dozen pixels across and the Sun's name
      // keeps its place over the Earth's; backed out less far, the Earth is named too.
      const nearer = farCamera(2_500_000);
      manager.frame({ eye: nearer.position, shown: 1, atMs: AT, camera: nearer, viewport });
      expect(manager.isLabelDrawn('earth', 'marker')).toBe(true);
      expect(manager.isLabelDrawn('earth', 'name')).toBe(true);
    });

    test('points to the Sun from a daytime view, where it is behind the camera (SS5)', () => {
      manager.placeAt(new Date(AT));
      const sunDirection = (scene.getObjectByName('sun') as THREE.Mesh).position.clone().normalize();
      const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 3e6);
      camera.position.copy(sunDirection).multiplyScalar(20_000);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      manager.frame({ eye: camera.position, shown: 1, atMs: AT, camera, viewport });
      expect(manager.isLabelDrawn('sun', 'pointer')).toBe(true);
      expect(manager.isLabelDrawn('sun', 'marker')).toBe(false);
    });

    test('takes them away with the solar system', () => {
      const camera = farCamera();
      manager.frame({ eye: camera.position, shown: 1, atMs: AT, camera, viewport });
      manager.frame({ eye: DEFAULT_VIEW, shown: 0, atMs: AT, camera, viewport });
      expect(manager.isLabelDrawn('neptune', 'marker')).toBe(false);
      expect(manager.isLabelDrawn('earth', 'name')).toBe(false);
    });
  });

  describe('lifecycle', () => {
    test('removes everything it added, and ignores frames after', () => {
      manager.dispose();
      expect(scene.children).toHaveLength(0);
      expect(manager.isInitialized()).toBe(false);
      expect(() => manager.frame({ eye: FAR_OUT, shown: 1, atMs: AT })).not.toThrow();
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
