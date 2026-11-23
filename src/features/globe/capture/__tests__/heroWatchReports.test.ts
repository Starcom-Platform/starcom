/**
 * Hero Watch's items, as the share handle lists and features them (decision D-HW, step 7; HW10–HW12):
 * a lifeboat station, a relief note at its country, and a field mission at its place, each listed with
 * its address; and the lines a card about one says, a field mission's never without its safety limits.
 */
import { describe, expect, it } from 'vitest';
import type { FieldMission, LifeboatStation, ReliefOperation, ReliefPresence } from '../../../../services/heroWatch/heroWatch';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';
import { featuredHeroWatchFor, heroWatchShareReports, type HeroWatchListing } from '../heroWatchReports';

const PK = '6301c4d0b1f3a2e4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809192a9692';
const square = (lon: number, lat: number, w: number): RegionOutline['geometry'] => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + w], [lon, lat + w], [lon, lat]]] });
const REGIONS: Record<string, RegionOutline> = {
  ET: { name: 'Ethiopia', geometry: square(36, 6, 6) },
  'us-nm': { name: 'New Mexico', geometry: square(-109, 32, 5) },
};
const base = { pubkey: PK, eventId: 'e', createdAt: Date.UTC(2026, 9, 10) / 1000, validFrom: Date.UTC(2026, 9, 9) / 1000, validUntil: Date.UTC(2026, 10, 10) / 1000, content: '' };
const dover: LifeboatStation = {
  ...base, id: `30023:${PK}:hero-watch-station-5113`, d: 'hero-watch-station-5113', kind: 'station', section: 'Lifeboats', title: 'Dover lifeboat station: 76 launches in 2025',
  source: 'RNLI', point: { lat: 51.118, lon: 1.311 }, precision: 'venue', launches: 76, year: 2025, stationType: 'ALB',
};
const op: ReliefOperation = {
  ...base, id: `30023:${PK}:hero-watch-appeal-1`, d: 'hero-watch-appeal-1', kind: 'operation', section: 'Relief', title: 'Ethiopian Red Cross Society: Ethiopia Drought Response',
  source: 'IFRC GO', jurisdiction: 'et', appealType: 'DREF', amountChf: 749_972, peopleToReach: 50_000, start: base.validFrom, end: Date.UTC(2027, 3, 1) / 1000,
};
const presence: ReliefPresence = {
  ...base, id: `30023:${PK}:hero-watch-presence-et`, d: 'hero-watch-presence-et', kind: 'presence', section: 'Relief', title: '144 organisations respond in Ethiopia, by OCHA\'s count',
  source: 'OCHA, via HDX', jurisdiction: 'et', organisations: 144, nationalNgos: 73, sectors: [], periodStart: '2026-01-01', periodEnd: '2026-03-31',
};
const LIMITS = 'Work in pairs. Never confront anyone. Look after yourself first. If someone is unresponsive, call 911 first.';
const naloxone: FieldMission = {
  ...base, id: `30079:${PK}:starcom_mission_package_field-naloxone-NM`, d: 'starcom_mission_package_field-naloxone-NM', kind: 'field_mission', section: 'FieldMissions',
  title: 'Carry naloxone in New Mexico: overdose deaths up 28.1% in a year', jurisdiction: 'us-nm', family: 'naloxone', state: 'open', description: '',
  objectives: [{ id: 'a', ask: 'Get naloxone.', effortMinutes: 30 }, { id: 'b', ask: 'Learn to use it.', effortMinutes: 10 }], limits: LIMITS, harmReduction: true,
};
const listing = (over: Partial<HeroWatchListing> = {}): HeroWatchListing => ({
  stations: [dover],
  relief: [{ code: 'ET', name: 'Ethiopia', operations: [op], presence }],
  missions: [{ code: 'us-nm', name: 'New Mexico', missions: [naloxone] }],
  missionsLayer: 'FieldMissions',
  regionOf: (code) => REGIONS[code] ?? null,
  ...over,
});

