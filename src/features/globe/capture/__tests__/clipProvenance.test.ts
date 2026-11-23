/**
 * What a clip may claim — settled before anything records one.
 *
 * The rule under test, from the module header:
 *
 *   State may change during a clip only if a declared track drives it.
 *
 * DRIVEN state (the camera) moves freely. OPERATOR state (layers) that moves
 * without a track is refused. WORLD state (feeds, analysis) is sampled and
 * every change is disclosed with when it happened. These tests are grouped by
 * those classes, because a regression in one is a different kind of mistake
 * from a regression in another.
 */
import { describe, it, expect } from 'vitest';
import {
  buildClipProvenance,
  ClipProvenanceError,
  CLIP_ORIGIN,
  formatOffset,
  GLOBE_CLIP_SCHEMA,
  GLOBE_CLIP_SCHEMA_VERSION,
  type ClipSample,
} from '../clipProvenance';
import { COUNTRY_NAMES_CAVEAT, EMPTY_REASON_CAVEAT, STALE_AFTER_MS } from '../shareCardProvenance';
import { CREDITS } from '../sourceCredits';

const T0 = new Date('2026-09-11T12:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const BUILD = { sha: 'a'.repeat(40), builtAt: T0.toISOString() };
const LAYERS = [{ label: 'Space Weather', active: true, implemented: true }];
const WINDOW = { startedAt: T0, endedAt: at(10) };

/** A fresh NOAA reading at `seconds`, camera panning east as time passes. */
const sample = (seconds: number, over: Partial<ClipSample> = {}): ClipSample => ({
  at: at(seconds),
  camera: { lat: 0, lon: seconds * 10, altitude: 2.5 },
  layers: LAYERS,
  feeds: [{ name: 'NOAA', lastUpdated: at(seconds).toISOString() }],
  marks: null,
  build: BUILD,
  ...over,
});

const EVERY_2S = [0, 2, 4, 6, 8];
const caveatsOf = (samples: ClipSample[]) => buildClipProvenance(samples, WINDOW).caveats.join(' | ');

describe('refusals — when a clip cannot honestly claim anything', () => {
  it('refuses a clip with no samples, rather than returning a clean-looking empty one', () => {
    expect(() => buildClipProvenance([], WINDOW)).toThrow(ClipProvenanceError);
  });

  it('refuses a clip that ends before it starts', () => {
    expect(() => buildClipProvenance([sample(0)], { startedAt: at(5), endedAt: at(5) }))
      .toThrow(/at or before it starts/);
  });

  it('refuses a sample from a moment the footage does not contain', () => {
    expect(() => buildClipProvenance([sample(0), sample(12)], WINDOW)).toThrow(/outside the clip/);
  });

  it('refuses samples out of order, since time ranges would mean nothing', () => {
    expect(() => buildClipProvenance([sample(4), sample(2)], WINDOW)).toThrow(/out of order/);
  });

  it('refuses a clip whose samples came from two builds', () => {
    const other = { sha: 'b'.repeat(40), builtAt: T0.toISOString() };
    expect(() => buildClipProvenance([sample(0), sample(4, { build: other })], WINDOW))
      .toThrow(/build changed/);
  });
});

describe('OPERATOR state — must hold still, because no track drives it', () => {
  /**
   * The rule's sharpest consequence. A camera move is supposed to show one
   * fixed state from a moving viewpoint; if a layer is switched on at second
   * five, the viewer sees the world change and cannot tell whether the camera
   * or the operator caused it. That is avoidable, so it is refused rather than
   * disclosed.
   */
  it('refuses a clip in which the layers shown changed', () => {
    const withMore = [...LAYERS, { label: 'Satellites', active: true, implemented: true }];
    expect(() => buildClipProvenance(
      [sample(0), sample(4), sample(6, { layers: withMore })], WINDOW,
    )).toThrow(/no track drives layers/);
  });

  it('does not count an unimplemented layer toggling as a change in what is shown', () => {
    // Pinning a no-op layer changes nothing on screen, so it is not a change
    // in what the footage shows — refusing it would be a false positive.
    const withNoop = [...LAYERS, { label: 'Diplomacy', active: true, implemented: false }];
    expect(() => buildClipProvenance([sample(0), sample(6, { layers: withNoop })], WINDOW))
      .not.toThrow();
  });

  it('refuses when the feed set moves while the layers did not', () => {
    const twoFeeds = [
      { name: 'NOAA', lastUpdated: at(6).toISOString() },
      { name: 'GDACS', lastUpdated: at(6).toISOString() },
    ];
    expect(() => buildClipProvenance([sample(0), sample(6, { feeds: twoFeeds })], WINDOW))
      .toThrow(/set of feeds reported changed/);
  });
});

describe('DRIVEN state — the camera moves, and that is the content', () => {
  it('declares the camera as the track, and records where it started and ended', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW);
    expect(p.tracks).toEqual(['camera']);
    expect(p.camera.start.lon).toBe(0);
    expect(p.camera.end.lon).toBe(80);
  });

  it('does not treat camera movement as something to disclose', () => {
    expect(caveatsOf(EVERY_2S.map((s) => sample(s)))).not.toMatch(/camera/i);
  });
});

