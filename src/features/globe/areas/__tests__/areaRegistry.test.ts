/**
 * New kinds of area (BA16–BA18; plan block J, item 6): continents, unions,
 * spheres and zones, each named by a prefixed code a report can put in its
 * `jurisdiction` tag, with its members or its shape and the source they were
 * taken from.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { AREAS, areaCodeOf, areaByCode, areaDefinitionsHash, type AreaDef } from '../areaRegistry';
import zoneAreas from '../zoneAreas.json';
import type { ZoneAreas } from '../zoneAreas';

const ROOT = resolve(__dirname, '../../../../..');
const features = JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features;
const TERRITORIES = buildTerritoryIndex(features);
const members = (code: string) => {
  const def = areaByCode(code) as Extract<AreaDef, { from: 'members' }>;
  return def.members;
};

describe('the first set (BA18)', () => {
  // The first set had five spheres and eight zones; eight spheres and two zones were added on 2026-10-12. Since Mecha
  // Jono's lists (Part 2, 25 Oct) the unions and spheres are theirs: fifteen bodies and thirteen Spheres.
  it('seven continents, fifteen unions, thirteen spheres and the Zones served, each once', () => {
    const count = (kind: string) => AREAS.filter((a) => a.kind === kind).length;
    // The eleven first Zones, until a ZSP 2.0 partition is served: then its own, and those it retired (zoneAreas.ts).
    const partition = zoneAreas as unknown as ZoneAreas;
    const zones = partition.zones.length ? partition.zones.filter((z) => z.kind === 'zone').length + partition.retired.length : 11;
    expect([count('continent'), count('union'), count('sphere'), count('zone')]).toEqual([7, 15, 13, zones]);
    expect(new Set(AREAS.map((a) => a.code)).size).toBe(AREAS.length);
    // Its kind, then a slug as the ZSP reader takes one: a partition's ids may carry digits (zsp.ts).
    for (const area of AREAS) expect(area.code).toMatch(new RegExp(`^${area.kind}:[a-z0-9-]+$`));
  });

  it('each union and sphere with as many members as its source names', () => {
    expect(members('union:eu')).toHaveLength(27);
    // The AU's 55, but for the six its list names suspended.
    expect(members('union:au')).toHaveLength(49);
    expect(members('union:asean')).toHaveLength(11);
    expect(members('union:arab-league')).toHaveLength(22);
    expect(members('union:gcc')).toHaveLength(6);
    expect(members('union:mercosur')).toEqual(['ar', 'br', 'py', 'uy', 'bo']);
    expect(members('sphere:anglosphere')).toEqual(['au', 'ca', 'gb', 'nz', 'us']);
    expect(members('sphere:francophonie')).toHaveLength(50);
    expect(members('sphere:hispanosphere')).toHaveLength(21);
    expect(members('sphere:lusosphere')).toHaveLength(9);
    // Singapore with them, as Mecha Jono's sources count it.
    expect(members('sphere:sinosphere')).toHaveLength(9);
  });

  it('what each source says of members that are suspended or have left', () => {
    // Listed, with its status and day, and not drawn.
    expect(areaByCode('union:mercosur')?.others).toContainEqual({ code: 've', status: 'suspended', since: '2017-08-05' });
    expect(members('union:mercosur')).not.toContain('ve');
    for (const out of ['bf', 'gw', 'mg', 'ml', 'ne', 'sd']) expect(members('union:au')).not.toContain(out);
    // The three Sahel states left the Francophonie in March 2025.
    for (const gone of ['bf', 'ml', 'ne']) expect(members('sphere:francophonie')).not.toContain(gone);
    expect(members('union:asean')).toContain('tl');
  });

  it('every member a territory the map can draw, and none listed twice', () => {
    for (const area of AREAS) {
      if (area.from !== 'members') continue;
      expect(new Set(area.members).size, area.code).toBe(area.members.length);
      for (const code of area.members) expect(TERRITORIES.byCode(code), `${area.code}: ${code}`).not.toBeNull();
    }
  });

  it('every continent one the map\'s own data names, and every zone a shape or members of its own', () => {
    const continents = new Set(features.map((f: { properties: { CONTINENT: string } }) => f.properties.CONTINENT));
    for (const area of AREAS.filter((a) => a.from === 'continent')) {
      expect(continents.has((area as Extract<AreaDef, { from: 'continent' }>).continent), area.code).toBe(true);
    }
    for (const zone of AREAS.filter((a) => a.kind === 'zone')) expect(['members', 'lines', 'ring', 'circle', 'zsp', 'covered'], zone.code).toContain(zone.from);
    // A retired Zone is drawn as Zones the registry holds (zoneAreas.ts).
    for (const zone of AREAS.filter((a): a is Extract<AreaDef, { from: 'covered' }> => a.from === 'covered')) {
      expect(zone.coveredBy.length, zone.code).toBeGreaterThan(0);
      for (const code of zone.coveredBy) expect(AREAS.some((a) => a.code === code && a.from === 'zsp'), `${zone.code} ${code}`).toBe(true);
    }
  });

  it('every area cites where it was taken from, and when it was read', () => {
    for (const area of AREAS) {
      expect(area.source.url, area.code).toMatch(/^https:\/\//);
      expect(area.source.read, area.code).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(area.name.length, area.code).toBeGreaterThan(3);
    }
  });
});

describe('a code in a jurisdiction tag (BA17)', () => {
  it('a prefixed code, in any case and with stray spaces, and the bare eu', () => {
    expect(areaCodeOf('union:eu')).toBe('union:eu');
    expect(areaCodeOf(' Continent:Africa ')).toBe('continent:africa');
    expect(areaCodeOf('union : eu')).toBe('union:eu');
    expect(areaCodeOf('eu')).toBe('union:eu');
    expect(areaCodeOf('EU')).toBe('union:eu');
  });

  it('nothing for a country\'s code, a state\'s, or a code no area has', () => {
    expect(areaCodeOf('fr')).toBeNull();
    expect(areaCodeOf('us-oh')).toBeNull();
    expect(areaCodeOf('union:no-such-body')).toBeNull();
    expect(areaCodeOf('zone:')).toBeNull();
  });
});

describe('the shapes are baked from these definitions', () => {
  it('a hash of them, the same each time, that changes with any of them', () => {
    expect(areaDefinitionsHash()).toBe(areaDefinitionsHash());
    expect(areaDefinitionsHash()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('the baked file says it was baked from these very definitions (npm run bake:areas when it does not)', () => {
    const baked = JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/areas-lod0.geojson'), 'utf8'));
    expect(baked.definitionsHash).toBe(areaDefinitionsHash());
    expect(baked.features.map((f: { properties: { code: string } }) => f.properties.code).sort()).toEqual(AREAS.map((a) => a.code).sort());
  });
});
