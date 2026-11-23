import { describe, it, expect } from 'vitest';
import { initialStatus, recordSuccess, recordFailure, summariseCoverage } from '../sourceIngestStatus';
import { UCDP_SOURCE } from '../adapters/ucdpAdapter';
import { USGS_SOURCE } from '../adapters/naturalEventAdapter';

const NOW = new Date('2026-08-20T00:00:00Z');
const LATER = new Date('2026-08-20T06:00:00Z');

describe('source ingest status — an outage is not an empty result', () => {
  it('starts as not-attempted rather than as healthy', () => {
    expect(initialStatus(UCDP_SOURCE).outcome).toBe('not-attempted');
  });

  it('distinguishes "reached it, it had nothing" from "could not reach it"', () => {
    const base = initialStatus(UCDP_SOURCE);

    expect(recordSuccess(base, { observations: 0, dropped: 0 }, NOW).outcome).toBe('empty');
    expect(recordFailure(base, 'ETIMEDOUT', NOW).outcome).toBe('unreachable');
  });

  it('reports ok only when records actually arrived', () => {
    const base = initialStatus(UCDP_SOURCE);
    expect(recordSuccess(base, { observations: 12, dropped: 3 }, NOW).outcome).toBe('ok');
  });

  it('preserves last-success through a failure, so staleness is judgeable', () => {
    const healthy = recordSuccess(initialStatus(UCDP_SOURCE), { observations: 5, dropped: 0 }, NOW);
    const broken = recordFailure(healthy, 'ECONNREFUSED', LATER);

    expect(broken.lastSuccessAt).toBe(NOW.toISOString());
    expect(broken.lastAttemptAt).toBe(LATER.toISOString());
    expect(broken.error).toBe('ECONNREFUSED');
  });

  it('zeroes the ingested count on failure rather than leaving a stale number', () => {
    const healthy = recordSuccess(initialStatus(UCDP_SOURCE), { observations: 5, dropped: 0 }, NOW);
    expect(recordFailure(healthy, 'boom', LATER).observationsIngested).toBe(0);
  });
});

describe('coverage summary', () => {
  it('names blind spots and marks the picture degraded when a source is unreachable', () => {
    const coverage = summariseCoverage([
      recordSuccess(initialStatus(UCDP_SOURCE), { observations: 4, dropped: 0 }, NOW),
      recordFailure(initialStatus(USGS_SOURCE), 'ETIMEDOUT', NOW),
    ]);

    expect(coverage.degraded).toBe(true);
    expect(coverage.blindSpots).toEqual([USGS_SOURCE.label]);
    expect(coverage.ok).toBe(1);
    expect(coverage.unreachable).toBe(1);
  });

  it('is not degraded when every source was reached, even if some had nothing', () => {
    // "Everyone reported, two had nothing to report" is a complete picture.
    const coverage = summariseCoverage([
      recordSuccess(initialStatus(UCDP_SOURCE), { observations: 4, dropped: 0 }, NOW),
      recordSuccess(initialStatus(USGS_SOURCE), { observations: 0, dropped: 0 }, NOW),
    ]);

    expect(coverage.degraded).toBe(false);
    expect(coverage.empty).toBe(1);
    expect(coverage.blindSpots).toEqual([]);
  });
});
