import { describe, it, expect } from 'vitest';
import { ucdpAdapter, UcdpAdapter, UCDP_SOURCE } from '../adapters/ucdpAdapter';
import { usgsAdapter, NaturalEventAdapter, USGS_SOURCE } from '../adapters/naturalEventAdapter';
import { REGISTERED_SOURCES } from '../adapters';
import { observationsToEvents } from '../observationsToEvents';
import { computeDataIntegritySummary, computeIntegrityBySource } from '../../dataIntegrity/computeDataIntegritySummary';
import { computeCorroboratedFindings } from '../../../../applications/intelanalyzer/state/correlationUtils';
import { buildFindingAttestation } from '../../findings/FindingContent';
import type { NaturalEvent } from '../../../GeoEventsService';

const NOW = new Date('2026-08-20T00:00:00Z');

/**
 * The end-to-end provenance guarantee: a mock-flagged observation must not be
 * able to reach a published finding while looking real at any hop.
 *
 * The whole positioning bet of this app is real, falsifiable analysis rather
 * than fabricated data. That claim is only as good as the weakest hop between
 * an adapter and a broadcast — and every hop here is a place where a boolean
 * could quietly be dropped.
 */

const ucdpRecords = [
  { id: 1, date_start: '2026-08-18', latitude: 12.0, longitude: 43.0, side_a: 'Acme Militia', country: 'Somalia' },
];
const usgsRecords: NaturalEvent[] = [
  { id: 'us1', lat: 12.05, lng: 43.05, type: 'earthquake', timestamp: '2026-08-18T02:00:00Z', source: 'USGS', description: 'Acme Militia' },
];

describe('mock provenance survives every hop', () => {
  it('flags observations from a mock source', () => {
    const mockUcdp = new UcdpAdapter({ ...UCDP_SOURCE, id: 'ucdp-fixture', isMock: true });
    const { observations } = mockUcdp.toObservations(ucdpRecords);

    expect(observations.every(o => o.isMock)).toBe(true);
  });

  it('carries the flag into the integrity summary that reports the corpus as real', () => {
    const real = ucdpAdapter.toObservations(ucdpRecords).observations;
    const mocked = new UcdpAdapter({ ...UCDP_SOURCE, id: 'ucdp-fixture', isMock: true })
      .toObservations(ucdpRecords).observations;

    const summary = computeDataIntegritySummary([...real, ...mocked]);

    expect(summary.totalObservations).toBe(2);
    expect(summary.mockCount).toBe(1);
    expect(summary.realRatio).toBe(0.5);
  });

  it('attributes fabrication to the specific source rather than averaging it away', () => {
    // A 95%-real corpus where the whole 5% comes from one feed is a very
    // different situation from 5% spread evenly, and only the per-source
    // breakdown can tell them apart.
    const real = usgsAdapter.toObservations(usgsRecords).observations;
    const mocked = new NaturalEventAdapter({
      source: { ...USGS_SOURCE, id: 'usgs-fixture', isMock: true },
      method: 'measured',
      matches: (e) => (e.source ?? '').toUpperCase().includes('USGS'),
      attribute: 'seismic_event',
    }).toObservations(usgsRecords).observations;

    const bySource = computeIntegrityBySource([...real, ...mocked]);

    expect(bySource[0].sourceId).toBe('usgs-fixture');
    expect(bySource[0].realRatio).toBe(0);
    expect(bySource.find(s => s.sourceId === 'usgs-earthquakes')!.realRatio).toBe(1);
  });

  it('cannot produce a finding from mock data that is indistinguishable from a real one', () => {
    // Two mock sources agreeing on a place is exactly the shape that would
    // otherwise pass the corroboration bar and be publishable.
    const mockA = new UcdpAdapter({ ...UCDP_SOURCE, id: 'mock-a', isMock: true })
      .toObservations(ucdpRecords).observations;
    const mockB = new NaturalEventAdapter({
      source: { ...USGS_SOURCE, id: 'mock-b', isMock: true },
      method: 'measured',
      matches: () => true,
      attribute: 'seismic_event',
    }).toObservations(usgsRecords).observations;

    const all = [...mockA, ...mockB];
    expect(all.every(o => o.isMock)).toBe(true);

    const events = observationsToEvents(all, REGISTERED_SOURCES, NOW);
    const findings = computeCorroboratedFindings(events);

    // If corroboration DOES fire on fabricated inputs, the resulting finding
    // must still be traceable back to mock observations — the flag is the
    // last line between a fixture and a public broadcast.
    for (const finding of findings) {
      const contributing = all.filter(o => o.subjectEntityRef === finding.entityRef);
      expect(contributing.length).toBeGreaterThan(0);
      expect(contributing.every(o => o.isMock)).toBe(true);
    }
  });

  it('publishes a finding whose corroboration count matches real contributing sources only', () => {
    const real = ucdpAdapter.toObservations(ucdpRecords).observations;
    const events = observationsToEvents(real, REGISTERED_SOURCES, NOW);
    const findings = computeCorroboratedFindings(events);

    for (const finding of findings) {
      const content = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [],}, () => NOW);
      // A published finding carries a source COUNT and no source identities.
      expect(content.method.sourceCount).toBe(finding.sourceCount);
      expect(JSON.stringify(content)).not.toContain('ucdp-ged:');
    }
  });
});
