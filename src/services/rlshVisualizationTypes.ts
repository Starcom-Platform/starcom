// src/services/rlshVisualizationTypes.ts
/**
 * Types, interfaces, and constants for the RLSH Visualization Service.
 * Extracted from RLSHVisualizationService.ts monolith.
 */

import type { RLSHOverlayMarker, RLSHRoleClass } from '../interfaces/RLSHOverlay';
import type { RLSHTelemetrySummary } from './RLSHTelemetryService';

export const RLSH_MARKER_CAPS = {
  global: 300,
  highDetail: 120
} as const;

/**
 * Which role classes are ready to be offered to an operator.
 *
 * All four exist in the type, and every marker in the embedded dataset resolves
 * to `hero` — so a Zone Guardian or Rescue Ranger filter EMPTIED the globe.
 * That reads as a broken map rather than as an unbuilt feature, which is the
 * worse of the two failures: the operator concludes the data is gone.
 *
 * Gated rather than deleted, because the classes are a real intended taxonomy
 * and the registration record already carries a `role` field to populate them.
 * The env flag is the switch for when there is something behind them; the
 * default is off because today there is not.
 *
 * Same reasoning as GlobeLayerInfo.isImplemented, which exists so the UI can
 * say a layer would be a no-op rather than silently accepting a pin.
 */
export const RLSH_ROLE_CLASS_AVAILABILITY: Record<RLSHRoleClass, boolean> = {
  hero: true,
  zone_guardian: false,
  rescue_ranger: false,
  // Not offered as a filter at all; it is an authority, not a bucket to browse.
  archangel_knight: false
};

/** Roles an operator may filter by right now. */
export const availableRLSHRoleClasses = (): RLSHRoleClass[] => {
  const flagged = (() => {
    try {
      return import.meta.env.VITE_RLSH_ROLE_CLASSES_ENABLED === 'true';
    } catch {
      return false;
    }
  })();
  return (Object.keys(RLSH_ROLE_CLASS_AVAILABILITY) as RLSHRoleClass[])
    .filter((role) => flagged || RLSH_ROLE_CLASS_AVAILABILITY[role]);
};

export const ROLE_LABELS: Record<RLSHRoleClass, string> = {
  hero: 'Hero',
  zone_guardian: 'Zone Guardian',
  rescue_ranger: 'Rescue Ranger',
  archangel_knight: 'Archangel Knight'
};

export type ValidationStage = 'ingest' | 'publish' | 'client';

export type RejectionReason =
  | 'invalid-schema-version'
  | 'missing-id'
  | 'invalid-display-name'
  | 'invalid-url'
  | 'invalid-latitude'
  | 'invalid-longitude'
  | 'invalid-updated-at'
  | 'invalid-provider'
  | 'invalid-source-id'
  | 'invalid-geo-confidence'
  | 'unresolved-geo';

export type ResolutionTier = 'city' | 'region' | 'country';

export interface GeoResolutionResult {
  latitude: number;
  longitude: number;
  geoConfidence: RLSHOverlayMarker['geoConfidence'];
  city?: string;
  region?: string;
  countryCode?: string;
  conflict: boolean;
  reason?: RejectionReason;
}

export interface ValidationResult {
  marker: RLSHOverlayMarker | null;
  reason?: RejectionReason;
  provider: string;
}

export type RLSHEventType =
  | 'rlsh_fetch_success'
  | 'rlsh_fetch_failure'
  | 'rlsh_publish_success'
  | 'rlsh_publish_failure'
  | 'rlsh_publish_rollback'
  | 'rlsh_circuit_open'
  | 'rlsh_circuit_close';

export interface RLSHServiceEvent {
  type: RLSHEventType;
  provider?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface SnapshotRecord {
  id: string;
  createdAt: string;
  markers: RLSHOverlayMarker[];
}

export interface RLSHPipelineStepEvent {
  step: string;
  timestamp: string;
  result: 'success' | 'failure' | 'degraded';
  provider?: string;
  endpoint?: string;
  durationMs?: number;
  receivedCount?: number;
  filteredCount?: number;
  parsedCount?: number;
  returnedCount?: number;
  cacheSize?: number;
  reason?: string;
  displayPath?: 'marker' | 'intel' | 'none';
  roleFilter?: RLSHRoleClass | 'all';
  requestedLimit?: number;
  appliedLimit?: number;
}

export interface RLSHPipelineDiagnostics {
  runs: number;
  activeRunStartedAt: string | null;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastRunDurationMs: number | null;
  stepCounts: Record<string, number>;
  sourceAttemptsByProvider: Record<string, number>;
  sourceSuccessByProvider: Record<string, number>;
  recentSteps: RLSHPipelineStepEvent[];
}

export interface RLSHPipelineHumanReadableSummary {
  status: 'success' | 'failure' | 'degraded';
  issueScore: number;
  issueLevel: 'none' | 'low' | 'medium' | 'high';
  durationMs: number | null;
  /** Where the drawn records came from: profiles heroes submitted, test placeholders, a snapshot, or unknown. */
  dataOrigin: 'self_submitted' | 'placeholder' | 'snapshot' | 'unknown';
  sourceReachability: string;
  sourceProvider: string;
  recordsReceived: number;
  recordsAfterFilter: number;
  recordsParsed: number;
  recordsCached: number;
  recordsDisplayed: number;
  displayPath: 'marker' | 'intel' | 'none';
  activeRoleFilter: RLSHRoleClass | 'all' | 'unknown';
  roleFilteredCount: number;
  fallbackUsed: boolean;
  endpoint404Count: number;
  missingEndpoints: string[];
  endpointChecks: Array<{ endpoint: string; status: 'ok' | 'failed'; durationMs?: number; reason?: string }>;
  issues: string[];
}

export interface RLSHVisualizationDebugStats {
  cacheSize: number;
  subscriberCount: number;
  notifyCalls: number;
  lastRefreshAgeMs: number | null;
  rejectionCount: number;
  rejectionsByReason: Record<string, number>;
  rejectionsByProvider: Record<string, number>;
  rejectionsByStage: Record<ValidationStage, number>;
  geoResolutionsByConfidence: Record<RLSHOverlayMarker['geoConfidence'], number>;
  geoConflictCount: number;
  publishCount: number;
  rollbackCount: number;
  fallbackInUse: boolean;
  snapshotCount: number;
  activeSnapshotId: string | null;
  circuitOpenProviders: string[];
  recentEvents: RLSHServiceEvent[];
  pipelineDiagnostics: RLSHPipelineDiagnostics;
  telemetrySummary: RLSHTelemetrySummary;
}
