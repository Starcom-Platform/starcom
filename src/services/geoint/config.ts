import { GeoIntConfig } from './types';

export const GEOINT_DEFAULT_CONFIG: GeoIntConfig = {
  // A `relays` list stood here — including purplepag.es, in no registry — and
  // nothing read it: this config is only spread into the parser. Removed in the
  // relay consolidation (D-F); the relays the intake uses are in publicInfrastructure.ts.
  limitPerReq: 500,
  freshnessWindowMs: 24 * 60 * 60 * 1000,
  maxEventsStored: 1000,
  maxFeaturesPerCollection: 50,
  maxVerticesPerPolygon: 2000,
  maxEventVertexTotal: 5000,
  contentSizeCapBytes: 64 * 1024,
  tagCountCap: 100,
  tagLengthCap: 256,
  debounceMs: 300,
  backoff: {
    initialMs: 2000,
    maxMs: 60000,
    factor: 2,
    jitterMs: 500
  },
  cluster: {
    enabled: true,
    radiusKm: 50,
    minSize: 2
  },
  intelDefaults: {
    status: 'SUBMITTED',
    category: 'GEOINT',
    priorityHigh: 'CRITICAL',
    priorityMed: 'HIGH',
    priorityLow: 'LOW',
    confidenceDefault: 0.5
  }
};
