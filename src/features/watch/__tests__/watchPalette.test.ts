/**
 * Watching a place from the palette (D-WL, WL4, WL9): offered once the box starts with the verb (the reader's or the
 * English), a country by its two letters, any area by its code, a circle 300 km around the middle of the view named by
 * the territory it lies in; a watch made says so, and twenty is the most.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/Globe/Hooks/useTerritories', () => ({
  loadTerritories: async () => ({
    size: 2,
    at: (lat: number) => (lat > 30 ? 'Japan' : null),
    byCode: () => null,
    countries: () => [{ code: 'JP', name: 'Japan' }, { code: 'GF', name: 'French Guiana' }],
    a2Of: () => null,
  }),
}));
const notices: Array<{ title: string; message: string }> = [];
vi.mock('@utils/hudNotifications', () => ({ showHUDNotification: (n: { title: string; message: string }) => { notices.push(n); } }));

import { afterVerb, hereName, watchResults } from '../watchPalette';
import { resetWatchesForTests, watches, WATCH_MAX, addWatch } from '../watchlist';
import { setInspectorActions } from '../../globe/inspector/inspectorActions';
import { setLanguage } from '../../../i18n/app/i18n';

beforeEach(() => { localStorage.clear(); resetWatchesForTests(); notices.length = 0; setInspectorActions({ centre: () => ({ lat: 35.68, lng: 139.69 }) }); });
afterEach(async () => { setInspectorActions(null); await setLanguage('en', false); });

describe('the verb', () => {
  it('starts the box: three letters of it at least, the reader\'s or the English', () => {
    expect(afterVerb('watch japan', ['beobachte', 'watch'])).toBe('japan');
    expect(afterVerb('wat', ['watch'])).toBe('');
    expect(afterVerb('beob zone ring', ['beobachte', 'watch'])).toBe('zone ring');
    expect(afterVerb('wa japan', ['watch'])).toBeNull();
    expect(afterVerb('japan', ['watch'])).toBeNull();
  });
});

describe('the commands', () => {
  it('offer nothing without the verb, and "around here" with it alone', async () => {
    expect(await watchResults('japan')).toEqual([]);
    const alone = await watchResults('watch');
    expect(alone.map((r) => r.title)).toEqual(['Watch around here']);
    expect(alone[0].description).toBe('300 km around Japan, the middle of the view');
  });

  it('put the place typed first: "around here" only where the words fit it too', async () => {
    const found = await watchResults('watch japan');
    expect(found[0].id).toBe('watch:jp');
    expect(found.map((r) => r.id)).toContain('watch:here'); // the view's middle lies in Japan here
    expect((await watchResults('watch french')).some((r) => r.id === 'watch:here')).toBe(false);
  });

  it('offer a country by its two letters and an area by its code, and watch it', async () => {
    const found = await watchResults('watch french');
    const guiana = found.find((r) => r.id === 'watch:gf')!;
    expect(guiana.title).toBe('Watch French Guiana');
    guiana.run();
    expect(watches()[0].place).toEqual({ kind: 'territory', code: 'gf', name: 'French Guiana' });
    expect(notices.at(-1)).toMatchObject({ title: 'Watched', message: 'French Guiana' });
    // A Zone by its code; a retired one (the Ring of Fire, covered by its successors) is not offered.
    expect((await watchResults('watch atlas')).find((r) => r.id === 'watch:zone:atlas')?.title).toBe('Watch Atlas Zone');
    expect((await watchResults('watch ring of fire')).some((r) => r.id === 'watch:zone:ring-of-fire')).toBe(false);
  });

  it('watch around the middle of the view, 300 km, named by its territory', async () => {
    (await watchResults('watch'))[0].run();
    expect(watches()[0].place).toEqual({ kind: 'circle', lat: 35.68, lng: 139.69, km: 300, name: 'Japan' });
  });

  it('say so when twenty places are watched', async () => {
    for (let i = 0; i < WATCH_MAX; i += 1) addWatch({ kind: 'circle', lat: i, lng: i, km: 100, name: `p${i}` });
    (await watchResults('watch japan')).find((r) => r.id === 'watch:jp')!.run();
    expect(watches()).toHaveLength(WATCH_MAX);
    expect(notices.at(-1)?.message).toBe('Twenty places are watched: stop watching one first.');
  });

  it('take the reader\'s verb', async () => {
    await setLanguage('de', false);
    expect((await watchResults('beobachte japan')).find((r) => r.id === 'watch:jp')?.title).toBe('Beobachte Japan');
  });
});

describe('a place in the sea', () => {
  it('is named by where it is', () => {
    expect(hereName({ lat: -20.5, lng: -150.2 }, undefined)).toBe('20.5°S 150.2°W');
  });
});
