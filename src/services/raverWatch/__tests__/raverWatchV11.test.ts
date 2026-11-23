/**
 * Raver Watch v1.1, read (Mecha Jono's answers of 2026-10-01, kept beside the
 * record as RAVER_WATCH_V1_1.md with its schema and seven vectors).
 *
 * v1.1 is additive: every v1 note still reads as before. It adds scene events
 * as NIP-52 calendar events (kind 31923) with their own start and end, a
 * cancellation that is a status rather than a withdrawal, a geohash beside the
 * point, how precise the point is (a town, or a state's main city standing for
 * the state), warnings wider than a country (`region: europe`), policy news,
 * and subdivisions outside the US (ISO 3166-2). Their vectors are read here as
 * they wrote them; the "expect" line of each is what these tests hold.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import { MECHA_JONO_KEYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';
import { readRaverWatchNote, RaverWatchStore, startRaverWatch } from '../raverWatch';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/raver-watch');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const VECTORS: Array<{ name: string; event: Partial<Event> }> = JSON.parse(readFileSync(resolve(KEPT, 'raver_watch_v1_1_vectors.json'), 'utf8'));
/** A vector as a signed event. They are unsigned; ids differ so the store can tell versions apart. */
const vector = (name: string, over: Partial<Event> = {}): Event => {
  const found = VECTORS.find((v) => v.name === name);
  if (!found) throw new Error(`no vector named "${name}"`);
  return { id: 'e'.repeat(64), sig: 's'.repeat(128), ...found.event, ...over } as Event;
};
const VIENNA = 'a red lab warning, drawn at its city';
const NSW = 'an amber warning for a state, drawn as a point at its main city';
const EUROPE = 'a warning for all of Europe';
const POLICY = 'law and policy news';
const WITHDRAWAL = 'a withdrawal';
const EVENT = 'an upcoming scene event';
const CANCELLED = 'a cancelled scene event';
const retag = (event: Event, change: (tags: string[][]) => string[][]): Event => ({ ...event, tags: change(event.tags) });

describe('Raver Watch v1.1: their vectors, read as they expect', () => {
  // v1.2 added two after these (raverWatchV12.test.ts).
  it('has all seven of their v1.1 vectors, first', () => {
    expect(VECTORS.map((v) => v.name).slice(0, 7)).toEqual([VIENNA, NSW, EUROPE, POLICY, WITHDRAWAL, EVENT, CANCELLED]);
  });

  it('a red lab warning: DrugCheckAlerts at Vienna, at a town', () => {
    expect(readRaverWatchNote(vector(VIENNA))).toMatchObject({
      layer: 'DrugCheckAlerts', level: 'red', jurisdiction: 'at', point: { lat: 48.2, lon: 16.4 }, precision: 'city',
    });
  });

  it('a warning for a state: a point at its main city that stands for the state, not a venue', () => {
    const note = readRaverWatchNote(vector(NSW));
    expect(note).toMatchObject({ layer: 'DrugCheckAlerts', level: 'amber', point: { lat: -33.9, lon: 151.2 }, precision: 'state' });
    expect(note).not.toHaveProperty('jurisdiction');
  });

  it('a warning for all of Europe: a region, with no jurisdiction and no point', () => {
    const note = readRaverWatchNote(vector(EUROPE));
    expect(note).toMatchObject({ layer: 'DrugCheckAlerts', region: 'europe' });
    expect(note).not.toHaveProperty('point');
    expect(note).not.toHaveProperty('jurisdiction');
  });

  it('law and policy news: a scene incident whose category is policy', () => {
    expect(readRaverWatchNote(vector(POLICY))).toMatchObject({ layer: 'SceneIncidents', category: 'policy', level: 'amber' });
  });

  it('an upcoming scene event: kind 31923, with its own start, end and time zone, its town and genres', () => {
    expect(readRaverWatchNote(vector(EVENT))).toMatchObject({
      id: `31923:${MECHA}:raver-scene-event-19hz-f7c97f72d6e4ae4a`,
      layer: 'SceneEvents',
      category: 'event',
      start: 1_791_003_600,
      end: 1_791_021_600,
      startTzid: 'America/Los_Angeles',
      location: 'San Francisco, CA',
      genres: ['disco', 'funk', 'house'],
      jurisdiction: 'us-ca',
      point: { lat: 37.8, lon: -122.4 },
      precision: 'city',
      validFrom: 1_790_888_400,
      validUntil: 1_791_021_600,
      cancelled: false,
      retracted: false,
    });
  });

  it('a cancelled scene event: kept, marked cancelled, not withdrawn', () => {
    expect(readRaverWatchNote(vector(CANCELLED))).toMatchObject({ layer: 'SceneEvents', cancelled: true, retracted: false });
  });

  // Mecha Jono's key changes in early November 2026 (D-HW): the same note under both keys is one note.
  it('keeps one note across Mecha Jono\'s keys: the newer version stands, under its own address', () => {
    const NEW = 'a'.repeat(64);
    const store = new RaverWatchStore([NEW, MECHA], [{ name: 'mecha-jono', keys: [NEW, MECHA] }]);
    store.accept(vector(VIENNA, { created_at: 1_790_888_400 }));
    store.accept(vector(VIENNA, { pubkey: NEW, id: 'f'.repeat(64), created_at: 1_790_900_000 }));
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].id.split(':')[1]).toBe(NEW);
  });

  it('a cancellation replaces its event at the same address, and the event still stands, cancelled', () => {
    const store = new RaverWatchStore([MECHA]);
    store.accept(vector(EVENT, { created_at: 1_790_888_400 }));
    store.accept(vector(CANCELLED, { id: 'f'.repeat(64), created_at: 1_790_900_000 }));
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0]).toMatchObject({ layer: 'SceneEvents', cancelled: true });
  });

  it('a withdrawal signed after the warning ends it', () => {
    const store = new RaverWatchStore([MECHA]);
    store.accept(vector(VIENNA, { created_at: 1_790_888_400 }));
    store.accept(vector(WITHDRAWAL, { id: 'f'.repeat(64), created_at: 1_790_900_000 }));
    expect(store.items()).toEqual([]);
  });
});

