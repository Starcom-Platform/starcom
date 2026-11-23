import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { batchedLines } from '../../geometry/lineBatches';
import { latLonToVector3 } from '../../utils/latLonToVector3';
import { isTerritoryFillMaterial, getTerritoryMaterialBaseColorHex } from '../../theme/territoryFillMaterial';
import { resourceTypeColor, conflictZoneColor, type CountryResourceRank } from '../../theme/resourceZoneTheme';
import type { BakedTerritoryPart } from '../../services/NationalTerritoriesService';
import type { RealTradeRoute } from '../../../services/geopolitical/UNComtradeService';
import { buildResourceZoneFills, buildConflictZoneBorders, buildTradeRouteLines, resourceZoneSay, resourceZoneSwatches } from '../useResourceZones3D';
import type { ResourceFigures } from '../../utils/countryBrief';

function bakedPoint(lat: number, lon: number): number[] {
  const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
  return [v.x, v.y, -v.z];
}

function bakedTrianglePart(id: string, countryCode: string, center: [number, number]): BakedTerritoryPart {
  const [lat, lon] = center;
  return {
    id,
    countryCode,
    positions: [
      ...bakedPoint(lat + 0.1, lon), ...bakedPoint(lat - 0.1, lon - 0.1), ...bakedPoint(lat - 0.1, lon + 0.1)
    ],
    indices: [0, 1, 2]
  };
}

describe('buildResourceZoneFills', () => {
  const parts: BakedTerritoryPart[] = [
    bakedTrianglePart('USA:0-0', 'USA', [40, -100]),
    bakedTrianglePart('CAN:0-0', 'CAN', [56, -106])
  ];

  // USA has real data for both oil and gas (ranks higher in oil); CAN has no real data
  // at all — exercises the "no real data = no mesh" behavior alongside a real pick.
  const percentiles = new Map<string, CountryResourceRank[]>([
    ['USA', [{ resourceType: 'oil', percentile: 90 }, { resourceType: 'gas', percentile: 40 }]]
  ]);

  it('returns an empty group when no resource types are active', () => {
    const group = buildResourceZoneFills(parts, [], 0.5, percentiles);
    expect(group.children.length).toBe(0);
  });

  it('returns an empty group when opacity is zero', () => {
    const group = buildResourceZoneFills(parts, ['oil'], 0, percentiles);
    expect(group.children.length).toBe(0);
  });

  it('builds a mesh only for the country with real data, not the one with none', () => {
    const group = buildResourceZoneFills(parts, ['oil', 'gas'], 0.6, percentiles);
    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(isTerritoryFillMaterial(mesh.material)).toBe(true);
    expect(mesh.userData.countryCode).toBe('USA');
  });

  it('colors the mesh by the resource type the country ranks highest in, and tags userData.resourceType accordingly', () => {
    const group = buildResourceZoneFills(parts, ['oil', 'gas'], 0.6, percentiles);
    const mesh = group.children[0] as THREE.Mesh;
    const hex = getTerritoryMaterialBaseColorHex(mesh.material as THREE.ShaderMaterial);
    expect(hex).toBe(resourceTypeColor('oil')); // USA ranks higher in oil (90) than gas (40)
    expect(mesh.userData.resourceType).toBe('oil');
  });

  it('builds nothing at all when no country in the batch has real data for any active type', () => {
    const group = buildResourceZoneFills(parts, ['minerals', 'water'], 0.6, percentiles);
    expect(group.children.length).toBe(0);
  });

  it('scales the group so fills sit slightly outside the national-territories fill radius (avoids z-fighting when both overlays are on)', () => {
    const group = buildResourceZoneFills(parts, ['oil'], 0.5, percentiles);
    expect(group.scale.x).toBeGreaterThan(1.03); // TERRITORY_RADIUS_SCALE
  });
});

// The shipped files' own shapes: EIA's series (eia-production.json), the World Bank's rows, USGS's records.
const figures: ResourceFigures = {
  energy: {
    oil: { name: 'Crude oil including lease condensate production', unit: 'thousand barrels per day', year: 2023, values: { USA: 12_935, CAN: 4_865, MEX: 1_626 }, via: 'file' },
    gas: { name: 'Dry natural gas production', unit: 'billion cubic feet', year: 2023, values: { USA: 37_800, CAN: 6_400, QAT: 6_200, MEX: 900 }, via: 'file' },
  },
  water: [
    { countryISO3: 'USA', countryName: 'United States', value: 8_457, year: '2021' },
    { countryISO3: 'CAN', countryName: 'Canada', value: 74_042, year: '2021' },
  ],
  minerals: [
    { countryISO3: 'USA', countryName: 'United States', commodity: 'copper', value: 1_100, unit: 'thousand metric tons', year: '2024' },
    { countryISO3: 'CHL', countryName: 'Chile', commodity: 'copper', value: 5_300, unit: 'thousand metric tons', year: '2024' },
  ],
};

