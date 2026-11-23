/**
 * War & Conflict items, as the share handle lists and features them (contract
 * v10; decisions WC1-WC4). Each is listed with its layer, its
 * `30023:<pubkey>:<d>` id and its backing as `variant`, at its point to 0.1°,
 * or, when it names only a country, at the middle of the country's largest
 * part with how far the country reaches as its uncertainty. A card about one
 * says what happened, each casualty claim apart, where, and where it came from.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { ConflictItem } from '../../../../services/warConflict/warConflict';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';
import { warConflictShareReports, featuredWarConflictFor } from '../warConflictReports';

const PK = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const REPORTED = 1_790_967_291;
const item = (over: Partial<ConflictItem> = {}): ConflictItem => ({
  family: 'item', id: `30023:${PK}:starcom-intel-conflict-wikipedia-8b12506d8d1a4565`, pubkey: PK,
  d: 'starcom-intel-conflict-wikipedia-8b12506d8d1a4565', eventId: 'e', createdAt: REPORTED,
  title: 'Pakistan launches airstrikes in Afghanistan', reportedAt: REPORTED, content: 'words',
  events: [{ id: 'airstrike', label: 'Airstrike' }], fatal: true, actors: [], source: 'wikipedia', license: 'CC BY-SA 4.0',
  casualties: [
    { kind: 'killed', count: 22, qualifier: '', words: '' },
    { kind: 'killed', count: 9, qualifier: '', words: '' },
  ],
  theatre: { slug: 'afghanistan-pakistan', name: 'Afghanistan–Pakistan war', region: 'South Asia' },
  place: { words: 'Kunar Province', precision: 'state' }, point: { lat: 35, lon: 71.2 }, precision: 'state', jurisdiction: 'af',
  ...over,
});
const ethiopia: RegionOutline = { name: 'Ethiopia', geometry: { type: 'Polygon', coordinates: [[[33, 4], [47, 4], [47, 14.8], [33, 14.8], [33, 4]]] } };
const regionOf = (code: string) => (code === 'et' ? ethiopia : null);

describe('War & Conflict items, listed for an agent', () => {
  it('each with its layer, its address, and its backing as its variant, at its point to 0.1°', () => {
    const [report] = warConflictShareReports([item()], regionOf);
    expect(report).toMatchObject({
      id: item().id, layer: 'WarConflict', title: 'Pakistan launches airstrikes in Afghanistan',
      variant: 'deadly', variantMeans: 'deaths reported (a ring)',
      time: { iso: new Date(REPORTED * 1000).toISOString(), basis: 'written' },
      lat: 35, lng: 71.2, precisionM: 11_100, sharesPlaceWith: 0,
    });
  });

  it('one that names only a country stands at its middle, the country\'s reach its uncertainty', () => {
    const [report] = warConflictShareReports([item({ point: undefined, precision: undefined, place: undefined, jurisdiction: 'et' })], regionOf);
    expect(report.lat).toBeCloseTo(9.4, 0);
    expect(report.lng).toBeCloseTo(40, 0);
    expect(report.precisionM).toBeGreaterThan(500_000);
  });

  it('lists nothing that names no place it can stand at', () => {
    expect(warConflictShareReports([item({ point: undefined, jurisdiction: undefined }), item({ point: undefined, jurisdiction: 'zz' })], regionOf)).toEqual([]);
  });

  // IM14: an item that says what it is decides its card's badge, so an agent can see it too (contract v14).
  it('with its role, when it states one, and none when it does not', () => {
    const [critical, unstated] = warConflictShareReports([item({ role: 'critical' }), item({ id: 'other', role: undefined })], regionOf);
    expect(critical.role).toBe('critical');
    expect('role' in unstated).toBe(false);
  });

  it('counts the others at the same place', () => {
    const reports = warConflictShareReports([item(), item({ id: 'other' })], regionOf);
    expect(reports.map((r) => r.sharesPlaceWith)).toEqual([1, 1]);
  });
});

describe('a card about one', () => {
  it('says what happened and in which war, each casualty claim apart, where, and where it came from', () => {
    const card = featuredWarConflictFor(item(), regionOf, () => 'Afghanistan')!;
    expect(card.position).toEqual({ lat: 35, lng: 71.2 });
    expect(card.lines[0]).toBe('War & Conflict · Airstrike · Afghanistan–Pakistan war');
    expect(card.lines[1]).toBe('Casualties as reported: 22 killed; 9 killed (separate claims, not added)');
    expect(card.lines[2]).toBe('Kunar Province, Afghanistan · a province, marked at its centre near 35.0°, 71.2°');
    expect(card.lines[3]).toMatch(/^Reported 2 Oct 2026 18:54Z from Wikipedia's Current events portal \(CC BY-SA 4\.0\)$/);
  });

  it('about a country as a whole, says so', () => {
    const card = featuredWarConflictFor(item({ point: undefined, precision: undefined, place: undefined, jurisdiction: 'et', casualties: [], fatal: false }), regionOf, () => 'Ethiopia')!;
    expect(card.lines[1]).toMatch(/^Reported /);
    expect(card.lines[2]).toBe('About Ethiopia as a whole: the line names no place in it');
  });

  it('features nothing that has no place', () => {
    expect(featuredWarConflictFor(item({ point: undefined, jurisdiction: undefined }), regionOf, () => null)).toBeNull();
  });
});
