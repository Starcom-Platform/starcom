/**
 * The Spheres layer's drawing, on the areas as baked (areas-lod0): every Sphere
 * filled in a colour of its own, and the pointer naming every Sphere it is over.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CYAN } from '../../../styles/tokens';
import { areaShapesFrom } from '../../../features/globe/areas/areaShapes';
import { AREAS } from '../../../features/globe/areas/areaRegistry';
import { coloredSpheres, sphereColor } from '../../theme/sphereTheme';
import { buildSphereGroup, sphereCodes, spheresLegend, spheresUnderRay } from '../useSpheres3D';

const ROOT = resolve(__dirname, '../../../..');
const shapes = areaShapesFrom(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/areas-lod0.geojson'), 'utf8')));
const hue = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).h * 360;
const apart = (a: number, b: number) => { const d = Math.abs(hue(a) - hue(b)) % 360; return Math.min(d, 360 - d); };

describe('the Spheres and their colours', () => {
  const spheres = AREAS.filter((a) => a.kind === 'sphere');

  it('colours every Sphere the areas define, each its own', () => {
    expect(new Set(coloredSpheres())).toEqual(new Set(spheres.map((s) => s.code)));
    expect(new Set(spheres.map((s) => sphereColor(s.code))).size).toBe(spheres.length);
  });

  it('none is the app\'s cyan', () => {
    const cyan = parseInt(CYAN[400].slice(1), 16);
    for (const s of spheres) expect(apart(sphereColor(s.code), cyan), s.code).toBeGreaterThan(20);
  });

  it('Spheres that share a state, or border each other, stand at least 25° apart', () => {
    const members = new Map(spheres.map((s) => [s.code, new Set(s.from === 'members' ? s.members : [])]));
    const pairs: Array<[string, string]> = [];
    for (const a of spheres) for (const b of spheres) {
      if (a.code < b.code && [...members.get(a.code)!].some((m) => members.get(b.code)!.has(m))) pairs.push([a.code, b.code]);
    }
    pairs.push(
      ['sphere:russophone', 'sphere:nordic'], ['sphere:russophone', 'sphere:sinosphere'], ['sphere:germanosphere', 'sphere:nordic'],
      ['sphere:arabophone', 'sphere:persianate'], ['sphere:turkic', 'sphere:persianate'], ['sphere:turkic', 'sphere:arabophone'],
      ['sphere:swahili', 'sphere:arabophone'], ['sphere:anglosphere', 'sphere:hispanosphere'], ['sphere:malay', 'sphere:lusosphere'],
    );
    expect(pairs.length).toBeGreaterThan(10);
    for (const [a, b] of pairs) expect(apart(sphereColor(a), sphereColor(b)), `${a} / ${b}`).toBeGreaterThanOrEqual(25);
  });
});

describe('buildSphereGroup', () => {
  const group = buildSphereGroup(shapes);
  group.updateMatrixWorld(true);
  const fills = group.children.filter((c) => typeof c.userData.sphereCode === 'string');

  it('fills every Sphere, and draws its edge', () => {
    expect(new Set(fills.map((f) => f.userData.sphereCode))).toEqual(new Set(sphereCodes()));
    expect(group.children.some((c) => c.userData.sphereCode === undefined)).toBe(true);
  });

  it('the key names every Sphere drawn', () => {
    expect(spheresLegend(shapes).swatches.map((s) => s.label)).toContain('Russophone world');
    expect(spheresLegend(shapes).swatches).toHaveLength(sphereCodes().length);
  });

  /** A ray at a surface point, from outside the Earth on `side`: 1 the near side, -1 through the Earth from the far. */
  const rayOver = (lat: number, lon: number, side: 1 | -1) => {
    // The globe mesh's frame, as GeometryFactory builds the fills (lat/lon to xyz, z flipped).
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const p = new THREE.Vector3(-100 * Math.sin(phi) * Math.cos(theta), 100 * Math.cos(phi), 100 * Math.sin(phi) * Math.sin(theta));
    const ray = new THREE.Raycaster();
    ray.set(p.clone().multiplyScalar(3 * side), p.clone().multiplyScalar(-side).normalize());
    return ray;
  };

  it('names every Sphere under the pointer, the most specific first, and nothing through the Earth', () => {
    // Find a surface point inside Canada by asking the fills themselves: try a few, keep one both Spheres cover.
    const candidates: Array<[number, number]> = [[50, -75], [52, -70], [48, -77]];
    let found: string[] = [];
    let at: [number, number] | null = null;
    for (const [lat, lon] of candidates) {
      const codes = spheresUnderRay(rayOver(lat, lon, 1), fills, 100);
      if (codes.includes('sphere:anglosphere') && codes.includes('sphere:francophonie')) { found = codes; at = [lat, lon]; break; }
    }
    expect(found.slice(0, 2)).toEqual(['sphere:anglosphere', 'sphere:francophonie']);
    // The same point seen through the Earth: its fills are there to hit, and must not be named.
    const through = rayOver(at![0], at![1], -1);
    expect(through.intersectObjects(fills, false).length).toBeGreaterThan(0);
    expect(spheresUnderRay(through, fills, 100)).toEqual([]);
  });
});