describe('WORLD state — sampled, and every change disclosed with when', () => {
  it('says nothing about a feed that was current throughout', () => {
    expect(caveatsOf(EVERY_2S.map((s) => sample(s)))).not.toMatch(/NOAA/);
  });

  it('states a feed that was down throughout plainly, without time ranges', () => {
    const down = EVERY_2S.map((s) => sample(s, { feeds: [{ name: 'NOAA', lastUpdated: null, error: 'offline' }] }));
    const c = caveatsOf(down);
    expect(c).toMatch(/NOAA did not load at any point in this clip/);
    expect(c).not.toMatch(/\d:\d\d–/);
  });

  /**
   * The case the instant model cannot express. "NOAA was unreachable" is
   * neither true nor false of a clip in which it failed at second four — so the
   * caveat names the seconds, and the viewer can read the footage against them.
   */
  it('names the seconds when a feed changed state mid-clip', () => {
    const failsAt4 = EVERY_2S.map((s) => sample(s, s >= 4
      ? { feeds: [{ name: 'NOAA', lastUpdated: null, error: 'offline' }] }
      : {}));
    expect(caveatsOf(failsAt4)).toMatch(/NOAA changed during this clip: current 0:00–0:04, failed 0:04–0:10/);
  });

  it('covers the whole clip with runs — no gap, no overlap', () => {
    const flaps = EVERY_2S.map((s) => sample(s, s === 4
      ? { feeds: [{ name: 'NOAA', lastUpdated: null, error: 'offline' }] }
      : {}));
    const { runs } = buildClipProvenance(flaps, WINDOW).feeds[0];
    expect(runs[0].fromMs).toBe(0);
    expect(runs[runs.length - 1].toMs).toBe(10_000);
    for (let i = 1; i < runs.length; i++) expect(runs[i].fromMs).toBe(runs[i - 1].toMs);
    expect(runs.map((r) => r.state)).toEqual(['fresh', 'unreachable', 'fresh']);
  });

  it('reports the WORST staleness seen, not the first or the last', () => {
    // Last updated an hour before the clip began, never refreshed: the age
    // grows across the clip, and the conservative figure is the final one.
    const old = new Date(T0.getTime() - STALE_AFTER_MS).toISOString();
    const stale = EVERY_2S.map((s) => sample(s, { feeds: [{ name: 'NOAA', lastUpdated: old }] }));
    const { maxAgeMs } = buildClipProvenance(stale, WINDOW).feeds[0];
    expect(maxAgeMs).toBe(STALE_AFTER_MS + 8_000);
    expect(caveatsOf(stale)).toMatch(/NOAA was up to 1h 0m out of date throughout this clip/);
  });
});

