/**
 * Raver Watch items, as the share handle lists and features them (globe
 * record, section 19, Phase 1 step 4; contract v8). Each is listed with its
 * layer, its `30023:<pubkey>:<d>` id and its level as `variant`, so frame,
 * focus and tour work on it as on a report. A position is never finer than
 * 0.1°. An item about a country stands at the middle of its largest part, with
 * how far the country reaches as its uncertainty; a card about one names its
 * source, its dates and where it applies.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RaverWatchItem } from '../../../../services/raverWatch/raverWatch';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';
import { raverWatchShareReports, featuredRaverWatchFor } from '../raverWatchReports';

const PK = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const DAY = 86_400;
const item = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: `30023:${PK}:raver-drug-check-alert-x`, pubkey: PK, d: 'raver-drug-check-alert-x', eventId: 'e', createdAt: 1_790_600_000,
  layer: 'DrugCheckAlerts', title: 'Aktuelle Warnungen KW 39', source: 'checkit! Wien',
  validFrom: 20_352 * DAY, validUntil: 20_397 * DAY, content: 'words', level: 'red', point: { lat: 48.2, lon: 16.4 }, ...over,
});
/** Spain, as two parts: the peninsula, and a small island far off it. */
const spain: RegionOutline = {
  name: 'Spain',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [[[-18.1, 27.7], [-17.9, 27.7], [-17.9, 27.9], [-18.1, 27.7]]],
      [[[-9, 36], [3, 36], [3, 43.5], [-9, 43.5], [-9, 36]]],
    ],
  },
};
const regionOf = (code: string) => (code === 'es' ? spain : null);

describe('Raver Watch items, listed for an agent', () => {
  it('each with its layer, its address as its id, and its level as its variant', () => {
    const [report] = raverWatchShareReports([item()], regionOf);
    expect(report).toMatchObject({
      id: `30023:${PK}:raver-drug-check-alert-x`,
      layer: 'DrugCheckAlerts',
      title: 'Aktuelle Warnungen KW 39',
      variant: 'red',
      lat: 48.2,
      lng: 16.4,
      precisionM: 11_100,
      time: { iso: new Date(20_352 * DAY * 1000).toISOString(), basis: 'applies' },
      sharesPlaceWith: 0,
    });
    expect(report.variantMeans).toMatch(/level red/);
    expect(report.author).toMatch(/^npub1/);
  });

  it('places an item about a country at the middle of its largest part, as far as it reaches', () => {
    const [report] = raverWatchShareReports([item({ point: undefined, jurisdiction: 'es' })], regionOf);
    expect(report.lat).toBeCloseTo(39.8, 0);
    expect(report.lng).toBeCloseTo(-3, 0);
    expect(report.precisionM).toBeGreaterThan(500_000);
    expect(report.precisionM).toBeLessThan(1_000_000);
  });

  it('leaves out what has no place it can stand on', () => {
    expect(raverWatchShareReports([item({ point: undefined, jurisdiction: 'zz' }), item({ point: undefined })], regionOf)).toEqual([]);
  });

  it('counts the others drawn at the same place', () => {
    const reports = raverWatchShareReports([item(), item({ id: 'b' })], regionOf);
    expect(reports.map((r) => r.sharesPlaceWith)).toEqual([1, 1]);
  });
});

describe('a Raver Watch item, featured on a card', () => {
  it('names its level and layer, its source, when it applies, where, and that it was signed', () => {
    const featured = featuredRaverWatchFor(item(), regionOf)!;
    expect(featured).toMatchObject({ id: item().id, title: 'Aktuelle Warnungen KW 39', position: { lat: 48.2, lng: 16.4 } });
    expect(featured.lines).toEqual([
      'Drug-check alert · level red · from checkit! Wien',
      `Applies from ${new Date(20_352 * DAY * 1000).toUTCString().slice(5, 16).replace(/^0/, '')} until ${new Date(20_397 * DAY * 1000).toUTCString().slice(5, 16).replace(/^0/, '')}`,
      'Near 48.2°, 16.4° · placed to within about 11 km',
      'A signed Nostr event from The Record; its signature was checked on intake',
    ]);
  });

  it('says a country, not a point, for an item about one', () => {
    const featured = featuredRaverWatchFor(item({ point: undefined, jurisdiction: 'es', layer: 'SceneIncidents', level: 'amber' }), regionOf)!;
    expect(featured.lines[0]).toBe('Scene incident · level amber · from checkit! Wien');
    expect(featured.lines[2]).toBe('Applies to Spain');
  });
});

