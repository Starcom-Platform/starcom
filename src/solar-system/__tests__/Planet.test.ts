import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { Planet } from '../components/Planet';
import { getHeliocentricDistanceAU } from '../EphemerisService';
import { bodyTurn, drawnRadius, placeInSky, sunDirectionFrom } from '../bodyPlacement';
import type { SunlitMaterial } from '../sunlitMaterial';
import type { PlanetInstance } from '../types/PlanetaryTypes';

const marsData: PlanetInstance = {
  name: 'mars',
  radius: 3389.5,
  orbitRadius: 1.524,
  orbitPeriod: 686.98,
  color: 0xcd5c5c,
  hasAtmosphere: true
};

describe('Planet', () => {
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = new THREE.Scene();
  });

  test('throws for a planet name with no matching astronomy-engine body', () => {
    expect(() => new Planet(scene, { ...marsData, name: 'pluto' })).toThrow();
  });

  test('positions itself at its real current geocentric location on construction', () => {
    // Regression guard: originally nothing ever called updateOrbitalPosition in
    // production, so every planet mesh sat at the scene origin forever.
    const planet = new Planet(scene, marsData);
    const position = planet.getPosition();
    expect(position.length()).toBeGreaterThan(1000);
    planet.dispose();
  });

  test('is placed where it is in the Earth\'s sky for the moment, at its drawn distance (K6)', () => {
    const planet = new Planet(scene, marsData);
    const date = new Date('2025-06-01T00:00:00Z');
    planet.updateOrbitalPosition(date);
    expect(planet.getPosition().distanceTo(placeInSky(Astronomy.Body.Mars, date))).toBeLessThan(1e-6);
    planet.dispose();
  });

  test('is built at its true size on the globe\'s scale: Mars is about half the Earth', () => {
    const planet = new Planet(scene, marsData);
    const mesh = scene.getObjectByName('mars') as THREE.Mesh;
    expect((mesh.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(drawnRadius(3389.5), 6);
    expect((mesh.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(53.2, 1);
    planet.dispose();
  });

  describe('lit and turned (K6, step 3)', () => {
    test('is lit from where the Sun is seen from it, not from the Earth\'s light', () => {
      const planet = new Planet(scene, marsData);
      const date = new Date('2026-01-16T00:00:00Z');
      planet.updateOrbitalPosition(date);
      const material = (scene.getObjectByName('mars') as THREE.Mesh).material as SunlitMaterial;
      expect(material.uniforms.sunDirection.value.distanceTo(sunDirectionFrom(Astronomy.Body.Mars, date))).toBeLessThan(1e-9);
      planet.dispose();
    });

    test('is turned on its own axis', () => {
      const planet = new Planet(scene, marsData);
      const date = new Date('2026-01-16T00:00:00Z');
      planet.updateOrbitalPosition(date);
      const mesh = scene.getObjectByName('mars') as THREE.Mesh;
      // The same turn: their dot product is 1 (or -1), closer than an angle could resolve.
      expect(1 - Math.abs(mesh.quaternion.dot(bodyTurn(Astronomy.Body.Mars, date)))).toBeLessThan(1e-12);
      planet.dispose();
    });
  });

  describe('its orbit line', () => {
    const orbitLine = () => scene.children.find((c) => c instanceof THREE.Line) as THREE.Line;
    const distanceToLine = (point: THREE.Vector3, line: THREE.Line) => {
      const positions = line.geometry.getAttribute('position');
      const segment = new THREE.Line3();
      const closest = new THREE.Vector3();
      let nearest = Infinity;
      for (let i = 0; i + 1 < positions.count; i++) {
        segment.set(new THREE.Vector3().fromBufferAttribute(positions, i), new THREE.Vector3().fromBufferAttribute(positions, i + 1));
        nearest = Math.min(nearest, segment.closestPointToPoint(point, true, closest).distanceTo(point));
      }
      return nearest;
    };

    test('passes through the planet, at any moment: the line and the planet are drawn by one rule', () => {
      const planet = new Planet(scene, marsData);
      for (const iso of ['2025-06-01T00:00:00Z', '2026-01-16T00:00:00Z', '2027-02-22T12:00:00Z']) {
        planet.updateOrbitalPosition(new Date(iso));
        const position = planet.getPosition();
        expect(distanceToLine(position, orbitLine()) / position.length()).toBeLessThan(0.002);
      }
      planet.dispose();
    });

    test('reaches as far from the Earth as the planet ever is drawn', () => {
      const planet = new Planet(scene, marsData);
      planet.updateOrbitalPosition(new Date('2026-01-16T00:00:00Z'));
      const farthest = Math.max(...Array.from({ length: orbitLine().geometry.getAttribute('position').count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(orbitLine().geometry.getAttribute('position'), i).length()));
      expect(planet.getOrbitReach()).toBeCloseTo(farthest, 0);
      expect(planet.getOrbitReach()).toBeGreaterThan(planet.getPosition().length());
      planet.dispose();
    });

    test('is drawn by how much it is shown', () => {
      const planet = new Planet(scene, marsData);
      planet.setOrbitShown(0);
      expect(planet.isOrbitalPathVisible()).toBe(false);
      planet.setOrbitShown(0.5);
      expect(planet.isOrbitalPathVisible()).toBe(true);
      expect((orbitLine().material as THREE.LineBasicMaterial).opacity).toBeCloseTo(0.15, 6);
      planet.dispose();
    });
  });

  test('reports real heliocentric distanceFromSun, not geocentric distance', () => {
    const planet = new Planet(scene, marsData);
    const date = new Date('2025-06-01T00:00:00Z');
    planet.updateOrbitalPosition(date);

    const state = planet.getCurrentState();
    const expectedHelio = getHeliocentricDistanceAU(Astronomy.Body.Mars, date);
    expect(state.distanceFromSun).toBeCloseTo(expectedHelio, 6);
    // Sanity: Mars' real heliocentric distance range (~1.38-1.67 AU)
    expect(state.distanceFromSun).toBeGreaterThan(1.3);
    expect(state.distanceFromSun).toBeLessThan(1.7);
    planet.dispose();
  });

  test('position changes as time advances (real orbital motion)', () => {
    const planet = new Planet(scene, marsData);
    const t1 = new Date('2025-06-01T00:00:00Z');
    const t2 = new Date('2025-09-01T00:00:00Z');

    planet.updateOrbitalPosition(t1);
    const pos1 = planet.getPosition();
    planet.updateOrbitalPosition(t2);
    const pos2 = planet.getPosition();

    expect(pos1.distanceTo(pos2)).toBeGreaterThan(0);
    planet.dispose();
  });

  test('setShown draws it, its atmosphere with it, faded by how much', () => {
    const planet = new Planet(scene, marsData);
    expect(planet.isVisible()).toBe(false);

    planet.setShown(0.25);
    expect(planet.isVisible()).toBe(true);
    const mesh = scene.getObjectByName('mars') as THREE.Mesh;
    expect((mesh.material as THREE.Material).opacity).toBeCloseTo(0.25, 6);
    const atmosphere = mesh.parent!.children.find((c) => c !== mesh) as THREE.Mesh;
    expect(atmosphere.visible).toBe(true);
    expect((atmosphere.material as THREE.Material).opacity).toBeCloseTo(0.05, 6);

    planet.setShown(0);
    expect(planet.isVisible()).toBe(false);
    expect(atmosphere.visible).toBe(false);
    planet.dispose();
  });

  test('a planet with no atmosphere never creates an atmosphere mesh', () => {
    const mercuryData: PlanetInstance = {
      name: 'mercury',
      radius: 2439.7,
      orbitRadius: 0.387,
      orbitPeriod: 87.97,
      color: 0x8c7853,
      hasAtmosphere: false
    };
    const childCountBefore = scene.children.length;
    const planet = new Planet(scene, mercuryData);
    planet.setShown(1);

    // orbitalGroup (mesh only, no atmosphere) + orbital path line
    const added = scene.children.length - childCountBefore;
    expect(added).toBe(2);
    planet.dispose();
  });

  test('dispose removes the planet and its orbital path from the scene', () => {
    const childCountBefore = scene.children.length;
    const planet = new Planet(scene, marsData);
    expect(scene.children.length).toBeGreaterThan(childCountBefore);

    planet.dispose();
    expect(scene.children.length).toBe(childCountBefore);
  });

  test('dispose is idempotent', () => {
    const planet = new Planet(scene, marsData);
    expect(() => {
      planet.dispose();
      planet.dispose();
    }).not.toThrow();
  });

  describe('textures', () => {
    /*
     * Fetched on approach, not at construction.
     *
     * Every planet used to fetch its texture the moment it was built, and the
     * solar system is built on 7 of the 11 layers — so 3.4 MB of planet
     * imagery (4.03 MB with the Moon) downloaded at globe altitude, where
     * PlanetarySystemManager shows no planet at all. Measured server-side on
     * 2026-09-25. The project-wide TextureLoader mock (src/setupVitest.ts)
     * calls onLoad synchronously, so a load is observable at once.
     */
    const marsMap = () => ((scene.getObjectByName('mars') as THREE.Mesh).material as SunlitMaterial).uniforms.map.value;

    test('fetches nothing when it is built', () => {
      const planet = new Planet(scene, marsData);
      expect(marsMap()).toBeFalsy();
      planet.dispose();
    });

    test('fetches its real texture when asked to prefetch (Mars)', () => {
      const planet = new Planet(scene, marsData);
      planet.prefetchTextures();
      expect((marsMap() as unknown as { image: { src: string } }).image.src)
        .toContain('/assets/textures/planets/mars.jpg');
      planet.dispose();
    });

    test('fetches it when shown, if nothing prefetched it', () => {
      // A safety net: a planet must never be seen without its texture because
      // the prefetch was skipped.
      const planet = new Planet(scene, marsData);
      planet.setShown(0.1);
      expect(marsMap()).toBeTruthy();
      planet.dispose();
    });

    test('fetches once, however often it is asked', () => {
      const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
      const planet = new Planet(scene, marsData);
      planet.prefetchTextures();
      planet.prefetchTextures();
      planet.setShown(1);
      expect(load.mock.calls.filter(([url]) => String(url).includes('mars.jpg'))).toHaveLength(1);
      load.mockRestore();
      planet.dispose();
    });
  });

  describe('rings', () => {
    const saturnData: PlanetInstance = {
      name: 'saturn',
      radius: 58232,
      orbitRadius: 9.537,
      orbitPeriod: 10759.22,
      color: 0xead6b8,
      hasAtmosphere: true,
      hasRings: true
    };

    test('a planet with hasRings creates a rings mesh; one without does not', () => {
      const saturn = new Planet(scene, saturnData);
      expect(saturn.hasRings()).toBe(true);
      saturn.dispose();

      const mars = new Planet(scene, marsData);
      expect(mars.hasRings()).toBe(false);
      mars.dispose();
    });

    test('rings lie in Saturn\'s own equator, not the Earth\'s', () => {
      const saturn = new Planet(scene, saturnData);
      const date = new Date('2026-01-16T00:00:00Z');
      saturn.updateOrbitalPosition(date);
      const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
      const rings = group.children.find((c) => c instanceof THREE.Mesh && c.geometry.type === 'RingGeometry') as THREE.Mesh;
      const ringNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(rings.quaternion);
      const saturnNorth = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyTurn(Astronomy.Body.Saturn, date));
      expect(Math.abs(ringNormal.dot(saturnNorth))).toBeCloseTo(1, 9);
      // Saturn's equator is 6.5 degrees from the Earth's.
      expect(THREE.MathUtils.radToDeg(Math.acos(Math.abs(ringNormal.y)))).toBeGreaterThan(5);
      saturn.dispose();
    });

    test('rings are drawn with the planet', () => {
      const saturn = new Planet(scene, saturnData);
      const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
      const ringsMesh = group.children.find(
        (c) => c instanceof THREE.Mesh && c.geometry.type === 'RingGeometry'
      ) as THREE.Mesh | undefined;
      expect(ringsMesh).toBeDefined();
      expect(ringsMesh!.visible).toBe(false);

      saturn.setShown(1);
      expect(ringsMesh!.visible).toBe(true);

      saturn.setShown(0);
      expect(ringsMesh!.visible).toBe(false);
      saturn.dispose();
    });

    test('ring geometry UVs are remapped radially, not left as the default angular mapping', () => {
      // Regression guard: RingGeometry's default UVs run angularly around the
      // circumference. If createRings() ever stopped remapping U to radial distance,
      // every vertex would keep whatever U the constructor assigned, and points at
      // the same angle but different radii would end up with the SAME (or a
      // near-constant) U instead of visibly different ones.
      const saturn = new Planet(scene, saturnData);
      const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
      const ringsMesh = group.children.find(
        (c) => c instanceof THREE.Mesh && c.geometry.type === 'RingGeometry'
      ) as THREE.Mesh;
      const uv = ringsMesh.geometry.attributes.uv;
      const us = new Set<number>();
      for (let i = 0; i < uv.count; i++) {
        us.add(Math.round(uv.getX(i) * 1000) / 1000);
      }
      // A radial mapping produces many distinct U values (one per ring "row"); an
      // angular mapping left unmodified would produce values that don't track radius.
      expect(us.size).toBeGreaterThan(1);
      expect(Math.min(...us)).toBeCloseTo(0, 2);
      expect(Math.max(...us)).toBeCloseTo(1, 2);
      saturn.dispose();
    });
  });
});
