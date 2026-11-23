import { describe, it, expect, vi } from 'vitest';
import { ObservationIngestService } from '../ObservationIngestService';
import { ucdpAdapter } from '../adapters/ucdpAdapter';
import { usgsAdapter } from '../adapters/naturalEventAdapter';
import type { NaturalEvent } from '../../../GeoEventsService';

const NOW = () => new Date('2026-08-20T12:00:00Z');
const ucdpRows = [{ id: 1, date_start: '2026-08-18', latitude: 12, longitude: 43, side_a: 'X' }];
const usgsRows: NaturalEvent[] = [
  { id: 'us1', lat: 38, lng: -122, type: 'earthquake', timestamp: '2026-08-18T00:00:00Z', source: 'USGS', description: 'M5' },
];

describe('ObservationIngestService', () => {
  it('collects observations from every registered source', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => ucdpRows });
    svc.register({ adapter: usgsAdapter, fetch: async () => usgsRows });

    const { observations, coverage } = await svc.ingestAll(NOW);

    expect(observations).toHaveLength(2);
    expect(coverage.ok).toBe(2);
    expect(coverage.degraded).toBe(false);
  });

  it('one source failing degrades the picture rather than emptying it', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => { throw new Error('ETIMEDOUT'); } });
    svc.register({ adapter: usgsAdapter, fetch: async () => usgsRows });

    const { observations, coverage } = await svc.ingestAll(NOW);

    // Six sources exist precisely so that losing one is survivable.
    expect(observations).toHaveLength(1);
    expect(coverage.degraded).toBe(true);
    expect(coverage.blindSpots).toEqual([ucdpAdapter.source.label]);
  });

  it('records a failure as unreachable, never as empty', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => { throw new Error('boom'); } });

    await svc.ingestAll(NOW);
    const status = svc.getStatuses().find(s => s.sourceId === 'ucdp-ged')!;

    // "We could not reach UCDP" and "UCDP reports no conflicts" are opposite facts.
    expect(status.outcome).toBe('unreachable');
    expect(status.error).toBe('boom');
  });

  it('records a genuinely empty source as empty, not unreachable', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: usgsAdapter, fetch: async () => [] });

    await svc.ingestAll(NOW);
    expect(svc.getStatuses()[0].outcome).toBe('empty');
  });

  it('does not let repeated polls masquerade as corroboration', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => ucdpRows });

    await svc.ingestAll(NOW);
    await svc.ingestAll(NOW);
    await svc.ingestAll(NOW);

    // The same upstream record arriving three times is one observation.
    expect(svc.getObservations()).toHaveLength(1);
  });

  it('counts dropped records without discarding the signal', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => [...ucdpRows, { id: 2, side_a: 'no coords' }] });

    await svc.ingestAll(NOW);
    expect(svc.getStatuses()[0].droppedCount).toBe(1);
  });

  it('surfaces a source that was never attempted as not-attempted', async () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => ucdpRows });
    expect(svc.getStatuses()[0].outcome).toBe('not-attempted');
  });

  it('lists the sources it reads, so their names can be shown (plan item 3.6)', () => {
    const svc = new ObservationIngestService();
    svc.register({ adapter: ucdpAdapter, fetch: async () => ucdpRows });
    svc.register({ adapter: usgsAdapter, fetch: async () => usgsRows });
    expect(svc.registeredSources()).toEqual([ucdpAdapter.source, usgsAdapter.source]);
  });
});
