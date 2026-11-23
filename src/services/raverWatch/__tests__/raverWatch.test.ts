/**
 * Raver Watch, read (globe record section 19, Phase 1 step 1; decisions RW2,
 * RW3, RW6). Mecha Jono publishes safety notes for people at dance events to
 * The Record, as kind 30023 tagged `raver_watch`. Only named publishers are
 * read: a health alert from an unknown key could be a fake red alert or a
 * fake all-clear. A note that fails their schema is refused; the newest at an
 * address stands, and a withdrawal ends its item. Their live CFSRE note is the
 * first vector, read from the file kept beside the record.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import { MECHA_JONO_KEYS, RAVER_WATCH_PUBLISHERS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';
import { raverWatchRelays } from '../../nostr/publishTargets';
import { readRaverWatchNote, RaverWatchStore, startRaverWatch, raverWatchItems, raverWatchStatus, subscribeRaverWatch } from '../raverWatch';
import { BURST_MS } from '../../nostr/burst';
import { cappedRelay, settle } from '../../nostr/__tests__/cappedRelay';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/raver-watch');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const kept = (name: string) => JSON.parse(readFileSync(resolve(KEPT, name), 'utf8'));
/**
 * Their note as a signed event: the file holds what they sign, less the id,
 * signature and time. Signed before their withdrawal of it, which the kept
 * withdrawal dates 1_790_683_200.
 */
const asEvent = (note: Partial<Event>, over: Partial<Event> = {}): Event => ({
  id: 'e'.repeat(64), sig: 's'.repeat(128), created_at: 1_790_600_000, ...note, ...over,
} as Event);
const CFSRE = () => asEvent(kept('raver_watch_note.cfsre.example.json'));
const WITHDRAWAL = () => asEvent(kept('raver_watch_withdrawal.example.json'), { id: 'f'.repeat(64) });
const withTags = (tags: string[][], over: Partial<Event> = {}) => asEvent({ ...CFSRE(), tags }, over);
const without = (name: string) => CFSRE().tags.filter((t) => t[0] !== name);

describe('a Raver Watch note, read', () => {
  it('names Mecha Jono as its publisher, and reads The Record', () => {
    // Every key Mecha Jono has published (two across its key change), the current one among them.
    expect(RAVER_WATCH_PUBLISHERS).toEqual(MECHA_JONO_KEYS);
    expect(RAVER_WATCH_PUBLISHERS).toContain(MECHA);
    expect(THE_RECORD_RELAY).toBe('wss://record.cosmiccodex.app');
    expect(raverWatchRelays()).toEqual([THE_RECORD_RELAY]);
  });

  it('reads their live CFSRE note: its layer, level, source, where and when it applies', () => {
    const note = readRaverWatchNote(CFSRE());
    expect(note).toMatchObject({
      id: `30023:${MECHA}:raver-drug-check-alert-cfsre-6958716c26069b53`,
      layer: 'DrugCheckAlerts',
      level: 'red',
      category: 'supply',
      title: 'Emerging Synthetic Opioid Threats: Carfentanil in Counterfeit Tablets and Powders in the United States',
      source: 'CFSRE NPS Discovery',
      url: 'https://www.cfsre.org/nps-discovery/public-alerts/emerging-synthetic-opioid-threats-carfentanil-in-counterfeit-tablets-and-powders-in-the-united-states',
      jurisdiction: 'us',
      validFrom: 1_776_902_400,
      validUntil: 1_780_790_400,
      retracted: false,
    });
    expect(note).not.toHaveProperty('point');
  });

  it('reads an incident at a city, rounded to 0.1° as everything Starcom draws and shares is (RW3)', () => {
    const note = readRaverWatchNote(withTags([
      ...without('jurisdiction').map((t) => (t[0] === 't' && t[1] === 'drug_check_alert' ? ['t', 'scene_incident'] : t))
        .map((t) => (t[0] === 'category' ? ['category', 'heat'] : t)),
      ['geo', 'lat:52.52000,lon:13.41000'], ['geo_precision', 'city'], ['geo_kind', 'event_location'], ['geo_source', 'reference:geonames'],
    ]));
    expect(note).toMatchObject({ layer: 'SceneIncidents', category: 'heat', point: { lat: 52.5, lon: 13.4 } });
  });

  it('keeps no point it cannot place, and no region it cannot name', () => {
    const note = readRaverWatchNote(withTags([...without('jurisdiction'), ['jurisdiction', 'United States'], ['geo', 'lat:95,lon:13']]));
    expect(note).not.toHaveProperty('point');
    expect(note).not.toHaveProperty('jurisdiction');
    expect(readRaverWatchNote(withTags([...without('jurisdiction'), ['jurisdiction', 'us-tx']]))).toMatchObject({ jurisdiction: 'us-tx' });
  });

  it('keeps a link to the source only when it is a web page', () => {
    expect(readRaverWatchNote(withTags([...without('r'), ['r', 'javascript:alert(1)']]))).not.toHaveProperty('url');
  });

  it('reads their withdrawal as ending the item', () => {
    expect(readRaverWatchNote(WITHDRAWAL())).toMatchObject({
      id: `30023:${MECHA}:raver-drug-check-alert-cfsre-6958716c26069b53`, retracted: true, reason: 'the source withdrew its alert',
    });
  });

  it.each([
    ['a key not named as a publisher (RW2)', () => asEvent(kept('raver_watch_note.cfsre.example.json'), { pubkey: 'a'.repeat(64) })],
    ['one that also claims to be Starcom intel', () => withTags([...CFSRE().tags, ['t', 'starcom_intel']])],
    ['content that starts as data', () => asEvent({ ...CFSRE(), content: '  {"title":"x"}' })],
    ['content that starts as a list', () => asEvent({ ...CFSRE(), content: '[1]' })],
    ['another kind', () => asEvent({ ...CFSRE(), kind: 1 })],
    ['no raver_watch tag', () => withTags(CFSRE().tags.filter((t) => !(t[0] === 't' && t[1] === 'raver_watch')))],
    ['an address not starting raver-', () => withTags([...without('d'), ['d', 'cfsre-6958716c26069b53']])],
    ['no layer', () => withTags(CFSRE().tags.filter((t) => !(t[0] === 't' && t[1] === 'drug_check_alert')))],
    ['no title', () => withTags(without('title'))],
    ['no source', () => withTags(without('source'))],
    ['a start that is not a time', () => withTags([...without('valid_from'), ['valid_from', 'April']])],
    ['no end', () => withTags(without('valid_until'))],
    ['a tag that is not a pair of strings', () => withTags([...CFSRE().tags, ['-']])],
  ])('refuses %s', (_why, event) => {
    expect(readRaverWatchNote(event())).toHaveProperty('refused');
  });
});

