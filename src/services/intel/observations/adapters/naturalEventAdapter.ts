import type { Source, ObservationMethod } from '../../../../types/intel/SourceObservation';
import type { NaturalEvent } from '../../../GeoEventsService';
import { createObservation, ObservationValidationError } from '../createObservation';
import type { AdapterResult, SourceAdapter } from './types';

/**
 * Shared base for the open-data hazard feeds — USGS, GDACS, and NASA EONET.
 *
 * These three do NOT get adapters against their raw upstream formats, because
 * this app already normalises all three into `NaturalEvent`
 * (GeoEventsDataProvider / GeoEventsService), and that normalisation is real,
 * tested, and in production. Re-parsing the raw feeds would duplicate working
 * code and create a second place for each format's quirks to be handled
 * differently.
 *
 * They DO get one adapter each rather than sharing a single "hazards" source.
 * That distinction is load-bearing: trust and method are per-source facts, and
 * blending them would destroy the thing weight derivation depends on. A USGS
 * earthquake is an instrument reading from a national seismic network; a GDACS
 * alert level is a model output over other people's data; an EONET event is
 * curated remote sensing. Grading them identically would be a lie of exactly
 * the kind this whole phase exists to remove.
 */
export interface NaturalEventAdapterConfig {
  source: Source;
  method: ObservationMethod;
  /** Which NaturalEvents belong to this source, matched on `NaturalEvent.source`. */
  matches: (event: NaturalEvent) => boolean;
  /** The claim attribute this source asserts, e.g. 'seismic_event'. */
  attribute: string;
}

export class NaturalEventAdapter implements SourceAdapter<NaturalEvent> {
  readonly source: Source;

  constructor(private config: NaturalEventAdapterConfig) {
    this.source = config.source;
  }

  toObservations(raw: NaturalEvent[]): AdapterResult {
    const observations = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const ev of raw ?? []) {
      if (!ev || typeof ev !== 'object') {
        dropped.push({ reason: 'record is not an object' });
        continue;
      }
      // Not this source's record. Skipped silently rather than counted as a
      // drop — a drop means "this source produced something unusable", and
      // another source's event is neither.
      if (!this.config.matches(ev)) continue;

      const nativeId = ev.id != null ? String(ev.id) : undefined;
      if (!nativeId) {
        dropped.push({ reason: 'no stable upstream identifier' });
        continue;
      }

      if (!ev.timestamp) {
        // A hazard event with no time cannot participate in the temporal
        // windowing corroboration and contradiction both depend on.
        dropped.push({ nativeId, reason: 'no timestamp — cannot be time-windowed' });
        continue;
      }

      try {
        observations.push(createObservation(this.source, {
          nativeId,
          // The place is the subject for a hazard event: nothing here is a
          // claim about a named actor, and inventing one would be worse than
          // attributing the event to where it happened.
          subjectEntityRef: ev.description || `${ev.type} @ ${ev.lat.toFixed(2)},${ev.lng.toFixed(2)}`,
          claim: {
            attribute: this.config.attribute,
            value: {
              hazardType: ev.type,
              magnitude: ev.magnitude,
              depthKm: ev.depthKm,
              tsunami: ev.tsunami,
              severity: ev.severityOverride,
              status: ev.status,
            },
          },
          timestamp: ev.timestamp,
          method: this.config.method,
          geo: { lat: ev.lat, lon: ev.lng },
          label: ev.description || `${ev.type} event`,
          tags: ['hazard', ev.type, this.source.id].filter(Boolean),
          // An earthquake or wildfire is an occurrence, not a subject that
          // persists and could be somewhere else. Two quakes far apart on the
          // same day contradict nothing.
          subjectKind: 'event',
          // Escalation only — a feed that mixes fixture records with real ones
          // must be able to say so per record.
          isMock: ev.isMock === true,
        }));
      } catch (err) {
        dropped.push({
          nativeId,
          reason: err instanceof ObservationValidationError ? err.message : 'unexpected mapping failure',
        });
      }
    }

    return { observations, dropped };
  }
}

export const USGS_SOURCE: Source = {
  id: 'usgs-earthquakes',
  kind: 'open-data',
  label: 'USGS Earthquake Hazards Program',
  // A — a national instrument network publishing its own readings. The most
  // direct evidence available among these five sources.
  trustBaseline: 'A',
  ingestMethod: 'poll',
  isMock: false,
};

export const GDACS_SOURCE: Source = {
  id: 'gdacs',
  /**
   * GDACS republishes USGS for earthquakes — verified against both live
   * feeds: 31 of 31 USGS quakes had a GDACS counterpart at 0 metres.
   * Agreement between the two is an echo, and must never be counted as
   * independent corroboration.
   */
  derivesFrom: ['usgs-earthquakes'],
  kind: 'open-data',
  label: 'Global Disaster Alert and Coordination System',
  // C — fairly reliable. GDACS alert levels are MODEL OUTPUT over other
  // people's observations, tuned for early warning, which means deliberately
  // erring toward over-alerting. Useful and directional; not a measurement.
  trustBaseline: 'C',
  ingestMethod: 'poll',
  isMock: false,
};

export const EONET_SOURCE: Source = {
  id: 'nasa-eonet',
  kind: 'open-data',
  label: 'NASA Earth Observatory Natural Event Tracker',
  // B — usually reliable. Curated remote sensing: observed rather than
  // measured in situ, with a human curation step between sensor and record.
  trustBaseline: 'B',
  ingestMethod: 'poll',
  isMock: false,
};

export const usgsAdapter = new NaturalEventAdapter({
  source: USGS_SOURCE,
  method: 'measured',
  matches: (e) => (e.source ?? '').toUpperCase().includes('USGS'),
  attribute: 'seismic_event',
});

export const gdacsAdapter = new NaturalEventAdapter({
  source: GDACS_SOURCE,
  method: 'derived',
  matches: (e) => (e.source ?? '').toUpperCase().includes('GDACS'),
  attribute: 'disaster_alert',
});

export const eonetAdapter = new NaturalEventAdapter({
  source: EONET_SOURCE,
  method: 'observed',
  matches: (e) => (e.source ?? '').toUpperCase().includes('EONET'),
  attribute: 'natural_event',
});