describe('analysis marks across a clip', () => {
  const marks = (shown: number, fabricated: number | null = null) =>
    ({ shown, fabricated, totalObservations: fabricated === null ? null : 10, emptyReason: null });

  it('says so when the analysis changed while recording', () => {
    const growing = EVERY_2S.map((s) => sample(s, { marks: marks(s < 4 ? 3 : 5, 0) }));
    expect(caveatsOf(growing)).toMatch(/between 3 and 5 marks were shown/);
  });

  it('treats fabrication as unmeasured if ANY sample left it unmeasured', () => {
    // Eight seconds measured and two not: no number honestly covers all ten.
    const partly = EVERY_2S.map((s) => sample(s, { marks: marks(3, s === 8 ? null : 0) }));
    const p = buildClipProvenance(partly, WINDOW);
    expect(p.marks?.fabricated).toBeNull();
    expect(p.caveats.join(' ')).toMatch(/not measured here/);
  });

  it('states an empty globe in exactly the words a still would use', () => {
    // A reader who has seen a still card and a clip should read the same
    // sentence for the same condition — the reason these are shared exports.
    const empty = EVERY_2S.map((s) => sample(s, {
      marks: { shown: 0, fabricated: null, totalObservations: null, emptyReason: 'no-observations' },
    }));
    expect(buildClipProvenance(empty, WINDOW).caveats).toContain(EMPTY_REASON_CAVEAT['no-observations']);
  });
});

describe('the envelope', () => {
  it('names itself as a clip, distinct from a still', () => {
    const p = buildClipProvenance([sample(0)], WINDOW);
    expect(p.schema).toBe(GLOBE_CLIP_SCHEMA);
    expect(p.origin).toBe(CLIP_ORIGIN);
    expect(p.origin).toMatch(/recording/);
  });

  it('ends with the unconditional caveat, naming how long the view was', () => {
    const p = buildClipProvenance([sample(0)], WINDOW);
    expect(p.caveats.at(-1)).toBe(
      'Unsigned client-side recording: one browser\'s view over 0:10, not an attested record.',
    );
  });

  it('records how many samples its claims rest on', () => {
    expect(buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW).sampleCount).toBe(5);
  });

  it('formats offsets the way a viewer scrubbing the clip reads them', () => {
    expect(formatOffset(0)).toBe('0:00');
    expect(formatOffset(4_000)).toBe('0:04');
    expect(formatOffset(75_000)).toBe('1:15');
  });
});

describe('render time versus footage time', () => {
  /**
   * A caveat that is always present is never read. The render-time note only
   * appears when the world was observed over a materially longer span than the
   * footage shows — which is exactly when a viewer's reading of "a ten-second
   * clip" as "ten seconds of the world" would be wrong.
   */
  it('stays quiet when rendering took about as long as the footage', () => {
    const p = buildClipProvenance([sample(0), sample(8)], { ...WINDOW, renderedOverMs: 11_000 });
    expect(p.caveats.join(' ')).not.toMatch(/Rendered frame by frame/);
  });

  it('speaks up when the world was observed over a much longer span', () => {
    const p = buildClipProvenance([sample(0), sample(8)], { ...WINDOW, renderedOverMs: 74_000 });
    expect(p.caveats.join(' ')).toMatch(/Rendered frame by frame over 1:14 of real time, so these 0:10 of footage/);
    expect(p.renderedOverMs).toBe(74_000);
  });

  it('records nothing about render time for a clip that was not rendered frame by frame', () => {
    expect(buildClipProvenance([sample(0)], WINDOW).renderedOverMs).toBeNull();
  });
});

