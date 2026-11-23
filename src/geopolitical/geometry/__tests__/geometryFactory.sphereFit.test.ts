/**
 * Every fill built at runtime stays above the globe (C26, decision D-GV GV0.1).
 *
 * Only the bake's country fills were fitted to the sphere. War & Conflict, lit countries, Hero Watch, Spheres,
 * Organisations, Zones and GDACS built theirs here, as flat chords between corners on the sphere, and on LOD0
 * Canada's interior sagged 3.86 units below a 0.5 lift: 24 countries reached under the globe and its clouds.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GeometryFactory, type PolygonFeature } from '../geometryFactory';
import { maxTriangleSag } from '../sphereFitSubdivision';

const RADIUS = 100;

/** A rectangle of the given size in degrees, its outline every `step` degrees, as a country's border is dense. */
function rectangle(id: string, west: number, south: number, east: number, north: number, step = 1): PolygonFeature {
  const ring: [number, number][] = [];
  for (let x = west; x < east; x += step) ring.push([x, south]);
  for (let y = south; y < north; y += step) ring.push([east, y]);
  for (let x = east; x > west; x -= step) ring.push([x, north]);
  for (let y = north; y > south; y -= step) ring.push([west, y]);
  ring.push([west, south]);
  return { id, rings: [ring] };
}

function meshesOf(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

function deepestSag(group: THREE.Group, lift: number): number {
  let worst = 0;
  for (const mesh of meshesOf(group)) {
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const indices = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
    worst = Math.max(worst, maxTriangleSag(pos.array as ArrayLike<number>, indices, RADIUS + lift));
  }
  return worst;
}

describe('runtime fills fitted to the sphere', () => {
  // The lifts the callers use: the fills between the clouds and the surface lines (0.5), and GDACS (0.25).
  for (const lift of [0.5, 0.25]) {
    it(`keeps a continent-sized fill's interior within a sixth of a ${lift} lift`, () => {
      const group = GeometryFactory.buildTerritoryPolygons([rectangle(`big-${lift}`, -120, 30, -70, 60)], { radius: RADIUS, elevation: lift });
      // An eighth of the lift per edge, and an interior can sag 4/3 of an edge: at most a sixth of the lift.
      expect(deepestSag(group, lift)).toBeLessThanOrEqual(lift / 6 + 1e-9);
      expect(deepestSag(group, lift)).toBeGreaterThan(0);
    });
  }

  it('puts every new point on the fill\'s sphere, the globe plus its lift', () => {
    const group = GeometryFactory.buildTerritoryPolygons([rectangle('sphere', -60, -20, -30, 10)], { radius: RADIUS, elevation: 0.5 });
    const pos = meshesOf(group)[0].geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))).toBeCloseTo(RADIUS + 0.5, 5); // positions are 32-bit floats
    }
  });

  it('adds points only where a fill needs them', () => {
    // A ring's collinear points are dropped before triangulating, so each square starts as its four corners.
    const small = GeometryFactory.buildTerritoryPolygons([rectangle('small', 10, 45, 10.4, 45.4, 0.1)], { radius: RADIUS, elevation: 0.5 });
    const big = GeometryFactory.buildTerritoryPolygons([rectangle('large', 10, 45, 40, 65, 0.1)], { radius: RADIUS, elevation: 0.5 });
    const vertices = (g: THREE.Group) => meshesOf(g)[0].geometry.getAttribute('position').count;
    // A 0.4° square sags far less than the tolerance, so it keeps its corners.
    expect(vertices(small)).toBe(4);
    expect(vertices(big)).toBeGreaterThan(40);
  });

  it('leaves an extruded fill to its own builder', () => {
    const group = GeometryFactory.buildTerritoryPolygons([rectangle('thick', -120, 30, -70, 60)], { radius: RADIUS, elevation: 0.5, thickness: 2 });
    expect(meshesOf(group).length).toBeGreaterThan(0);
  });
});
