import {
  OBSERVATION_SCHEMA_VERSION,
  type Observation,
  type ObservationMethod,
  type Source,
  type SubjectKind,
} from '../../../types/intel/SourceObservation';
import type { IntelReliability } from '../../../types/intel/IntelItemUI';

/** Admiralty grades, best to worst. Ordering is what makes "no better than" checkable. */
const GRADE_ORDER: IntelReliability[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Clamp a self-reported grade so it can never exceed the source's baseline.
 *
 * A collector grading its own output upward is a self-report, and self-report
 * grants nothing. Downward is kept: a collector flagging its own output as
 * degraded has no incentive to invent that.
 */
export function clampObservedTrust(
  baseline: IntelReliability,
  observed: IntelReliability | undefined,
): IntelReliability | undefined {
  if (!observed) return undefined;
  const baseIdx = GRADE_ORDER.indexOf(baseline);
  const obsIdx = GRADE_ORDER.indexOf(observed);
  // An unrecognised grade (e.g. NetRunner's 'X', deliberate deception
  // suspected) is not on the A-F scale at all. Treat it as the worst grade
  // rather than dropping it — "deception suspected" is the single most
  // important thing a collector can say about its own output.
  if (obsIdx === -1) return 'F';
  return obsIdx > baseIdx ? observed : baseline;
}

/**
 * The one way an Observation is constructed.
 *
 * Adapters do not build the object literal themselves. Going through a
 * constructor is what makes the envelope's guarantees enforceable rather than
 * conventional: the deterministic id, the inherited mock flag, and the
 * validation below cannot be forgotten by the next adapter someone writes.
 */

export interface ObservationInput {
  /** The upstream record's own identifier, stable across polls. */
  nativeId: string;
  subjectEntityRef: string;
  claim: { attribute: string; value: unknown };
  /** ISO 8601 or anything Date can parse; normalised to UTC ISO. */
  timestamp: string | Date;
  method: ObservationMethod;
  geo?: { lat: number; lon: number };
  label: string;
  tags?: string[];
  /** What kind of thing the subject is. Omitted means 'unknown', which is treated as exclusive. */
  subjectKind?: SubjectKind;
  /** Width of the uncertainty on `timestamp`, in ms. Omitted means the source did not say. */
  timePrecisionMs?: number;
  /** Source-supplied per-record grade. Clamped to no better than the source baseline. */
  observedTrust?: IntelReliability;
  /**
   * Per-record mock flag, for sources that mix real and fabricated records in
   * one feed (NaturalEvent carries its own `isMock`).
   *
   * ESCALATION ONLY: this can mark a record as mock, never as real. The
   * effective value is `source.isMock || input.isMock`. An adapter must be
   * able to say "this particular record is fabricated" about an otherwise real
   * source; it must never be able to say "this record from my mock source is
   * genuine", which is precisely how fabricated data launders itself into a
   * corpus that reports its own integrity ratio.
   */
  isMock?: boolean;
}

export class ObservationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservationValidationError';
  }
}

/**
 * Deterministic observation id.
 *
 * Every open-data source here is polled, so the same upstream record arrives
 * again on every cycle. A random id would turn one real-world event into N
 * observations, and N observations of one event look exactly like N-way
 * independent corroboration to the correlation engine. That is the worst
 * failure mode available to this system, so the id is derived, not generated.
 */
export function observationId(sourceId: string, nativeId: string): string {
  return `${sourceId}:${nativeId}`;
}

function assertFiniteCoord(value: number, name: string, min: number, max: number): void {
  if (!Number.isFinite(value)) throw new ObservationValidationError(`${name} must be a finite number, got ${value}`);
  if (value < min || value > max) throw new ObservationValidationError(`${name} out of range: ${value}`);
}

/**
 * Build an Observation from one upstream record.
 *
 * Throws rather than returning a degraded record. An adapter handed something
 * it cannot faithfully represent should drop it and count the drop — silently
 * emitting a partial observation puts unreliable data into the corpus wearing
 * the same clothes as reliable data.
 */
export function createObservation(source: Source, input: ObservationInput): Observation {
  if (!input.nativeId) throw new ObservationValidationError('nativeId is required — without it the id is not stable across polls');
  if (!input.subjectEntityRef) throw new ObservationValidationError('subjectEntityRef is required');
  if (!input.claim?.attribute) throw new ObservationValidationError('claim.attribute is required');
  if (!input.label) throw new ObservationValidationError('label is required');

  const date = input.timestamp instanceof Date ? input.timestamp : new Date(input.timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new ObservationValidationError(`timestamp is not parseable: ${String(input.timestamp)}`);
  }

  if (input.geo) {
    assertFiniteCoord(input.geo.lat, 'geo.lat', -90, 90);
    assertFiniteCoord(input.geo.lon, 'geo.lon', -180, 180);
  }

  return {
    id: observationId(source.id, input.nativeId),
    sourceId: source.id,
    subjectEntityRef: input.subjectEntityRef,
    claim: input.claim,
    timestamp: date.toISOString(),
    method: input.method,
    geo: input.geo,
    label: input.label,
    tags: input.tags ?? [],
    subjectKind: input.subjectKind ?? 'unknown',
    timePrecisionMs: input.timePrecisionMs,
    // Escalation only: a source marked mock stays mock regardless of input,
    // and a record may additionally flag itself. An adapter can never clear
    // the flag — see ObservationInput.isMock.
    isMock: source.isMock || input.isMock === true,
    observedTrust: clampObservedTrust(source.trustBaseline, input.observedTrust),
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
  };
}

/**
 * Collapse observations to one per id, newest wins.
 *
 * Polling means the same record arrives repeatedly, sometimes revised. This is
 * the guard that stops repetition being mistaken for corroboration.
 */
export function dedupeObservations(observations: Observation[]): Observation[] {
  const byId = new Map<string, Observation>();
  for (const obs of observations) {
    const existing = byId.get(obs.id);
    if (!existing || obs.timestamp >= existing.timestamp) byId.set(obs.id, obs);
  }
  return [...byId.values()];
}