describe('silent and untimed sources across a clip', () => {
  it('states a layer that never reports its source, in the words a still uses', () => {
    const quiet = EVERY_2S.map((s) => sample(s, { feeds: [{ name: 'NOAA', lastUpdated: null, unreported: true }] }));
    expect(caveatsOf(quiet)).toMatch(/NOAA does not report whether its data arrived/);
  });

  it('treats an untimed, healthy source as current rather than never-loaded', () => {
    const untimed = EVERY_2S.map((s) => sample(s, { feeds: [{ name: 'NOAA', lastUpdated: null, timestamped: false }] }));
    const p = buildClipProvenance(untimed, WINDOW);
    expect(p.feeds[0].runs.map((r) => r.state)).toEqual(['fresh']);
    expect(p.caveats.join(' ')).not.toMatch(/never loaded/);
  });
});

describe('standing notes in a clip', () => {
  const NOTE = 'GDELT events are machine-coded from news reports; any single event can be miscoded.';
  const gdelt = (seconds: number, error: string | null = null) => ({
    name: 'GDELT', lastUpdated: error ? null : at(seconds).toISOString(), error, note: NOTE,
  });

  it('states the note once for the whole clip, not once per sample', () => {
    const samples = EVERY_2S.map((s) => sample(s, { feeds: [gdelt(s)] }));
    expect(buildClipProvenance(samples, WINDOW).caveats.filter((c) => c === NOTE)).toHaveLength(1);
  });

  it('states it if the data was in the picture at any moment', () => {
    const samples = EVERY_2S.map((s) => sample(s, { feeds: [gdelt(s, s < 6 ? 'no snapshot' : null)] }));
    expect(caveatsOf(samples)).toContain(NOTE);
  });

  it('does not state it for a source that never loaded during the clip', () => {
    const samples = EVERY_2S.map((s) => sample(s, { feeds: [gdelt(s, 'no snapshot')] }));
    expect(caveatsOf(samples)).not.toContain(NOTE);
  });
});

/*
 * The report a clip is about (decision D-F, section 18, item 5). Constant across
 * the clip, like its layers: an end card can name one subject honestly, not a
 * subject that changed halfway.
 */
describe('credits (schema 4; record D-L, decision L5)', () => {
  it('names each source whose data was drawn at any moment of the clip, once', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s, {
      feeds: [{ name: 'NOAA', lastUpdated: at(s).toISOString(), credits: [CREDITS.noaaSwpc] }],
    })), WINDOW);
    expect(p.credits).toEqual(['NOAA SWPC']);
  });

  it('names who made the images drawn at any moment, once, after the data (clip schema 6; TX10)', () => {
    const p = buildClipProvenance(EVERY_2S.map((s, i) => sample(s, {
      imagery: i === 0 ? ['Solar System Scope (CC BY 4.0)', 'NASA'] : ['NASA', 'Solar System Scope (CC BY 4.0)'],
    })), WINDOW);
    expect(p.imagery).toEqual(['Solar System Scope (CC BY 4.0)', 'NASA']);
    expect(buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW).imagery).toEqual([]);
  });
});

describe('a clip with country names (clip schema 7)', () => {
  it('says it draws them, and that they are Natural Earth\'s with de facto control, only when it does', () => {
    const asked = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, countryNames: true });
    expect(asked.countryNames).toBe(true);
    expect(asked.caveats).toContain(COUNTRY_NAMES_CAVEAT);
    const none = buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW);
    expect(none).not.toHaveProperty('countryNames');
    expect(none.caveats).not.toContain(COUNTRY_NAMES_CAVEAT);
  });
});

// D-CM, CM3 (clip schema 12): a clip of two layers side by side says which half is which.
describe('a clip of two layers side by side (clip schema 12)', () => {
  it('records the halves by their layers, and says which is which', () => {
    const compared = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, compare: { left: 'EcologicalDisasters', right: 'EarthWeather' } });
    expect(compared.compare).toEqual({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    expect(compared.caveats.join(' | ')).toMatch(/Side by side: .* in the left half, .* in the right/);
    expect(buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW)).not.toHaveProperty('compare');
  });
});

