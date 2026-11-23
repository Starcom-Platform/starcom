/**
 * Raver Watch v1.5's scene news, and what no layer reads (decisions RW17, IX1,
 * 2026-10-03).
 *
 * Their v1.5 added scene news: festivals, tours, line-ups and releases. Starcom
 * refused all 16 notes on The Record, since no layer took them. They are read
 * onto Scene events as news, listed and never drawn. A note of a kind no layer
 * reads is still refused, and counted by its kind, so the card and the key can
 * say so.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readRaverWatchNote, RaverWatchStore, unreadKindOf, startRaverWatch, raverWatchUnread, subscribeRaverWatch } from '../raverWatch';
import { cappedRelay, settle } from '../../nostr/__tests__/cappedRelay';

const KEPT = resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/raver-watch');
const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const LIVE: { events: Event[] } = JSON.parse(readFileSync(resolve(KEPT, 'raver_watch_live_2026-10-03.json'), 'utf8'));
const tagged = (event: Event, value: string) => event.tags.some((t) => t[0] === 't' && t[1] === value);
const NEWS = LIVE.events.filter((e) => tagged(e, 'scene_news') && !tagged(e, 'retracted'));
const retag = (event: Event, change: (tags: string[][]) => string[][]): Event => ({ ...event, tags: change(event.tags) });
const asUnknownKind = (event: Event) => retag(event, (tags) => tags.map((t) => (t[0] === 't' && t[1] === 'scene_news' ? ['t', 'scene_rumour'] : t)));

describe('scene news (RW17)', () => {
  it('reads each of their 16 scene-news notes of 3 October onto Scene events, as scene news', () => {
    expect(NEWS).toHaveLength(16);
    for (const event of NEWS) {
      const note = readRaverWatchNote(event, [MECHA]);
      expect(note).not.toHaveProperty('refused');
      expect(note).toMatchObject({ layer: 'SceneEvents', sceneNews: true });
    }
  });

  it('marks nothing else as scene news', () => {
    const others = LIVE.events.filter((e) => !tagged(e, 'scene_news'));
    for (const event of others) {
      const note = readRaverWatchNote(event, [MECHA]);
      if (!('refused' in note)) expect(note.sceneNews).toBeUndefined();
    }
  });
});

describe('what no layer reads (IX1)', () => {
  it('names the kind of a note of theirs that no layer reads, and nothing for one a layer reads or one not theirs', () => {
    expect(readRaverWatchNote(asUnknownKind(NEWS[0]), [MECHA])).toEqual({ refused: 'it names no Raver Watch layer' });
    expect(unreadKindOf(asUnknownKind(NEWS[0]))).toBe('scene_rumour');
    expect(unreadKindOf(NEWS[0])).toBeNull();
    // Not tagged raver_watch: not theirs to count, whatever kind it names.
    expect(unreadKindOf(retag(asUnknownKind(NEWS[0]), (tags) => tags.filter((t) => !(t[0] === 't' && t[1] === 'raver_watch'))))).toBeNull();
  });

  it('takes the kind from a plain tag, never a namespaced one before it', () => {
    const ordered = retag(asUnknownKind(NEWS[0]), (tags) => [
      ...tags.filter((t) => !(t[0] === 't')),
      ['t', 'raver_watch'], ['t', 'critical'], ['t', 'category:scene'], ['t', 'artist:someone'], ['t', 'scene_rumour'],
    ]);
    expect(unreadKindOf(ordered)).toBe('scene_rumour');
  });

  it('is told by the store, each address once however many versions, most first', () => {
    const store = new RaverWatchStore([MECHA]);
    const first = asUnknownKind(NEWS[0]);
    const again = { ...first, id: 'f'.repeat(64), created_at: first.created_at + 60 };
    const other = asUnknownKind(NEWS[1]);
    const odd = retag(asUnknownKind(NEWS[2]), (tags) => tags.map((t) => (t[0] === 't' && t[1] === 'scene_rumour' ? ['t', 'lost_and_found'] : t)));
    for (const event of [first, again, other, odd]) store.accept(event);
    expect(store.unread()).toEqual([{ kind: 'scene_rumour', count: 2 }, { kind: 'lost_and_found', count: 1 }]);
  });

  it('reads every kind of theirs on 3 October once scene news is read', () => {
    const store = new RaverWatchStore([MECHA]);
    for (const event of LIVE.events) store.accept(event);
    expect(store.unread()).toEqual([]);
  });
});

describe('what no layer reads, as the layer is told it (IX1)', () => {
  it('reaches the key through the read of The Record, and tells its listeners', async () => {
    const relay = cappedRelay([asUnknownKind(NEWS[0]), NEWS[1]]);
    let heard = 0;
    const stopListening = subscribeRaverWatch(() => { heard += 1; });
    const stop = startRaverWatch({ pool: relay.pool });
    await settle();
    expect(raverWatchUnread()).toEqual([{ kind: 'scene_rumour', count: 1 }]);
    expect(raverWatchUnread()).toBe(raverWatchUnread());
    expect(heard).toBeGreaterThan(0);
    stop();
    stopListening();
  });
});