describe('Hero Watch\'s items in listReports', () => {
  it('lists each drawn item by its address, on its layer, at a tenth of a degree or its region\'s middle', () => {
    const reports = heroWatchShareReports(listing());
    expect(reports.map((r) => [r.id, r.layer, r.variant])).toEqual([
      [dover.id, 'Lifeboats', 'station'],
      [op.id, 'Relief', 'operation'],
      [presence.id, 'Relief', 'presence'],
      [naloxone.id, 'FieldMissions', 'mission'],
    ]);
    const [station, operation, count, mission] = reports;
    expect(station).toMatchObject({ lat: 51.1, lng: 1.3, precisionM: 11_100, sharesPlaceWith: 0, title: 'Dover lifeboat station: 76 launches in 2025' });
    // A relief note and a field mission apply to the whole of their place: its middle, and how far it reaches.
    expect(operation).toMatchObject({ lat: count.lat, lng: count.lng, sharesPlaceWith: 1 });
    expect(operation.precisionM).toBeGreaterThan(100_000);
    expect(mission.time).toEqual({ iso: new Date(base.validFrom * 1000).toISOString(), basis: 'applies' });
    expect(mission.variantMeans).toBe('an open field mission, with its safety limits');
  });

  it('lists a mission on the layer that draws it: Raver Watch\'s Raver missions when that is the one', () => {
    expect(heroWatchShareReports(listing({ missionsLayer: 'RaverMissions' })).at(-1)!.layer).toBe('RaverMissions');
  });
});

describe('a card about a Hero Watch item', () => {
  it('says a field mission\'s place, end and asks, and its safety limits in full, before the signature', () => {
    const card = featuredHeroWatchFor(naloxone.id, listing())!;
    expect(card.title).toBe(naloxone.title);
    expect(card.lines).toEqual([
      'Field mission · open · posted by an AI agent',
      'New Mexico, the whole state · open to 9 Nov 2026 · 2 asks, 40 minutes in all',
      `Safety limits: ${LIMITS}`,
      'A signed Nostr event from The Record; its signature was checked on intake',
    ]);
  });

  it('says a relief note\'s country, its operation or its count, and IFRC GO\'s use', () => {
    const operation = featuredHeroWatchFor(op.id, listing())!;
    expect(operation.title).toBe(op.title);
    expect(operation.lines).toEqual([
      'Relief · Ethiopia, the whole country · 1 operation, 144 organisations at work',
      'DREF of CHF 749,972 to reach 50,000 people, until 31 Mar 2027 · from IFRC GO, used non-commercially',
      'A signed Nostr event from The Record; its signature was checked on intake',
    ]);
    expect(featuredHeroWatchFor(presence.id, listing())!.lines[1])
      .toBe('144 organisations at work by OCHA\'s count, January to March 2026, 73 of them national NGOs; counted, never named · from OCHA, via HDX');
  });

  it('says a station\'s launches as last year\'s count, never as rescues now', () => {
    const card = featuredHeroWatchFor(dover.id, listing())!;
    expect(card.title).toBe('Dover lifeboat station');
    expect(card.lines).toEqual([
      'Lifeboats · all-weather lifeboat · RNLI open data',
      '76 launches in 2025, the RNLI\'s count: last year\'s launches, not rescues happening now',
      'At the station, near 51.1°, 1.3° · placed to within about 11 km',
      'A signed Nostr event from The Record; its signature was checked on intake',
    ]);
    expect(featuredHeroWatchFor(dover.id, listing({ stations: [{ ...dover, launches: undefined, year: undefined }] }))!.lines[1])
      .toBe('Its launches are not counted in the RNLI\'s records');
  });

  it('features nothing that is not drawn, and nothing not its own', () => {
    expect(featuredHeroWatchFor(naloxone.id, listing({ missions: [] }))).toBeNull();
    expect(featuredHeroWatchFor('30023:x:not-ours', listing())).toBeNull();
  });
});
