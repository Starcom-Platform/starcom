/**
 * One Organisation drawn (decision D-ZR, ZR10): its members' outline filled in its colour, with a material of its
 * own so it lights alone, and a key that names it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { areaShapesFrom } from '../../../features/globe/areas/areaShapes';
import { getTerritoryMaterialBaseColorHex } from '../../theme/territoryFillMaterial';
import { buildOrganisationGroup, organisationLegend, ORGANISATION_COLOR } from '../useOrganisations3D';

const ROOT = resolve(__dirname, '../../../..');
const shapes = areaShapesFrom(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/areas-lod0.geojson'), 'utf8')));

describe('buildOrganisationGroup', () => {
  it('fills the body shown over its members, and nothing for a body it has no shape for', () => {
    const group = buildOrganisationGroup(shapes, 'union:eu');
    const fills = group.children.filter((c): c is THREE.Mesh => c.userData.organisationCode === 'union:eu');
    expect(fills.length).toBeGreaterThan(0);
    for (const mesh of fills) expect(getTerritoryMaterialBaseColorHex(mesh.material as THREE.ShaderMaterial)).toBe(ORGANISATION_COLOR);
    expect(buildOrganisationGroup(shapes, 'union:atlantis').children).toHaveLength(0);
  });
});

describe('organisationLegend', () => {
  it('names the body shown and how many members it is drawn over', () => {
    const legend = organisationLegend('union:eu');
    expect(legend.swatches.map((s) => s.label)).toEqual(['European Union']);
    expect(legend.colorMeans).toMatch(/^European Union: its 27 members; one body at a time$/);
  });
});
