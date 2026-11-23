/**
 * The Zones layer's drawing (ZSP 1.0), on the East African Rift Zone as served:
 * a fill per Sector that can light alone, each line between Sectors drawn once,
 * and a key made from what was drawn.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isTerritoryFillMaterial, getTerritoryMaterialBaseColorHex } from '../../theme/territoryFillMaterial';
import { sectorColor, swatchCss, zoneColor } from '../../theme/zoneTheme';
import { zoneFrom, zoneIndexOf, type ZspZone } from '../../zones/zsp';
import { buildZoneGroup, placeUnderRay, zoneLines, zonesLegend } from '../useZones3D';

const ROOT = resolve(__dirname, '../../../..');
// The 1.0 documents as served until the swap (zones/__tests__/zsp-1.0).
const ZSP_1 = resolve(ROOT, 'src/geopolitical/zones/__tests__/zsp-1.0');
const doc = () => JSON.parse(readFileSync(resolve(ZSP_1, 'east-african-rift.zsp.geojson'), 'utf8'));
const rift = zoneFrom(doc()) as ZspZone;
const index = zoneIndexOf([rift]);

const key = (a: number[], b: number[]) => [a, b].map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).sort().join('|');
const segments = (lines: number[][][]) => lines.flatMap((line) => line.slice(1).map((p, i) => key(line[i], p)));

describe('buildZoneGroup', () => {
  const group = buildZoneGroup(index);
  const fills = group.children.filter((c): c is THREE.Mesh => typeof c.userData.zspId === 'string');

  it('fills every Sector, each in its own shade of the Zone, with a material of its own', () => {
    expect(new Set(fills.map((m) => m.userData.zspId))).toEqual(new Set(rift.sectors.map((s) => s.id)));
    const base = zoneColor(rift.root);
    rift.sectors.forEach((sector, i) => {
      const mine = fills.filter((m) => m.userData.zspId === sector.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const mesh of mine) {
        expect(isTerritoryFillMaterial(mesh.material as THREE.Material)).toBe(true);
        expect(getTerritoryMaterialBaseColorHex(mesh.material as THREE.ShaderMaterial)).toBe(sectorColor(base, i));
      }
    });
    expect(new Set(fills.map((m) => m.material)).size).toBe(fills.length);
  });

  it('does not fill the Zone over its Sectors', () => {
    expect(fills.some((m) => m.userData.zspId === rift.root.id)).toBe(false);
  });

  it('draws everything as direct children, which is all the layer disposes', () => {
    expect(group.children.every((c) => !(c instanceof THREE.Group) || c.children.length === 0 || c.userData.zspId === undefined)).toBe(true);
    expect(group.children.some((c) => c.userData.zspId === undefined)).toBe(true);
  });

  it('fills a Zone with no Sectors itself', () => {
    const lone = zoneFrom({ ...doc(), features: doc().features.slice(0, 1) }) as ZspZone;
    const meshes = buildZoneGroup(zoneIndexOf([lone])).children.filter((c) => c.userData.zspId);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((m) => m.userData.zspId === lone.root.id)).toBe(true);
  });
});

describe('zoneLines', () => {
  const { edge, between } = zoneLines(rift);

  it('draws each line between two Sectors once, and never on the Zone edge', () => {
    const inner = segments(between);
    const outer = new Set(segments(edge));
    expect(inner.length).toBeGreaterThan(0);
    expect(new Set(inner).size).toBe(inner.length);
    expect(inner.filter((s) => outer.has(s))).toEqual([]);
  });

  it('every segment two Sectors share is a line between them; every other is the edge', () => {
    const count = new Map<string, number>();
    for (const sector of rift.sectors) {
      const polys = sector.geometry.type === 'Polygon' ? [sector.geometry.coordinates] : sector.geometry.coordinates;
      for (const ring of polys.flat()) segments([ring as number[][]]).forEach((s) => count.set(s, (count.get(s) ?? 0) + 1));
    }
    const shared = [...count].filter(([, n]) => n === 2).map(([s]) => s).sort();
    expect(segments(between).sort()).toEqual(shared);
    expect(segments(edge).sort()).toEqual([...count].filter(([, n]) => n === 1).map(([s]) => s).sort());
  });

  it('joins segments into whole lines, so a dashed line dashes along its length', () => {
    expect(between.length).toBeLessThan(segments(between).length / 2);
  });
});

describe('zonesLegend', () => {
  it('names the Zone once at the end of its run of shades, and both kinds of line', () => {
    const legend = zonesLegend(index);
    const areas = legend.swatches.filter((s) => s.shape === 'area');
    expect(areas.map((s) => s.color)).toEqual(rift.sectors.map((_s, i) => swatchCss(sectorColor(zoneColor(rift.root), i))));
    expect(areas.filter((s) => s.label)).toEqual([expect.objectContaining({ label: 'East African Rift Zone (geological frame)' })]);
    expect(legend.swatches.find((s) => s.shape === 'dashed')?.label).toBe('Between its Sectors: approximate');
  });
});

describe('placeUnderRay: only the near side of the Earth', () => {
  const group = buildZoneGroup(index);
  group.updateMatrixWorld(true);
  const fills = group.children.filter((c) => c.userData.zspId);
  const afar = fills.find((c) => c.userData.zspId.endsWith('afar-triangle')) as THREE.Mesh;
  afar.geometry.computeBoundingSphere();
  const at = afar.geometry.boundingSphere!.center.clone();

  const rayFrom = (from: THREE.Vector3, to: THREE.Vector3) => {
    const ray = new THREE.Raycaster();
    ray.set(from, to.clone().sub(from).normalize());
    return ray;
  };

  it('finds the Sector a ray from above it meets', () => {
    expect(placeUnderRay(rayFrom(at.clone().multiplyScalar(3), at), fills, 100)).toBe(afar.userData.zspId);
  });

  it('a ray from the other side of the Earth, through it, finds nothing', () => {
    expect(placeUnderRay(rayFrom(at.clone().multiplyScalar(-3), at), fills, 100)).toBeNull();
  });
});

describe('every Zone served', () => {
  const folder = ZSP_1;
  const entries = JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8')).zones as Array<{ id: string; file: string }>;
  const zones = entries.map((e) => zoneFrom(JSON.parse(readFileSync(resolve(folder, e.file), 'utf8'))) as ZspZone);

  it('is read whole', () => {
    expect(zones.map((z) => z?.root.id)).toEqual(entries.map((e) => e.id));
    for (const z of zones) expect(z.unread).toBe(0);
  });

  it('fills every Sector, parts and holes included, and draws its lines once each', () => {
    const group = buildZoneGroup(zoneIndexOf(zones));
    const filled = new Set(group.children.map((c) => c.userData.zspId).filter(Boolean));
    for (const z of zones) {
      for (const s of z.sectors) expect(filled.has(s.id), s.id).toBe(true);
      const { edge, between } = zoneLines(z);
      expect(edge.length, z.root.id).toBeGreaterThan(0);
      expect(between.length, z.root.id).toBeGreaterThan(0);
      const outer = new Set(segments(edge));
      expect(segments(between).filter((s) => outer.has(s)), z.root.id).toEqual([]);
    }
  });

  it('stays inside the renderer\'s limits: at most 2,000 points in any one part', () => {
    for (const z of zones) {
      for (const p of z.places) {
        const parts = p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates;
        for (const rings of parts) expect(rings.reduce((n, r) => n + r.length, 0), p.id).toBeLessThanOrEqual(2000);
      }
    }
  });
});
