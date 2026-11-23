/**
 * What of War & Conflict is drawn, and how (decisions WC1-WC3).
 *
 * An item stands for three days from when it was reported, the day's news and
 * the two before, fading through its last quarter; a warning that says when
 * it ends stands until then. With a window chosen, an item stands when it was
 * reported inside it. The glyph is what happened; the backing says the most
 * serious thing about it: a critical warning glows, a line that reports deaths
 * is ringed, and the rest are discs. Its hover gives each casualty claim
 * apart, never their sum. The war map shades each war's countries by its
 * tier, and a country in two wars takes the higher.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { WarConflictStore, type ConflictItem, type WarItem } from '../warConflict';
import { THEATRE_COUNTRIES } from '../theatreCountries';
import {
  ITEM_LIVE_S, standsAt, fadeAt, glyphOf, backingOf, describeConflictItem, warMapCountries, sourceName, isWarConflictNote,
  CONFLICT_GLYPHS, eventGlyphKnown, sourceNamed, unknownIn, stateForceArcs,
} from '../warConflictView';

const HOUR = 3_600;
const NOW = 1_791_000_000;
const item = (over: Partial<ConflictItem> = {}): ConflictItem => ({
  family: 'item', id: '30023:pk:starcom-intel-conflict-wikipedia-x', pubkey: 'pk', d: 'starcom-intel-conflict-wikipedia-x', eventId: 'e',
  createdAt: NOW - HOUR, title: 'Pakistan launches airstrikes in Afghanistan', reportedAt: NOW - HOUR, content: 'words',
  events: [{ id: 'airstrike', label: 'Airstrike' }], casualties: [], fatal: false, actors: [], source: 'wikipedia', role: 'context',
  ...over,
});
const war = (over: Partial<WarItem> = {}): WarItem => ({
  family: 'war', id: '30023:pk:starcom-intel-war-x', pubkey: 'pk', d: 'starcom-intel-war-x', eventId: 'e', createdAt: NOW,
  title: 'Major war: X', reportedAt: NOW, content: 'words', name: 'X', tier: 'major_war', tierLabel: 'Major war', tierMeans: '',
  countries: ['ua'], fatalities: [], includes: [], theatres: [], ...over,
});
const live = (atS: number) => ({ atS, window: null });

describe('when an item stands', () => {
  it('for three days from when it was reported', () => {
    expect(ITEM_LIVE_S).toBe(72 * HOUR);
    const it1 = item({ reportedAt: NOW });
    expect(standsAt(it1, live(NOW - 1))).toBe(false);
    expect(standsAt(it1, live(NOW))).toBe(true);
    expect(standsAt(it1, live(NOW + 72 * HOUR - 1))).toBe(true);
    expect(standsAt(it1, live(NOW + 72 * HOUR))).toBe(false);
  });

  it('a warning that says when it ends, until then', () => {
    const warning = item({ reportedAt: NOW, validUntil: NOW + 10 * 24 * HOUR });
    expect(standsAt(warning, live(NOW + 5 * 24 * HOUR))).toBe(true);
    expect(standsAt(warning, live(NOW + 10 * 24 * HOUR))).toBe(false);
  });

  it('with a window chosen, when it was reported inside it', () => {
    const it1 = item({ reportedAt: NOW });
    expect(standsAt(it1, { atS: NOW + HOUR, window: { fromS: NOW - HOUR, untilS: NOW + HOUR } })).toBe(true);
    expect(standsAt(it1, { atS: NOW, window: { fromS: NOW + 1, untilS: NOW + HOUR } })).toBe(false);
    // A warning still in force during the window stands, though reported before it.
    const warning = item({ reportedAt: NOW - 48 * HOUR, validUntil: NOW + 48 * HOUR });
    expect(standsAt(warning, { atS: NOW + HOUR, window: { fromS: NOW, untilS: NOW + HOUR } })).toBe(true);
  });

  it('whole until its last quarter, then fading, never below what still reads', () => {
    const it1 = item({ reportedAt: NOW });
    expect(fadeAt(it1, live(NOW + 50 * HOUR))).toBe(1);
    expect(fadeAt(it1, live(NOW + 66 * HOUR))).toBeLessThan(1);
    expect(fadeAt(it1, live(NOW + 72 * HOUR - 1))).toBeGreaterThanOrEqual(0.3);
  });
});

describe('how an item is drawn', () => {
  it('its glyph is what happened, by its first, most specific event', () => {
    expect(glyphOf(item({ events: [{ id: 'drone_strike', label: '' }] }))).toBe('strike');
    expect(glyphOf(item({ events: [{ id: 'shelling', label: '' }] }))).toBe('strike');
    expect(glyphOf(item({ events: [{ id: 'ground_fighting', label: '' }] }))).toBe('fighting');
    expect(glyphOf(item({ events: [{ id: 'hostage', label: '' }] }))).toBe('captive');
    expect(glyphOf(item({ events: [{ id: 'piracy', label: '' }] }))).toBe('sea');
    expect(glyphOf(item({ events: [{ id: 'dark_fleet', label: '' }] }))).toBe('sea');
    expect(glyphOf(item({ events: [{ id: 'ceasefire_talks', label: '' }] }))).toBe('diplomacy');
    expect(glyphOf(item({ events: [{ id: 'nuclear_safety', label: '' }] }))).toBe('nuclear');
    expect(glyphOf(item({ events: [{ id: 'travel_warning', label: '' }] }))).toBe('warning');
    expect(glyphOf(item({ events: [{ id: 'internet_shutdown', label: '' }] }))).toBe('shutdown');
    expect(glyphOf(item({ events: [{ id: 'export_controls', label: '' }] }))).toBe('sanctions');
    expect(glyphOf(item({ events: [{ id: 'humanitarian', label: '' }] }))).toBe('humanitarian');
    expect(glyphOf(item({ events: [{ id: 'troop_movement', label: '' }] }))).toBe('troops');
  });

  it('the events their Interchange 3.6 added (WC5): protest and unrest as unrest, a launch as a strike, the rest as warnings', () => {
    expect(CONFLICT_GLYPHS).toContain('unrest');
    expect(glyphOf(item({ events: [{ id: 'protest', label: '' }] }))).toBe('unrest');
    expect(glyphOf(item({ events: [{ id: 'unrest', label: '' }] }))).toBe('unrest');
    expect(glyphOf(item({ events: [{ id: 'missile_launch', label: '' }] }))).toBe('strike');
    expect(glyphOf(item({ events: [{ id: 'state_of_emergency', label: '' }] }))).toBe('warning');
    expect(glyphOf(item({ events: [{ id: 'election_security', label: '' }] }))).toBe('warning');
  });

  it('with no event it knows, by its category, else as a report', () => {
    expect(glyphOf(item({ events: [], category: 'conflict.airspace' }))).toBe('warning');
    expect(glyphOf(item({ events: [], category: 'conflict.security_council' }))).toBe('diplomacy');
    expect(glyphOf(item({ events: [{ id: 'something_new', label: '' }] }))).toBe('report');
  });

  it('its backing says the most serious thing: a critical warning, then deaths reported', () => {
    expect(backingOf(item({ role: 'critical', fatal: true }))).toBe('critical');
    expect(backingOf(item({ fatal: true }))).toBe('deadly');
    expect(backingOf(item())).toBe('report');
  });
});

describe('what its hover says', () => {
  const said = () => describeConflictItem(item({
    fatal: true,
    casualties: [
      { kind: 'killed', count: 22, qualifier: '', words: 'killing of 22 Taliban fighters' },
      { kind: 'killed', count: 9, qualifier: '', words: 'nine women and children are killed' },
    ],
    actors: [{ name: 'Armed forces of Pakistan', kind: 'state_force', country: 'pk' }, { name: 'Taliban', kind: 'de_facto_government', country: 'af' }],
    theatre: { slug: 'afghanistan-pakistan', name: 'Afghanistan–Pakistan war', region: 'South Asia' },
    place: { words: 'Kunar Province', precision: 'state' }, point: { lat: 35, lon: 71.2 }, precision: 'state', jurisdiction: 'af',
    license: 'CC BY-SA 4.0',
  }), (code) => (code === 'af' ? 'Afghanistan' : null));

  it('each casualty claim apart, saying they are not added', () => {
    expect(said()).toContain('22 killed; 9 killed');
    expect(said()).toMatch(/separate claims, not added/);
    expect(said()).not.toContain('31');
  });

  it('what happened, the war it belongs to, the forces named, where, and when it was reported', () => {
    expect(said()).toContain('Airstrike');
    expect(said()).toContain('Afghanistan–Pakistan war');
    expect(said()).toContain('Armed forces of Pakistan; Taliban');
    expect(said()).toContain('Kunar Province, Afghanistan');
    expect(said()).toMatch(/a province, marked at its centre/);
    expect(said()).toMatch(/Reported \d+ \w+ 2026 \d\d:\d\dZ/);
    expect(said()).toContain("Wikipedia's Current events portal");
    expect(said()).toContain('CC BY-SA 4.0');
  });

  it('a claim with no number in its own words, and a qualifier kept', () => {
    const text = describeConflictItem(item({ casualties: [{ kind: 'killed', count: null, qualifier: 'at least', words: 'dozens were killed' }] }), () => null);
    expect(text).toContain('"dozens were killed"');
    const atLeast = describeConflictItem(item({ casualties: [{ kind: 'injured', count: 40, qualifier: 'at least', words: '' }] }), () => null);
    expect(atLeast).toContain('at least 40 injured');
  });

  it('names a source it does not know by its id', () => {
    expect(sourceName('un_news')).toBe('UN News');
    expect(sourceName('somewhere_new')).toBe('somewhere_new');
  });

  it('names the sources their Interchange 3.6 added', () => {
    expect(sourceName('mofa_jp')).toBe("Japan's Ministry of Foreign Affairs");
    expect(sourceName('rferl')).toBe('Radio Free Europe/Radio Liberty');
  });

  it('names the two sources the audit of 23 October found shown by their ids', () => {
    expect(sourceName('wiki_timeline')).toBe("Wikipedia's conflict timelines");
    expect(sourceName('uk_mod')).toBe('the UK Ministry of Defence');
  });
});

describe('what this build does not know (IX1)', () => {
  it('names each event type with no glyph and each source with no name, with how many items carry it, most first', () => {
    const items = [
      item({ events: [{ id: 'coup', label: '' }], source: 'new_desk' }),
      item({ events: [{ id: 'coup', label: '' }, { id: 'airstrike', label: '' }], source: 'un_news' }),
      // An item naming one event twice is one item that names it.
      item({ events: [{ id: 'blockade', label: '' }, { id: 'blockade', label: 'Blockade' }], source: 'new_desk' }),
      item({ events: [{ id: 'airstrike', label: '' }], source: undefined }),
    ];
    expect(unknownIn(items)).toEqual({
      events: [{ id: 'coup', count: 2 }, { id: 'blockade', count: 1 }],
      sources: [{ id: 'new_desk', count: 2 }],
    });
    expect(unknownIn([item()])).toEqual({ events: [], sources: [] });
    expect([eventGlyphKnown('airstrike'), eventGlyphKnown('coup')]).toEqual([true, false]);
    expect([sourceNamed('un_news'), sourceNamed('new_desk')]).toEqual([true, false]);
  });

  it('knows every event type and source of their notes of 3 October, read after their 3.6.3', () => {
    const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/war-conflict');
    const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(KEPT, 'war_conflict_live_2026-10-03.json'), 'utf8'));
    const store = new WarConflictStore([LIVE.events[0].pubkey]);
    for (const event of LIVE.events) store.accept(event);
    expect(store.items().length).toBe(89);
    expect(unknownIn(store.items())).toEqual({ events: [], sources: [] });
  });
});

/*
 * Where a war is fought, not every country on its list (theatre-lens.md, TL1,
 * TL11, TL12): the wash that drowned a card's own item.
 */
