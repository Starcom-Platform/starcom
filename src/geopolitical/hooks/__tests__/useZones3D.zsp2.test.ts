/**
 * The Zones layer's drawing under ZSP 2.0 (decision D-ZR), on the whole-globe test partition: each Sector in its
 * shade, each Terra's and Mare's own edge drawn heaviest, and a key that names the containers.
 *
 * At full scale, about 2,600 Sectors, a mesh and a material each was a draw each: measured on 18 October, 3,184
 * objects, and the globe about seven times slower with Zones on. So a 2.0 partition's fills are one mesh per Terra
 * or Mare, each Sector a part of it, lit by a texel of its own, as the country fills are; and its lines are batched
 * across the whole partition by look, so the draws do not grow with the Sectors.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { partitionFills } from '../../theme/partitionTheme';
import { swatchCss } from '../../theme/zoneTheme';
import { indexFrom } from '../../zones/zsp';
import { gridPartition, testPartition } from '../../zones/__tests__/testPartition';
import { buildZoneGroup, buildZoneGroupInSteps, partitionTargets, placesUnderRay, zoneLines, zonesLegend } from '../useZones3D';
import { box } from '../../zones/__tests__/testPartition';
import { territoryBatchData, createPartMotion } from '../../geometry/territoryBatch';
import { lineBatchData } from '../../geometry/lineBatches';
import type { ZspZone } from '../../zones/zsp';

const { manifest, files } = testPartition();
const index = indexFrom(manifest, Object.values(files).map((t) => JSON.parse(t)));
const batchesOf = (group: THREE.Group) => group.children.filter((c): c is THREE.Mesh => territoryBatchData(c) !== null);
const linesOf = (group: THREE.Group) => group.children.filter((c) => lineBatchData(c) !== null);

/** A grid partition as the files are read; its Sectors small enough to triangulate as real ones do. */
const gridIndex = (zoneDegrees: number, sectorDegrees: number, every = 10) => {
  const grid = gridPartition(zoneDegrees, sectorDegrees, every);
  return indexFrom(grid.manifest, Object.values(grid.files).map((t) => JSON.parse(t)));
};

describe('buildZoneGroup, ZSP 2.0', () => {
  const big = gridIndex(45, 15);
  const group = buildZoneGroup(big);
  const batches = batchesOf(group);

  it('fills every Sector as a part of one mesh per Terra or Mare, each in the shade the partition gives it', () => {
    expect(batches).toHaveLength(2);
    const shades = partitionFills(big).sectors;
    const parts = batches.flatMap((mesh) => territoryBatchData(mesh)!.parts.map((part) => ({ mesh, part })));
    expect(new Set(parts.map(({ part }) => part.id))).toEqual(new Set(big.zones.flatMap((z) => z.sectors.map((s) => s.id))));
    for (const { mesh, part } of parts) {
      const colour = mesh.geometry.getAttribute('aBaseColor');
      const at = part.vertexStart;
      expect(new THREE.Color(colour.getX(at), colour.getY(at), colour.getZ(at)).getHex()).toBe(new THREE.Color(shades.get(part.id)!).getHex());
    }
    // No Sector is a mesh of its own any more.
    expect(group.children.some((c) => typeof c.userData.zspId === 'string')).toBe(false);
  });

  it('draws as few objects for 288 Sectors as for 72', () => {
    const small = gridIndex(90, 30);
    expect(small.zones.flatMap((z) => z.sectors)).toHaveLength(72);
    expect(big.zones.flatMap((z) => z.sectors)).toHaveLength(288);
    expect(buildZoneGroup(small).children.length).toBe(group.children.length);
    expect(linesOf(group).length).toBeLessThanOrEqual(4);
  });

  it('names the Sector under a ray through the part it strikes', () => {
    // Straight down onto 20°N, 20°E, inside the Sector from 15° to 30° in each.
    const lat = (20 * Math.PI) / 180;
    const lon = (20 * Math.PI) / 180;
    let id: string | undefined;
    for (const sign of [1, -1]) {
      const at = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), sign * Math.cos(lat) * Math.sin(lon)).multiplyScalar(100);
      const ray = new THREE.Raycaster(at.clone().multiplyScalar(3), at.clone().negate().normalize());
      id = id ?? placesUnderRay(ray, batches, 100)[0];
    }
    // 15°–30°E, 15°–30°N; or its mirror at 30°–15°W, as the globe turns its x axis.
    expect(['zone:borea-180/sector:195-105', 'zone:borea-135/sector:150-105']).toContain(id);
  });

  it('is built a Terra or Mare at a time, the page given time between, to the same drawing', async () => {
    let pauses = 0;
    const stepped = await buildZoneGroupInSteps(big, {}, async () => { pauses += 1; });
    expect(pauses).toBeGreaterThanOrEqual(2);
    expect(stepped.children.map((c) => c.name)).toEqual(group.children.map((c) => c.name));
    expect(batchesOf(stepped).map((m) => territoryBatchData(m)!.parts.length)).toEqual(batches.map((m) => territoryBatchData(m)!.parts.length));
  });

  it('draws its Sector lines simpler when the globe steps detail down; its edges and fills as they were', () => {
    const dense = gridIndex(90, 30, 0.5);
    const segments = (g: THREE.Group) => linesOf(g).map((c) => lineBatchData(c)!.lines.reduce((n, l) => n + l.count, 0));
    const full = buildZoneGroup(dense);
    const simple = buildZoneGroup(dense, { simpleSectorLines: true });
    const [fullSectors, fullEdges, fullContainers] = segments(full);
    const [simpleSectors, simpleEdges, simpleContainers] = segments(simple);
    expect(simpleSectors).toBeLessThan(fullSectors / 1.5);
    expect([simpleEdges, simpleContainers]).toEqual([fullEdges, fullContainers]);
    expect(batchesOf(simple).map((m) => m.geometry.getAttribute('position').count)).toEqual(batchesOf(full).map((m) => m.geometry.getAttribute('position').count));
  });

  it('draws each Terra\'s and Mare\'s own edge besides its Zones\' lines', () => {
    const withoutContainers = buildZoneGroup({ ...big, containers: [] });
    expect(linesOf(group).length).toBeGreaterThan(linesOf(withoutContainers).length);
    expect(batchesOf(withoutContainers)).toHaveLength(2);
  });
});

