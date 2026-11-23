import { expect, it } from 'vitest';
import { OBSERVATION_SCHEMA_VERSION } from '../../../../types/intel/SourceObservation';
import type { SourceAdapter } from './types';

/**
 * The shared contract suite every source adapter must pass.
 *
 * ADR-0003's stated risk was that "the shape of the first two sources quietly
 * becomes the permanent shape of the API." A contract suite is the guard
 * against that: a new adapter proves it satisfies the envelope's invariants
 * before it is wired in, rather than each source growing its own conventions
 * and the envelope becoming whatever the union of them happens to be.
 *
 * Call it from an adapter's own test file with a small set of realistic raw
 * records:
 *
 *   describe('UcdpAdapter', () => {
 *     runAdapterContract(ucdpAdapter, validRecords);
 *   });
 */
export function runAdapterContract<TRaw>(adapter: SourceAdapter<TRaw>, validRaw: TRaw[]): void {
  it('[contract] declares a source with a stable id, label, and trust baseline', () => {
    expect(adapter.source.id).toBeTruthy();
    expect(adapter.source.label).toBeTruthy();
    expect(['A', 'B', 'C', 'D', 'E', 'F']).toContain(adapter.source.trustBaseline);
  });

  it('[contract] produces at least one observation from realistic input', () => {
    const { observations } = adapter.toObservations(validRaw);
    expect(observations.length).toBeGreaterThan(0);
  });

  it('[contract] stamps every observation with its source id and the current schema version', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      expect(obs.sourceId).toBe(adapter.source.id);
      expect(obs.schemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
    }
  });

  it('[contract] derives ids deterministically — re-ingest replaces, never duplicates', () => {
    const first = adapter.toObservations(validRaw).observations.map(o => o.id);
    const second = adapter.toObservations(validRaw).observations.map(o => o.id);

    expect(second).toEqual(first);
    // Repetition must not be able to masquerade as corroboration.
    expect(new Set(first).size).toBe(first.length);
  });

  it('[contract] inherits isMock from the source rather than setting it independently', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      expect(obs.isMock).toBe(adapter.source.isMock);
    }
  });

  it('[contract] never declares its own confidence — weight is derived downstream', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      expect(obs).not.toHaveProperty('confidence');
      expect(obs).not.toHaveProperty('weight');
    }
  });

  it('[contract] normalises timestamps to UTC ISO 8601', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      expect(obs.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    }
  });

  it('[contract] emits coordinates only within valid ranges', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      if (!obs.geo) continue;
      expect(obs.geo.lat).toBeGreaterThanOrEqual(-90);
      expect(obs.geo.lat).toBeLessThanOrEqual(90);
      expect(obs.geo.lon).toBeGreaterThanOrEqual(-180);
      expect(obs.geo.lon).toBeLessThanOrEqual(180);
    }
  });

  it('[contract] survives empty input without throwing', () => {
    const result = adapter.toObservations([]);
    expect(result.observations).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it('[contract] drops malformed records with a reason instead of coercing them', () => {
    const garbage = [{}, { nonsense: true }, null, undefined] as unknown as TRaw[];
    const result = adapter.toObservations(garbage);

    expect(result.observations).toHaveLength(0);
    expect(result.dropped.length).toBeGreaterThan(0);
    for (const d of result.dropped) {
      // A drop with no stated reason is a silent drop wearing a counter.
      expect(d.reason).toBeTruthy();
      expect(d.reason.length).toBeGreaterThan(5);
    }
  });

  it('[contract] gives every observation a non-empty subject and label', () => {
    const { observations } = adapter.toObservations(validRaw);
    for (const obs of observations) {
      expect(obs.subjectEntityRef).toBeTruthy();
      expect(obs.label).toBeTruthy();
    }
  });
}
