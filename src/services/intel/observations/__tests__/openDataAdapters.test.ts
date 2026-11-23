import { describe, it, expect } from 'vitest';
import { runAdapterContract } from '../adapters/adapterContract';
import {
  usgsAdapter, gdacsAdapter, eonetAdapter,
  USGS_SOURCE, GDACS_SOURCE, EONET_SOURCE,
  NaturalEventAdapter,
} from '../adapters/naturalEventAdapter';
import { reliefWebAdapter, type ReliefWebDisaster } from '../adapters/reliefWebAdapter';
import { REGISTERED_SOURCES } from '../adapters';
import type { NaturalEvent } from '../../../GeoEventsService';

const naturalEvents: NaturalEvent[] = [
  { id: 'us7000abcd', lat: 38.1, lng: -122.3, type: 'earthquake', magnitude: 5.4, timestamp: '2026-08-01T10:00:00Z', source: 'USGS', description: 'M 5.4 - Northern California', depthKm: 12, tsunami: false },
  { id: 'gdacs-1234', lat: -1.2, lng: 36.8, type: 'flood', timestamp: '2026-08-02T00:00:00Z', source: 'GDACS', description: 'Flood in Kenya', severityOverride: 'major' },
  { id: 'EONET_6789', lat: 19.4, lng: -155.3, type: 'volcano', timestamp: '2026-08-03T00:00:00Z', source: 'NASA EONET (IRWIN)', description: 'Kilauea activity' },
];

const disasters: ReliefWebDisaster[] = [
  { id: 52001, fields: { name: 'Kenya: Floods - Aug 2026', status: 'ongoing', date: { created: '2026-08-02T06:00:00+00:00' }, primary_country: { name: 'Kenya', location: { lat: -1.28, lon: 36.82 } }, type: [{ name: 'Flood' }] } },
  { id: '52002', fields: { name: 'Chad: Drought - 2026', status: 'alert', date: { created: '2026-07-15T00:00:00+00:00' }, primary_country: { name: 'Chad' }, type: [{ name: 'Drought' }] } },
];

describe('USGS adapter', () => {
  runAdapterContract(usgsAdapter, naturalEvents);

  it('grades a national instrument network as A/measured', () => {
    expect(USGS_SOURCE.trustBaseline).toBe('A');
    expect(usgsAdapter.toObservations(naturalEvents).observations[0].method).toBe('measured');
  });

  it('takes only its own records from a mixed feed', () => {
    const { observations } = usgsAdapter.toObservations(naturalEvents);
    expect(observations).toHaveLength(1);
    expect(observations[0].id).toBe('usgs-earthquakes:us7000abcd');
  });

  it('does not count another source\'s events as its own drops', () => {
    // A GDACS record is not a USGS failure. Counting it as one would make the
    // per-source drop rate meaningless as a data-quality signal.
    expect(usgsAdapter.toObservations(naturalEvents).dropped).toHaveLength(0);
  });
});

describe('GDACS adapter', () => {
  runAdapterContract(gdacsAdapter, naturalEvents);

  it('grades model-derived alert levels lower than measurements', () => {
    expect(GDACS_SOURCE.trustBaseline).toBe('C');
    expect(gdacsAdapter.toObservations(naturalEvents).observations[0].method).toBe('derived');
    // The whole point of separate sources: GDACS must not inherit USGS's grade.
    expect(GDACS_SOURCE.trustBaseline).not.toBe(USGS_SOURCE.trustBaseline);
  });
});

describe('EONET adapter', () => {
  runAdapterContract(eonetAdapter, naturalEvents);

  it('grades curated remote sensing as B/observed', () => {
    expect(EONET_SOURCE.trustBaseline).toBe('B');
    expect(eonetAdapter.toObservations(naturalEvents).observations[0].method).toBe('observed');
  });
});

describe('ReliefWeb adapter', () => {
  runAdapterContract(reliefWebAdapter, disasters);

  it('records that a country centroid is coarse rather than presenting it as a position', () => {
    const { observations } = reliefWebAdapter.toObservations(disasters);
    const kenya = observations.find(o => o.subjectEntityRef === 'Kenya');
    expect((kenya?.claim.value as Record<string, unknown>).geoPrecision).toBe('country-centroid');
  });

  it('omits geo entirely rather than inventing a position when none is given', () => {
    const { observations } = reliefWebAdapter.toObservations(disasters);
    const chad = observations.find(o => o.subjectEntityRef === 'Chad');
    expect(chad?.geo).toBeUndefined();
    expect((chad?.claim.value as Record<string, unknown>).geoPrecision).toBe('none');
  });
});

describe('the mock flag can only ever escalate', () => {
  it('marks a per-record mock as mock even on a real source', () => {
    const withMock: NaturalEvent[] = [{ ...naturalEvents[0], isMock: true }];
    expect(usgsAdapter.toObservations(withMock).observations[0].isMock).toBe(true);
  });

  it('cannot launder a mock source record into a real one', () => {
    const mockSourced = new NaturalEventAdapter({
      source: { ...USGS_SOURCE, id: 'usgs-fixture', isMock: true },
      method: 'measured',
      matches: (e) => (e.source ?? '').toUpperCase().includes('USGS'),
      attribute: 'seismic_event',
    });
    // Record explicitly says isMock: false; the source says true. Source wins.
    const records: NaturalEvent[] = [{ ...naturalEvents[0], isMock: false }];
    expect(mockSourced.toObservations(records).observations[0].isMock).toBe(true);
  });
});

describe('source registry', () => {
  it('registers six sources, each with a distinct id — the Phase 1 gate', () => {
    expect(REGISTERED_SOURCES).toHaveLength(6);
    expect(new Set(REGISTERED_SOURCES.map(s => s.id)).size).toBe(6);
  });

  it('grades them independently rather than lumping open data into one bucket', () => {
    const grades = new Set(REGISTERED_SOURCES.map(s => s.trustBaseline));
    expect(grades.size).toBeGreaterThan(1);
  });
});
