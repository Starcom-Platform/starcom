/**
 * What of Raver Watch is drawn, and how (globe record, section 19, Phase 1
 * step 3; RW6). An item is drawn while it applies: live, from `valid_from` to
 * `valid_until`; with a window chosen, when its time overlaps the window. It
 * fades as its end nears and is hidden after it. A red level glows, amber
 * rings and info is a disc; an alert draws as the lab's flask, an incident as
 * its category. What is not drawn is counted, with why.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RaverWatchItem } from '../raverWatch';
import { standsAt, fadeAt, glyphOf, levelOf, describeItem, notDrawn, FADE_FLOOR, flareAt, FLARE_S, heatAround, tonightOf, tonightLines } from '../raverWatchView';

const DAY = 86_400;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'DrugCheckAlerts', title: 'Carfentanil in counterfeit tablets', source: 'CFSRE NPS Discovery',
  validFrom: 100 * DAY, validUntil: 130 * DAY, content: 'words', level: 'red', jurisdiction: 'us', ...over,
});
const live = (atS: number) => ({ atS, window: null });

// The legal review of 2026-10-17: a drug check finds only what it tests for, so no alert is never "safe".
describe('a drug-check alert', () => {
  it('says that no alert is not a sign that anything is safe; other notes do not', () => {
    expect(describeItem(item(), () => 'United States')).toMatch(/No alert is not a sign that anything is safe\.$/);
    expect(describeItem(item({ layer: 'SceneIncidents' }), () => 'United States')).not.toMatch(/No alert/);
  });
});

describe('when an item is drawn', () => {
  it('while it applies, live', () => {
    expect(standsAt(item(), live(99 * DAY))).toBe(false);
    expect(standsAt(item(), live(100 * DAY))).toBe(true);
    expect(standsAt(item(), live(129 * DAY))).toBe(true);
    expect(standsAt(item(), live(130 * DAY))).toBe(false);
  });

  it('when its time overlaps a window chosen', () => {
    const window = (fromS: number, untilS: number) => ({ atS: untilS, window: { fromS, untilS } });
    expect(standsAt(item(), window(90 * DAY, 101 * DAY))).toBe(true);
    expect(standsAt(item(), window(129 * DAY, 140 * DAY))).toBe(true);
    expect(standsAt(item(), window(130 * DAY, 140 * DAY))).toBe(false);
    expect(standsAt(item(), window(80 * DAY, 100 * DAY))).toBe(false);
  });
});

describe('how solid it is drawn', () => {
  it('is whole until its end nears, then fades, never below the floor', () => {
    expect(fadeAt(item(), live(105 * DAY))).toBe(1);
    const late = fadeAt(item(), live(128 * DAY));
    expect(late).toBeLessThan(1);
    expect(late).toBeGreaterThanOrEqual(FADE_FLOOR);
    expect(fadeAt(item(), live(129.99 * DAY))).toBeCloseTo(FADE_FLOOR, 2);
    expect(fadeAt(item(), live(126 * DAY))).toBeGreaterThan(fadeAt(item(), live(128 * DAY)));
  });

  it('fades over a quarter of a short item, not a week of it', () => {
    const short = item({ validFrom: 0, validUntil: 2 * DAY });
    expect(fadeAt(short, live(1 * DAY))).toBe(1);
    expect(fadeAt(short, live(1.75 * DAY))).toBeLessThan(1);
  });
});

describe('which mark', () => {
  it('draws an alert as the lab’s flask, and an incident as its category', () => {
    expect(glyphOf(item())).toBe('alert');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'heat' }))).toBe('heat');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'crowd' }))).toBe('crowd');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'violence' }))).toBe('violence');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'closure' }))).toBe('closure');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'drugs' }))).toBe('drugs');
    expect(glyphOf(item({ layer: 'SceneIncidents', category: 'weather' }))).toBe('incident');
    expect(glyphOf(item({ layer: 'SceneIncidents' }))).toBe('incident');
  });

  it('takes its level as stated, and info when it states none', () => {
    expect(levelOf(item())).toBe('red');
    expect(levelOf(item({ level: 'amber' }))).toBe('amber');
    expect(levelOf(item({ level: undefined }))).toBe('info');
  });
});

describe('what a hover says', () => {
  it('names the item, its source, when it was reported, where it applies and until when, in UTC', () => {
    const text = describeItem(item(), (code) => (code === 'us' ? 'United States' : null));
    expect(text).toContain('Carfentanil in counterfeit tablets');
    expect(text).toContain('CFSRE NPS Discovery');
    expect(text).toContain('Applies to United States');
    expect(text).toContain('from 11 Apr 1970');
    expect(text).toContain('until 11 May 1970');
    expect(text).toContain('red');
  });

  it('places a point as its town, to 0.1°', () => {
    const text = describeItem(item({ jurisdiction: undefined, point: { lat: 52.5, lon: 13.4 } }), () => null);
    expect(text).toContain('Applies near 52.5°N 13.4°E (to about 11 km)');
  });
});

describe('what is not drawn, and why', () => {
  it('counts what has ended, what applies to a region not drawn here, and what names no place', () => {
    const counts = notDrawn([
      item({ id: 'a' }),
      item({ id: 'ended', validUntil: 101 * DAY }),
      item({ id: 'state', jurisdiction: 'us-tx' }),
      item({ id: 'nowhere', jurisdiction: undefined }),
      item({ id: 'unknown-country', jurisdiction: 'zz' }),
    ], live(110 * DAY), (code) => code === 'us');
    expect(counts).toEqual({ ended: 1, notYet: 0, regionNotDrawn: 2, noPlace: 1, news: 0, sceneNews: 0, outsideWeekend: 0 });
  });
});

/*
 * A scene event flares as it starts (raver-nights.md, RN1, RN5): over the first
 * twenty minutes of its night, in the world's time, so a screen and a clip agree.
 */
