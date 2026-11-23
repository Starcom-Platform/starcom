/**
 * War & Conflict, read (Mecha Jono's Interchange 3.4 and 3.5 of 2026-10-02,
 * kept beside the record in `war-conflict/` with their vectors and vocabulary;
 * the owner's decisions WC1-WC3).
 *
 * Two families are read from The Record, from named publishers only: a
 * conflict item (`conflict_desk`), one line of the day's war news parsed into
 * its theatre, what happened, each side's casualty claims, the forces named
 * and its place; and a war (`war_map`), one of Wikipedia's ongoing armed
 * conflicts with its intensity tier, its countries and its deaths by year.
 * Two sides' casualty numbers are two claims, kept apart and never summed. An
 * actor is a force, group or state, never a person. A place is kept no finer
 * than 0.1°, as everything Starcom draws is. A withdrawal ends its item, and
 * so does a second copy withdrawn as a duplicate.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import { MECHA_JONO_KEYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';
import { readWarConflictNote, WarConflictStore, startWarConflict, warConflictSnapshot, warConflictStatus } from '../warConflict';
import { cappedRelay, settle } from '../../nostr/__tests__/cappedRelay';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/war-conflict');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const VECTORS: Array<{ family: string; event: Partial<Event> }> = JSON.parse(readFileSync(resolve(KEPT, 'conflict_vectors_3_5.json'), 'utf8'));
const vector = (family: string, over: Partial<Event> = {}): Event => {
  const found = VECTORS.find((v) => v.family === family);
  if (!found) throw new Error(`no vector for ${family}`);
  return { id: 'e'.repeat(64), sig: 's'.repeat(128), pubkey: MECHA, created_at: 1_790_967_291, ...found.event, ...over } as Event;
};
const retag = (event: Event, change: (tags: string[][]) => string[][]): Event => ({ ...event, tags: change(event.tags) });
const setTag = (name: string, ...values: string[]) => (tags: string[][]) => [...tags.filter((t) => t[0] !== name), [name, ...values]];
const ITEM = 'conflict_note';
const WAR = 'conflict_war';

describe('a conflict item, as their vector has it: a Pakistani airstrike in Afghanistan', () => {
  const item = () => readWarConflictNote(vector(ITEM));

  it('is an item at its address, with its theatre, what happened, and its source', () => {
    expect(item()).toMatchObject({
      family: 'item',
      id: `30023:${MECHA}:starcom-intel-conflict-wikipedia-8b12506d8d1a4565`,
      theatre: { slug: 'afghanistan-pakistan', name: 'Afghanistan–Pakistan war', region: 'South Asia' },
      events: [{ id: 'airstrike', label: 'Airstrike' }],
      source: 'wikipedia',
      category: 'conflict.events',
      role: 'context',
      reportedAt: 1_790_967_291,
      url: 'https://en.wikipedia.org/wiki/Portal%3ACurrent_events/2026_October_1',
      license: 'CC BY-SA 4.0',
      retracted: false,
    });
  });

  it('keeps each side\'s casualty claim apart, never their sum, and says deaths were reported', () => {
    expect(item()).toMatchObject({
      casualties: [
        { kind: 'killed', count: 22, qualifier: '', words: 'killing of 22 Taliban fighters' },
        { kind: 'killed', count: 9, qualifier: '', words: 'nine women and children are killed' },
      ],
      fatal: true,
    });
  });

  it('names the forces and states, each with its kind and country', () => {
    expect(item()).toMatchObject({
      actors: [
        { name: 'Armed forces of Pakistan', kind: 'state_force', country: 'pk' },
        { name: 'Taliban', kind: 'de_facto_government', country: 'af' },
        { name: 'Government of Afghanistan', kind: 'state', country: 'af' },
      ],
    });
  });

  it('is placed at its province\'s centre, to 0.1°, as an area, in the country it happened in', () => {
    expect(item()).toMatchObject({
      place: { words: 'Kunar Province', precision: 'state' },
      point: { lat: 35, lon: 71.2 },
      precision: 'state',
      jurisdiction: 'af',
    });
  });
});

describe('a war, as their vector has it: the Russo-Ukrainian war', () => {
  const war = () => readWarConflictNote(vector(WAR));

  it('is a war at its address, with its name, tier and countries', () => {
    expect(war()).toMatchObject({
      family: 'war',
      id: `30023:${MECHA}:starcom-intel-war-russo-ukrainian-war`,
      name: 'Russo-Ukrainian war',
      tier: 'major_war',
      tierLabel: 'Major war',
      tierMeans: '10,000 or more combat-related deaths in the current or previous year',
      countries: ['ua', 'ru', 'by'],
      started: '2014',
    });
  });

  it('keeps its deaths as the list writes them, with a number to sort by', () => {
    expect(war()).toMatchObject({
      fatalities: [
        { period: 'cumulative', text: '369,028–827,000+', low: 369_028 },
        { period: '2025', text: '80,245', low: 80_245 },
        { period: '2026', text: '42,279', low: 42_279 },
      ],
      includes: ['Ukrainian resistance in Russian-occupied Ukraine', 'Attacks in Russia', 'Belarusian involvement', 'North Korean involvement'],
      theatres: [{ slug: 'russia-ukraine', name: 'Russia–Ukraine war', region: 'Europe' }],
    });
  });

  it('keeps only the tiers they publish, and refuses a war with none', () => {
    for (const tier of ['major_war', 'minor_war', 'conflict', 'skirmish']) {
      expect(readWarConflictNote(retag(vector(WAR), setTag('intensity', tier, 'x', 'y'))), tier).toMatchObject({ tier });
    }
    expect(readWarConflictNote(retag(vector(WAR), setTag('intensity', 'apocalypse', 'x', 'y')))).toHaveProperty('refused');
    expect(readWarConflictNote(retag(vector(WAR), (tags) => tags.filter((t) => t[0] !== 'intensity')))).toHaveProperty('refused');
  });

  it('drops a country code it cannot read, and keeps the rest', () => {
    const war2 = readWarConflictNote(retag(vector(WAR), (tags) => [...tags, ['jurisdiction', 'Ukraine'], ['jurisdiction', 'u']]));
    expect(war2).toMatchObject({ countries: ['ua', 'ru', 'by'] });
  });
});

describe('what else it reads, and refuses', () => {
  it('reads a casualty with no number it can count as a claim with no count, its words kept', () => {
    const item = readWarConflictNote(retag(vector(ITEM), (tags) => [...tags.filter((t) => t[0] !== 'casualty'), ['casualty', 'killed', 'dozens', 'at least', 'dozens were killed']]));
    expect(item).toMatchObject({ casualties: [{ kind: 'killed', count: null, qualifier: 'at least', words: 'dozens were killed' }] });
  });

  it('keeps at most three things that happened, most specific first', () => {
    const item = readWarConflictNote(retag(vector(ITEM), (tags) => [
      ...tags.filter((t) => t[0] !== 'event'),
      ['event', 'drone_strike', 'Drone strike'], ['event', 'explosion', 'Explosion'], ['event', 'attack', 'Attack'], ['event', 'terror', 'Terrorism'],
    ]));
    expect(item).toMatchObject({ events: [{ id: 'drone_strike' }, { id: 'explosion' }, { id: 'attack' }] });
    expect((item as { events: unknown[] }).events).toHaveLength(3);
  });

  it('places an item by its geohash when it gives no geo, and keeps no finer than 0.1°', () => {
    // Their geohash is `tw4x`, a cell about 20 by 40 km round the point: its centre, at 0.1°.
    const { point } = readWarConflictNote(retag(vector(ITEM), (tags) => tags.filter((t) => t[0] !== 'geo'))) as { point: { lat: number; lon: number } };
    expect(Math.abs(point.lat - 35)).toBeLessThan(0.2);
    expect(Math.abs(point.lon - 71.2)).toBeLessThan(0.3);
    expect(Math.round(point.lat * 10)).toBeCloseTo(point.lat * 10, 9);
    const fine = readWarConflictNote(retag(vector(ITEM), setTag('geo', 'lat:13.1833,lon:30.2167')));
    expect(fine).toMatchObject({ point: { lat: 13.2, lon: 30.2 } });
  });

  it('keeps a lone jurisdiction it can read, and drops one it cannot', () => {
    const noPoint = (j: string) => readWarConflictNote(retag(vector(ITEM), (tags) => [...tags.filter((t) => !['geo', 'g', 'jurisdiction'].includes(t[0])), ['jurisdiction', j]]));
    expect(noPoint('et')).toMatchObject({ jurisdiction: 'et' });
    expect(noPoint('et')).not.toHaveProperty('point');
    expect(noPoint('Ethiopia')).not.toHaveProperty('jurisdiction');
  });

  it('reads a critical role, and when a warning ends', () => {
    const warning = readWarConflictNote(retag(vector(ITEM), (tags) => [
      ...tags.filter((t) => !(t[0] === 't' && t[1].startsWith('role:'))), ['t', 'role:critical'], ['valid_until', '1791200000'],
    ]));
    expect(warning).toMatchObject({ role: 'critical', validUntil: 1_791_200_000 });
  });

  it('refuses what is not theirs, not a conflict note, or their own test', () => {
    expect(readWarConflictNote(vector(ITEM, { pubkey: 'f'.repeat(64) }))).toHaveProperty('refused');
    expect(readWarConflictNote(vector(ITEM, { kind: 1 }))).toHaveProperty('refused');
    expect(readWarConflictNote(retag(vector(ITEM), (tags) => tags.filter((t) => !(t[0] === 't' && t[1] === 'conflict_desk'))))).toHaveProperty('refused');
    expect(readWarConflictNote(retag(vector(ITEM), (tags) => [...tags, ['t', 'scratch-verification']]))).toHaveProperty('refused');
    expect(readWarConflictNote(retag(vector(ITEM), setTag('d', 'raver-heat-risk-x')))).toHaveProperty('refused');
    expect(readWarConflictNote(retag(vector(ITEM), (tags) => tags.filter((t) => t[0] !== 'title')))).toHaveProperty('refused');
    expect(readWarConflictNote(vector(ITEM, { content: '{"json": true}' }))).toHaveProperty('refused');
  });

  it('refuses the war map\'s index: it lists wars, and is not one', () => {
    expect(readWarConflictNote(vector('war_map_index'))).toHaveProperty('refused');
  });
});

describe('what stands', () => {
  it('a newer note replaces the one at its address', () => {
    const store = new WarConflictStore([MECHA]);
    store.accept(vector(ITEM, { created_at: 1_000 }));
    store.accept(retag(vector(ITEM, { id: 'f'.repeat(64), created_at: 2_000 }), setTag('title', 'Edited line')));
    expect(store.items().map((i) => i.title)).toEqual(['Edited line']);
  });

  // Mecha Jono's key changes in early November 2026 (D-HW): the same note under both keys is one note.
  it('keeps one note across Mecha Jono\'s keys: the newer version stands', () => {
    const NEW = 'a'.repeat(64);
    const store = new WarConflictStore([NEW, MECHA], [{ name: 'mecha-jono', keys: [NEW, MECHA] }]);
    store.accept(vector(ITEM, { created_at: 1_000 }));
    store.accept(retag(vector(ITEM, { pubkey: NEW, id: 'f'.repeat(64), created_at: 2_000 }), setTag('title', 'Signed under the new key')));
    expect(store.items().map((i) => i.title)).toEqual(['Signed under the new key']);
  });

  it('a withdrawal ends its item, and so does a second copy withdrawn as a duplicate', () => {
    const store = new WarConflictStore([MECHA]);
    store.accept(vector(ITEM, { created_at: 1_000 }));
    store.accept(retag(vector(ITEM, { id: 'f'.repeat(64), created_at: 2_000 }), (tags) => [...tags, ['t', 'retracted'], ['t', 'duplicate'], ['duplicate_of', 'starcom-intel-conflict-x']]));
    expect(store.items()).toEqual([]);
  });

  it('lists items newest first, and wars by tier, then by this year\'s deaths', () => {
    const store = new WarConflictStore([MECHA]);
    store.accept(retag(vector(ITEM, { id: 'a'.repeat(64) }), (tags) => setTag('published_at', '100')(setTag('d', 'starcom-intel-conflict-wikipedia-old')(tags))));
    store.accept(retag(vector(ITEM, { id: 'b'.repeat(64) }), (tags) => setTag('published_at', '200')(setTag('d', 'starcom-intel-conflict-wikipedia-new')(tags))));
    expect(store.items().map((i) => i.d)).toEqual(['starcom-intel-conflict-wikipedia-new', 'starcom-intel-conflict-wikipedia-old']);
    const war = (d: string, tier: string, deaths: string) => retag(vector(WAR, { id: d.padEnd(64, '0').slice(0, 64) }), (tags) => [
      ...tags.filter((t) => !['d', 'intensity', 'fatalities'].includes(t[0])), ['d', d], ['intensity', tier, tier, ''], ['fatalities', '2026', deaths, deaths],
    ]);
    store.accept(war('starcom-intel-war-small', 'skirmish', '50'));
    store.accept(war('starcom-intel-war-big', 'major_war', '20000'));
    store.accept(war('starcom-intel-war-bigger', 'major_war', '40000'));
    // A major war by last year's deaths can have fewer so far this year than a minor one,
    // as the Congolese conflicts did on 2 October (3,493): its tier still comes first.
    store.accept(war('starcom-intel-war-major-quiet', 'major_war', '3493'));
    store.accept(war('starcom-intel-war-minor-loud', 'minor_war', '5000'));
    expect(store.wars().map((w) => w.d)).toEqual([
      'starcom-intel-war-bigger', 'starcom-intel-war-big', 'starcom-intel-war-major-quiet', 'starcom-intel-war-minor-loud', 'starcom-intel-war-small',
    ]);
  });
});

describe('asking The Record', () => {
  it('reads every note it holds, though it returns them a page at a time, and says it has read them only then', async () => {
    const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(KEPT, 'war_conflict_live_2026-10-02.json'), 'utf8'));
    const direct = new WarConflictStore([MECHA]);
    for (const event of LIVE.events) direct.accept(event);
    // A cap of 50 where The Record's is 500: their notes grow by dozens a day, and passed 149 on 3 October.
    const relay = cappedRelay([...LIVE.events], { cap: 50, url: THE_RECORD_RELAY });
    const stop = startWarConflict({ pool: relay.pool });
    expect(warConflictStatus().loaded).toBe(false);
    await settle();
    expect(relay.subscribeMany.mock.calls.length).toBeGreaterThan(3);
    expect(warConflictStatus()).toMatchObject({ loaded: true, error: null });
    expect(warConflictSnapshot().items.map((i) => i.id).sort()).toEqual(direct.items().map((i) => i.id).sort());
    stop();
  });

  it('for its conflict notes and its wars, from named publishers only', () => {
    const subscribeMany = vi.fn(() => ({ close: vi.fn() }));
    const stop = startWarConflict({ pool: { subscribeMany } as never });
    expect(subscribeMany).toHaveBeenCalledWith(
      [THE_RECORD_RELAY], { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': ['conflict_desk', 'war_map'] }, expect.anything(),
    );
    stop();
  });
});

describe('their real notes of 2 October', () => {
  // Signed by their key and read from The Record that day, read-only.
  const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(KEPT, 'war_conflict_live_2026-10-02.json'), 'utf8'));

  it('reads every conflict note and war they sent, and refuses only the index and the brief', () => {
    const refused = LIVE.events.map((e) => readWarConflictNote(e)).filter((r) => 'refused' in r);
    expect(refused).toHaveLength(2);
  });

  it('leaves 57 items standing once the withdrawals and duplicates are applied, and 48 wars', () => {
    const store = new WarConflictStore([MECHA]);
    for (const event of LIVE.events) store.accept(event);
    expect(store.items()).toHaveLength(57);
    expect(store.wars()).toHaveLength(48);
  });
});

// Mecha Jono's key change (2 Nov 2026): a note re-signed under the new key keeps its time, by its carried tag.
describe('a War & Conflict note carried to Mecha Jono\'s new key', () => {
  it('is reported when it was first published, not when it was carried', () => {
    const carried = retag(vector(ITEM, { pubkey: MECHA_JONO_KEYS[0], created_at: 1_793_631_600 }), setTag('carried', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', '1790967291'));
    expect(readWarConflictNote(carried)).toMatchObject({ reportedAt: 1_790_967_291, createdAt: 1_793_631_600 });
  });
});