describe("a resource fill's hover and click (critique-2026-11-01, O9)", () => {
  it('says where the country stands for each type that is on, the one it is coloured for first, each with its source', () => {
    const say = resourceZoneSay('USA', 'United States', 'gas', ['oil', 'gas', 'water'], figures)!;
    const lines = say.tooltip.split('\n');
    expect(lines[0]).toBe('United States · Resource Zones');
    expect(lines[1]).toBe('Natural gas: rank 1 of 4 producers · top 1% (its colour)');
    expect(lines[2]).toBe('Crude oil: rank 1 of 3 producers · top 1%');
    expect(lines[3]).toBe('Freshwater per person: rank 2 of 2 countries · top 100%');
    expect(lines).toHaveLength(4);
    // Minerals are off: never said.
    expect(say.tooltip).not.toMatch(/Copper/);
    expect(say.opens.heading).toBe('United States · Resource Zones');
    expect(say.opens.notes.map((n) => n.id)).toEqual(['resource-zone:USA:gas', 'resource-zone:USA:oil', 'resource-zone:USA:water']);
    const oil = say.opens.notes[1];
    expect(oil.text).toMatch(/barrels a day · EIA, 2023$/);
    expect(oil.sources).toEqual(['https://www.eia.gov/international/data/world']);
    expect(say.opens.notes[2].sources).toEqual(['https://data.worldbank.org/indicator/ER.H2O.INTR.PC']);
  });

  it('names a mineral by the commodity it stands highest in, with USGS as its source', () => {
    const say = resourceZoneSay('USA', 'United States', 'minerals', ['minerals'], figures)!;
    expect(say.tooltip.split('\n')[1]).toBe('Copper: rank 2 of 2 producers · top 100% (its colour)');
    expect(say.opens.notes[0].sources).toEqual(['https://doi.org/10.5066/P1WKQ63T']);
  });

  it('says nothing when the figures name the country for none of the types that are on', () => {
    expect(resourceZoneSay('FRA', 'France', 'oil', ['oil', 'gas'], figures)).toBeNull();
  });

  it("puts the words on the fill, once a country however many parts it has; without figures a fill stays silent", () => {
    const parts = [
      bakedTrianglePart('USA:0-0', 'USA', [40, -100]),
      bakedTrianglePart('USA:1-0', 'USA', [64, -150]),
    ];
    const percentiles = new Map<string, CountryResourceRank[]>([['USA', [{ resourceType: 'oil', percentile: 100 }]]]);
    const meshes = buildResourceZoneFills(parts, ['oil'], 0.6, percentiles, figures).children as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes[0].userData.tooltip).toMatch(/^United States · Resource Zones|^USA · Resource Zones/);
    expect(meshes[0].userData.opens).toBe(meshes[1].userData.opens);
    expect(meshes[0].userData.resourceType).toBe('oil');
    const silent = buildResourceZoneFills(parts, ['oil'], 0.6, percentiles).children[0] as THREE.Mesh;
    expect(silent.userData.tooltip).toBeUndefined();
  });

  it('keys only the types the fills drew, in the key order, each in its colour', () => {
    const parts = [bakedTrianglePart('USA:0-0', 'USA', [40, -100]), bakedTrianglePart('CAN:0-0', 'CAN', [56, -106])];
    const percentiles = new Map<string, CountryResourceRank[]>([
      ['USA', [{ resourceType: 'oil', percentile: 100 }]],
      ['CAN', [{ resourceType: 'water', percentile: 100 }]],
    ]);
    const fills = buildResourceZoneFills(parts, ['oil', 'gas', 'water'], 0.6, percentiles, figures);
    expect(resourceZoneSwatches(fills)).toEqual([
      { color: `#${resourceTypeColor('oil').toString(16).padStart(6, '0')}`, label: 'Crude oil' },
      { color: `#${resourceTypeColor('water').toString(16).padStart(6, '0')}`, label: 'Freshwater per person' },
    ]);
  });
});