describe('a clip in one mark style (clip schema 9; plan H4)', () => {
  it('says the style it drew on every layer only when it asked for one', () => {
    const asked = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, markStyle: 'glow' });
    expect(asked.markStyle).toBe('glow');
    expect(asked.schemaVersion).toBe(14);
    expect(buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW)).not.toHaveProperty('markStyle');
  });
});

describe('a clip featuring a report', () => {
  const FEATURED = { id: 'evt1', title: 'Grant closes Friday', lines: ['not assessed · by npub1abc…wxyz'] };

  it('carries the featured report when every sample agrees on it', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s, { featured: FEATURED })), WINDOW);
    expect(p.featured).toEqual(FEATURED);
    expect(p.schemaVersion).toBe(14);
  });

  it('carries none when nothing was featured', () => {
    expect(buildClipProvenance(EVERY_2S.map((s) => sample(s)), WINDOW).featured).toBeUndefined();
  });

  it('refuses a clip whose featured report changed during it', () => {
    const samples = EVERY_2S.map((s) => sample(s, { featured: s < 4 ? FEATURED : { ...FEATURED, id: 'evt2' } }));
    expect(() => buildClipProvenance(samples, WINDOW)).toThrow(/featured report changed during the clip/);
  });
});

/*
 * What a replay may claim (decision D-F, section 18, item 5).
 */
describe('a clip that replays reports in time', () => {
  const replay = { fromIso: '2026-09-20T00:00:00.000Z', toIso: '2026-09-25T00:00:00.000Z', pace: 'even' as const, untimed: 2 };

  it('says it drove time, over which window, and by which time each report appears', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, tracks: ['camera', 'time'], replay });
    expect(p.tracks).toEqual(['camera', 'time']);
    expect(p.replay).toEqual(replay);
    const text = p.caveats.join(' | ');
    expect(text).toMatch(/2026-09-20 00:00Z to 2026-09-25 00:00Z/);
    expect(text).toMatch(/event time, or when it was written/);
    expect(text).toMatch(/in the order they happened, evenly spaced; the spacing is not the time between them/);
    expect(text).toMatch(/2 reports state no time and are shown throughout/);
  });

  it('says so when the footage kept the calendar\'s pace instead', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, tracks: ['camera', 'time'], replay: { ...replay, pace: 'time' } });
    expect(p.caveats.join(' | ')).toMatch(/pace of the calendar/);
  });

  it('says where a bounded replay\'s span came from, and what it left out (BA2, clip schema 3)', () => {
    const named = buildClipProvenance(EVERY_2S.map((s) => sample(s)), {
      ...WINDOW, tracks: ['camera', 'time'], replay: { ...replay, basis: 'named', outside: 41 },
    });
    const text = named.caveats.join(' | ');
    expect(text).toMatch(/A replay from 2026-09-20 00:00Z to 2026-09-25 00:00Z, the span asked for:/);
    expect(text).toMatch(/41 reports drawn outside it are hidden while it plays\./);
    expect(named.replay).toMatchObject({ basis: 'named', outside: 41 });
    const window = buildClipProvenance(EVERY_2S.map((s) => sample(s)), {
      ...WINDOW, tracks: ['camera', 'time'], replay: { ...replay, basis: 'window', outside: 1 },
    });
    expect(window.caveats.join(' | ')).toMatch(/, the timeline's window: .*1 report drawn outside it is hidden while it plays\./);
    // The reports' own span leaves nothing out, and says nothing of it.
    const own = buildClipProvenance(EVERY_2S.map((s) => sample(s)), {
      ...WINDOW, tracks: ['camera', 'time'], replay: { ...replay, basis: 'reports', outside: 0 },
    });
    expect(own.caveats.join(' | ')).not.toMatch(/outside it|the span asked for|timeline's window/);
  });

  // D-EQ, EQ21 (clip schema 11): the quakes drawn are replayed with the reports.
  it('says how many quakes it replayed and over how long each faded, and nothing of quakes where none were', () => {
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s)), {
      ...WINDOW, tracks: ['camera', 'time'], replay: { ...replay, pace: 'time', quakes: 312, quakeDecaySeconds: 4 },
    });
    expect(p.schemaVersion).toBe(14);
    expect(p.replay).toMatchObject({ quakes: 312, quakeDecaySeconds: 4 });
    expect(p.caveats.join(' | ')).toMatch(/312 quakes rise as the replay reaches each and fade over 4 s of the clip\./);
    const none = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, tracks: ['camera', 'time'], replay });
    expect(none.caveats.join(' | ')).not.toMatch(/quake/);
    expect(none.caveats.join(' | ')).toMatch(/each report appears by its event time, or when it was written where it states none\./);
  });

  it('claims no report was replayed when quakes alone may have been', () => {
    const quakesOnly = { ...replay, pace: 'time' as const, untimed: 0, quakes: 40, quakeDecaySeconds: 4 };
    const p = buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, tracks: ['camera', 'time'], replay: quakesOnly });
    const said = p.caveats.join(' | ');
    expect(said).not.toMatch(/each report appears/);
    expect(said).toMatch(/each report or quake drawn appears by its event time, a report stating none by when it was written\./);
  });

  it('refuses a time track with no window to say it swept', () => {
    expect(() => buildClipProvenance(EVERY_2S.map((s) => sample(s)), { ...WINDOW, tracks: ['camera', 'time'] }))
      .toThrow(/time track/);
  });
});