describe('Raver Watch v1.1: what else it reads, and refuses', () => {
  it('places a note by its geohash when it gives no geo point, no finer than 0.1°', () => {
    const note = readRaverWatchNote(retag(vector(EVENT), (tags) => tags.filter((t) => t[0] !== 'geo')));
    expect(note).toMatchObject({ point: { lat: 37.8, lon: -122.4 } });
  });

  it('reads ISO 3166-2 subdivisions anywhere, and a US state as before', () => {
    for (const code of ['au-nsw', 'ca-bc', 'es-ct', 'us-tx', 'gb-eng', 'fr-75']) {
      const note = readRaverWatchNote(retag(vector(VIENNA), (tags) => [...tags.filter((t) => t[0] !== 'jurisdiction'), ['jurisdiction', code]]));
      expect(note, code).toMatchObject({ jurisdiction: code });
    }
    for (const bad of ['AU-NSW', 'australia', 'au-', 'au-nswx', 'a-nsw']) {
      const note = readRaverWatchNote(retag(vector(VIENNA), (tags) => [...tags.filter((t) => t[0] !== 'jurisdiction'), ['jurisdiction', bad]]));
      expect(note, bad).not.toHaveProperty('jurisdiction');
    }
  });

  it('keeps only the precisions and regions they publish', () => {
    const odd = readRaverWatchNote(retag(vector(NSW), (tags) => [
      ...tags.filter((t) => t[0] !== 'geo_precision'), ['geo_precision', 'street'], ['region', 'atlantis'],
    ]));
    expect(odd).not.toHaveProperty('precision');
    expect(odd).not.toHaveProperty('region');
  });

  it('refuses a calendar event that is not a scene event, or lacks its start, end, time zone or town', () => {
    // A calendar event on another layer: a lab warning is a note, not a date.
    expect(readRaverWatchNote(retag(vector(EVENT), (tags) => tags.map((t) => (t[0] === 't' && t[1] === 'scene_event' ? ['t', 'drug_check_alert'] : t)))))
      .toHaveProperty('refused');
    for (const name of ['start', 'end', 'start_tzid', 'location']) {
      expect(readRaverWatchNote(retag(vector(EVENT), (tags) => tags.filter((t) => t[0] !== name))), name).toHaveProperty('refused');
    }
    expect(readRaverWatchNote(retag(vector(EVENT), (tags) => tags.map((t) => (t[0] === 'start' ? ['start', 'tonight'] : t))))).toHaveProperty('refused');
  });

  it('refuses any other kind', () => {
    expect(readRaverWatchNote(vector(EVENT, { kind: 31922 }))).toHaveProperty('refused');
    expect(readRaverWatchNote(vector(VIENNA, { kind: 1 }))).toHaveProperty('refused');
  });

  it('gives a long-form scene note its own address, apart from a calendar event at the same d', () => {
    const store = new RaverWatchStore([MECHA]);
    const asLongForm = retag(vector(EVENT, { kind: 30023, id: 'a'.repeat(64) }), (tags) => tags);
    store.accept(asLongForm);
    store.accept(vector(EVENT, { id: 'b'.repeat(64) }));
    expect(store.items().map((i) => i.id.split(':')[0]).sort()).toEqual(['30023', '31923']);
  });

  it('asks The Record for both kinds', () => {
    const subscribeMany = vi.fn(() => ({ close: vi.fn() }));
    const stop = startRaverWatch({ pool: { subscribeMany } as never });
    expect(subscribeMany).toHaveBeenCalledWith([THE_RECORD_RELAY], { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': ['raver_watch'] }, expect.anything());
    expect(subscribeMany).toHaveBeenCalledWith([THE_RECORD_RELAY], { kinds: [31923], authors: [...MECHA_JONO_KEYS], '#t': ['raver_watch'] }, expect.anything());
    stop();
  });
});