describe('partitionTargets', () => {
  const ids = ['zone:a/sector:1', 'zone:a/sector:2', 'zone:b/sector:3'];

  it('lights the Sector under the pointer, and nothing is dimmed while nothing is open', () => {
    const motion = createPartMotion(3);
    partitionTargets(motion, ids, 'zone:a/sector:2', null);
    expect([...motion.targetHover]).toEqual([0, 1, 0]);
    expect([...motion.targetSelect]).toEqual([0, 0, 0]);
    expect([...motion.targetDim]).toEqual([0, 0, 0]);
  });

  it('an open Zone lights every Sector in it and dims the rest; an open Sector lights itself', () => {
    const motion = createPartMotion(3);
    partitionTargets(motion, ids, null, 'zone:a');
    expect([...motion.targetSelect]).toEqual([1, 1, 0]);
    expect([...motion.targetDim]).toEqual([0, 0, 1]);
    partitionTargets(motion, ids, null, 'zone:b/sector:3');
    expect([...motion.targetSelect]).toEqual([0, 0, 1]);
    expect([...motion.targetDim]).toEqual([1, 1, 0]);
  });
});


describe('zonesLegend, ZSP 2.0', () => {
  it('names each Terra and Mare in its colour, and the three weights of line', () => {
    const legend = zonesLegend(index);
    const areas = legend.swatches.filter((s) => s.shape === 'area');
    expect(areas.map((s) => s.label)).toEqual(['Terra Borea (Terra)', 'Mare Austra (Mare)']);
    expect(areas[0].color).toBe(swatchCss(partitionFills(index).containers.get('terra:borea')!));
    expect(legend.swatches.filter((s) => s.shape !== 'area').map((s) => s.label)).toEqual([
      'Terra / Mare: its edge', 'A Zone\'s edge', 'Between its Sectors: approximate',
    ]);
  });
});

describe('zoneLines on the antimeridian', () => {
  const onMeridian180 = (lines: number[][][]) => lines.some((line) => line.some((p, i) => i > 0 && Math.abs(p[0]) === 180 && Math.abs(line[i - 1][0]) === 180));

  it('draws it where two places meet there: the edge of a Zone that ends at 180°', () => {
    const east = index.zones.find((z) => z.root.id === 'zone:borea-east')!;
    expect(onMeridian180(zoneLines(east).edge)).toBe(true);
  });

  it('leaves it out where a place split at ±180° meets itself', () => {
    const wrapped = { ...index.zones[0], sectors: [], root: { ...index.zones[0].root, geometry: { type: 'MultiPolygon' as const, coordinates: [[box(170, 0, 180, 10)], [box(-180, 0, -170, 10)]] } } } as ZspZone;
    expect(onMeridian180(zoneLines(wrapped).edge)).toBe(false);
  });
});
