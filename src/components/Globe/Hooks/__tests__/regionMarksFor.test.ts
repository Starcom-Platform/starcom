/**
 * Which territories get drawn for reports that name a jurisdiction.
 *
 * The selection is where the judgement is; the rendering needs a globe. So the
 * selection is tested directly, against the real Natural Earth polygons.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { featuredRegionFeatures, regionMarksFor } from '../useGlobeRegionMarks';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { usStatesFrom } from '../../../../services/raverWatch/usStates';
import { areaShapesFrom } from '../../../../features/globe/areas/areaShapes';
import { territoryResolver } from '../../../../features/globe/capture/territoryReports';
import type { PolygonGeometry } from '../../../../services/geoint/pointInPolygon';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const geo = JSON.parse(fs.readFileSync('public/geopolitical/world-territories-lod0.geojson', 'utf8'));
const territories = buildTerritoryIndex(geo.features);
const states = usStatesFrom(JSON.parse(fs.readFileSync('public/geopolitical/us-states-50m.geojson', 'utf8')));
const areas = areaShapesFrom(JSON.parse(fs.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
const ringsOf = (geometry: PolygonGeometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: `r-${Math.random().toString(36).slice(2, 7)}`,
  title: 't', content: '', author: 'a', category: 'GEOINT', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'SUBMITTED',
  ...over,
} as IntelReportUI);

describe('regionMarksFor', () => {
  it('draws the territory a jurisdiction names', () => {
    const { features } = regionMarksFor([report({ jurisdictions: ['fr'] })], territories);
    expect(features.length).toBeGreaterThan(0);
    expect(features[0].id).toContain('France');
  });

  it('ignores a report that already has a coordinate', () => {
    // It is drawn where it says it is; outlining its whole country as well
    // would restate the same report at a resolution it never claimed.
    const { features } = regionMarksFor(
      [report({ jurisdictions: ['fr'], latitude: 48.85, longitude: 2.35 })],
      territories,
    );
    expect(features).toHaveLength(0);
  });

  it('draws a territory once however many reports name it', () => {
    const many = [report({ jurisdictions: ['fr'] }), report({ jurisdictions: ['fr'] })];
    const one = regionMarksFor([report({ jurisdictions: ['fr'] })], territories);
    expect(regionMarksFor(many, territories).features).toHaveLength(one.features.length);
  });

  it('reports a jurisdiction it could not match, rather than dropping it', () => {
    // Sub-national codes are the common case, and silence would make the globe
    // look like it had drawn everything it was given.
    const { features, unmatched } = regionMarksFor(
      [report({ jurisdictions: ['us-tx'] })], territories,
    );
    expect(features).toHaveLength(0);
    expect(unmatched).toEqual(['us-tx']);
  });

  it('draws what it can and reports what it cannot, from one report', () => {
    const { features, unmatched } = regionMarksFor(
      [report({ jurisdictions: ['us', 'us-tx'] })], territories,
    );
    expect(features.length).toBeGreaterThan(0);
    expect(unmatched).toEqual(['us-tx']);
  });

  it('draws nothing before the polygons have loaded', () => {
    expect(regionMarksFor([report({ jurisdictions: ['fr'] })], undefined))
      .toEqual({ features: [], unmatched: [] });
  });
});

/*
 * A US state from Starcom's own state lines (BA3): the country index has no
 * states, so a report naming only `us-oh` had no outline at all.
 */
describe('regionMarksFor: US states', () => {
  it('draws a state from the state lines, and no longer lists it as unmatched', () => {
    const { features, unmatched } = regionMarksFor([report({ jurisdictions: ['us-oh', 'fr'] })], territories, states);
    expect(features.some((f) => f.id.startsWith('Ohio#'))).toBe(true);
    expect(features.some((f) => f.id.startsWith('France#'))).toBe(true);
    expect(unmatched).toEqual([]);
  });

  it('draws the states it has before the country polygons load', () => {
    const { features, unmatched } = regionMarksFor([report({ jurisdictions: ['us-oh', 'fr'] })], undefined, states);
    expect(features.some((f) => f.id.startsWith('Ohio#'))).toBe(true);
    expect(unmatched).toEqual(['fr']);
  });
});

/*
 * An area (BA16): a continent, union, sphere or zone, drawn from its baked
 * shape, every ring of it. A hole is part of the outline: Switzerland is no
 * part of the European Union, and an EU drawn without it says it is.
 */
describe('regionMarksFor: areas', () => {
  it('draws an area a report names, every ring of it, holes and all', () => {
    const { features, unmatched } = regionMarksFor([report({ jurisdictions: ['union:eu'] })], territories, undefined, areas);
    const eu = areas.get('union:eu')!.geometry;
    expect(features.filter((f) => f.id.startsWith('European Union#'))).toHaveLength(ringsOf(eu).length);
    expect(ringsOf(eu).length).toBeGreaterThan((eu.coordinates as unknown[]).length);
    expect(unmatched).toEqual([]);
  });

  it('draws a country\'s holes too: South Africa around Lesotho', () => {
    const { features } = regionMarksFor([report({ jurisdictions: ['za'] })], territories);
    const za = territories.byCode('za')!.geometry;
    expect(ringsOf(za).length).toBeGreaterThan(1);
    expect(features).toHaveLength(ringsOf(za).length);
  });

  it('lists an area as unmatched until its shapes load, as a state is', () => {
    expect(regionMarksFor([report({ jurisdictions: ['zone:sahel'] })], territories).unmatched).toEqual(['zone:sahel']);
    expect(regionMarksFor([report({ jurisdictions: ['zone:sahel'] })], territories, undefined, areas).unmatched).toEqual([]);
  });

  it('draws the areas it has before the country polygons load', () => {
    const { features } = regionMarksFor([report({ jurisdictions: ['zone:sahel'] })], undefined, undefined, areas);
    expect(features.some((f) => f.id.startsWith('Sahel Zone#'))).toBe(true);
  });

  it('lights every ring of a featured area: the edge around each hole as well', () => {
    const featured = report({ id: 'f-eu', jurisdictions: ['union:eu'] });
    const { edges, fills } = featuredRegionFeatures([featured], 'f-eu', territoryResolver(territories, undefined, areas));
    const eu = areas.get('union:eu')!.geometry;
    expect(edges).toHaveLength(ringsOf(eu).length);
    expect(fills).toHaveLength((eu.coordinates as unknown[]).length);
    // The holes go with their part's fill, so the fill leaves them unlit.
    expect(fills.reduce((n, f) => n + f.rings.length, 0)).toBe(ringsOf(eu).length);
  });
});
