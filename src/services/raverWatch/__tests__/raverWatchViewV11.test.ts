/**
 * What of Raver Watch v1.1 is drawn, and how (their answers of 2026-10-01;
 * the owner's decisions of the same day).
 *
 * A scene event is drawn from a week before it starts until it ends, marked
 * as not begun until its start (the owner chose their suggested week). With a
 * window chosen, it is drawn when its own start and end overlap the window, so
 * "Tonight" shows tonight's events. A cancelled event is kept, struck through,
 * until its end. A subdivision with no outline here falls back to its
 * country's. A warning for all of Europe outlines Europe. Policy news is news,
 * not an incident, so it is listed apart and not drawn; what names no place is
 * listed, newest first, and never drawn.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RaverWatchItem } from '../raverWatch';
import {
  standsAt, notBegunAt, fadeAt, glyphOf, isNews, regionToOutline, countriesOf, elsewhere, describeItem, notDrawn,
  LOOKAHEAD_S, FADE_FLOOR,
} from '../raverWatchView';

const HOUR = 3_600;
const DAY = 86_400;
const START = 1_791_003_600; // Fri 2 Oct 2026 22:00 in Los Angeles, 05:00Z on the 3rd
const END = START + 5 * HOUR;
const PUBLISHED = START - 14 * DAY;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'DrugCheckAlerts', title: 'A warning', source: 'A lab',
  validFrom: 100 * DAY, validUntil: 130 * DAY, content: 'words', level: 'amber', ...over,
});
const sceneEvent = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
  id: '31923:pk:raver-scene-event-1', d: 'raver-scene-event-1', layer: 'SceneEvents', level: undefined,
  title: 'Disco, funk and house event in San Francisco, CA', source: '19hz.info', category: 'event',
  validFrom: PUBLISHED, validUntil: END, start: START, end: END, startTzid: 'America/Los_Angeles',
  location: 'San Francisco, CA', genres: ['disco', 'funk', 'house'], jurisdiction: 'us-ca',
  point: { lat: 37.8, lon: -122.4 }, precision: 'city', cancelled: false, ...over,
});
const live = (atS: number) => ({ atS, window: null });
const windowed = (fromS: number, untilS: number) => ({ atS: untilS, window: { fromS, untilS } });

describe('a scene event, live', () => {
  it('is drawn from a week before it starts until it ends, not from when it was published', () => {
    expect(LOOKAHEAD_S).toBe(7 * DAY);
    expect(standsAt(sceneEvent(), live(PUBLISHED))).toBe(false);
    expect(standsAt(sceneEvent(), live(START - 7 * DAY - 1))).toBe(false);
    expect(standsAt(sceneEvent(), live(START - 7 * DAY))).toBe(true);
    expect(standsAt(sceneEvent(), live(START + HOUR))).toBe(true);
    expect(standsAt(sceneEvent(), live(END))).toBe(false);
  });

  it('is never drawn before it was published, however near its start', () => {
    expect(standsAt(sceneEvent({ validFrom: START - DAY }), live(START - 2 * DAY))).toBe(false);
  });

  it('is marked not begun until it starts', () => {
    expect(notBegunAt(sceneEvent(), live(START - HOUR))).toBe(true);
    expect(notBegunAt(sceneEvent(), live(START))).toBe(false);
    expect(notBegunAt(item(), live(100 * DAY))).toBe(false);
  });

  it('is whole until it starts, and fades only over the last quarter of the night itself', () => {
    expect(fadeAt(sceneEvent(), live(START - DAY))).toBe(1);
    expect(fadeAt(sceneEvent(), live(START + 3 * HOUR))).toBe(1);
    expect(fadeAt(sceneEvent(), live(END - HOUR))).toBeLessThan(1);
    expect(fadeAt(sceneEvent(), live(END - HOUR))).toBeGreaterThanOrEqual(FADE_FLOOR);
  });
});

describe('a scene event, with a window chosen', () => {
  it('is drawn when its own night overlaps the window: Tonight shows tonight', () => {
    expect(standsAt(sceneEvent(), windowed(START - 2 * HOUR, START + 10 * HOUR))).toBe(true);
    expect(standsAt(sceneEvent(), windowed(END, END + DAY))).toBe(false);
    // A window that holds its publication but not its night does not draw it.
    expect(standsAt(sceneEvent(), windowed(PUBLISHED, PUBLISHED + DAY))).toBe(false);
  });

  it('is not marked not begun: the window says when to look', () => {
    expect(notBegunAt(sceneEvent(), windowed(START - 2 * HOUR, START - HOUR))).toBe(false);
  });
});

describe('how it is drawn', () => {
  it('a scene event is music; a cancelled one is struck through', () => {
    expect(glyphOf(sceneEvent())).toBe('event');
    expect(glyphOf(sceneEvent({ cancelled: true }))).toBe('cancelled');
  });

  it('policy news is news, not an incident', () => {
    expect(isNews(item({ layer: 'SceneIncidents', category: 'policy' }))).toBe(true);
    expect(isNews(item({ layer: 'SceneIncidents', category: 'drugs' }))).toBe(false);
    expect(isNews(item({ layer: 'DrugCheckAlerts', category: 'policy' }))).toBe(false);
  });
});

describe('where a region is outlined', () => {
  const outlined = new Set(['us', 'us-ca', 'au', 'at', 'de', 'fr']);
  const can = (code: string) => outlined.has(code);

  it('a region with an outline is outlined', () => {
    expect(regionToOutline('us-ca', can)).toBe('us-ca');
    expect(regionToOutline('at', can)).toBe('at');
  });

  it('a subdivision with no outline here falls back to its country, as they asked', () => {
    expect(regionToOutline('au-nsw', can)).toBe('au');
  });

  it('a US state waits for its own outline, rather than outlining the whole country meanwhile', () => {
    expect(regionToOutline('us-tx', can)).toBeNull();
  });

  it('nothing, when neither it nor its country is outlined', () => {
    expect(regionToOutline('nz-auk', can)).toBeNull();
    expect(regionToOutline('nz', can)).toBeNull();
  });

  it('Europe is its countries, as two-letter codes', () => {
    const europe = countriesOf('europe');
    for (const code of ['at', 'de', 'es', 'fr', 'gb', 'nl', 'pl', 'ch', 'no', 'ua']) expect(europe, code).toContain(code);
    for (const code of ['us', 'au', 'ru-mow', 'tr-34']) expect(europe, code).not.toContain(code);
    expect(europe.every((code) => /^[a-z]{2}$/.test(code))).toBe(true);
  });
});

describe('what is listed instead of drawn', () => {
  const now = live(110 * DAY);
  const can = (code: string) => code === 'us';
  const placed = item({ id: 'a', point: { lat: 1, lon: 1 } });
  const country = item({ id: 'b', jurisdiction: 'us', validFrom: 101 * DAY });
  const unplaced = item({ id: 'c', layer: 'SceneIncidents', category: 'heat', validFrom: 105 * DAY });
  const older = item({ id: 'd', layer: 'SceneIncidents', category: 'crowd', validFrom: 102 * DAY });
  const noOutline = item({ id: 'e', jurisdiction: 'nz', validFrom: 103 * DAY });
  const europe = item({ id: 'f', region: 'europe', validFrom: 104 * DAY });
  const policy = item({ id: 'g', layer: 'SceneIncidents', category: 'policy', jurisdiction: 'us', validFrom: 106 * DAY });
  const ended = item({ id: 'h', validFrom: 10 * DAY, validUntil: 20 * DAY });

  it('what names no place, or a region not outlined here, newest first; a Europe-wide warning too', () => {
    const policyNowhere = item({ id: 'p', layer: 'SceneIncidents', category: 'policy', validFrom: 108 * DAY });
    const { unplaced: list } = elsewhere([placed, country, unplaced, older, noOutline, europe, policy, policyNowhere, ended], now, can);
    expect(list.map((i) => i.id)).toEqual(['c', 'f', 'e', 'd']);
  });

  it('policy news apart, newest first, placed or not', () => {
    const { news } = elsewhere([placed, policy, unplaced, item({ id: 'k', layer: 'SceneIncidents', category: 'policy', validFrom: 107 * DAY })], now, can);
    expect(news.map((i) => i.id)).toEqual(['k', 'g']);
  });

  it('counts news apart from what names no place, so the key can say each', () => {
    const counts = notDrawn([policy, unplaced], now, can);
    expect(counts.news).toBe(1);
    expect(counts.noPlace).toBe(1);
  });
});

describe('what a hover says', () => {
  const regionName = (code: string) => ({ 'us-ca': 'California', us: 'United States' }[code] ?? null);

  it('a scene event: its night in its own time zone and in UTC, its town and genres, and that it has not begun', () => {
    const said = describeItem(sceneEvent(), regionName, live(START - DAY));
    expect(said).toContain('San Francisco, CA');
    expect(said).toContain('Fri 2 Oct 22:00');
    expect(said).toContain('America/Los_Angeles');
    expect(said).toContain('3 Oct 05:00Z');
    expect(said).toContain('disco, funk, house');
    expect(said).toMatch(/not begun/i);
    expect(said).not.toMatch(/Level:/);
  });

  it('a cancelled event says so first', () => {
    expect(describeItem(sceneEvent({ cancelled: true }), regionName, live(START - DAY))).toMatch(/^Cancelled/);
  });

  it('a point that stands for a state says it is not a venue', () => {
    const said = describeItem(item({ point: { lat: -33.9, lon: 151.2 }, precision: 'state' }), regionName, live(110 * DAY));
    expect(said).toMatch(/stands for a whole state or province/i);
  });

  it('a Europe-wide warning names Europe', () => {
    expect(describeItem(item({ region: 'europe' }), regionName, live(110 * DAY))).toContain('Applies across Europe');
  });
});

describe('scene news (RW17)', () => {
  const now = live(110 * DAY);
  const can = (code: string) => code === 'us';
  const sceneNews = (over: Partial<RaverWatchItem> = {}) => item({ layer: 'SceneEvents', level: undefined, sceneNews: true, category: 'scene.news', ...over });

  it('is news: never drawn, and listed apart from policy news, newest first, placed or not', () => {
    const placed = sceneNews({ id: 'n1', validFrom: 103 * DAY, point: { lat: 35.7, lon: 139.7 } });
    const unplaced = sceneNews({ id: 'n2', validFrom: 104 * DAY });
    const policy = item({ id: 'g', layer: 'SceneIncidents', category: 'policy', validFrom: 106 * DAY });
    expect(isNews(placed)).toBe(true);
    const listed = elsewhere([placed, unplaced, policy], now, can);
    expect(listed.sceneNews.map((i) => i.id)).toEqual(['n2', 'n1']);
    expect(listed.news.map((i) => i.id)).toEqual(['g']);
    expect(listed.unplaced).toEqual([]);
  });

  it('is counted apart from policy news, so the key can say each', () => {
    const counts = notDrawn([sceneNews({ id: 'n1' }), sceneNews({ id: 'n2' }), item({ id: 'g', layer: 'SceneIncidents', category: 'policy' })], now, can);
    expect(counts).toMatchObject({ sceneNews: 2, news: 1 });
  });
});
