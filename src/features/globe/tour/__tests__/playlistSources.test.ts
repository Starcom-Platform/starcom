/**
 * What each briefing playlist holds, from its layer (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP5, BP6).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { ConflictItem, WarItem } from '../../../../services/warConflict/warConflict';
import type { RaverWatchItem } from '../../../../services/raverWatch/raverWatch';
import { heatCandidates, raveCandidates, warCandidates } from '../playlistSources';

const PK = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const DAY = 86_400;
const TODAY = 20_369 * DAY; // 2025-10-08T00:00Z, a day the fixtures are reported on
const conflict = (id: string, over: Partial<ConflictItem> = {}): ConflictItem => ({
  family: 'item', id, pubkey: PK, d: id, eventId: 'e', createdAt: TODAY + 3600, title: `Item ${id}`, reportedAt: TODAY + 3600,
  content: 'words', events: [{ id: 'airstrike', label: 'Airstrike' }], fatal: false, actors: [], casualties: [],
  theatre: { slug: 'ukraine', name: 'Russo-Ukrainian war', region: 'Europe' },
  point: { lat: 49, lon: 32 }, precision: 'town', jurisdiction: 'ua', source: 'wikipedia',
  ...over,
});
const war = (slug: string, tier: WarItem['tier']): WarItem => ({
  family: 'war', id: `war-${slug}`, pubkey: PK, d: slug, eventId: 'e', createdAt: TODAY, title: slug, reportedAt: TODAY, content: '',
  name: slug, tier, tierLabel: tier, tierMeans: '', countries: [], fatalities: [], includes: [],
  theatres: [{ slug, name: slug, region: '' }],
} as unknown as WarItem);
const noRegion = () => null;
const regionName = (code: string) => ({ ua: 'Ukraine', sd: 'Sudan' } as Record<string, string>)[code] ?? null;

describe('War & Conflict today (BP5, BP6)', () => {
  const wars = [war('ukraine', 'major_war'), war('sudan', 'major_war'), war('kivu', 'minor_war')];

  it('holds the newest day of the brief, critical before deadly before the rest, each saying why', () => {
    const { candidates } = warCandidates([
      conflict('report'),
      conflict('critical', { role: 'critical' }),
      conflict('deadly', { fatal: true }),
      conflict('yesterday', { role: 'critical', reportedAt: TODAY - 3600 }),
    ], wars, noRegion, regionName);
    const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
    expect(sorted.map((c) => c.id)).toEqual(['critical', 'deadly', 'report']);
    expect(sorted.map((c) => c.why)).toEqual([
      'Critical, as its report tagged it · Russo-Ukrainian war',
      'Deaths reported · Russo-Ukrainian war',
      'In the day\'s brief · Russo-Ukrainian war',
    ]);
  });

  it('ranks a theatre of a worse war first among equals, and one on no war\'s list last', () => {
    const { candidates } = warCandidates([
      conflict('skirmish', { fatal: true, theatre: { slug: 'kivu', name: 'Kivu', region: '' } }),
      conflict('major', { fatal: true }),
      conflict('unlisted', { fatal: true, theatre: { slug: 'elsewhere', name: 'Elsewhere', region: '' } }),
    ], wars, noRegion, regionName);
    expect([...candidates].sort((a, b) => a.rank - b.rank).map((c) => c.id)).toEqual(['major', 'skirmish', 'unlisted']);
  });

  it('groups by theatre, an item on none by its country, and one naming neither by its 10° cell', () => {
    const { candidates } = warCandidates([
      conflict('theatre'),
      conflict('country', { theatre: undefined, jurisdiction: 'sd', point: { lat: 15, lon: 30 } }),
      conflict('cell', { theatre: undefined, jurisdiction: undefined, point: { lat: -12.3, lon: 45.6 } }),
    ], wars, noRegion, regionName);
    const group = Object.fromEntries(candidates.map((c) => [c.id, c.group]));
    expect(group).toEqual({ theatre: 'theatre:ukraine', country: 'region:sd', cell: 'cell:-2:4' });
  });

  it('leaves out what has no place to stand at, and says what it is in the layer\'s own words', () => {
    const { candidates } = warCandidates([conflict('nowhere', { point: undefined, jurisdiction: undefined }), conflict('here')], wars, noRegion, regionName);
    expect(candidates.map((c) => c.id)).toEqual(['here']);
    expect(candidates[0].title).toBe('Item here');
    expect(candidates[0].position).toEqual({ lat: 49, lng: 32 });
    expect(candidates[0].lines[0]).toMatch(/^War & Conflict · /);
    expect(candidates[0].lines.join(' ')).not.toMatch(/Mecha Jono/);
  });

  it('is nothing on a day with no items', () => {
    expect(warCandidates([], wars, noRegion, regionName).candidates).toEqual([]);
  });
});

const NOW = TODAY * 1000 + 18 * 3_600_000; // 18:00Z
const rave = (id: string, over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id, pubkey: PK, d: id, eventId: 'e', createdAt: TODAY, layer: 'DrugCheckAlerts', title: `Rave ${id}`, source: 'checkit! Wien',
  validFrom: TODAY, validUntil: TODAY + 7 * DAY, content: 'words', level: 'red', point: { lat: 48.2, lon: 16.4 }, jurisdiction: 'at',
  ...over,
});
const event = (id: string, startHourZ: number, over: Partial<RaverWatchItem> = {}) => rave(id, {
  layer: 'SceneEvents', level: undefined, start: TODAY + startHourZ * 3600, end: TODAY + (startHourZ + 6) * 3600,
  validFrom: TODAY, validUntil: TODAY + (startHourZ + 6) * 3600, ...over,
});

describe('Raver Watch tonight (BP5)', () => {
  it('holds red, then amber alerts and incidents, then tonight\'s scene events, soonest first', () => {
    const candidates = raveCandidates([
      event('late', 23),
      rave('amber', { level: 'amber', layer: 'SceneIncidents' }),
      event('early', 21),
      rave('red'),
    ], NOW, noRegion);
    const order = [...candidates].sort((a, b) => a.rank - b.rank || b.at - a.at).map((c) => c.id);
    expect(order).toEqual(['red', 'amber', 'early', 'late']);
    const why = Object.fromEntries(candidates.map((c) => [c.id, c.why]));
    expect(why).toEqual({
      red: 'Red drug-check alert',
      amber: 'Amber scene incident',
      early: 'A scene event tonight, from 21:00Z',
      late: 'A scene event tonight, from 23:00Z',
    });
  });

  it('leaves out information, heat, sites, missions, news, cancelled events and anything not standing tonight', () => {
    const candidates = raveCandidates([
      rave('info', { level: 'info' }),
      rave('heat', { layer: 'HeatRisk', heatRisk: 3 }),
      rave('site', { layer: 'HarmReductionSites', level: undefined }),
      rave('mission', { layer: 'RaverMissions' }),
      event('news', 21, { sceneNews: true }),
      event('cancelled', 21, { cancelled: true }),
      event('next-week', 21 + 7 * 24),
      rave('over', { validUntil: TODAY + 3600 }),
      rave('kept'),
    ], NOW, noRegion);
    expect(candidates.map((c) => c.id)).toEqual(['kept']);
  });

  it('groups by the state or country it names', () => {
    const [c] = raveCandidates([rave('a', { jurisdiction: 'us-tx' })], NOW, noRegion);
    expect(c.group).toBe('region:us-tx');
  });
});

describe('the heat watch (BP5)', () => {
  const heat = (id: string, level: number, over: Partial<RaverWatchItem> = {}) => rave(id, {
    layer: 'HeatRisk', level: undefined, heatRisk: level, jurisdiction: 'us-az', validFrom: TODAY + 6 * 3600, validUntil: TODAY + 30 * 3600, ...over,
  });

  it('holds Orange and above, the worst first, saying its level', () => {
    const candidates = heatCandidates([heat('yellow', 1), heat('orange', 2), heat('magenta', 4), heat('red', 3)], NOW, noRegion);
    expect([...candidates].sort((a, b) => a.rank - b.rank).map((c) => c.id)).toEqual(['magenta', 'red', 'orange']);
    expect(candidates.find((c) => c.id === 'magenta')!.why).toBe('HeatRisk Magenta (4 of 4)');
  });

  it('only what stands now or tonight', () => {
    expect(heatCandidates([heat('tomorrow', 4, { validFrom: TODAY + 2 * DAY, validUntil: TODAY + 3 * DAY })], NOW, noRegion)).toEqual([]);
  });
});