describe('the war map, filled where a war is fought', () => {
  const theatre = (slug: string) => ({ slug, name: slug, region: '' });
  const countries = { 'russia-ukraine': ['ua', 'ru'], mexico: ['mx'], sahel: ['ml', 'bf', 'ne'] };

  it('fills a war\'s theatres\' countries and only outlines the rest of its list', () => {
    const map = warMapCountries([
      war({ name: 'Russo-Ukrainian war', countries: ['ua', 'ru', 'by'], theatres: [theatre('russia-ukraine')] }),
      war({ name: 'Mexican drug war', countries: ['mx', 'us', 'gt'], theatres: [theatre('mexico')] }),
    ], countries);
    expect(map.get('ua')).toEqual({ tier: 'major_war', wars: ['Russo-Ukrainian war'], filled: true });
    expect(map.get('by')).toEqual({ tier: 'major_war', wars: ['Russo-Ukrainian war'], filled: false });
    expect(map.get('mx')!.filled).toBe(true);
    expect(map.get('us')!.filled).toBe(false);
  });

  it('fills a war on no theatre where it lists one country, and only outlines one that lists several', () => {
    const map = warMapCountries([
      war({ name: 'Peruvian conflict', tier: 'skirmish', countries: ['pe'] }),
      war({ name: 'Brazilian drug war', tier: 'minor_war', countries: ['br', 'py', 'bo'] }),
    ], countries);
    expect(map.get('pe')!.filled).toBe(true);
    expect(['br', 'py', 'bo'].map((c) => map.get(c)!.filled)).toEqual([false, false, false]);
  });

  it('never outlines a country another war fills, and gives each its worst tier of each kind', () => {
    const map = warMapCountries([
      war({ name: 'Sahel', tier: 'minor_war', countries: ['ml', 'bf', 'ne', 'dz'], theatres: [theatre('sahel')] }),
      war({ name: 'Algerian', tier: 'major_war', countries: ['dz', 'ml'] }),
    ], countries);
    // Mali: filled for the Sahel, outlined for the Algerian war: filled, at the filled war's tier.
    expect(map.get('ml')).toEqual({ tier: 'minor_war', wars: ['Sahel'], filled: true });
    // Algeria: outer for both: outlined, at the worse of the two.
    expect(map.get('dz')).toEqual({ tier: 'major_war', wars: ['Algerian', 'Sahel'], filled: false });
  });
});

