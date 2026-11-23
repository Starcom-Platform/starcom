/**
 * Groups through the share handle (BA10; plan block J, item 4, contract v27).
 *
 * Reports at one place are drawn as one glyph with a count, and reports about
 * one territory share its outline; the handle said only `sharesPlaceWith`, a
 * number, so a driver could not tell which reports were together. Each listed
 * Intel Report now names its group, `listGroups()` lists each group's members
 * most severe first, and a card featuring one says which of how many it is.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupReportsByPlace } from '../../../../components/Globe/reportPlaces';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import { listShareReports, groupsOfShareReports, withGroupLine, featuredReportFor, type ShareReportInfo, type FeaturedReport } from '../shareReports';
import { territoryResolver, territoryShareReports } from '../territoryReports';

const marker = (pubkey: string, over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey, title: `Report ${pubkey}`, content: '', tags: [], latitude: 39.9612, longitude: -82.9988,
  timestamp: Date.UTC(2026, 9, 3, 12), author: 'a', ...over,
});
const TERRITORIES = buildTerritoryIndex(JSON.parse(readFileSync(resolve(__dirname, '../../../../../public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features);
const resolveCountries = territoryResolver(TERRITORIES, undefined);
const about = (id: string, jurisdictions: string[], over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title: `Report ${id}`, content: 'c', summary: 's', author: 'a'.repeat(64), category: 'intel', tags: [],
  hashtags: ['starcom_intel'], jurisdictions, createdAt: new Date('2026-10-02T12:00:00Z'), updatedAt: new Date('2026-10-02T12:00:00Z'),
  status: 'SUBMITTED', version: 1, history: [], ...over,
} as IntelReportUI);

describe('each listed Intel Report names its group', () => {
  it('a place\'s, keyed by the report drawn for it and never by where it is, with how many it holds', () => {
    const places = groupReportsByPlace([marker('raw'), marker('crit', { tags: ['critical'] }), marker('far', { latitude: 10 })]);
    const listed = listShareReports(places);
    const byId = Object.fromEntries(listed.map((r) => [r.id, r.group]));
    expect(byId.raw).toEqual({ key: 'place:crit', kind: 'place', size: 2 });
    expect(byId.crit).toEqual({ key: 'place:crit', kind: 'place', size: 2 });
    expect(byId.far).toEqual({ key: 'place:far', kind: 'place', size: 1 });
  });

  it('a territory\'s, by the first territory it names, as it stands there', () => {
    const listed = territoryShareReports([about('a', ['fr']), about('b', ['fr', 'de']), about('c', ['de'])], resolveCountries);
    expect(listed.map((r) => r.group)).toEqual([
      { key: 'territory:fr', kind: 'territory', size: 2 },
      { key: 'territory:fr', kind: 'territory', size: 2 },
      { key: 'territory:de', kind: 'territory', size: 1 },
    ]);
  });
});

describe('listGroups', () => {
  const places = groupReportsByPlace([marker('raw'), marker('crit', { tags: ['critical'] }), marker('far', { latitude: 10 })]);
  const territorial = territoryShareReports([about('t1', ['fr']), about('t2', ['fr'], { tags: ['critical'] })], resolveCountries);
  const raverWatch = { id: '30023:pk:rw', layer: 'HeatRisk', title: 'Heat', variant: 'warning', sharesPlaceWith: 0, lat: 1, lng: 1 } as unknown as ShareReportInfo;
  const groups = groupsOfShareReports([...listShareReports(places), ...territorial, raverWatch]);

  it('each group once, its members most severe first, every Intel Report in exactly one', () => {
    expect(groups.map((g) => [g.key, g.members])).toEqual([
      ['place:crit', ['crit', 'raw']],
      ['place:far', ['far']],
      ['territory:fr', ['t2', 't1']],
    ]);
    expect(groups.reduce((n, g) => n + g.size, 0)).toBe(5);
  });

  it('where each is, no finer than its members are listed, and a territory\'s territory', () => {
    const [place, , france] = groups;
    expect(place).toMatchObject({ kind: 'place', size: 2, lat: 40, lng: -83 });
    expect(place.territory).toBeUndefined();
    expect(france).toMatchObject({ kind: 'territory', size: 2, territory: { code: 'fr', name: 'France' } });
  });

  it('none of the other layers\' items, which group no way yet (their half of K8 is block G)', () => {
    expect(groups.some((g) => g.members.includes('30023:pk:rw'))).toBe(false);
  });
});

describe('a card featuring one of a group (BA10)', () => {
  const listed = listShareReports(groupReportsByPlace([marker('a', { tags: ['critical'] }), marker('b'), marker('c', { tags: ['actionable'] }), marker('d')]));
  const featured = (id: string): FeaturedReport => ({
    id, title: `Report ${id}`, position: { lat: 40, lng: -83 },
    lines: ['not assessed · by a', 'Written 3 Oct 12:00Z; when it happened was not stated', 'Near 40.0°, -83.0° · within about 1 km', 'Made on this device; not signed'],
  });

  it('says which of how many is here, after where it is', () => {
    expect(withGroupLine(featured('b'), listed).lines).toEqual([
      'not assessed · by a', 'Written 3 Oct 12:00Z; when it happened was not stated', 'Near 40.0°, -83.0° · within about 1 km',
      '3 of 4 here', 'Made on this device; not signed',
    ]);
    expect(withGroupLine(featured('a'), listed).lines[3]).toBe('1 of 4 here');
  });

  it('after "About … as a whole" for a territory\'s', () => {
    const territorial = territoryShareReports([about('t1', ['fr']), about('t2', ['fr'])], resolveCountries);
    const lines = ['raw · by a', 'Written …', 'About France as a whole: the report names no place in it', 'A signed Nostr event'];
    expect(withGroupLine({ id: 't2', title: 'T', position: { lat: 46, lng: 2 }, lines }, territorial).lines)
      .toEqual(['raw · by a', 'Written …', 'About France as a whole: the report names no place in it', '2 of 2 here', 'A signed Nostr event']);
  });

  it('nothing for a report alone, nor for one not listed', () => {
    const alone = listShareReports(groupReportsByPlace([marker('solo')]));
    expect(withGroupLine(featured('solo'), alone).lines).toHaveLength(4);
    expect(withGroupLine(featured('elsewhere'), listed).lines).toHaveLength(4);
  });
});

describe('the globe says it on the card', () => {
  it('for an Intel Report at its place and for one about a territory, from what the handle lists', () => {
    // The line is only as good as its wiring: read where the globe builds the featured card.
    const globe = readFileSync(resolve(__dirname, '../../../../components/Globe/Globe.tsx'), 'utf8');
    const built = globe.slice(globe.indexOf('const featuredForCard = useMemo'), globe.indexOf('}, [featuredReportId,', globe.indexOf('const featuredForCard = useMemo')));
    expect(built).toMatch(/if \(featured\) return withGroupLine\(featured, shareReports\)/);
    expect(built).toMatch(/if \(regionMarks\.featured\) return withGroupLine\(regionMarks\.featured, shareReports\)/);
  });
});

describe('each listed Intel Report says what it is about (v28, BA13)', () => {
  it('its stated top-level category, or null when it states none', () => {
    const listed = listShareReports(groupReportsByPlace([
      marker('war', { tags: ['category:conflict', 'category:conflict.wars'] }),
      marker('none', { latitude: 10 }),
    ]));
    expect(Object.fromEntries(listed.map((r) => [r.id, r.category]))).toEqual({ war: 'conflict', none: null });
  });
});

describe('a card featuring one says what it is about (BA13)', () => {
  it('its category\'s word before its assessment, and nothing for a report stating none', () => {
    expect(featuredReportFor(marker('w', { tags: ['category:conflict.wars', 'category:conflict'] }))!.lines[0]).toBe('conflict · not assessed · by a');
    expect(featuredReportFor(marker('n'))!.lines[0]).toBe('not assessed · by a');
  });
});

