import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CorroboratedFinding, LocationConflict } from '../../../../applications/intelanalyzer/state/correlationUtils';

const envMock = { globeIntelLayer: false };
vi.mock('../../../../config/env', () => ({ env: envMock }));

const correlationMock: {
  corroboratedFindings: CorroboratedFinding[];
  locationConflicts: LocationConflict[];
  correlationStale: boolean;
  positionOf: (sourceId: string) => { lat: number; lon: number } | undefined;
} = {
  corroboratedFindings: [],
  locationConflicts: [],
  correlationStale: false,
  positionOf: () => undefined,
};
vi.mock('../../../../applications/intelanalyzer/state/CorrelationContext', () => ({
  useCorrelation: () => correlationMock,
}));

const { useGlobeIntelLayer } = await import('../useGlobeIntelLayer');

const findings: CorroboratedFinding[] = [
  { entityRef: 'Acme Corp', attribute: 'location', value: { lat: 10, lon: 20 }, confidence: 0.8, sourceCount: 2, algorithmVersion: 1 },
];

describe('useGlobeIntelLayer', () => {
  beforeEach(() => {
    envMock.globeIntelLayer = false;
    correlationMock.corroboratedFindings = [];
    correlationMock.locationConflicts = [];
    correlationMock.correlationStale = false;
    correlationMock.positionOf = () => undefined;
  });

  it('returns null when the feature is off — not an empty layer', () => {
    correlationMock.corroboratedFindings = findings;
    const { result } = renderHook(() => useGlobeIntelLayer());

    // "Analysis was never shown here" and "analysis ran and found nothing"
    // must not be the same value. Conflating them is the exact failure this
    // layer exists to fix.
    expect(result.current).toBeNull();
  });

  it('returns an empty layer, not null, when analysis genuinely found nothing', () => {
    envMock.globeIntelLayer = true;
    const { result } = renderHook(() => useGlobeIntelLayer());

    expect(result.current).not.toBeNull();
    expect(result.current!.marks).toEqual([]);
  });

  it('projects findings into marks when enabled', () => {
    envMock.globeIntelLayer = true;
    correlationMock.corroboratedFindings = findings;
    const { result } = renderHook(() => useGlobeIntelLayer());

    expect(result.current!.marks).toHaveLength(1);
    expect(result.current!.marks[0].label).toBe('Acme Corp');
  });

  it('marks the layer degraded while a recompute is outstanding', () => {
    envMock.globeIntelLayer = true;
    correlationMock.corroboratedFindings = findings;
    correlationMock.correlationStale = true;
    const { result } = renderHook(() => useGlobeIntelLayer());

    // Stale marks must not present as current.
    expect(result.current!.degraded).toBe(true);
  });
});

describe('useGlobeIntelLayer — contradictions ship with corroborations', () => {
  beforeEach(() => {
    envMock.globeIntelLayer = true;
    correlationMock.corroboratedFindings = [];
    correlationMock.locationConflicts = [];
    correlationMock.correlationStale = false;
    correlationMock.positionOf = () => undefined;
  });

  it('renders contradiction marks and their link, not only agreement', () => {
    // The regression this covers: the hook called buildFindingsLayer, so every
    // contradiction — the arcs, the pairing, the antimeridian handling — was
    // built, tested, and never once displayed.
    correlationMock.locationConflicts = [
      { entity: 'Gamma Inc', sourceIdA: 'a', sourceIdB: 'b', distanceKm: 3400, hoursApart: 2, strength: 0.7 },
    ];
    correlationMock.positionOf = (id) => (id === 'a' ? { lat: 10, lon: 10 } : { lat: 40, lon: 40 });

    const { result } = renderHook(() => useGlobeIntelLayer());

    expect(result.current!.marks.filter(m => m.kind === 'contradiction')).toHaveLength(2);
    expect(result.current!.links).toHaveLength(1);
  });

  it('does not report "nothing found" when only contradictions exist', () => {
    correlationMock.locationConflicts = [
      { entity: 'Gamma Inc', sourceIdA: 'a', sourceIdB: 'b', distanceKm: 3400, hoursApart: 2, strength: 0.7 },
    ];
    correlationMock.positionOf = (id) => (id === 'a' ? { lat: 10, lon: 10 } : { lat: 40, lon: 40 });

    expect(renderHook(() => useGlobeIntelLayer()).result.current!.emptyReason).toBeNull();
  });
});
