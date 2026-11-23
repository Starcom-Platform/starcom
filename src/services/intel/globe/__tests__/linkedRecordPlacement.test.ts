/**
 * A Case or Mission on the globe is its linked reports' own pins, plus an
 * account of every linked record that is not one (case-location-semantics.md,
 * option C).
 */
import { describe, it, expect } from 'vitest';
import { placeLinkedRecords } from '../linkedRecordPlacement';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const report = (id: string, over: Record<string, unknown> = {}): IntelReportUI => ({
  id,
  title: `Report ${id}`,
  content: 'Body',
  summary: '',
  author: 'analyst-1',
  category: 'General',
  tags: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  status: 'DRAFT',
  version: 1,
  history: [],
  ...over,
} as IntelReportUI);

describe('placeLinkedRecords', () => {
  it("pins each linked report that has coordinates, by the report's own id and position", () => {
    const p = placeLinkedRecords(
      ['a', 'b'],
      [report('a', { latitude: 51.5, longitude: -0.1 }), report('b', { latitude: -33.9, longitude: 18.4 })],
      [],
    );
    expect(p.markers.map((m) => [m.pubkey, m.latitude, m.longitude])).toEqual([['a', 51.5, -0.1], ['b', -33.9, 18.4]]);
    expect(p.notDrawn).toEqual({ count: 0, byReason: {} });
  });

  it('draws only linked reports, and never a pin for the case or mission itself', () => {
    const p = placeLinkedRecords(
      ['a'],
      [report('a', { latitude: 1, longitude: 2 }), report('unlinked', { latitude: 3, longitude: 4 })],
      [],
    );
    expect(p.markers.map((m) => m.pubkey)).toEqual(['a']);
  });

  it('counts every other linked record by why it is not drawn', () => {
    const p = placeLinkedRecords(
      ['placed', 'bare', 'item', 'gone'],
      [report('placed', { latitude: 1, longitude: 2 }), report('bare')],
      [{ id: 'item' }],
    );
    expect(p.linkedCount).toBe(4);
    expect(p.markers.map((m) => m.pubkey)).toEqual(['placed']);
    expect(p.notDrawn).toEqual({ count: 3, byReason: { 'no-coordinates': 1, 'intel-item': 1, 'not-found': 1 } });
  });

  it("counts a mission's linked cases that cannot be found, whose records cannot be read", () => {
    const p = placeLinkedRecords(['a'], [report('a', { latitude: 1, longitude: 2 })], [], 2);
    expect(p.linkedCount).toBe(3);
    expect(p.notDrawn).toEqual({ count: 2, byReason: { 'case-not-found': 2 } });
  });

  it('decides "has coordinates" by the rule the globe draws with', () => {
    // The visualization service pins a numeric string, so it counts as drawn
    // here too. NaN and a missing longitude are not coordinates to either.
    const p = placeLinkedRecords(
      ['str', 'nan', 'half'],
      [
        report('str', { latitude: '12.5', longitude: '-3' }),
        report('nan', { latitude: Number.NaN, longitude: 4 }),
        report('half', { latitude: 5 }),
      ],
      [],
    );
    expect(p.markers.map((m) => [m.pubkey, m.latitude, m.longitude])).toEqual([['str', 12.5, -3]]);
    expect(p.notDrawn.byReason).toEqual({ 'no-coordinates': 2 });
  });

  it('counts a record linked twice once', () => {
    const p = placeLinkedRecords(['a', 'a', 'gone', 'gone'], [report('a', { latitude: 1, longitude: 2 })], []);
    expect(p.linkedCount).toBe(2);
    expect(p.markers).toHaveLength(1);
    expect(p.notDrawn).toEqual({ count: 1, byReason: { 'not-found': 1 } });
  });

  it('points the camera at the pins, and nowhere when nothing is placed', () => {
    const placed = placeLinkedRecords(['a'], [report('a', { latitude: 40, longitude: -75 })], []);
    expect(placed.cameraTarget!.lat).toBeCloseTo(40, 6);
    expect(placed.cameraTarget!.lng).toBeCloseTo(-75, 6);
    expect(placeLinkedRecords(['bare'], [report('bare')], []).cameraTarget).toBeNull();
  });
});

describe('the camera target', () => {
  const at = (id: string, latitude: number, longitude: number) => report(id, { latitude, longitude });

  it('looks across the antimeridian, not through Greenwich', () => {
    const { cameraTarget } = placeLinkedRecords(['east', 'west'], [at('east', 0, 170), at('west', 0, -170)], []);
    expect(Math.abs(cameraTarget!.lng)).toBeCloseTo(180, 6);
    expect(cameraTarget!.lat).toBeCloseTo(0, 6);
  });

  it('is null for pins with no one centre', () => {
    expect(placeLinkedRecords(['a', 'b'], [at('a', 0, 0), at('b', 0, 180)], []).cameraTarget).toBeNull();
  });
});