// A briefing playlist as a clip (briefing-playlists.md, BP15, BP18, BP21; clip schema 8).
describe('a clip that tours a playlist', () => {
  const TOUR = {
    playlist: 'war', title: 'War & Conflict today', shown: 2, total: 12, partial: false,
    opening: { why: 'The worst 2 of 12, worst first, by region', fromMs: 0, toMs: 3000 },
    stops: [
      { id: 'a', title: 'Missile strike on Kramatorsk', progress: '1 of 2 · 12 in all', why: 'Critical, as its report tagged it', lines: ['Kramatorsk, Ukraine'], fromMs: 3000, toMs: 6000 },
      { id: 'b', title: 'Shelling of El Fasher', progress: '2 of 2 · 12 in all', why: 'Deaths reported', lines: [], fromMs: 6000, toMs: 10_000 },
    ],
  };
  const window = (tour?: typeof TOUR) => ({ ...WINDOW, tracks: ['camera' as const, 'tour' as const], ...(tour ? { tour } : {}) });

  it('keeps the tour, its stops and when each caption shows, as clip schema 8', () => {
    const clip = buildClipProvenance(EVERY_2S.map((t) => sample(t)), window(TOUR));
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    expect(clip.tracks).toEqual(['camera', 'tour']);
    expect(clip.tour).toEqual(TOUR);
    expect(clip.caveats.join(' | ')).not.toMatch(/had arrived/);
  });

  it('refuses a tour track with no stops to say what it toured', () => {
    expect(() => buildClipProvenance(EVERY_2S.map((t) => sample(t)), window()))
      .toThrow('The clip has a tour track and no stops to say what it toured. Captions that are not recorded cannot be checked against the footage.');
  });

  it('says when the tour was planned from what had arrived', () => {
    const clip = buildClipProvenance(EVERY_2S.map((t) => sample(t)), window({ ...TOUR, partial: true }));
    expect(clip.caveats).toContain('The tour was planned before The Record had been read whole for War & Conflict today: it stops at what had arrived.');
  });

  it('has no tour when it toured nothing', () => {
    expect(buildClipProvenance(EVERY_2S.map((t) => sample(t)), WINDOW).tour).toBeUndefined();
  });
});
