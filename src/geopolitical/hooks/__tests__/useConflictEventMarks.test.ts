/**
 * Conflict Zones' events as marks (critique-2026-11-01, O12; plan B1): each event's kind from its CAMEO code, its
 * severity from its Goldstein score, its place where the report put it, its note on a click.
 */
import { describe, it, expect } from 'vitest';
import { conflictEventItems, conflictKindOf, severityOfGoldstein } from '../useConflictEventMarks';
import type { RealGdeltEvent } from '../../../services/geopolitical/GDELTEventService';

describe('Conflict Zones events', () => {
  it("names each event's kind from its CAMEO code, the three digits where they say more, else the root", () => {
    expect(conflictKindOf('195', '19')).toBe('conflict:kinetic:airstrike');
    expect(conflictKindOf('1951', '19')).toBe('conflict:kinetic:airstrike');
    expect(conflictKindOf('194', '19')).toBe('conflict:kinetic:shelling');
    expect(conflictKindOf('190', '19')).toBe('conflict:kinetic:ground-fighting');
    expect(conflictKindOf('181', '18')).toBe('conflict:effects:captives');
    expect(conflictKindOf('145', '14')).toBe('society:civic:protest');
    expect(conflictKindOf('203', '20')).toBe('conflict:effects:mass-violence');
    expect(conflictKindOf('', '')).toBe('conflict:report');
  });

  it('is brighter the more conflictual its Goldstein score', () => {
    expect(severityOfGoldstein(-10)).toBe(1);
    expect(severityOfGoldstein(-5)).toBe(0.5);
    expect(severityOfGoldstein(4)).toBe(0);
  });

  it('places each event where the report put it, opening its note', () => {
    const event = {
      id: 'g1', actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '195', eventRootCode: '19', goldsteinScale: -10,
      lat: 50.45, lng: 30.52, sourceUrl: 'https://example.org/a', dateAdded: '20261101093000', sources: 7, placeName: 'Kyiv',
    } as unknown as RealGdeltEvent;
    const [it0] = conflictEventItems([event, { ...event, id: 'g2', lat: Number.NaN }]);
    expect(it0).toMatchObject({ id: 'g1', lat: 50.45, lng: 30.52, kind: 'conflict:kinetic:airstrike', magnitude: 7, severity: 1 });
    expect(it0.tooltip).toContain('Goldstein -10.0');
    expect(it0.tooltip).toContain('Kyiv');
    expect(it0.opens?.notes).toHaveLength(1);
    expect(it0.timeMs).toBe(Date.UTC(2026, 10, 1, 9, 30));
  });
});
