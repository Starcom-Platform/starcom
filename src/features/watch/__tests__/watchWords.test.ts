/**
 * A watch and its pings in the reader's words (D-WL; D-ML): a circle's name, a notice for a quake and for a hazard, the
 * times, and the inspector's line naming every watch an item landed in, in English and in German.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { agoIn, pingNotice, placeWords, watchedInWords } from '../watchWords';
import { messagesNow, setLanguage } from '../../../i18n/app/i18n';
import type { WatchPing } from '../../../services/watch/watchPings';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const japan = { kind: 'territory' as const, code: 'jp', name: 'Japan' };
const tokyo = { kind: 'circle' as const, lat: 35.68, lng: 139.69, km: 300, name: 'Tokyo' };
const quake: WatchPing = {
  item: { id: 'q', kind: 'quake', lat: 35.4, lng: 139.8, level: 5.14, timeMs: NOW - 3 * 60_000,
    event: { id: 'q', lat: 35.4, lng: 139.8, type: 'earthquake', description: 'M 5.1 - 30 km S of Tokyo, Japan' } },
  watches: [{ id: 'a', name: 'Japan', place: japan }, { id: 'b', name: '300 km around Tokyo', place: tokyo }],
  atMs: NOW,
};
const hazard: WatchPing = {
  item: { id: 'gdacs-9', kind: 'hazard', lat: 16, lng: 125, level: 2, timeMs: NOW - 2 * 3_600_000,
    event: { id: 'gdacs-9', lat: 16, lng: 125, type: 'hurricane', description: 'Typhoon MAN-YI — 185 km/h' } },
  watches: [{ id: 'c', name: '1000 km around Manila', place: { ...tokyo, km: 1000, name: 'Manila' } }],
  atMs: NOW,
};

afterEach(async () => { await setLanguage('en', false); });

describe('in English', () => {
  const w = () => messagesNow().watch;
  it('names a circle by its radius and its place', () => {
    expect(placeWords(japan, w())).toBe('Japan');
    expect(placeWords(tokyo, w())).toBe('300 km around Tokyo');
  });
  it('tells of a quake and a hazard, with the watch it landed in first', () => {
    expect(pingNotice(quake, w(), NOW)).toEqual({ title: 'New in Japan', message: 'M5.1, 30 km S of Tokyo, Japan, 3 min ago' });
    expect(pingNotice(hazard, w(), NOW)).toEqual({ title: 'New in 1000 km around Manila', message: 'Red alert: Typhoon MAN-YI — 185 km/h, 2 h ago' });
  });
  it('names every watch in the inspector', () => {
    expect(watchedInWords(quake, w())).toBe('In your watches: Japan and 300 km around Tokyo');
  });
  it('says how long ago', () => {
    expect([10_000, 3 * 60_000, 2 * 3_600_000].map((ms) => agoIn(ms, w()))).toEqual(['just now', '3 min ago', '2 h ago']);
  });
});

describe('in German', () => {
  it('says the notice and the times in the reader\'s words', async () => {
    await setLanguage('de', false);
    const w = messagesNow().watch;
    expect(pingNotice(hazard, w, NOW)).toEqual({ title: 'Neu in 1000 km um Manila', message: 'Roter Alarm: Typhoon MAN-YI — 185 km/h, vor 2 Std.' });
    expect(agoIn(3 * 60_000, w)).toBe('vor 3 Min.');
  });
});
