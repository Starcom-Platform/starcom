import { describe, it, expect } from 'vitest';
import { createObservation, dedupeObservations, observationId, ObservationValidationError } from '../createObservation';
import { OBSERVATION_SCHEMA_VERSION, type Source } from '../../../../types/intel/SourceObservation';

const source: Source = {
  id: 'test-source',
  kind: 'open-data',
  label: 'Test Source',
  trustBaseline: 'B',
  ingestMethod: 'poll',
  isMock: false,
};

const base = {
  nativeId: 'n1',
  subjectEntityRef: 'Acme Corp',
  claim: { attribute: 'location', value: { lat: 1, lon: 2 } },
  timestamp: '2026-08-20T00:00:00Z',
  method: 'reported' as const,
  label: 'Acme seen in Lagos',
};

describe('createObservation', () => {
  it('derives a stable id from source and native id', () => {
    expect(createObservation(source, base).id).toBe('test-source:n1');
    expect(observationId('a', 'b')).toBe('a:b');
  });

  it('produces the identical id on re-ingest of the same upstream record', () => {
    expect(createObservation(source, base).id).toBe(createObservation(source, base).id);
  });

  it('inherits isMock from the source and ignores anything the caller might pass', () => {
    const mocked = createObservation({ ...source, isMock: true }, base);
    expect(mocked.isMock).toBe(true);
    expect(createObservation(source, base).isMock).toBe(false);
  });

  it('stamps the current schema version', () => {
    expect(createObservation(source, base).schemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
  });

  it('normalises the timestamp to UTC ISO', () => {
    expect(createObservation(source, { ...base, timestamp: new Date('2026-08-20T05:30:00+05:30') }).timestamp)
      .toBe('2026-08-20T00:00:00.000Z');
  });

  it('throws rather than emitting a degraded record', () => {
    expect(() => createObservation(source, { ...base, nativeId: '' })).toThrow(ObservationValidationError);
    expect(() => createObservation(source, { ...base, subjectEntityRef: '' })).toThrow(ObservationValidationError);
    expect(() => createObservation(source, { ...base, label: '' })).toThrow(ObservationValidationError);
    expect(() => createObservation(source, { ...base, timestamp: 'not a date' })).toThrow(ObservationValidationError);
  });

  it('rejects impossible coordinates instead of clamping', () => {
    expect(() => createObservation(source, { ...base, geo: { lat: 91, lon: 0 } })).toThrow(/out of range/);
    expect(() => createObservation(source, { ...base, geo: { lat: 0, lon: 181 } })).toThrow(/out of range/);
    expect(() => createObservation(source, { ...base, geo: { lat: NaN, lon: 0 } })).toThrow(/finite/);
  });
});

describe('dedupeObservations', () => {
  it('collapses repeat polls of one record to a single observation, newest winning', () => {
    const older = createObservation(source, { ...base, timestamp: '2026-08-01T00:00:00Z' });
    const newer = createObservation(source, { ...base, timestamp: '2026-08-19T00:00:00Z' });

    const result = dedupeObservations([older, newer, older]);

    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2026-08-19T00:00:00.000Z');
  });

  it('keeps genuinely distinct observations apart', () => {
    const a = createObservation(source, base);
    const b = createObservation(source, { ...base, nativeId: 'n2' });
    expect(dedupeObservations([a, b])).toHaveLength(2);
  });
});
