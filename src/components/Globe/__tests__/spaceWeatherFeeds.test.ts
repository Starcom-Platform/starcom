/**
 * What a card says of Space Weather's sources (space-weather-visualization.md, SW11): each source,
 * when it was read and whether it could be, and the notes that say what is drawn. A drawing that
 * stands in for a source that failed (the Kp model's aurora, the belts at a typical brightness) is
 * its own entry, so its note is shown: a note on a failed source's entry never is.
 */
import { describe, expect, it } from 'vitest';
import { spaceWeatherFeeds, type SpaceWeatherFeedInput } from '../spaceWeatherFeeds';
import { noteApplies } from '../../../features/globe/capture/shareCardProvenance';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';

const BASE: SpaceWeatherFeedInput = {
  noaa: { lastUpdated: '2026-10-10T19:00:00Z', error: null, loading: false },
  eField: { on: false, look: 'streaks' },
  aurora: { on: false, drawn: false, observed: null, error: null, loading: false, curtain: true, kpStandsIn: false },
  fieldLines: { on: false, drawn: false, reading: null, error: null, loading: false },
  vanAllen: { on: false, drawn: false, electrons: null, error: null, loading: false },
};
const applying = (input: SpaceWeatherFeedInput) => spaceWeatherFeeds(input).filter(noteApplies).map((f) => f.shortName ?? f.name);