describe('the theatres\' countries, as Interchange 3.5 lists them (TL11)', () => {
  it('match the kept vocabulary, every theatre and every country', () => {
    const kept = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/war-conflict/conflict_vocabulary_3_5.json'), 'utf8'));
    const theatres = (Array.isArray(kept.theatres) ? kept.theatres : Object.values(kept.theatres)) as Array<{ slug: string; countries: string[] }>;
    expect(Object.fromEntries(theatres.map((t) => [t.slug, t.countries]))).toEqual(THEATRE_COUNTRIES);
  });
});

describe('drawn once', () => {
  // Their notes carry t=starcom_intel too, which Intel Reports reads.
  it('knows a War & Conflict note among Intel Reports by its desk\'s tag', () => {
    expect(isWarConflictNote(['nostr', 'conflict_desk', 'starcom_intel'])).toBe(true);
    expect(isWarConflictNote(['war_map', 'starcom_intel'])).toBe(true);
    expect(isWarConflictNote(['nostr', 'starcom_intel', 'world_desk'])).toBe(false);
    expect(isWarConflictNote(undefined)).toBe(false);
  });
});

/*
 * Arcs of state forces (theatre-lens.md, TL6): a state's forces named in an item,
 * from their country to where it happened. Only state forces, only from another
 * country, and only where both ends can be placed.
 */
