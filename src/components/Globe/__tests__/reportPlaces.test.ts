/**
 * Reports grouped by place (decision D-F, section 18, item 1.2).
 *
 * The glyph layer and the pins both draw one mark per place from this, so what
 * matters is that a place leads with the report a reader most needs to see, and
 * that its count is neither short nor inflated.
 */
import { describe, it, expect } from 'vitest';
import { groupReportsByPlace, placeKeyOf, reportsAtPlace } from '../reportPlaces';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';

const report = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'p', title: 'A report', content: '', tags: [], latitude: 38.9, longitude: -77.0,
  timestamp: 0, author: 'a', ...over,
});

describe('groupReportsByPlace', () => {
  it('merges reports at one coordinate and keeps the others apart', () => {
    const places = groupReportsByPlace([
      report({ pubkey: 'a' }),
      report({ pubkey: 'b' }),
      report({ pubkey: 'c', latitude: 40.7, longitude: -74.0 }),
    ]);

    expect(places).toHaveLength(2);
    expect(places[0].reports.map((r) => r.pubkey).sort()).toEqual(['a', 'b']);
    expect(places[0].count).toBe(2);
    expect(places[1].count).toBe(1);
  });

  it('treats a place as one centroid, not a neighbourhood', () => {
    // 0.001° is about 110 m: near, but not the same geocoded point.
    const places = groupReportsByPlace([report({ pubkey: 'a' }), report({ pubkey: 'b', latitude: 38.901 })]);
    expect(places).toHaveLength(2);
  });

  it('never puts a person and a report in one place', () => {
    const places = groupReportsByPlace([report({ pubkey: 'a' }), report({ pubkey: 'b', kind: 'rlsh' })]);
    expect(places.map((p) => p.kind).sort()).toEqual(['intel', 'rlsh']);
  });

  it('leads with the most severe report, whatever order they arrived in', () => {
    const [place] = groupReportsByPlace([
      report({ pubkey: 'raw', tags: [] }),
      report({ pubkey: 'standard', tags: ['low'] }),
      report({ pubkey: 'critical', tags: ['critical'] }),
      report({ pubkey: 'actionable', tags: ['actionable'] }),
    ]);

    expect(place.lead.pubkey).toBe('critical');
    expect(place.reports.map((r) => r.pubkey)).toEqual(['critical', 'actionable', 'standard', 'raw']);
  });

  it('leads with the newest when severity ties', () => {
    const [place] = groupReportsByPlace([
      report({ pubkey: 'old', timestamp: 1_000 }),
      report({ pubkey: 'new', timestamp: 2_000 }),
    ]);
    expect(place.lead.pubkey).toBe('new');
  });

  it('counts what a marker says stands at its place, without summing it', () => {
    const [place] = groupReportsByPlace([
      report({ pubkey: 'a', kind: 'rlsh', groupKind: 'location', groupSize: 14 }),
      report({ pubkey: 'b', kind: 'rlsh', groupKind: 'location', groupSize: 14 }),
    ]);
    expect(place.count).toBe(14);
  });

  it('does not count an explicit group, which can span places', () => {
    const [place] = groupReportsByPlace([report({ groupKind: 'explicit', groupSize: 9 })]);
    expect(place.count).toBe(1);
  });

  it('leaves out a marker with no position rather than placing it at 0,0', () => {
    expect(groupReportsByPlace([report({ latitude: Number.NaN })])).toEqual([]);
  });

  it('keys a place by kind and coordinate', () => {
    expect(placeKeyOf(report())).toBe('intel|38.9000,-77.0000');
  });
});


/*
 * The clicked place's reports, and no others (BA8). The popup paged on past a
 * place into every report on the globe; a place's menu lists its reports, and
 * the popup pages through those alone.
 */
describe('reportsAtPlace', () => {
  it('the clicked place\'s reports, most severe first, and none from elsewhere', () => {
    const list = [
      report({ pubkey: 'far-1', latitude: 10 }),
      report({ pubkey: 'here-raw' }),
      report({ pubkey: 'far-2', latitude: 20 }),
      report({ pubkey: 'here-crit', tags: ['critical'] }),
    ];
    expect(reportsAtPlace(list, list[1]).map((r) => r.pubkey)).toEqual(['here-crit', 'here-raw']);
  });

  it('the clicked report alone when nothing shares its place, or when it has no position', () => {
    const list = [report({ pubkey: 'a' }), report({ pubkey: 'b', latitude: 5 })];
    expect(reportsAtPlace(list, list[1]).map((r) => r.pubkey)).toEqual(['b']);
    const nowhere = report({ pubkey: 'n', latitude: Number.NaN });
    expect(reportsAtPlace([...list, nowhere], nowhere).map((r) => r.pubkey)).toEqual(['n']);
  });

  it('never a person among reports', () => {
    const list = [report({ pubkey: 'r' }), report({ pubkey: 'hero', kind: 'rlsh' })];
    expect(reportsAtPlace(list, list[0]).map((r) => r.pubkey)).toEqual(['r']);
  });
});
