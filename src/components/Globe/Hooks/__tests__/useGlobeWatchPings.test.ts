/**
 * Opening what landed in a watched place (D-WL, WL2): the item in the inspector as Eco Disasters' note has it, with a
 * line naming every watch it landed in, at its place; the ping cleared, what landed still listed.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { openWatchPing } from '../useGlobeWatchPings';
import { getGlobeNoteState, closeGlobeNotes } from '../../../../features/globe/noteDetail/globeNoteStore';
import { keepForTests, landedPings, resetWatchPingsForTests, watchPings, type WatchPing } from '../../../../services/watch/watchPings';

const ping: WatchPing = {
  item: { id: 'us7000abcd', kind: 'quake', lat: 35.4, lng: 139.8, level: 5.1, timeMs: Date.parse('2026-11-08T11:57:00Z'),
    event: { id: 'us7000abcd', lat: 35.4, lng: 139.8, type: 'earthquake', magnitude: 5.1, timestamp: '2026-11-08T11:57:00Z', description: 'M 5.1 - 30 km S of Tokyo, Japan', source: 'USGS' } },
  watches: [{ id: 'a', name: 'Japan', place: { kind: 'territory', code: 'jp', name: 'Japan' } }],
  atMs: Date.parse('2026-11-08T12:00:00Z'),
};

afterEach(() => { resetWatchPingsForTests(); closeGlobeNotes(); });

describe('opening a watch ping', () => {
  it('shows the item with the watches it landed in, and clears the ping', () => {
    keepForTests([ping]);
    expect(watchPings()).toHaveLength(1);
    openWatchPing(ping);
    const open = getGlobeNoteState().open!;
    expect(open.at).toEqual({ lat: 35.4, lng: 139.8 });
    expect(open.notes[0].id).toBe('us7000abcd');
    expect(open.notes[0].text).toMatch(/\nIn your watches: Japan$/);
    expect(watchPings()).toHaveLength(0);
    expect(landedPings()).toHaveLength(1);
  });
});

describe('opening a ping of what The Record carries (WL10–WL12)', () => {
  it('opens a day of unrest about a whole country as Civil Unrest says it, where the view is, with the watches', () => {
    const unrest = {
      id: '30023:abc:es-2026-11-08-jp', pubkey: 'abc', d: 'es-2026-11-08-jp', eventId: 'e1', createdAt: 1762603200, publishedAt: 1762603200,
      section: 'CivilUnrest', title: 'Japan: protest on 8 November 2026', content: 'Protests in Tokyo.', kinds: ['protest'], jurisdiction: 'jp',
      claims: [], sources: [], tags: [],
    } as never;
    const ping: WatchPing = {
      item: { id: (unrest as { id: string }).id, kind: 'unrest', lat: NaN, lng: NaN, timeMs: 1762603200_000, title: 'Japan: protest on 8 November 2026', jurisdictions: ['jp'], unrest },
      watches: [{ id: 'a', name: 'Japan', place: { kind: 'territory', code: 'jp', name: 'Japan' } }],
      atMs: Date.parse('2026-11-08T12:00:00Z'),
    };
    keepForTests([ping]);
    openWatchPing(ping);
    const open = getGlobeNoteState().open!;
    expect(open.at).toBeUndefined();
    expect(open.heading).toBe('Civil Unrest');
    expect(open.notes[0].kind).toBe('Day of unrest');
    expect(open.notes[0].text).toBe('Protests in Tokyo.\nIn your watches: Japan');
    expect(watchPings()).toHaveLength(0);
  });
});
