/**
 * A clip that sweeps the shared moment (decision D-W, step 5c). The moment is
 * a track, so what it changes is disclosed, not refused: a source may be
 * drawn for part of the footage only (radar near now, the satellites' clouds
 * for hours they have seen), and each source is judged against the moment each
 * frame shows, not the clock it was rendered by.
 */
import { describe, it, expect } from 'vitest';
import { buildClipProvenance, GLOBE_CLIP_SCHEMA_VERSION, type ClipSample } from '../clipProvenance';

const T0 = new Date('2026-10-07T01:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const HOUR = 3_600_000;
const BUILD = { sha: 'a'.repeat(40), builtAt: T0.toISOString() };
const LAYERS = [{ label: 'Earth Weather', active: true, implemented: true }];
const MODEL = 'NOAA GFS mean rain, via NOAA Open Data Dissemination';
const RADAR = 'Radar rain from RainViewer';

/** Frame at `seconds` of footage, showing `hours` past T0; the model drawn for that moment, radar when given. */
const sample = (seconds: number, hours: number, radar = false): ClipSample => {
  const moment = new Date(T0.getTime() + hours * HOUR);
  return {
    at: at(seconds),
    moment,
    camera: { lat: 0, lon: 0, altitude: 2.5 },
    layers: LAYERS,
    feeds: [
      { name: MODEL, lastUpdated: moment.toISOString() },
      ...(radar ? [{ name: RADAR, lastUpdated: T0.toISOString() }] : []),
    ],
    marks: null,
    build: BUILD,
  };
};

const sweep = (fromHours: number, toHours: number) => ({
  fromIso: new Date(T0.getTime() + fromHours * HOUR).toISOString(),
  toIso: new Date(T0.getTime() + toHours * HOUR).toISOString(),
});
const window = (fromHours: number, toHours: number) => ({
  startedAt: T0, endedAt: at(4), tracks: ['camera' as const, 'moment' as const], sweep: sweep(fromHours, toHours),
});

describe('a clip sweeping the moment', () => {
  it('refuses a moment track with no span to say what it swept', () => {
    expect(() => buildClipProvenance([sample(0, 0)], { startedAt: T0, endedAt: at(4), tracks: ['camera', 'moment'] }))
      .toThrow(/moment track and no span/);
  });

  it('says a stepped sweep\'s step in words, and keeps it, as clip schema 10 (D-PW, PW62)', () => {
    const stepped = { ...window(-6, -2), sweep: { ...sweep(-6, -2), stepSeconds: 7200 } };
    const clip = buildClipProvenance([sample(0, -6), sample(4, -2)], stepped);
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(10);
    expect(clip.sweep).toEqual({ ...sweep(-6, -2), stepSeconds: 7200 });
    expect(clip.caveats.join(' | ')).toContain('The moment moves from 2026-10-06 19:00Z to 2026-10-06 23:00Z in steps of 2 hours over the footage');
    const daily = buildClipProvenance([sample(0, -6), sample(4, -2)], { ...stepped, sweep: { ...sweep(-6, -2), stepSeconds: 86_400 } });
    expect(daily.caveats.join(' | ')).toContain('in steps of a day over the footage');
  });

  it('says the span it swept, and keeps it, as clip schema 5', () => {
    const clip = buildClipProvenance([sample(0, -6), sample(4, -2)], window(-6, -2));
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
    expect(clip.sweep).toEqual(sweep(-6, -2));
    expect(clip.tracks).toEqual(['camera', 'moment']);
    expect(clip.caveats.join(' | ')).toContain('The moment moves from 2026-10-06 19:00Z to 2026-10-06 23:00Z over the footage, and every layer is drawn for each frame\'s moment.');
    expect(clip.caveats.join(' | ')).not.toMatch(/forecast/);
  });

  it('says hours after it was recorded are a forecast, and what the layers that cannot forecast show', () => {
    const clip = buildClipProvenance([sample(0, 0), sample(4, 12)], window(0, 12));
    expect(clip.caveats.join(' | ')).toContain('Hours after 2026-10-07 01:00Z, when it was recorded, are a forecast: layers that forecast show theirs; the others show what they held, those that filter by time only what falls in the window.');
  });

  it('judges a source by when a frame was drawn, not by a moment ahead of it (SW19)', () => {
    // NOAA's space weather, read at the recording: at hours 6 and 12 ahead, not out of date, but what it held.
    const held = (x: ClipSample): ClipSample => ({ ...x, feeds: [...x.feeds, { name: 'NOAA space weather', lastUpdated: T0.toISOString() }] });
    const clip = buildClipProvenance([held(sample(0, 0)), held(sample(2, 6)), held(sample(4, 12))], window(0, 12));
    expect(clip.feeds.find((f) => f.name === 'NOAA space weather')!.runs).toEqual([{ state: 'fresh', fromMs: 0, toMs: 4000 }]);
    expect(clip.caveats.join(' | ')).not.toMatch(/out of date|changed during this clip/);
  });

  it('judges a source by the moment each frame shows: hours a day past are not out of date', () => {
    const clip = buildClipProvenance([sample(0, -24), sample(4, -20)], window(-24, -20));
    expect(clip.feeds[0].runs).toEqual([{ state: 'fresh', fromMs: 0, toMs: 4000 }]);
    expect(clip.caveats.join(' | ')).not.toMatch(/out of date/);
  });

  it('discloses a source drawn for part of the footage only, with when', () => {
    // Radar is drawn only within half an hour of its frame, so the frame 15 minutes on still carries it.
    const clip = buildClipProvenance([sample(0, 0, true), sample(2, 0.25, true), sample(4, 3)], window(0, 3));
    const radar = clip.feeds.find((f) => f.name === RADAR)!;
    expect(radar.runs).toEqual([{ state: 'fresh', fromMs: 0, toMs: 4000 }, { state: 'absent', fromMs: 4000, toMs: 4000 }]);
    expect(clip.caveats.join(' | ')).toContain(`${RADAR} changed during this clip: current 0:00–0:04, not drawn 0:04–0:04.`);
  });

  it('discloses a source that comes into the picture as the moment reaches it', () => {
    const clip = buildClipProvenance([sample(-2, -2), sample(2, -1), sample(4, 0, true)].map((x, i) => ({ ...x, at: at(i * 2) })), window(-2, 0));
    const radar = clip.feeds.find((f) => f.name === RADAR);
    expect(radar?.runs).toEqual([{ state: 'absent', fromMs: 0, toMs: 4000 }, { state: 'fresh', fromMs: 4000, toMs: 4000 }]);
  });

  it('still refuses a change of sources that nothing drives', () => {
    expect(() => buildClipProvenance([sample(0, 0, true), sample(4, 0)], { startedAt: T0, endedAt: at(4) }))
      .toThrow(/set of feeds reported changed/);
  });
});

/*
 * A source whose name says what it draws at that moment, as Raver Watch's does ("… (225 not begun)"),
 * is one source across the footage, known by its short name: a count changing is not a source
 * changing (raver-nights.md, the sweep clip). A sweep of a night made one history a frame, and
 * an end card of six pages, which was refused.
 */
describe('a source whose name changes with the moment', () => {
  const SCENE = (notBegun: number) => `Scene events from 19hz.info, via Mecha Jono on The Record (${notBegun} not begun)`;
  const scene = (seconds: number, hours: number, notBegun: number): ClipSample => {
    const moment = new Date(T0.getTime() + hours * HOUR);
    return {
      ...sample(seconds, hours),
      layers: [{ label: 'Scene events', active: true, implemented: true }],
      feeds: [{ name: SCENE(notBegun), shortName: 'Scene events', lastUpdated: moment.toISOString() }],
    };
  };

  it('is one source over a sweep, named by its short name where its name changed', () => {
    const clip = buildClipProvenance([scene(0, 0, 225), scene(2, 1, 210), scene(4, 2, 190)], window(0, 2));
    expect(clip.feeds).toHaveLength(1);
    expect(clip.feeds[0]).toMatchObject({ name: 'Scene events', runs: [{ state: 'fresh', fromMs: 0, toMs: 4000 }] });
    expect(clip.caveats.join(' | ')).not.toMatch(/changed during this clip/);
  });

  it('keeps its whole name where it did not change', () => {
    const clip = buildClipProvenance([scene(0, 0, 225), scene(4, 2, 225)], window(0, 2));
    expect(clip.feeds.map((f) => f.name)).toEqual([SCENE(225)]);
  });

  it('is one source in a clip that sweeps nothing: a count changing as an event begins is not a change of sources', () => {
    const clip = buildClipProvenance([scene(0, 0, 225), scene(4, 0, 224)], { startedAt: T0, endedAt: at(4) });
    expect(clip.feeds.map((f) => f.name)).toEqual(['Scene events']);
  });

  it('still discloses a change in its state, by its short name', () => {
    const loading = { ...scene(2, 1, 210), feeds: [{ name: SCENE(210), shortName: 'Scene events', lastUpdated: null, loading: true }] };
    const clip = buildClipProvenance([scene(0, 0, 225), loading, scene(4, 2, 190)], window(0, 2));
    expect(clip.caveats.join(' | ')).toContain('Scene events changed during this clip: current 0:00–0:02, loading 0:02–0:04, current 0:04–0:04.');
  });
});