describe('an event\'s flare', () => {
  const START = 100 * DAY + 22 * 3600;
  const event = (over: Partial<RaverWatchItem> = {}) => item({ layer: 'SceneEvents', level: undefined, start: START, end: START + 6 * 3600, ...over });

  it('runs from its start over twenty minutes, as how far through it is', () => {
    expect(FLARE_S).toBe(20 * 60);
    expect(flareAt(event(), live(START - 1))).toBeNull();
    expect(flareAt(event(), live(START))).toBe(0);
    expect(flareAt(event(), live(START + 5 * 60))).toBeCloseTo(0.25, 10);
    expect(flareAt(event(), live(START + FLARE_S - 1))).toBeCloseTo(1 - 1 / FLARE_S, 10);
    expect(flareAt(event(), live(START + FLARE_S))).toBeNull();
  });

  it('is the moment shown, inside the window around it: a paused moment, a sweep frame, tonight from its start', () => {
    expect(flareAt(event(), { atS: START + 10 * 60, window: { fromS: START - 3600, untilS: START + 3 * 3600 } })).toBeCloseTo(0.5, 10);
  });

  it('is none over a range read to its end, as a dragged window is: it has no one moment for a start to have just passed', () => {
    expect(flareAt(event(), { atS: START + 10 * 60, window: { fromS: START - 3600, untilS: START + 10 * 60 } })).toBeNull();
  });

  it('is none for an event called off, or for anything but a scene event with a start', () => {
    expect(flareAt(event({ cancelled: true }), live(START + 60))).toBeNull();
    expect(flareAt(item(), live(100 * DAY + 60))).toBeNull();
    // Only a scene event flares, even one of another layer that states a start.
    expect(flareAt(item({ layer: 'SceneIncidents', start: START }), live(START + 60))).toBeNull();
  });
});

/*
 * An event's heat (raver-nights.md, RN2, RN4): the worst HeatRisk of a town within
 * 25 km whose day covers the event's start, when it is Orange (2) or worse.
 */
describe('an event\'s heat', () => {
  const START = 100 * DAY + 3 * 3600;
  const event = (over: Partial<RaverWatchItem> = {}) => item({
    layer: 'SceneEvents', level: undefined, start: START, end: START + 5 * 3600, point: { lat: 34.05, lon: -118.25 }, ...over,
  });
  const heat = (heatRisk: number, over: Partial<RaverWatchItem> = {}) => item({
    layer: 'HeatRisk', level: heatRisk >= 3 ? 'red' : 'amber', heatRisk, point: { lat: 34.1, lon: -118.3 },
    validFrom: START - 6 * 3600, validUntil: START + 18 * 3600, ...over,
  });

  it('is the worst level of a town within 25 km whose day covers its start, from Orange up', () => {
    expect(heatAround(event(), [heat(2), heat(3)])).toBe(3);
    expect(heatAround(event(), [heat(4)])).toBe(4);
    expect(heatAround(event(), [heat(1)])).toBeNull();
  });

  it('leaves out a town further than 25 km, and a day that does not cover the start', () => {
    // About 33 km north.
    expect(heatAround(event(), [heat(3, { point: { lat: 34.35, lon: -118.25 } })])).toBeNull();
    // A day, the 24 hours before the note ends, starting a second after the event, or ending as it starts.
    expect(heatAround(event(), [heat(3, { validUntil: START + 24 * 3600 + 1 })])).toBeNull();
    expect(heatAround(event(), [heat(3, { validUntil: START + 24 * 3600 })])).toBe(3);
    expect(heatAround(event(), [heat(3, { validUntil: START })])).toBeNull();
  });

  it('reads a note as its own day, however long before it the note was published', () => {
    // Published days ahead, as the NWS forecasts a week: Magenta on a later day is not this night's heat.
    const week = { validFrom: START - 2 * DAY };
    expect(heatAround(event(), [heat(4, { ...week, validUntil: START + 5 * DAY }), heat(2, { ...week })])).toBe(2);
    expect(heatAround(event(), [heat(4, { ...week, validUntil: START + 5 * DAY })])).toBeNull();
    // Published after the event began, its day still covers the start.
    expect(heatAround(event(), [heat(3, { validFrom: START + 3600 })])).toBe(3);
  });

  it('is none for an event called off, one with no place or start, or anything but a scene event', () => {
    expect(heatAround(event({ cancelled: true }), [heat(3)])).toBeNull();
    expect(heatAround(event({ point: undefined }), [heat(3)])).toBeNull();
    expect(heatAround(heat(3), [heat(3)])).toBeNull();
  });
});