describe('what stands', () => {
  it('is the newest note at each address', () => {
    const store = new RaverWatchStore();
    const newer = asEvent({ ...CFSRE(), content: 'Newer words.' }, { id: '2'.repeat(64), created_at: 1_790_700_000 });
    expect(store.accept(newer).kept).toBe(true);
    expect(store.accept(CFSRE()).kept).toBe(false);
    expect(store.items().map((i) => i.content)).toEqual(['Newer words.']);
  });

  it('ends an item its withdrawal names, and keeps it when an older withdrawal arrives after a newer note', () => {
    const store = new RaverWatchStore();
    store.accept(CFSRE());
    store.accept(WITHDRAWAL());
    expect(store.items()).toEqual([]);

    const again = new RaverWatchStore();
    again.accept(asEvent({ ...CFSRE() }, { id: '3'.repeat(64), created_at: 1_790_800_000 }));
    again.accept(WITHDRAWAL());
    expect(again.items()).toHaveLength(1);
  });

  it('breaks a tie in time by the lower id, as relays do', () => {
    const store = new RaverWatchStore();
    store.accept(asEvent({ ...CFSRE(), content: 'Higher id.' }, { id: '9'.repeat(64) }));
    store.accept(asEvent({ ...CFSRE(), content: 'Lower id.' }, { id: '1'.repeat(64) }));
    expect(store.items().map((i) => i.content)).toEqual(['Lower id.']);
  });

  it('holds nothing refused', () => {
    const store = new RaverWatchStore();
    expect(store.accept(withTags([...CFSRE().tags, ['t', 'starcom_intel']]))).toMatchObject({ kept: false });
    expect(store.items()).toEqual([]);
  });
});

