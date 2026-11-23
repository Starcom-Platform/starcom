/**
 * Campaigns and Operations on the globe (decision D-RS, RS25): each running or coming one, at the places it names,
 * its pill saying its name and clock; a place with several counts them. An ended one, or one past its window, is
 * not drawn; a place that cannot be outlined here is listed, not drawn.
 */
import { describe, it, expect } from 'vitest';
import { clockOf, rosterOpsByPlace, opsPillText, describeOpsAt, opsNoteSet } from '../rosterPlaces';
import type { ReadRosterItem } from '../rosterItem';

const B = 'b'.repeat(64);
const op = (over: Partial<ReadRosterItem> = {}): ReadRosterItem => ({
  d: 'operation-1', kind: 'operation', title: 'Count the Geminids', limits: ['Public, lawful places only.'], places: ['us-ca'], toward: [], counts: [], text: '',
  purpose: 'So that the shower is counted from dark sites.', window: { from: '2026-12-13', until: '2026-12-15' },
  author: B, createdAt: 1_792_200_000, address: `30084:${B}:operation-1`, ...over,
});
const outline = (code: string) => ({ 'us-ca': { name: 'California' }, 'US': { name: 'United States' }, 'DE': { name: 'Germany' } } as Record<string, { name: string }>)[code] ?? null;

describe('clockOf', () => {
  it('says how long is left, when it starts, or that it is open-ended', () => {
    expect(clockOf(op(), '2026-12-13')).toBe('2 days left');
    expect(clockOf(op(), '2026-12-14')).toBe('1 day left');
    expect(clockOf(op(), '2026-12-15')).toBe('ends today');
    expect(clockOf(op(), '2026-12-12')).toBe('starts tomorrow');
    expect(clockOf(op(), '2026-12-01')).toBe('starts in 12 days');
    expect(clockOf(op({ window: { from: '2026-10-01', until: '' } }), '2026-12-01')).toBe('under way');
  });
});

describe('rosterOpsByPlace', () => {
  it('places running and coming campaigns and operations, and leaves out the rest', () => {
    const items = [
      op(),
      op({ d: 'campaign-1', kind: 'campaign', title: 'Dark skies for California', address: `30084:${B}:campaign-1`, window: { from: '2026-10-01', until: '2027-03-01' } }),
      op({ d: 'ended', title: 'Ended early', address: `30084:${B}:ended`, ended: { date: '2026-12-01', why: 'Done' } }),
      op({ d: 'past', title: 'Long past', address: `30084:${B}:past`, window: { from: '2026-01-01', until: '2026-02-01' } }),
      op({ d: 'epic', kind: 'epic', title: 'An epic', address: `30084:${B}:epic` }),
      op({ d: 'eu', title: 'Across the EU', address: `30084:${B}:eu`, places: ['union:eu', 'de'] }),
    ];
    const { places, unplaced } = rosterOpsByPlace(items, outline, '2026-12-13');
    expect(places.map((p) => [p.code, p.name, p.items.map((i) => i.title)])).toEqual([
      ['us-ca', 'California', ['Count the Geminids', 'Dark skies for California']],
      ['DE', 'Germany', ['Across the EU']],
    ]);
    expect(unplaced).toEqual([]);
  });

  it('lists one naming no place it can outline', () => {
    const { places, unplaced } = rosterOpsByPlace([op({ places: ['union:eu'] })], outline, '2026-12-13');
    expect(places).toEqual([]);
    expect(unplaced.map((i) => i.title)).toEqual(['Count the Geminids']);
  });
});

describe('what the globe says of a place', () => {
  const place = { code: 'us-ca', name: 'California', items: [op()] };
  it('names one by its title and clock, and counts several', () => {
    expect(opsPillText(place, '2026-12-13')).toBe('Count the Geminids · 2 days left');
    expect(opsPillText({ ...place, items: [op(), op({ d: 'x', address: 'x' })] }, '2026-12-13')).toBe('California · 2 campaigns and operations');
  });

  it('hovers each with its kind and clock', () => {
    expect(describeOpsAt(place, '2026-12-13')).toBe('California\nOperation: Count the Geminids · 2 days left\nClick to open it in Operations');
  });

  it('opens them in Operations, by their addresses', () => {
    const set = opsNoteSet(place);
    expect(set.panel).toBe('operations');
    expect(set.heading).toBe('California');
    expect(set.notes[0]).toMatchObject({ id: `30084:${B}:operation-1`, kind: 'Operation', title: 'Count the Geminids', sources: [] });
    expect(set.notes[0].limits).toBe('Public, lawful places only.');
  });
});
