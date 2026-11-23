import { describe, it, expect } from 'vitest';
import {
  analyzeCountryConnectivity,
  buildLandingPointCountryMap,
  identifyChokepointCables
} from './commHubsConnectivity';
import type { SubmarineCable } from '../types/CommHubs';

function makeCable(overrides: Partial<SubmarineCable> = {}): SubmarineCable {
  return {
    id: `cable-${Math.random()}`,
    name: 'Test Cable',
    color: '#e63946',
    paths: [[[0, 0], [1, 1]]],
    isPlanned: false,
    landingPoints: [],
    ...overrides
  };
}

describe('analyzeCountryConnectivity', () => {
  it('flags a real country landed by only one real cable as single-cable-dependent', () => {
    const cables = [
      makeCable({ id: 'a', landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Solomon Islands' }] })
    ];

    const result = analyzeCountryConnectivity(cables);
    expect(result).toEqual([
      { country: 'Solomon Islands', cableIds: ['a'], landingPointIds: ['lp-1'], isSingleCableDependency: true }
    ]);
  });

  it('does not flag a country landed by two distinct real cables', () => {
    const cables = [
      makeCable({ id: 'a', landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Japan' }] }),
      makeCable({ id: 'b', landingPoints: [{ id: 'lp-2', name: 'Point 2', country: 'Japan' }] })
    ];

    const result = analyzeCountryConnectivity(cables);
    expect(result).toEqual([
      { country: 'Japan', cableIds: ['a', 'b'], landingPointIds: ['lp-1', 'lp-2'], isSingleCableDependency: false }
    ]);
  });

  it('counts a country landed twice by the SAME real cable as still single-cable-dependent', () => {
    // Real case: a cable can have multiple real landing points in the same country
    // (e.g. two separate stations). That's still only one distinct cable serving it.
    const cables = [
      makeCable({
        id: 'a',
        landingPoints: [
          { id: 'lp-1', name: 'Point 1', country: 'Iceland' },
          { id: 'lp-2', name: 'Point 2', country: 'Iceland' }
        ]
      })
    ];

    const result = analyzeCountryConnectivity(cables);
    expect(result[0].isSingleCableDependency).toBe(true);
    expect(result[0].cableIds).toEqual(['a']);
    expect(result[0].landingPointIds).toEqual(['lp-1', 'lp-2']);
  });

  it('skips a real landing point with no country field rather than fabricating one', () => {
    const cables = [makeCable({ landingPoints: [{ id: 'lp-1', name: 'Point 1', country: '' }] })];
    expect(analyzeCountryConnectivity(cables)).toEqual([]);
  });

  it('skips a real landing point whose country field is whitespace-only', () => {
    const cables = [makeCable({ landingPoints: [{ id: 'lp-1', name: 'Point 1', country: '   ' }] })];
    expect(analyzeCountryConnectivity(cables)).toEqual([]);
  });

  it('treats a real country name with stray whitespace as the same country as its trimmed form, not a second one', () => {
    const cables = [
      makeCable({ id: 'a', landingPoints: [{ id: 'lp-1', name: 'P', country: 'Japan' }] }),
      makeCable({ id: 'b', landingPoints: [{ id: 'lp-2', name: 'P', country: ' Japan ' }] })
    ];
    const result = analyzeCountryConnectivity(cables);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ country: 'Japan', cableIds: ['a', 'b'], landingPointIds: ['lp-1', 'lp-2'], isSingleCableDependency: false });
  });

  it('sorts real countries alphabetically for stable, predictable output', () => {
    const cables = [
      makeCable({ id: 'a', landingPoints: [{ id: 'lp-1', name: 'P', country: 'Zambia' }] }),
      makeCable({ id: 'b', landingPoints: [{ id: 'lp-2', name: 'P', country: 'Angola' }] })
    ];
    expect(analyzeCountryConnectivity(cables).map((c) => c.country)).toEqual(['Angola', 'Zambia']);
  });
});

describe('buildLandingPointCountryMap', () => {
  it('maps a real landing point id to its real country', () => {
    const cables = [makeCable({ landingPoints: [{ id: 'lp-1', name: 'Point 1', country: 'Ghana' }] })];
    expect(buildLandingPointCountryMap(cables).get('lp-1')).toBe('Ghana');
  });

  it('does not include an entry for a landing point with no country', () => {
    const cables = [makeCable({ landingPoints: [{ id: 'lp-1', name: 'Point 1', country: '' }] })];
    expect(buildLandingPointCountryMap(cables).has('lp-1')).toBe(false);
  });

  it('trims stray whitespace from a real country name', () => {
    const cables = [makeCable({ landingPoints: [{ id: 'lp-1', name: 'Point 1', country: ' Ghana ' }] })];
    expect(buildLandingPointCountryMap(cables).get('lp-1')).toBe('Ghana');
  });
});

describe('identifyChokepointCables', () => {
  it('flags a real cable whose real path passes through the Strait of Malacca box', () => {
    const cables = [makeCable({ id: 'a', name: 'A', paths: [[[100, 3], [101, 4]]] })];
    const result = identifyChokepointCables(cables);
    expect(result).toEqual([{ cableId: 'a', cableName: 'A', chokepoints: ['Strait of Malacca'] }]);
  });

  it('does not flag a real cable whose real path stays outside every chokepoint box', () => {
    const cables = [makeCable({ paths: [[[0, 0], [1, 1]]] })];
    expect(identifyChokepointCables(cables)).toEqual([]);
  });

  it('flags multiple distinct chokepoints for one real cable, deduped and sorted', () => {
    const cables = [
      makeCable({
        id: 'a',
        name: 'A',
        paths: [[[38, 15], [100, 3], [120, 20]]] // Red Sea, then Malacca, then Luzon
      })
    ];
    const result = identifyChokepointCables(cables);
    expect(result[0].chokepoints).toEqual(['Luzon Strait', 'Red Sea / Bab-el-Mandeb', 'Strait of Malacca']);
  });

  it('only counts a matched chokepoint once even if multiple real path points fall inside it', () => {
    const cables = [makeCable({ id: 'a', name: 'A', paths: [[[100, 3], [101, 4], [102, 5]]] })];
    expect(identifyChokepointCables(cables)[0].chokepoints).toEqual(['Strait of Malacca']);
  });

  it('does not false-match a real point near the antimeridian (±180°) — no chokepoint box crosses it', () => {
    const cables = [makeCable({ paths: [[[179, 3], [-179, 3]]] })];
    expect(identifyChokepointCables(cables)).toEqual([]);
  });

  it('matches a real point exactly on a chokepoint box boundary (inclusive bounds)', () => {
    const cables = [makeCable({ id: 'a', name: 'A', paths: [[[95, -2], [96, -1]]] })]; // Malacca's exact minLng/minLat corner
    expect(identifyChokepointCables(cables)[0].chokepoints).toEqual(['Strait of Malacca']);
  });
});
