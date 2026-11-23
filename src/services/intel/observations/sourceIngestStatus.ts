import type { Source } from '../../../types/intel/SourceObservation';

/**
 * Per-source ingest status.
 *
 * The distinction this exists to preserve: **an outage is not an empty
 * result.** A source that returned zero records and a source that could not be
 * reached both leave the corpus with nothing from that source, and both render
 * as an absence. But "UCDP reports no conflict events in this window" and "we
 * could not reach UCDP" are opposite facts, and an analyst reading a quiet map
 * needs to know which one they are looking at.
 *
 * This is the same principle the OPSEC fix applied to security status, and the
 * same one navcom-app/docs/attestation.md states as "absence is information":
 * no attestation is a fact about the world — nobody has established this — and
 * it is different from a negative claim.
 */

export type IngestOutcome =
  /** Reached the source; it returned records. */
  | 'ok'
  /** Reached the source; it genuinely had nothing for this window. */
  | 'empty'
  /** Could not reach the source, or it errored. We know nothing about this window. */
  | 'unreachable'
  /** Never attempted in this session. */
  | 'not-attempted';

export interface SourceIngestStatus {
  sourceId: string;
  label: string;
  outcome: IngestOutcome;
  /** ISO 8601. Null when never attempted. */
  lastAttemptAt: string | null;
  /** ISO 8601 of the last attempt that actually reached the source. */
  lastSuccessAt: string | null;
  observationsIngested: number;
  /** Records the adapter refused to map, with reasons — see AdapterResult.dropped. */
  droppedCount: number;
  error: string | null;
}

export function initialStatus(source: Source): SourceIngestStatus {
  return {
    sourceId: source.id,
    label: source.label,
    outcome: 'not-attempted',
    lastAttemptAt: null,
    lastSuccessAt: null,
    observationsIngested: 0,
    droppedCount: 0,
    error: null,
  };
}

export function recordSuccess(
  previous: SourceIngestStatus,
  counts: { observations: number; dropped: number },
  now: Date = new Date(),
): SourceIngestStatus {
  const at = now.toISOString();
  return {
    ...previous,
    // Zero records from a source we actually reached is 'empty', never 'ok'
    // and never 'unreachable'. It is a real, positive statement that the
    // source had nothing.
    outcome: counts.observations > 0 ? 'ok' : 'empty',
    lastAttemptAt: at,
    lastSuccessAt: at,
    observationsIngested: counts.observations,
    droppedCount: counts.dropped,
    error: null,
  };
}

export function recordFailure(
  previous: SourceIngestStatus,
  error: string,
  now: Date = new Date(),
): SourceIngestStatus {
  return {
    ...previous,
    outcome: 'unreachable',
    lastAttemptAt: now.toISOString(),
    // lastSuccessAt is deliberately preserved: "last heard from at 09:00" is
    // the fact an analyst needs to judge how stale the picture is.
    observationsIngested: 0,
    droppedCount: 0,
    error,
  };
}

export interface CoverageSummary {
  total: number;
  ok: number;
  empty: number;
  unreachable: number;
  notAttempted: number;
  /** Sources contributing nothing because we could not reach them. */
  blindSpots: string[];
  /**
   * True when at least one source is unreachable — meaning the corpus is
   * missing data it would otherwise have, and any "no corroboration found" or
   * "no contradiction found" conclusion drawn from it is provisional.
   */
  degraded: boolean;
}

export function summariseCoverage(statuses: SourceIngestStatus[]): CoverageSummary {
  const by = (o: IngestOutcome) => statuses.filter(s => s.outcome === o);
  const unreachable = by('unreachable');

  return {
    total: statuses.length,
    ok: by('ok').length,
    empty: by('empty').length,
    unreachable: unreachable.length,
    notAttempted: by('not-attempted').length,
    blindSpots: unreachable.map(s => s.label),
    degraded: unreachable.length > 0,
  };
}
