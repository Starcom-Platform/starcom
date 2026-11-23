/**
 * The command palette's machinery (D-CP): plain words find commands (CP2), places and items; the last 8 picks are kept
 * in this browser (CP4); sources offer results while they are registered.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPaletteRecent, closePalette, openPalette, paletteMatch, paletteOpen, paletteRecent, paletteScore, paletteSources,
  RECENT_LIMIT, registerPaletteSource, rememberPick, resetPaletteForTests,
} from '../palette';

const r = (title: string, description = '', keywords = '') => ({ title, description, keywords });

beforeEach(() => { localStorage.clear(); resetPaletteForTests(); });

describe('plain words (CP2)', () => {
  it('find a command by the words of its title, in any order of importance', () => {
    const all = [r('Rain: on', 'Earth Weather: colour by rain'), r('Clouds: on'), r('Last 7 days', 'The time bar over the last week', 'week'), r('Japan', 'Fly to Japan')];
    expect(paletteMatch(all, 'rain on').map((x) => x.title)).toEqual(['Rain: on']);
    expect(paletteMatch(all, 'last 7').map((x) => x.title)).toEqual(['Last 7 days']);
    expect(paletteMatch(all, 'week').map((x) => x.title)).toEqual(['Last 7 days']);
    expect(paletteMatch(all, 'jap').map((x) => x.title)).toEqual(['Japan']);
    expect(paletteMatch(all, 'snow')).toEqual([]);
  });

  it('rank a title beginning with the words over one that only holds them, and over a description', () => {
    const all = [r('Eco Disasters', 'quakes and fires'), r('Quakes ping', ''), r('Plate boundaries', 'beside the quakes')];
    expect(paletteMatch(all, 'quake').map((x) => x.title)).toEqual(['Quakes ping', 'Eco Disasters', 'Plate boundaries']);
    expect(paletteScore(r('Ålesund'), 'ale')).toBeGreaterThan(0);
  });

  it('keep the empty box\'s results in their order, up to a limit', () => {
    expect(paletteMatch([r('b'), r('a'), r('c')], '', 2).map((x) => x.title)).toEqual(['b', 'a']);
  });
});

describe('the last picks (CP4)', () => {
  it('are kept newest first, each once, eight at most, in this browser', () => {
    for (let i = 0; i < RECENT_LIMIT + 3; i += 1) rememberPick(`id-${i}`);
    rememberPick('id-5');
    expect(paletteRecent()[0]).toBe('id-5');
    expect(paletteRecent()).toHaveLength(RECENT_LIMIT);
    expect(new Set(paletteRecent()).size).toBe(RECENT_LIMIT);
    resetPaletteForTests();
    expect(paletteRecent()[0]).toBe('id-5');
    clearPaletteRecent();
    expect(paletteRecent()).toEqual([]);
  });

  it('come back empty from anything stored that is not a list of ids', () => {
    localStorage.setItem('starcom:palette-recent', '{"x":1}');
    expect(paletteRecent()).toEqual([]);
  });
});

describe('sources and the open palette', () => {
  it('offer results while registered; one of the same id replaces the other', () => {
    const off = registerPaletteSource({ id: 'globe', results: () => [] });
    registerPaletteSource({ id: 'globe', results: () => [] });
    expect(paletteSources()).toHaveLength(1);
    off();
    // The first's leaving does not take the second.
    expect(paletteSources()).toHaveLength(1);
  });

  it('opens with the words handed it, and closes', () => {
    openPalette('rain');
    expect(paletteOpen()).toEqual({ query: 'rain' });
    closePalette();
    expect(paletteOpen()).toBeNull();
  });
});