describe('reading The Record', () => {
  it('asks The Record for named publishers’ raver_watch notes only, and tells listeners what stands', () => {
    vi.useFakeTimers();
    let handlers: { onevent: (e: Event) => void } | undefined;
    const close = vi.fn();
    const subscribeMany = vi.fn((_relays: string[], _filter: unknown, h: { onevent: (e: Event) => void }) => { handlers = h; return { close }; });
    const heard = vi.fn();
    const stopListening = subscribeRaverWatch(heard);
    const stop = startRaverWatch({ pool: { subscribeMany } as never });

    // A kind at a time: The Record returns 500 per filter, and one kind must not crowd out the other.
    expect(subscribeMany.mock.calls.map((c) => c[1])).toEqual([
      { kinds: [30023], authors: [...RAVER_WATCH_PUBLISHERS], '#t': ['raver_watch'] },
      { kinds: [31923], authors: [...RAVER_WATCH_PUBLISHERS], '#t': ['raver_watch'] },
    ]);
    expect(subscribeMany.mock.calls.every((c) => c[0].length === 1 && c[0][0] === THE_RECORD_RELAY)).toBe(true);
    handlers!.onevent(CFSRE());
    // A burst is gathered before it is told: one rebuild and one render, not one a note.
    expect(heard).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BURST_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(raverWatchItems().map((i) => i.layer)).toEqual(['DrugCheckAlerts']);

    heard.mockClear();
    handlers!.onevent(asEvent(kept('raver_watch_note.cfsre.example.json'), { pubkey: 'a'.repeat(64), id: '4'.repeat(64) }));
    vi.advanceTimersByTime(BURST_MS);
    expect(heard).not.toHaveBeenCalled();

    stop();
    expect(close).toHaveBeenCalled();
    stopListening();
    vi.useRealTimers();
  });

  it('tells a burst of notes once, and at once when The Record has sent what it holds', () => {
    vi.useFakeTimers();
    type H = { onevent: (e: Event) => void; oneose: () => void };
    const handlers: H[] = [];
    const subscribeMany = vi.fn((_relays: string[], _filter: unknown, h: H) => { handlers.push(h); return { close: vi.fn() }; });
    const heard = vi.fn();
    const stopListening = subscribeRaverWatch(heard);
    const stop = startRaverWatch({ pool: { subscribeMany } as never });
    handlers[0].onevent(CFSRE());
    handlers[0].onevent(asEvent(kept('raver_watch_note.cfsre.example.json'), { id: '5'.repeat(64), created_at: CFSRE().created_at + 1 }));
    expect(heard).not.toHaveBeenCalled();
    // Each page answered, and the page after it, until every filter's last page is in.
    for (let i = 0; i < handlers.length; i++) handlers[i].oneose();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(raverWatchStatus().loaded).toBe(true);
    vi.advanceTimersByTime(BURST_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    stopListening();
    vi.useRealTimers();
  });

  it('opens one read however many ask, and closes it when the last is done', () => {
    const close = vi.fn();
    const subscribeMany = vi.fn(() => ({ close }));
    const pool = { subscribeMany } as never;
    const first = startRaverWatch({ pool });
    const second = startRaverWatch({ pool });
    // One subscription per kind, opened once.
    expect(subscribeMany).toHaveBeenCalledTimes(2);
    first();
    expect(close).not.toHaveBeenCalled();
    second();
    second();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('hands out the same list until what stands changes, as a React store must', () => {
    const subscribeMany = vi.fn(() => ({ close: vi.fn() }));
    const stop = startRaverWatch({ pool: { subscribeMany } as never });
    expect(raverWatchItems()).toBe(raverWatchItems());
    stop();
  });

  it('says when The Record has answered, and when it could not be read', () => {
    type H = { onevent: (e: Event) => void; oneose: () => void; onclose: (reasons: Array<{ url: string; reason: string }>) => void };
    const opened: H[] = [];
    const subscribeMany = vi.fn((_r: string[], _f: unknown, h: H) => { opened.push(h); return { close: vi.fn() }; });
    const heard = vi.fn();
    const stopListening = subscribeRaverWatch(heard);

    const stop = startRaverWatch({ pool: { subscribeMany } as never });
    expect(raverWatchStatus()).toEqual({ loaded: false, error: null, at: null });
    opened[0].oneose();
    // One kind has answered and the other has not: not read yet.
    expect(raverWatchStatus().loaded).toBe(false);
    opened[1].oneose();
    expect(raverWatchStatus()).toMatchObject({ loaded: true, error: null });
    expect(raverWatchStatus().at).toBeGreaterThan(Date.now() - 5_000);
    expect(heard).toHaveBeenCalled();
    stop();

    const again = startRaverWatch({ pool: { subscribeMany } as never });
    expect(raverWatchStatus()).toEqual({ loaded: false, error: null, at: null });
    opened.at(-1)!.onclose([{ url: THE_RECORD_RELAY, reason: 'connection failed' }]);
    expect(raverWatchStatus()).toEqual({ loaded: false, error: 'The Record could not be read: connection failed', at: null });
    again();

    // Closed by us before it answered is not a failure to read it.
    const third = startRaverWatch({ pool: { subscribeMany: vi.fn((_r: string[], _f: unknown, h: H) => ({ close: () => h.onclose([{ url: THE_RECORD_RELAY, reason: 'closed by caller' }]) })) } as never });
    third();
    expect(raverWatchStatus().error).toBeNull();
    stopListening();
  });
});

// Last: the read leaves what it read in the module's store.
describe('reading all The Record holds', () => {
  it('reads every note and venue night The Record held on 3 October, though it returns 500 per filter', async () => {
    // Read then with one filter over both kinds, The Record sent 460 nights and 40 of the 92 notes:
    // every drug-check alert, a critical one among them, and 51 heat towns were never drawn.
    const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(KEPT, 'raver_watch_live_2026-10-03.json'), 'utf8'));
    const direct = new RaverWatchStore([MECHA]);
    for (const event of LIVE.events) direct.accept(event);
    const relay = cappedRelay([...LIVE.events], { url: THE_RECORD_RELAY });
    const stop = startRaverWatch({ pool: relay.pool });
    await settle();
    expect(raverWatchStatus().loaded).toBe(true);
    // Every item the notes make is drawn (the store also holds an earlier test's example note).
    expect(raverWatchItems().map((i) => i.id)).toEqual(expect.arrayContaining(direct.items().map((i) => i.id)));
    // 627 drawn or listed, and from RW17 the 16 scene-news notes, listed.
    expect(direct.items().length).toBe(643);
    expect(raverWatchItems().filter((i) => i.layer === 'DrugCheckAlerts').length).toBeGreaterThanOrEqual(5);
    expect(raverWatchItems().some((i) => i.id.endsWith(':raver-drug-check-alert-trimbos-83029564c1c28f44'))).toBe(true);
    stop();
  });
});