describe('Raver Watch v1.1 items, listed and featured', () => {
  const START = 1_791_003_600;
  const sceneEvent = (over: Partial<RaverWatchItem> = {}) => item({
    id: `31923:${PK}:raver-scene-event-19hz-f7c97f72d6e4ae4a`, d: 'raver-scene-event-19hz-f7c97f72d6e4ae4a',
    layer: 'SceneEvents', level: undefined, title: 'Disco, funk and house event in San Francisco, CA', source: '19hz.info',
    validFrom: START - 14 * DAY, validUntil: START + 18_000, start: START, end: START + 18_000, startTzid: 'America/Los_Angeles',
    location: 'San Francisco, CA', genres: ['disco', 'funk', 'house'], point: { lat: 37.8, lon: -122.4 }, precision: 'city',
    cancelled: false, ...over,
  });

  it('a scene event is listed under its own layer and id, at the time of its night, not when it was listed', () => {
    const [report] = raverWatchShareReports([sceneEvent()], regionOf);
    expect(report).toMatchObject({
      id: `31923:${PK}:raver-scene-event-19hz-f7c97f72d6e4ae4a`, layer: 'SceneEvents',
      time: { iso: new Date(START * 1000).toISOString(), basis: 'applies' },
    });
  });

  it('a card says it is a scene event, its night in UTC, its genres and its town', () => {
    const featured = featuredRaverWatchFor(sceneEvent(), regionOf)!;
    expect(featured.lines[0]).toBe('Scene event · listed by 19hz.info');
    expect(featured.lines[1]).toBe('3 Oct 05:00Z until 3 Oct 10:00Z · disco, funk, house');
    expect(featured.lines[2]).toBe('San Francisco, CA, near 37.8°, -122.4° · placed to within about 11 km');
  });

  it('a card says an all-day event\'s own day, in its own zone, and no clock time (Interchange 3.25)', () => {
    // Paris, 3 Nov 2026: its day runs from 23:00Z on the 2nd.
    const day = Date.UTC(2026, 10, 2, 23) / 1000;
    const featured = featuredRaverWatchFor(sceneEvent({ allDay: true, start: day, end: day + DAY, startTzid: 'Europe/Paris', genres: [] }), regionOf)!;
    expect(featured.lines[1]).toBe('Tue 3 Nov (Europe/Paris), all day');
  });

  it('a card says first when an event is called off', () => {
    expect(featuredRaverWatchFor(sceneEvent({ cancelled: true }), regionOf)!.lines[0]).toMatch(/^Cancelled · Scene event/);
  });

  it('a card says a point that stands for a state is not a venue', () => {
    const featured = featuredRaverWatchFor(item({ point: { lat: -33.9, lon: 151.2 }, precision: 'state' }), regionOf)!;
    expect(featured.lines[2]).toMatch(/^Stands for a whole state or province/);
  });
});

describe('v1.2: a scene event at a public venue, and HeatRisk', () => {
  const START = 1_791_003_600;
  const atVenue = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => item({
    id: `31923:${PK}:raver-scene-event-v`, layer: 'SceneEvents', level: undefined, category: 'event',
    title: 'Disco, funk and house at Public Works, San Francisco, CA', source: '19hz.info',
    validFrom: START - 14 * DAY, validUntil: START + 18_000, start: START, end: START + 18_000, startTzid: 'America/Los_Angeles',
    location: 'Public Works, 161 Erie Street, San Francisco, CA', venue: 'Public Works',
    license: 'ODbL-1.0 (venue: OpenStreetMap contributors)', genres: ['disco', 'drum_and_bass'],
    point: { lat: 37.769, lon: -122.42 }, precision: 'venue', cancelled: false, ...over,
  });
  const heat = item({
    id: `30023:${PK}:raver-heat-risk-ca-costa-mesa-2026-10-03`, layer: 'HeatRisk', category: 'heat', level: 'red', heatRisk: 3,
    title: 'HeatRisk Red in Costa Mesa, CA on Sat 3 Oct', source: 'National Weather Service HeatRisk',
    validFrom: 1_790_888_400, validUntil: 1_791_118_800, point: { lat: 33.6, lon: -117.9 }, precision: 'city',
  });

  // Drawn at the venue, but handed out as everything is: an agent's link never carries a venue's point.
  it('lists a venue\'s event at 0.1°, as every item is listed', () => {
    const [report] = raverWatchShareReports([atVenue()], regionOf);
    expect(report).toMatchObject({ layer: 'SceneEvents', lat: 37.8, lng: -122.4, precisionM: 11_100 });
  });

  it('counts two venues in one town as sharing its place', () => {
    const reports = raverWatchShareReports([atVenue(), atVenue({ id: 'other', point: { lat: 37.771, lon: -122.412 } })], regionOf);
    expect(reports.map((r) => r.sharesPlaceWith)).toEqual([1, 1]);
  });

  it('a card about it names the venue and address, credits OpenStreetMap, and gives no point finer than 0.1°', () => {
    const card = featuredRaverWatchFor(atVenue(), regionOf)!;
    expect(card.position).toEqual({ lat: 37.8, lng: -122.4 });
    const said = card.lines.join('\n');
    expect(said).toContain('Public Works, 161 Erie Street, San Francisco, CA');
    expect(said).toContain('OpenStreetMap contributors, ODbL');
    expect(said).toContain('disco, drum and bass');
    expect(said).not.toMatch(/\d+\.\d{2,}/);
  });

  it('a card about HeatRisk names its layer and the NWS level, until the hour it ends', () => {
    const card = featuredRaverWatchFor(heat, regionOf)!;
    expect(card.lines[0]).toBe('Heat risk · level red · from National Weather Service HeatRisk');
    expect(card.lines[1]).toBe('NWS HeatRisk Red (3 of 4) · applies from 1 Oct 2026 21:00Z until 4 Oct 2026 13:00Z');
  });
});
