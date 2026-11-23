/**
 * What Raver Watch v1.2 says on the globe (Mecha Jono's update of 2026-10-02;
 * the owner's decisions of the same day, RW12).
 *
 * A scene event at a public venue says the venue and its address, and credits
 * OpenStreetMap, whose venue it is. A HeatRisk note is the heat glyph, and its
 * hover names the National Weather Service's level in its own words. Genres
 * read as words: `drum_and_bass` is "drum and bass".
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RaverWatchItem } from '../raverWatch';
import { describeItem, glyphOf, genreName, heatRiskName } from '../raverWatchView';

const HOUR = 3_600;
const DAY = 86_400;
const START = 1_791_003_600;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'DrugCheckAlerts', title: 'A warning', source: 'A lab',
  validFrom: 100 * DAY, validUntil: 130 * DAY, content: 'words', level: 'amber', ...over,
});
const atVenue = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
  id: '31923:pk:raver-scene-event-v', layer: 'SceneEvents', level: undefined, category: 'event',
  title: 'Disco, funk and house at Public Works, San Francisco, CA', source: '19hz.info',
  validFrom: START - 14 * DAY, validUntil: START + 5 * HOUR, start: START, end: START + 5 * HOUR, startTzid: 'America/Los_Angeles',
  location: 'Public Works, 161 Erie Street, San Francisco, CA', venue: 'Public Works',
  license: 'ODbL-1.0 (venue: OpenStreetMap contributors)', genres: ['disco', 'drum_and_bass'],
  point: { lat: 37.769, lon: -122.42 }, precision: 'venue', cancelled: false, ...over,
});
const heat = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
  id: '30023:pk:raver-heat-risk-ca-costa-mesa-2026-10-03', layer: 'HeatRisk', category: 'heat', level: 'red', heatRisk: 3,
  title: 'HeatRisk Red in Costa Mesa, CA on Sat 3 Oct', source: 'National Weather Service HeatRisk',
  validFrom: 1_790_888_400, validUntil: 1_791_118_800,
  point: { lat: 33.6, lon: -117.9 }, precision: 'city', jurisdiction: 'us-ca', ...over,
});

describe('a scene event at a public venue', () => {
  it('says the venue and its address, and credits OpenStreetMap', () => {
    const said = describeItem(atVenue(), () => null);
    expect(said).toContain('Public Works, 161 Erie Street, San Francisco, CA');
    expect(said).toMatch(/OpenStreetMap contributors, ODbL/);
  });

  it('credits nothing at a town', () => {
    expect(describeItem(atVenue({ venue: undefined, license: undefined, precision: 'city', location: 'San Francisco, CA' }), () => null))
      .not.toMatch(/OpenStreetMap/);
  });
});

describe('genres, as words', () => {
  it('reads an underscore as a space', () => {
    expect(genreName('drum_and_bass')).toBe('drum and bass');
    expect(genreName('hard_techno')).toBe('hard techno');
    expect(genreName('house')).toBe('house');
    expect(describeItem(atVenue(), () => null)).toContain(': disco, drum and bass —');
  });
});

describe('HeatRisk', () => {
  it('is the heat glyph, whatever its category says', () => {
    expect(glyphOf(heat())).toBe('heat');
    expect(glyphOf(heat({ category: undefined }))).toBe('heat');
  });

  it('names each level as the NWS does', () => {
    expect([0, 1, 2, 3, 4].map(heatRiskName)).toEqual(['Green', 'Yellow', 'Orange', 'Red', 'Magenta']);
  });

  it('says its level as the NWS does, out of four, where it applies and until when', () => {
    const said = describeItem(heat(), () => null);
    expect(said).toContain('NWS HeatRisk Red (3 of 4)');
    expect(said).toContain('near 33.6°N 117.9°W');
    // It applies for a day, until 06:00 in Costa Mesa: to the hour, not the date.
    expect(said).toContain('until 4 Oct 2026 13:00Z');
  });

  it('without a level it can read, says the note\'s own', () => {
    expect(describeItem(heat({ heatRisk: undefined }), () => null)).not.toContain('HeatRisk Red (');
  });
});