/*
 * Tonight, for its card (raver-nights.md, RN3, RN7, RN8): the scene events starting
 * in the twelve hours from a moment, a row a region by the zone each was listed in,
 * the night's order (the first to start first), with how many stand in heat.
 */
describe('tonight', () => {
  const FROM = Date.UTC(2026, 9, 10, 0, 0) / 1000;
  const scene = (startUtcHour: number, tz: string, over: Partial<RaverWatchItem> = {}) => item({
    layer: 'SceneEvents', level: undefined, start: FROM + startUtcHour * 3600, end: FROM + (startUtcHour + 5) * 3600,
    startTzid: tz, point: { lat: 34.05, lon: -118.25 }, ...over,
  });
  // HeatRisk Red in Los Angeles on Fri 9 Oct, as Mecha Jono's notes end it: 06:00 PDT on the 10th.
  const hotLA = item({ layer: 'HeatRisk', level: 'red', heatRisk: 3, point: { lat: 34.1, lon: -118.3 }, validFrom: FROM - 2 * DAY, validUntil: FROM + 13 * 3600 });

  it('counts the events starting in the twelve hours, by the region of the zone each was listed in, the first to start first', () => {
    const items = [
      scene(4, 'America/Los_Angeles'), scene(5, 'America/Los_Angeles'), scene(3, 'America/New_York', { point: { lat: 40.7, lon: -74 } }),
      scene(22, 'Europe/Berlin', { point: { lat: 52.5, lon: 13.4 } }),
      scene(13, 'America/Chicago', { point: { lat: 41.9, lon: -87.6 } }),
      scene(2, 'America/Los_Angeles', { cancelled: true }),
      scene(6, 'America/Los_Angeles', { sceneNews: true }),
      hotLA,
    ];
    const t = tonightOf(items, FROM);
    expect(t).toMatchObject({ fromS: FROM, untilS: FROM + 12 * 3600, count: 3, underHeat: 2, underWay: 0 });
    expect(t.regions).toEqual([
      { name: 'US Eastern', count: 1, underHeat: 0, first: { atS: FROM + 3 * 3600, local: '23:00 EDT' } },
      { name: 'US Pacific', count: 2, underHeat: 2, first: { atS: FROM + 4 * 3600, local: '21:00 PDT' } },
    ]);
    expect(t.points).toHaveLength(3);
  });

  it('names a region by its zone where it is not a US one, and says the night in lines', () => {
    const t = tonightOf([scene(1, 'Europe/Berlin', { point: { lat: 52.5, lon: 13.4 } }), scene(2, 'Australia/Sydney', { point: { lat: -33.9, lon: 151.2 } }), scene(3, 'Asia/Tokyo', { point: { lat: 35.7, lon: 139.7 } }), scene(4, 'America/Los_Angeles'), hotLA], FROM);
    expect(t.regions.map((r) => r.name)).toEqual(['Europe', 'Australia', 'Tokyo time', 'US Pacific']);
    expect(tonightLines(t)).toEqual([
      '4 scene events start in the twelve hours from 00:00Z, 1 in a hot town',
      'Europe · 1 event · first 03:00 GMT+2',
      'Australia · 1 event · first 13:00 GMT+11',
      'Tokyo time · 1 event · first 12:00 GMT+9',
      'US Pacific · 1 event · 1 under heat · first 21:00 PDT',
    ]);
    expect(tonightLines(t, 2).slice(-1)).toEqual(['and 2 more regions']);
  });

  it('counts apart the events already under way as tonight begins: its card draws them, its count leaves them out (RN10)', () => {
    const t = tonightOf([
      // Began two hours before and runs five: under way.
      scene(-2, 'America/Los_Angeles'),
      // Over an hour before tonight begins.
      scene(-6, 'America/Los_Angeles'),
      // Ends as tonight begins: not under way.
      scene(-5, 'America/Los_Angeles'),
      scene(-1, 'America/Los_Angeles', { cancelled: true }),
      scene(-1, 'America/Los_Angeles', { sceneNews: true }),
      scene(-1, 'America/Los_Angeles', { point: undefined }),
      scene(1, 'America/Los_Angeles'),
    ], FROM);
    expect(t).toMatchObject({ count: 1, underWay: 1 });
    expect(t.points).toHaveLength(1);
  });
});
