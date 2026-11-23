/**
 * Intel Reports about an area as a whole (BA16, BA17; plan block J, item 6):
 * a continent, union, sphere or zone named in a report's jurisdiction tag is
 * listed, featured and grouped as a territory is, standing at the middle of
 * its largest part and said, in words that read, to be about it as a whole.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { usStatesFrom } from '../../../../services/raverWatch/usStates';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { areaShapesFrom } from '../../areas/areaShapes';
import { territoryResolver, territoryShareReports, featuredTerritoryFor, territoryMarkerFor } from '../territoryReports';

const ROOT = resolve(__dirname, '../../../../..');
const read = (file: string) => JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical', file), 'utf8'));
const TERRITORIES = buildTerritoryIndex(read('world-territories-lod0.geojson').features);
const STATES = usStatesFrom(read('us-states-50m.geojson'));
const AREAS = areaShapesFrom(read('areas-lod0.geojson'));
const resolveAll = territoryResolver(TERRITORIES, STATES, AREAS);

const report = (id: string, jurisdictions: string[], over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id,
  title: `Report ${id}`,
  content: 'Locust swarms reported across the belt.',
  summary: 'S',
  author: 'a'.repeat(64),
  category: 'intel',
  tags: [],
  hashtags: ['starcom_intel'],
  jurisdictions,
  createdAt: new Date('2026-10-04T12:00:00.000Z'),
  updatedAt: new Date('2026-10-04T12:00:00.000Z'),
  status: 'SUBMITTED',
  version: 1,
  history: [],
  ...over,
} as IntelReportUI);

describe('an area named in a jurisdiction tag (BA17)', () => {
  it('by its prefixed code in any case, and the bare eu as the European Union', () => {
    expect(resolveAll('union:eu')).toMatchObject({ code: 'union:eu', name: 'European Union' });
    expect(resolveAll('EU')).toMatchObject({ code: 'union:eu', name: 'European Union' });
    expect(resolveAll(' Continent:Africa ')).toMatchObject({ code: 'continent:africa', name: 'Africa' });
    expect(resolveAll('zone:sahel')?.geometry.type).toMatch(/Polygon$/);
  });

  it('a country and a state still as they were, and nothing for an area no one defined', () => {
    expect(resolveAll('de')).toMatchObject({ code: 'de', name: 'Germany' });
    expect(resolveAll('us-oh')).toMatchObject({ code: 'us-oh', name: 'Ohio' });
    expect(resolveAll('union:no-such-body')).toBeNull();
  });

  it('none before the shapes are loaded, which happens only once a report names an area', () => {
    expect(territoryResolver(TERRITORIES, STATES)('union:eu')).toBeNull();
    expect(territoryResolver(TERRITORIES, STATES)('eu')).toBeNull();
  });

  it('named in running text as a reader would: the European Union, the Sahel, but Africa and BRICS', () => {
    const inText = (code: string) => { const t = resolveAll(code); return t?.inText ?? t?.name; };
    expect(inText('union:eu')).toBe('the European Union');
    expect(inText('zone:sahel')).toBe('the Sahel Zone');
    expect(inText('continent:africa')).toBe('Africa');
    // As Mecha Jono's list runs each name (Part 2): with the article, but not BRICS.
    expect(inText('union:asean')).toBe('the Association of Southeast Asian Nations');
    expect(inText('union:brics')).toBe('BRICS');
    expect(inText('de')).toBe('Germany');
  });
});

describe('listed for the share handle (BA16)', () => {
  it('at the middle of its largest part, with how far it reaches, named by its code', () => {
    const [sahel] = territoryShareReports([report('s1', ['zone:sahel'])], resolveAll);
    expect(sahel).toMatchObject({ id: 's1', territories: [{ code: 'zone:sahel', name: 'Sahel Zone' }] });
    expect(sahel.lat).toBeGreaterThan(12);
    expect(sahel.lat).toBeLessThan(18);
    expect(sahel.precisionM).toBeGreaterThan(2_000_000);
  });

  it('grouped by the area, apart from its members', () => {
    const listed = territoryShareReports([report('a', ['union:eu']), report('b', ['eu']), report('c', ['fr'])], resolveAll);
    expect(listed.map((r) => r.group)).toEqual([
      { key: 'territory:union:eu', kind: 'territory', size: 2 },
      { key: 'territory:union:eu', kind: 'territory', size: 2 },
      { key: 'territory:fr', kind: 'territory', size: 1 },
    ]);
  });
});

describe('featured, and opened', () => {
  it('a card says it is about the area as a whole, in words that read', () => {
    expect(featuredTerritoryFor(report('e', ['union:eu']), resolveAll)!.lines)
      .toContain('About the European Union as a whole: the report names no place in it');
    expect(featuredTerritoryFor(report('a', ['continent:africa']), resolveAll)!.lines)
      .toContain('About Africa as a whole: the report names no place in it');
    expect(featuredTerritoryFor(report('m', ['zone:sahel', 'ng']), resolveAll)!.lines)
      .toContain('About the Sahel Zone and Nigeria as a whole: the report names no place in them');
  });

  it('a country named mid-sentence as a reader would: the United States of America, but France', () => {
    expect(featuredTerritoryFor(report('u', ['us']), resolveAll)!.lines)
      .toContain('About the United States of America as a whole: the report names no place in it');
    expect(featuredTerritoryFor(report('f', ['fr']), resolveAll)!.lines)
      .toContain('About France as a whole: the report names no place in it');
  });

  it('the popup says so too', () => {
    expect(territoryMarkerFor(report('e', ['union:eu', 'de']), resolveAll)?.aboutTerritories).toEqual(['the European Union', 'Germany']);
  });
});
