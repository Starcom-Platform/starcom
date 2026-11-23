/**
 * Watchlists (D-WL, WL1, WL5): a watch names a place and the kinds that count there, kept in this browser, at most
 * twenty; a place lies in a watch by its circle or its territory's outline, and in nothing whose outline is not to hand.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addWatch, DEFAULT_KINDS, placeHolds, removeWatch, resetWatchesForTests, setWatchKinds, setWatchRadius, watches, watchFrom, watchName,
  WATCH_MAX, type WatchPlace,
} from '../watchlist';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';

const NOW = Date.parse('2026-11-08T08:00:00Z');
const japan: WatchPlace = { kind: 'territory', code: 'jp', name: 'Japan' };
// A box from 130°E to 146°E, 30°N to 46°N, [lng, lat] as GeoJSON has it.
const box: PolygonGeometry = { type: 'Polygon', coordinates: [[[130, 30], [146, 30], [146, 46], [130, 46], [130, 30]]] };
const outline = (code: string) => (code === 'jp' ? { geometry: box } : null);

beforeEach(() => { localStorage.clear(); resetWatchesForTests(); });

describe('a watch', () => {
  it('is kept in this browser, its kinds the defaults until chosen', () => {
    const made = addWatch(japan, undefined, NOW);
    expect(made).toMatchObject({ added: true, watch: { place: japan, kinds: DEFAULT_KINDS, madeMs: NOW } });
    resetWatchesForTests();
    expect(watches()).toHaveLength(1);
    expect(watches()[0].place).toEqual(japan);
  });

  it('is the one already there for a place watched twice, and refused past twenty', () => {
    const first = addWatch(japan, undefined, NOW);
    const again = addWatch({ ...japan }, { quakes: '6', hazards: null, intel: false, war: false, unrest: false }, NOW + 1);
    expect(again).toEqual({ watch: (first as { watch: unknown }).watch, added: false });
    for (let i = 1; i < WATCH_MAX; i += 1) addWatch({ kind: 'circle', lat: i, lng: i, km: 100, name: `p${i}` }, undefined, NOW);
    expect(watches()).toHaveLength(WATCH_MAX);
    expect(addWatch({ kind: 'circle', lat: 50, lng: 50, km: 100, name: 'one more' })).toEqual({ refused: 'full' });
  });

  it('changes what it counts, and goes', () => {
    const { watch } = addWatch(japan, undefined, NOW) as { watch: { id: string } };
    setWatchKinds(watch.id, { quakes: '2.5', hazards: null, intel: true, war: false, unrest: true });
    expect(watches()[0].kinds).toEqual({ quakes: '2.5', hazards: null, intel: true, war: false, unrest: true });
    removeWatch(watch.id);
    expect(watches()).toEqual([]);
  });

  it('changes a circle\'s radius, never into a circle another watch has', () => {
    const { watch } = addWatch({ kind: 'circle', lat: 1, lng: 2, km: 300, name: 'here' }, undefined, NOW) as { watch: { id: string } };
    addWatch({ kind: 'circle', lat: 1, lng: 2, km: 100, name: 'here' }, undefined, NOW);
    setWatchRadius(watch.id, 1000);
    expect(watches()[0].place).toMatchObject({ km: 1000 });
    setWatchRadius(watch.id, 100);
    expect(watches()[0].place).toMatchObject({ km: 1000 });
  });

  it('passes over a kept entry it cannot read, and a kind it does not know', () => {
    expect(watchFrom({ id: 'x', madeMs: NOW, place: { kind: 'circle', lat: 1, lng: 2, km: -5, name: 'n' }, kinds: {} })).toBeNull();
    expect(watchFrom({ id: 'x', place: japan, kinds: {} })).toBeNull();
    // A watch kept in step 1 counts The Record's kinds, as a new one does (WL13); one turned off stays off.
    expect(watchFrom({ id: 'x', madeMs: NOW, place: japan, kinds: { quakes: '3', hazards: 'red' } })?.kinds).toEqual({ quakes: null, hazards: 'red', intel: true, war: true, unrest: true });
    expect(watchFrom({ id: 'x', madeMs: NOW, place: japan, kinds: { quakes: '6', hazards: null, war: false } })?.kinds).toMatchObject({ war: false, intel: true });
    localStorage.setItem('starcom:watchlist', '{not json');
    resetWatchesForTests();
    expect(watches()).toEqual([]);
  });

  it('is named by its place', () => {
    expect(watchName(japan)).toBe('Japan');
    expect(watchName({ kind: 'circle', lat: 35.7, lng: 139.7, km: 200, name: 'Tokyo' })).toBe('200 km around Tokyo');
  });
});

describe('a place', () => {
  it('holds a point within its circle', () => {
    const tokyo: WatchPlace = { kind: 'circle', lat: 35.68, lng: 139.69, km: 100, name: 'Tokyo' };
    expect(placeHolds(tokyo, 35.36, 138.73, outline)).toBe(true); // Mount Fuji, ~95 km
    expect(placeHolds(tokyo, 34.69, 135.5, outline)).toBe(false); // Osaka, ~400 km
  });

  it('holds a point inside its territory, and none where its outline is not to hand', () => {
    expect(placeHolds(japan, 35.68, 139.69, outline)).toBe(true);
    expect(placeHolds(japan, 37.5, 127, outline)).toBe(false); // west of the box
    expect(placeHolds({ kind: 'territory', code: 'zone:unknown', name: 'Unknown' }, 35.68, 139.69, outline)).toBe(false);
    expect(placeHolds(japan, NaN, 139.69, outline)).toBe(false);
  });
});