describe('arcs of state forces', () => {
  const MIDDLES: Record<string, { lat: number; lng: number }> = { us: { lat: 39, lng: -98 }, iq: { lat: 33, lng: 43.7 }, pk: { lat: 30, lng: 69 }, af: { lat: 33.9, lng: 67.7 } };
  const places = {
    // Where the item happened: its point, else its country's middle.
    placeOf: (it: ConflictItem) => (it.point ? { lat: it.point.lat, lng: it.point.lon } : MIDDLES[it.jurisdiction ?? ''] ?? null),
    countryOf: (code: string) => (code in MIDDLES ? code : null),
    middleOf: (code: string) => MIDDLES[code] ?? null,
  };
  const us = { name: 'Armed forces of United States', kind: 'state_force', country: 'us' };

  it('joins a state force\'s country to where the item happened, when it is another country', () => {
    const strike = item({ id: 'a', jurisdiction: 'iq', point: { lat: 36.3, lon: 43.1 }, actors: [us, { name: 'Islamic State', kind: 'armed_group', country: '' }] });
    expect(stateForceArcs([strike], places)).toEqual([
      { itemId: 'a', actor: 'Armed forces of United States', from: 'us', start: MIDDLES.us, end: { lat: 36.3, lng: 43.1 } },
    ]);
  });

  it('draws none for a force at home, any other kind of actor, or an end it cannot place', () => {
    const atHome = item({ id: 'b', jurisdiction: 'pk', actors: [{ name: 'Armed forces of Pakistan', kind: 'state_force', country: 'pk' }] });
    const police = item({ id: 'c', jurisdiction: 'iq', actors: [{ name: 'Police of United States', kind: 'police', country: 'us' }] });
    const unplaced = item({ id: 'd', jurisdiction: 'zz', point: undefined, actors: [us] });
    const nowhere = item({ id: 'e', jurisdiction: 'iq', actors: [{ name: 'Armed forces of Atlantis', kind: 'state_force', country: 'at' }] });
    // A point in a country it cannot name: "another country" cannot be told.
    const unnamed = item({ id: 'h', jurisdiction: 'zz', point: { lat: 33, lon: 44 }, actors: [us] });
    expect(stateForceArcs([atHome, police, unplaced, nowhere, unnamed], places)).toEqual([]);
  });

  it('draws one arc for a country named twice in one item, and one for each item', () => {
    const twice = item({ id: 'f', jurisdiction: 'af', point: undefined, actors: [{ name: 'Armed forces of Pakistan', kind: 'state_force', country: 'pk' }, { name: 'Pakistan Air Force', kind: 'state_force', country: 'pk' }] });
    const again = item({ id: 'g', jurisdiction: 'af', point: undefined, actors: [{ name: 'Armed forces of Pakistan', kind: 'state_force', country: 'pk' }] });
    expect(stateForceArcs([twice, again], places).map((a) => [a.itemId, a.from, a.actor])).toEqual([
      ['f', 'pk', 'Armed forces of Pakistan'], ['g', 'pk', 'Armed forces of Pakistan'],
    ]);
  });
});
