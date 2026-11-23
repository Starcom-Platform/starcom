import { describe, it, expect } from 'vitest';
import { UcdpAdapter, ucdpAdapter, UCDP_SOURCE, type UcdpGedRecord } from '../adapters/ucdpAdapter';
import { runAdapterContract } from '../adapters/adapterContract';

/** Shaped after real UCDP GED records. */
const records: UcdpGedRecord[] = [
  {
    id: 100001,
    date_start: '2026-03-14',
    latitude: 12.34,
    longitude: 43.21,
    country: 'Somalia',
    region: 'Africa',
    side_a: 'Government of Somalia',
    side_b: 'Al-Shabaab',
    best: 14,
    deaths_civilians: 3,
    type_of_violence: 1,
  },
  {
    id: '100002',
    date_start: '2026-04-02',
    latitude: '5.5',
    longitude: '-0.2',
    country: 'Ghana',
    region: 'Africa',
    side_a: 'Civilians',
    best: 2,
    type_of_violence: 3,
  },
];

describe('UcdpAdapter', () => {
  runAdapterContract(ucdpAdapter, records);

  it('maps a conflict event into a located, attributed observation', () => {
    const { observations } = ucdpAdapter.toObservations(records);
    const first = observations[0];

    expect(first.id).toBe('ucdp-ged:100001');
    expect(first.subjectEntityRef).toBe('Government of Somalia');
    expect(first.claim.attribute).toBe('armed_conflict_event');
    expect(first.geo).toEqual({ lat: 12.34, lon: 43.21 });
    expect(first.method).toBe('reported');
    expect(first.tags).toContain('conflict');
  });

  it('coerces numeric strings, since UCDP returns coordinates both ways', () => {
    const { observations } = ucdpAdapter.toObservations(records);
    expect(observations[1].geo).toEqual({ lat: 5.5, lon: -0.2 });
  });

  it('drops a record with no coordinates rather than placing it at 0,0', () => {
    const { observations, dropped } = ucdpAdapter.toObservations([
      { id: 1, date_start: '2026-01-01', side_a: 'X' },
    ]);

    expect(observations).toHaveLength(0);
    expect(dropped[0].reason).toContain('coordinates');
  });

  it('falls back through side_a -> country -> region rather than inventing an actor', () => {
    const { observations } = ucdpAdapter.toObservations([
      { id: 7, date_start: '2026-01-01', latitude: 1, longitude: 1, country: 'Chad' },
    ]);
    expect(observations[0].subjectEntityRef).toBe('Chad');
  });

  it('falls back to the year when no day-level date is present', () => {
    const { observations } = ucdpAdapter.toObservations([
      { id: 8, year: 2025, latitude: 1, longitude: 1, side_a: 'Y' },
    ]);
    expect(observations[0].timestamp.startsWith('2025-01-01')).toBe(true);
  });

  it('rejects out-of-range coordinates instead of clamping them', () => {
    const { observations, dropped } = ucdpAdapter.toObservations([
      { id: 9, date_start: '2026-01-01', latitude: 999, longitude: 1, side_a: 'Z' },
    ]);

    expect(observations).toHaveLength(0);
    expect(dropped[0].reason).toContain('out of range');
  });

  it('propagates a mock source onto every observation it produces', () => {
    const mockAdapter = new UcdpAdapter({ ...UCDP_SOURCE, id: 'ucdp-fixture', isMock: true });
    const { observations } = mockAdapter.toObservations(records);

    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every(o => o.isMock)).toBe(true);
  });
});
