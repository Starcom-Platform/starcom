/**
 * Hero Watch this week as a briefing playlist (hero-watch.md, HW13): its relief countries first, the
 * largest operation first, then its open field missions, ending soonest first, each stop in its card's
 * own words, a mission's safety limits among them.
 */
import { describe, expect, it } from 'vitest';
import type { FieldMission, ReliefOperation, ReliefPresence } from '../../../../services/heroWatch/heroWatch';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';
import type { HeroWatchListing } from '../../capture/heroWatchReports';
import { heroCandidates } from '../playlistSources';

const PK = '6301c4d0b1f3a2e4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809192a9692';
const square = (lon: number, lat: number, w: number): RegionOutline['geometry'] => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + w], [lon, lat + w], [lon, lat]]] });
const REGIONS: Record<string, RegionOutline> = {
  ET: { name: 'Ethiopia', geometry: square(36, 6, 6) },
  SD: { name: 'Sudan', geometry: square(24, 10, 8) },
  'us-nm': { name: 'New Mexico', geometry: square(-109, 32, 5) },
};
const base = { pubkey: PK, eventId: 'e', createdAt: 1, validFrom: 1, validUntil: Date.UTC(2026, 10, 10) / 1000, content: '' };
const op = (id: string, jurisdiction: string, amountChf?: number): ReliefOperation => ({
  ...base, id, d: id, kind: 'operation', section: 'Relief', title: `Operation ${id}`, source: 'IFRC GO', jurisdiction, appealType: 'DREF', amountChf,
});
const presence: ReliefPresence = {
  ...base, id: 'pr', d: 'pr', kind: 'presence', section: 'Relief', title: '144 organisations respond in Ethiopia, by OCHA\'s count',
  source: 'OCHA, via HDX', jurisdiction: 'et', organisations: 144, sectors: [],
};
const mission = (id: string, endsDay: number): FieldMission => ({
  ...base, id, d: id, kind: 'field_mission', section: 'FieldMissions', title: `Mission ${id}`, jurisdiction: 'us-nm', family: 'naloxone', state: 'open',
  description: '', objectives: [{ id: 'a', ask: 'Get naloxone.', effortMinutes: 30 }], limits: 'Work in pairs.', harmReduction: true,
  validUntil: Date.UTC(2026, 10, endsDay) / 1000,
});
const listing = (over: Partial<HeroWatchListing> = {}): HeroWatchListing => ({
  stations: [],
  relief: [
    { code: 'SD', name: 'Sudan', operations: [op('sd-1', 'sd', 200_000)], presence: null },
    { code: 'ET', name: 'Ethiopia', operations: [op('et-small', 'et', 50_000), op('et-big', 'et', 749_972)], presence },
  ],
  missions: [{ code: 'us-nm', name: 'New Mexico', missions: [mission('late', 20), mission('soon', 9)] }],
  missionsLayer: 'FieldMissions',
  regionOf: (code) => REGIONS[code] ?? null,
  ...over,
});

describe('Hero Watch this week as a playlist', () => {
  it('stops at each relief country, at its largest operation, the largest first, then at each open mission', () => {
    const candidates = heroCandidates(listing());
    expect(candidates.map((c) => [c.id, c.rank, c.group])).toEqual([
      ['sd-1', 0, 'region:SD'],
      ['et-big', 0, 'region:ET'],
      ['late', 1, 'region:us-nm'],
      ['soon', 1, 'region:us-nm'],
    ]);
    const [sudan, ethiopia, late, soon] = candidates;
    // The larger operation first among relief, the soonest ending first among missions (`at`: larger first).
    expect(ethiopia.at).toBeGreaterThan(sudan.at);
    expect(soon.at).toBeGreaterThan(late.at);
  });

  it('says why each stop is on the tour, and gives its card\'s own lines, a mission\'s limits among them', () => {
    const [sudan, ethiopia, , soon] = heroCandidates(listing());
    expect(sudan.why).toBe('Relief: 1 Red Cross and Red Crescent operation');
    expect(ethiopia.why).toBe('Relief: 2 Red Cross and Red Crescent operations, and 144 organisations at work');
    expect(ethiopia.title).toBe('Operation et-big');
    // It ends at 00:00Z on 9 November: open to the 8th, as every mission's last day is said.
    expect(soon.why).toBe('A field mission, open to 8 Nov 2026');
    expect(soon.lines).toContain('Safety limits: Work in pairs.');
    // Held whole in a clip's caption, which cuts the other lines first (HW13).
    expect(soon.neverCut!.map((i) => soon.lines[i])).toEqual(['Safety limits: Work in pairs.']);
    expect(ethiopia.neverCut).toBeUndefined();
    // At its place's middle: New Mexico's.
    expect(soon.position.lat).toBeGreaterThan(32);
    expect(soon.position.lng).toBeLessThan(-104);
  });

  it('stops at a country with only OCHA\'s count, and at nothing it does not draw', () => {
    const counted = heroCandidates(listing({ relief: [{ code: 'ET', name: 'Ethiopia', operations: [], presence }], missions: [] }));
    expect(counted.map((c) => [c.id, c.why])).toEqual([['pr', 'Relief: 144 organisations at work, by OCHA\'s count']]);
    expect(heroCandidates(listing({ relief: [], missions: [] }))).toEqual([]);
  });
});
