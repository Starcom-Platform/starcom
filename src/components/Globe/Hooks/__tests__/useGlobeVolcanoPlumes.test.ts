import { describe, it, expect } from 'vitest';
import { buildPlumeSpecs, sortVolcanoesByAllocationPriority } from '../useGlobeVolcanoPlumes';
import type { NaturalEvent } from '../../../../hooks/useGeoEvents';

const makeVolcano = (id: string | number, lat: number, lng: number, timestamp?: string): NaturalEvent => ({
  id,
  lat,
  lng,
  type: 'volcano',
  severityBucket: 'major',
  source: 'NASA EONET',
  timestamp
});

describe('sortVolcanoesByAllocationPriority', () => {
  it('puts the most recently reported real activity first', () => {
    const oldest = makeVolcano('a', 0, 0, '2026-01-01T00:00:00Z');
    const newest = makeVolcano('b', 0, 0, '2026-08-01T00:00:00Z');
    const middle = makeVolcano('c', 0, 0, '2026-04-01T00:00:00Z');
    const result = sortVolcanoesByAllocationPriority([oldest, newest, middle]);
    expect(result.map((v) => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts a volcano with no real timestamp last, not first', () => {
    const dated = makeVolcano('a', 0, 0, '2026-01-01T00:00:00Z');
    const undated = makeVolcano('b', 0, 0, undefined);
    const result = sortVolcanoesByAllocationPriority([undated, dated]);
    expect(result.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const volcanoes = [makeVolcano('a', 0, 0, '2026-01-01T00:00:00Z'), makeVolcano('b', 0, 0, '2026-08-01T00:00:00Z')];
    const original = [...volcanoes];
    sortVolcanoesByAllocationPriority(volcanoes);
    expect(volcanoes).toEqual(original);
  });
});

describe('buildPlumeSpecs', () => {
  it('builds one real emitter spec per active volcano, keyed by its real id', () => {
    const specs = buildPlumeSpecs([makeVolcano('EONET_1', 10, 20), makeVolcano('EONET_2', -5, 100)]);
    expect(specs).toHaveLength(2);
    expect(specs.map((s) => s.id)).toEqual(['EONET_1', 'EONET_2']);
  });

  it('returns an empty list when there are no real active volcanoes', () => {
    expect(buildPlumeSpecs([])).toEqual([]);
  });

  it('drifts outward along the real surface normal at the volcano position, not a fixed world direction', () => {
    // At (lat=0, lng=0), the surface normal points along the scene's +Z — where
    // react-globe.gl draws the prime meridian (see globeCoordinates.ts).
    const [spec] = buildPlumeSpecs([makeVolcano(1, 0, 0)]);
    expect(spec.drift.z).toBeGreaterThan(0);
    expect(Math.abs(spec.drift.x)).toBeLessThan(1e-6);
    expect(Math.abs(spec.drift.y)).toBeLessThan(1e-6);
  });

  it('gives every emitter the same real per-emitter particle count and lifespan config', () => {
    const specs = buildPlumeSpecs([makeVolcano(1, 0, 0), makeVolcano(2, 40, -70)]);
    expect(specs[0].count).toBe(specs[1].count);
    expect(specs[0].lifespanMs).toBe(specs[1].lifespanMs);
    expect(specs[0].color).toBe(specs[1].color);
  });
});