describe('Space Weather\'s sources on a card', () => {
  it('name NOAA always, and the e-field\'s note only while the field is drawn', () => {
    expect(spaceWeatherFeeds(BASE).map((f) => f.name)).toEqual(['NOAA space weather']);
    expect(applying(BASE)).toEqual([]);
    expect(applying({ ...BASE, eField: { on: true, look: 'streaks' } })).toEqual(['NOAA space weather']);
  });

  it('say OVATION could not be read, and that the Kp model stands in, where it does', () => {
    const feeds = spaceWeatherFeeds({ ...BASE, aurora: { ...BASE.aurora, on: true, error: 'OVATION answered 503.', kpStandsIn: true } });
    const ovation = feeds.find((f) => f.shortName === 'OVATION')!;
    expect(ovation.error).toBe('OVATION answered 503.');
    const kp = feeds.find((f) => f.shortName === 'Kp aurora')!;
    expect(noteApplies(kp)).toBe(true);
    expect(kp.noteShort).toBe('The aurora is modelled from Kp: OVATION could not be read.');
  });

  it('say the belts are drawn at a typical brightness where GOES could not be read', () => {
    const feeds = spaceWeatherFeeds({ ...BASE, vanAllen: { on: true, drawn: true, electrons: null, error: 'GOES answered 503', loading: false } });
    expect(feeds.find((f) => f.shortName === 'GOES electrons')!.error).toBe('GOES answered 503');
    const belts = feeds.find((f) => f.shortName === 'Van Allen belts')!;
    expect(noteApplies(belts)).toBe(true);
    expect(belts.note).toMatch(/GOES could not be read/);
  });

  it('give the cusps an entry of their own, so their note is shown, once drawn', () => {
    const reading = { drivers: { pdyn: 2, dst: 0, byImf: 0, bzImf: -5 }, held: [], wind: { observed: 'w', arrives: 'a', speed: 500, density: 5, bx: -2, by: 0, bz: -5 }, dst: null, missing: [] };
    expect(applying({ ...BASE, cusps: { on: true, drawn: true, reading } })).toEqual(['Cusps']);
    expect(applying({ ...BASE, cusps: { on: true, drawn: false, reading } })).toEqual([]);
  });

  it('give the tail\'s current sheet an entry of its own, once drawn', () => {
    expect(applying({ ...BASE, tailSheet: { on: true, drawn: true } })).toEqual(['Tail sheet']);
    expect(applying({ ...BASE, tailSheet: { on: true, drawn: false } })).toEqual([]);
  });

  it('name the 7 days of wind, and say the stream from the Sun is a hindcast, once drawn', () => {
    const heliosphere = { on: true, drawn: true, moment: Date.UTC(2026, 9, 6, 9), lastArrival: Date.UTC(2026, 9, 10, 20), error: null, loading: false };
    const feeds = spaceWeatherFeeds({ ...BASE, heliosphere });
    const wind = feeds.find((f) => f.shortName === '7-day wind')!;
    expect(wind.lastUpdated).toBe('2026-10-10T20:00:00.000Z');
    expect(wind.noteShort).toBe('Solar wind: a hindcast, as it was at 6 Oct 09:00Z.');
    expect(applying({ ...BASE, heliosphere: { ...heliosphere, drawn: false } })).toEqual([]);
  });

  it('name ENLIL, and say its values are the model\'s, read off NOAA\'s frames, a forecast when ahead, once drawn', () => {
    const enlil = { on: true, drawn: true, at: Date.UTC(2026, 9, 12, 6), quantity: 'density' as const, forecast: true, error: null, loading: false };
    const feeds = spaceWeatherFeeds({ ...BASE, enlil });
    const model = feeds.find((f) => f.shortName === 'ENLIL')!;
    expect(model.name).toBe('NOAA SWPC WSA-ENLIL model');
    expect(model.credits).toEqual([CREDITS.wsaEnlil]);
    expect(model.noteShort).toBe('ENLIL: the model\'s forecast density for 12 Oct 06:00Z, not a measurement.');
    expect(applying({ ...BASE, enlil })).toEqual(['ENLIL']);
    expect(applying({ ...BASE, enlil: { ...enlil, drawn: false } })).toEqual([]);
    expect(spaceWeatherFeeds({ ...BASE, enlil: { ...enlil, on: false } }).find((f) => f.shortName === 'ENLIL')).toBeUndefined();
  });

  it('name DONKI\'s CMEs, and say whose their arrivals are, once drawn', () => {
    const cme = { id: 'c', leftAt: Date.UTC(2026, 9, 10, 18, 40), speed: 1553, halfAngle: 45, lat: 12, lon: 9, type: 'O', link: '', earth: { kind: 'arrives' as const, at: Date.UTC(2026, 9, 12, 0, 43), glancing: false, modelledAt: 0, link: '' } };
    const cmes = { on: true, drawn: true, at: Date.UTC(2026, 9, 10, 23), inFlight: [cme], error: null, loading: false };
    const entry = spaceWeatherFeeds({ ...BASE, cmes }).find((f) => f.shortName === 'CMEs')!;
    expect(entry.name).toBe('NASA CCMC DONKI CMEs');
    expect(entry.credits).toEqual([CREDITS.donki]);
    expect(entry.noteShort).toBe('CMEs: drag-based fronts; CCMC\'s ENLIL: Earth 12 Oct 00:43Z (in 26 h).');
    expect(applying({ ...BASE, cmes })).toEqual(['CMEs']);
    expect(applying({ ...BASE, cmes: { ...cmes, drawn: false } })).toEqual([]);
    expect(spaceWeatherFeeds({ ...BASE, cmes: { ...cmes, on: false } }).find((f) => f.shortName === 'CMEs')).toBeUndefined();
  });

  it('give the wind near the Earth an entry of its own, the wind now and its flow a model', () => {
    const reading = { drivers: { pdyn: 2, dst: 0, byImf: 0, bzImf: -5 }, held: [], wind: { observed: '2026-10-10T20:00:00Z', arrives: 'a', speed: 500, density: 5, bx: -2, by: 0, bz: -5 }, dst: null, missing: [] };
    const feeds = spaceWeatherFeeds({ ...BASE, nearEarthFlow: { on: true, drawn: true, reading } });
    const near = feeds.find((f) => f.shortName === 'Near-Earth flow')!;
    expect(near.noteShort).toBe('Solar wind near the Earth: the wind now; its flow round the magnetosphere a model.');
    expect(near.note).toMatch(/the wind measured at 10 Oct 20:00Z/);
    expect(applying({ ...BASE, nearEarthFlow: { on: true, drawn: true, reading } })).toEqual(['Near-Earth flow']);
    expect(applying({ ...BASE, nearEarthFlow: { on: true, drawn: false, reading } })).toEqual([]);
  });

  it('carry the belts\' note on GOES\'s own entry when GOES was read', () => {
    const electrons = { at: '2026-10-10T19:10:00Z', flux: 221.5, satellite: 19 };
    const feeds = spaceWeatherFeeds({ ...BASE, vanAllen: { on: true, drawn: true, electrons, error: null, loading: false } });
    expect(applying({ ...BASE, vanAllen: { on: true, drawn: true, electrons, error: null, loading: false } })).toEqual(['GOES electrons']);
    expect(feeds.find((f) => f.shortName === 'GOES electrons')!.lastUpdated).toBe('2026-10-10T19:10:00Z');
  });
});