describe('buildConflictZoneBorders', () => {
  const borders = [
    { id: 'A', coordinates: [[0, 0], [10, 10]] as [number, number][], classification: 'disputed' as const },
    { id: 'B', coordinates: [[20, 20], [30, 30]] as [number, number][], classification: 'line_of_control' as const },
    { id: 'C', coordinates: [[40, 40], [50, 50]] as [number, number][], classification: 'international' as const }
  ];

  it('returns an empty group when conflictZones.show is false', () => {
    const group = buildConflictZoneBorders(borders, { show: false, highlightDisputed: false, alertLevel: 'medium' });
    expect(group.children.length).toBe(0);
  });

  it('includes only disputed/line_of_control borders, not international ones', () => {
    const group = buildConflictZoneBorders(borders, { show: true, highlightDisputed: false, alertLevel: 'medium' });
    expect(batchedLines(group).map((l) => l.id)).toEqual(['A', 'B']);
  });

  it('colors lines by the configured alert level', () => {
    const group = buildConflictZoneBorders(borders, { show: true, highlightDisputed: false, alertLevel: 'high' });
    const batch = group.children[0] as LineSegments2;
    expect((batch.material as LineMaterial).color.getHex()).toBe(conflictZoneColor('high'));
  });

  it('uses a thicker line width when highlightDisputed is true', () => {
    const dim = buildConflictZoneBorders(borders, { show: true, highlightDisputed: false, alertLevel: 'medium' });
    const bright = buildConflictZoneBorders(borders, { show: true, highlightDisputed: true, alertLevel: 'medium' });
    const dimLine = dim.children[0] as LineSegments2;
    const brightLine = bright.children[0] as LineSegments2;
    expect((brightLine.material as LineMaterial).linewidth).toBeGreaterThan((dimLine.material as LineMaterial).linewidth);
  });
});

describe('buildTradeRouteLines', () => {
  const centroids = new Map([
    ['USA', { lat: 40, lng: -100 }],
    ['CHN', { lat: 35, lng: 105 }],
    ['AUS', { lat: -25, lng: 135 }]
  ]);
  const routes: RealTradeRoute[] = [
    { id: 'USA-CHN-27', from: 'USA', to: 'CHN', hsCode: '27', commodity: 'Mineral fuels, oils', value: 1000 },
    { id: 'AUS-DEU-26', from: 'AUS', to: 'DEU', hsCode: '26', commodity: 'Ores, slag and ash', value: 2000 } // DEU has no centroid here
  ];

  it('builds a connection only for routes whose both endpoints resolve a centroid', () => {
    const group = buildTradeRouteLines(centroids, routes, 50);
    // Only USA-CHN resolves both endpoints; AUS-DEU's DEU endpoint has no centroid here.
    expect(batchedLines(group).map((l) => l.id)).toEqual(['USA-CHN-27']);
    group.children.forEach((child) => expect(child).toBeInstanceOf(LineSegments2));
  });

  it('returns an empty group when no route endpoints resolve', () => {
    const group = buildTradeRouteLines(new Map(), routes, 50);
    expect(group.children.length).toBe(0);
  });

  it('returns an empty group when there are no routes at all', () => {
    const group = buildTradeRouteLines(centroids, [], 50);
    expect(group.children.length).toBe(0);
  });

  it('scales opacity with intensity, clamped to a sensible minimum', () => {
    const low = buildTradeRouteLines(centroids, routes, 0);
    const high = buildTradeRouteLines(centroids, routes, 100);
    const lowLine = low.children[0] as LineSegments2;
    const highLine = high.children[0] as LineSegments2;
    expect((lowLine.material as LineMaterial).opacity).toBeGreaterThan(0); // clamped minimum, not fully invisible at 0
    expect((highLine.material as LineMaterial).opacity).toBeGreaterThan((lowLine.material as LineMaterial).opacity);
  });
});

/*
 * Trade routes are SOLID arcs (decision D-F, clutter and legibility).
 *
 * The same reason the diplomatic connections are: `materialTheme.ts` marks
 * disputed and line-of-control borders dashed and everything else solid, calling
 * it the standard cartographic convention. Dashed means PROVISIONAL here, and a
 * trade route is not provisional — drawing it dashed borrowed a meaning it does
 * not have and diluted the one that does. These arcs also rise 12 units above a
 * 100-unit globe, so at the limb the dashes piled into a speckled band outside
 * the planet's own silhouette.
 */
/**
 * Every line material under an object, however the batches are nested.
 *
 * buildConnectionLines returns a group holding a LineSegments2, and each caller
 * adds that group to one of its own — so the materials are two levels down, not
 * one.
 */
const lineMaterials = (root: THREE.Object3D): LineMaterial[] => {
  const out: LineMaterial[] = [];
  root.traverse((o) => {
    const material = (o as LineSegments2).material as LineMaterial | undefined;
    if (material && typeof (material as { dashed?: boolean }).dashed === 'boolean') out.push(material);
  });
  return out;
};

describe('the trade route arcs', () => {
  const arcCentroids = new Map([
    ['USA', { lat: 40, lng: -100 }],
    ['CHN', { lat: 35, lng: 105 }],
  ]);
  const arcRoutes: RealTradeRoute[] = [
    { id: 'USA-CHN-27', from: 'USA', to: 'CHN', hsCode: '27', commodity: 'Mineral fuels, oils', value: 1000 },
  ];

  it('draws them solid, because dashed means provisional here', () => {
    const materials = lineMaterials(buildTradeRouteLines(arcCentroids, arcRoutes, 50));

    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) expect(material.dashed).toBe(false);
  });
});
