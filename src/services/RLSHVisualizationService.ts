import type { IntelReportOverlayMarker } from '../interfaces/IntelReportOverlay';
import { rlshGeoPrecisionM } from '../interfaces/RLSHOverlay';
import type { RLSHMarkerQueryOptions, RLSHOverlayMarker, RLSHRoleClass } from '../interfaces/RLSHOverlay';
import { rlshTelemetryService } from './RLSHTelemetryService';
import {
  CURATED_RLSH_REGISTRATION_DIAGNOSTICS,
  CURATED_RLSH_REGISTRATIONS,
  type CuratedRLSHRegistrationRecord
} from '../data/rlshCuratedRegistration';
import { createLogger } from '@utils/logger';

// Re-export types and constants from extracted modules for backward compatibility
export type { RLSHVisualizationDebugStats } from './rlshVisualizationTypes';

import { ROLE_LABELS, RLSH_MARKER_CAPS } from './rlshVisualizationTypes';
export { RLSH_MARKER_CAPS };
import type {
  ValidationStage,
  RejectionReason,
  GeoResolutionResult,
  ValidationResult,
  RLSHEventType,
  RLSHServiceEvent,
  SnapshotRecord,
  RLSHPipelineStepEvent,
  RLSHPipelineDiagnostics,
  RLSHPipelineHumanReadableSummary,
  RLSHVisualizationDebugStats,
} from './rlshVisualizationTypes';

import {
  normalizeTags,
  normalizeMemberList,
  normalizeMeaningfulTags,
  normalizeOptionalText,
  normalizeOptionalIsoDate,
  normalizeOptionalUrl,
  normalizeOptionalNpub,
  normalizeOptionalEmail,
  normalizeUrlArray,
  isHttpUrl,
  toEpochMs,
  resolveGeoCandidate,
} from './rlshNormalizationAndGeo';
import { resolveRLSHEntityId, resolveRLSHGroupId } from '../utils/rlshIdentityNavigation';

const log = createLogger({ prefix: 'RLSHVisualizationService' });

class RLSHVisualizationService {
  private static readonly SCHEMA_VERSION = '1.0.0';
  private static readonly MAX_SNAPSHOTS = 3;
  private static readonly CIRCUIT_FAILURE_THRESHOLD = 3;
  private static readonly PUBLISH_MIN_VALID_MARKERS = 1;
  private static readonly MAX_ALLOWED_REJECTION_RATE = 0.75;
  private static readonly DEFAULT_FETCH_TIMEOUT_MS = 7000;
  private static readonly CURATED_REGISTRATION_BY_ID = new Map<string, CuratedRLSHRegistrationRecord>(
    CURATED_RLSH_REGISTRATIONS.map((record) => [record.id, record])
  );
  private cache: RLSHOverlayMarker[] = [];
  private lastRefresh: Date | null = null;
  private subscribers = new Set<(markers: RLSHOverlayMarker[]) => void>();
  private notifyCalls = 0;
  private rejectionCount = 0;
  private rejectionsByReason = new Map<RejectionReason, number>();
  private rejectionsByProvider = new Map<string, number>();
  private rejectionsByStage: Record<ValidationStage, number> = {
    ingest: 0,
    publish: 0,
    client: 0
  };
  private geoResolutionsByConfidence: Record<RLSHOverlayMarker['geoConfidence'], number> = {
    exact: 0,
    city: 0,
    region: 0,
    country: 0,
    unknown: 0
  };
  private geoConflictCount = 0;
  private snapshots: SnapshotRecord[] = [];
  private activeSnapshotId: string | null = null;
  private fallbackInUse = false;
  private publishCount = 0;
  private rollbackCount = 0;
  private providerFailureCounts = new Map<string, number>();
  private circuitOpenProviders = new Set<string>();
  private recentEvents: RLSHServiceEvent[] = [];
  private pipelineRuns = 0;
  private pipelineActiveRunStartedAt: string | null = null;
  private pipelineLastRunStartedAt: string | null = null;
  private pipelineLastRunCompletedAt: string | null = null;
  private pipelineLastRunDurationMs: number | null = null;
  private pipelineStepCounts = new Map<string, number>();
  private sourceAttemptsByProvider = new Map<string, number>();
  private sourceSuccessByProvider = new Map<string, number>();
  private recentPipelineSteps: RLSHPipelineStepEvent[] = [];
  /** Held so a reload does not silently widen the globe back out. */
  private activeStatusFilter: 'active' | 'all' = 'all';
  private activeRoleFilter: RLSHRoleClass | 'all' = 'hero';
  private curatedDiagnosticsEmitted = false;

  /**
   * Is this person operating NOW?
   *
   * Deliberately conservative: only wording that positively asserts current
   * activity counts. 'Unknown' is not activity — a record nobody has checked
   * in 185 days says nothing about today, and treating silence as presence is
   * how a roster inflates itself. Case-insensitive because the source carries
   * both 'Secret' and 'secret' in its sibling field and will do the same here.
   */
  private static isCurrentlyOperating(marker: RLSHOverlayMarker): boolean {
    const s = (marker.status ?? '').trim().toLowerCase();
    return s === 'active' || s === 'semi-active';
  }

  /**
   * How the roster actually breaks down, so an interface can say so.
   *
   * Counted over the whole cache rather than the filtered view, because the
   * question a reader has — "how many of these are current?" — is about the
   * set, not about what happens to be on screen.
   */
  async statusBreakdown(): Promise<{ total: number; operating: number; byStatus: Record<string, number> }> {
    if (this.cache.length === 0) {
      await this.loadFromPipeline();
    }
    const byStatus: Record<string, number> = {};
    for (const marker of this.cache) {
      const key = (marker.status ?? '').trim() || 'Unstated';
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }
    return {
      total: this.cache.length,
      operating: this.cache.filter((m) => RLSHVisualizationService.isCurrentlyOperating(m)).length,
      byStatus,
    };
  }

  async getMarkers(options: RLSHMarkerQueryOptions = {}): Promise<RLSHOverlayMarker[]> {
    if (this.cache.length === 0) {
      await this.loadFromPipeline();
    }

    const requestedLimit = options.limit && options.limit > 0 ? options.limit : this.cache.length;
    const limit = Math.min(requestedLimit, RLSH_MARKER_CAPS.global);
    const activeRoleFilter = options.roleFilter ?? this.activeRoleFilter;
    const statusFilter = options.statusFilter ?? this.activeStatusFilter;
    const filteredMarkers = this.cache.filter((marker) =>
      this.isMarkerIncludedByRoleFilter(marker, activeRoleFilter)
      && (statusFilter === 'all' || RLSHVisualizationService.isCurrentlyOperating(marker)));
    const visibleMarkers = filteredMarkers.slice(0, limit).map(marker => ({ ...marker, tags: [...marker.tags] }));

    this.emitPipelineStep('display_ready', {
      result: 'success',
      displayPath: 'marker',
      roleFilter: activeRoleFilter,
      requestedLimit,
      appliedLimit: limit,
      receivedCount: this.cache.length,
      filteredCount: filteredMarkers.length,
      returnedCount: visibleMarkers.length,
      cacheSize: this.cache.length
    });

    return visibleMarkers;
  }

  async getIntelCompatibleMarkers(options: RLSHMarkerQueryOptions = {}): Promise<IntelReportOverlayMarker[]> {
    const requestedLimit = options.limit && options.limit > 0 ? options.limit : RLSH_MARKER_CAPS.highDetail;
    const appliedLimit = Math.min(requestedLimit, RLSH_MARKER_CAPS.highDetail);
    const markers = await this.getMarkers({
      ...options,
      limit: appliedLimit
    });
    const clientSafeMarkers = this.validateAndNormalizeCollection(markers, 'client');

    /**
     * Group sizes, counted once over the whole set before any marker is built.
     *
     * The source geocodes to a city centroid, so co-location is the norm rather
     * than the exception: these 197 markers occupy 107 coordinates. A consumer
     * given one marker at a time cannot know that, which is why the count is
     * computed here, where every marker is in hand.
     */
    const groupSizes = new Map<string, number>();
    for (const marker of clientSafeMarkers) {
      const gid = resolveRLSHGroupId({
        markerId: marker.id,
        latitude: marker.latitude,
        longitude: marker.longitude
      });
      if (gid) groupSizes.set(gid, (groupSizes.get(gid) ?? 0) + 1);
    }

    const intelMarkers = clientSafeMarkers.map((marker) => {
      const entityId = resolveRLSHEntityId({ markerId: marker.id });
      const groupId = resolveRLSHGroupId({
        markerId: marker.id,
        latitude: marker.latitude,
        longitude: marker.longitude
      });
      const tags = ['RLSH', marker.geoConfidence.toUpperCase(), ...marker.tags];
      if (groupId) {
        tags.push(`RLSH_GROUP_KEY:${groupId}`);
      }

      return {
        pubkey: marker.id,
        title: marker.displayName,
        content: marker.summary,
        tags,
        latitude: marker.latitude,
        longitude: marker.longitude,
        timestamp: toEpochMs(marker.updatedAt),
        author: marker.source.provider,
        entityId: entityId ?? undefined,
        groupId: groupId ?? undefined,
        groupKind: groupId ? ('location' as const) : undefined,
        groupVersion: groupId ? 1 : undefined,
        groupSize: groupId ? groupSizes.get(groupId) : undefined,
        // The interaction layer used to deduce this from subMode === 'RLSH',
        // which is only true while RLSH is the PRIMARY mode — so a pinned RLSH
        // marker was treated as an intel report.
        kind: 'rlsh' as const,
        /*
         * geoConfidence, in the units a renderer can act on.
         *
         * The confidence itself only reached consumers as an uppercase TAG
         * (line above), which the tooltip pattern-matched back out to draw a
         * badge — so the badge said "CITY" while the coordinate beside it was
         * printed to four decimals. These positions are city centroids: 197
         * markers over 107 coordinates, San Diego standing for fourteen
         * people. Four decimals names a building none of them live in.
         */
        geoPrecisionM: rlshGeoPrecisionM(marker.geoConfidence)
      };
    });

    this.emitPipelineStep('intel_display_ready', {
      result: 'success',
      displayPath: 'intel',
      roleFilter: options.roleFilter ?? this.activeRoleFilter,
      requestedLimit,
      appliedLimit,
      receivedCount: markers.length,
      filteredCount: intelMarkers.length,
      parsedCount: clientSafeMarkers.length,
      returnedCount: intelMarkers.length,
      cacheSize: this.cache.length
    });

    return intelMarkers;
  }

  async getMarkerById(id: string): Promise<RLSHOverlayMarker | null> {
    if (!id?.trim()) {
      return null;
    }

    const markers = await this.getMarkers();
    const marker = markers.find((item) => item.id === id.trim());
    if (!marker) {
      return null;
    }

    return { ...marker, tags: [...marker.tags] };
  }

  getRoleFilter(): RLSHRoleClass | 'all' {
    return this.activeRoleFilter;
  }

  async setRoleFilter(roleFilter: RLSHRoleClass | 'all'): Promise<void> {
    this.activeRoleFilter = roleFilter;
    const markers = await this.getMarkers();
    this.notify(markers);
  }

  /**
   * Narrow the globe to people currently operating, or widen it back.
   *
   * Mirrors setRoleFilter so the rail has one shape to call. Held as service
   * state rather than passed per-query because the subscribers — the globe
   * among them — refetch through getMarkers() and would otherwise lose the
   * filter on the next reload.
   */
  async setStatusFilter(statusFilter: 'active' | 'all'): Promise<void> {
    this.activeStatusFilter = statusFilter;
    const markers = await this.getMarkers();
    this.notify(markers);
  }

  subscribe(listener: (markers: RLSHOverlayMarker[]) => void): () => void {
    this.subscribers.add(listener);

    if (this.cache.length > 0) {
      listener(this.cache.map(marker => ({ ...marker, tags: [...marker.tags] })));
    }

    return () => {
      this.subscribers.delete(listener);
    };
  }

  notify(markers: RLSHOverlayMarker[]): void {
    if (this.subscribers.size === 0) {
      return;
    }

    this.notifyCalls += 1;
    const snapshot = markers.map(marker => ({ ...marker, tags: [...marker.tags] }));
    this.subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        log.warn('RLSHVisualizationService subscriber threw an error:', error);
      }
    });
  }

  async refresh(options: RLSHMarkerQueryOptions = {}): Promise<RLSHOverlayMarker[]> {
    await this.loadFromPipeline();
    const markers = await this.getMarkers(options);
    this.lastRefresh = new Date();
    this.notify(markers);
    return markers;
  }

  getDebugStats(): RLSHVisualizationDebugStats {
    const rejectionsByReason: Record<string, number> = {};
    const rejectionsByProvider: Record<string, number> = {};
    const stepCounts: Record<string, number> = {};
    const sourceAttemptsByProvider: Record<string, number> = {};
    const sourceSuccessByProvider: Record<string, number> = {};

    this.rejectionsByReason.forEach((value, key) => {
      rejectionsByReason[key] = value;
    });

    this.rejectionsByProvider.forEach((value, key) => {
      rejectionsByProvider[key] = value;
    });

    this.pipelineStepCounts.forEach((value, key) => {
      stepCounts[key] = value;
    });

    this.sourceAttemptsByProvider.forEach((value, key) => {
      sourceAttemptsByProvider[key] = value;
    });

    this.sourceSuccessByProvider.forEach((value, key) => {
      sourceSuccessByProvider[key] = value;
    });

    return {
      cacheSize: this.cache.length,
      subscriberCount: this.subscribers.size,
      notifyCalls: this.notifyCalls,
      lastRefreshAgeMs: this.lastRefresh ? Date.now() - this.lastRefresh.getTime() : null,
      rejectionCount: this.rejectionCount,
      rejectionsByReason,
      rejectionsByProvider,
      rejectionsByStage: { ...this.rejectionsByStage },
      geoResolutionsByConfidence: { ...this.geoResolutionsByConfidence },
      geoConflictCount: this.geoConflictCount,
      publishCount: this.publishCount,
      rollbackCount: this.rollbackCount,
      fallbackInUse: this.fallbackInUse,
      snapshotCount: this.snapshots.length,
      activeSnapshotId: this.activeSnapshotId,
      circuitOpenProviders: [...this.circuitOpenProviders],
      recentEvents: [...this.recentEvents],
      pipelineDiagnostics: {
        runs: this.pipelineRuns,
        activeRunStartedAt: this.pipelineActiveRunStartedAt,
        lastRunStartedAt: this.pipelineLastRunStartedAt,
        lastRunCompletedAt: this.pipelineLastRunCompletedAt,
        lastRunDurationMs: this.pipelineLastRunDurationMs,
        stepCounts,
        sourceAttemptsByProvider,
        sourceSuccessByProvider,
        recentSteps: [...this.recentPipelineSteps]
      },
      telemetrySummary: rlshTelemetryService.getSummary()
    };
  }

  private async loadFromPipeline(): Promise<void> {
    const runStart = Date.now();
    const runStartIso = new Date(runStart).toISOString();
    this.pipelineRuns += 1;
    this.pipelineActiveRunStartedAt = runStartIso;
    this.pipelineLastRunStartedAt = runStartIso;

    this.emitPipelineStep('pipeline_start', {
      result: 'success',
      cacheSize: this.cache.length
    });

    this.emitCuratedRegistrationDiagnostics();

    try {
      const sourceRecords = await this.fetchSourceRecords();
      const providerKey = this.getProviderKey(sourceRecords);

      this.emitPipelineStep('source_records_received', {
        provider: providerKey,
        result: sourceRecords.length > 0 ? 'success' : 'failure',
        receivedCount: sourceRecords.length,
        reason: sourceRecords.length > 0 ? undefined : 'no-source-records'
      });

      this.recordFetchSuccess(providerKey, sourceRecords.length);
      const validatedIngestMarkers = this.validateAndNormalizeCollection(sourceRecords, 'ingest');
      this.emitPipelineStep('ingest_validation_complete', {
        provider: providerKey,
        result: validatedIngestMarkers.length > 0 ? 'success' : 'failure',
        receivedCount: sourceRecords.length,
        filteredCount: validatedIngestMarkers.length,
        reason: validatedIngestMarkers.length > 0 ? undefined : 'ingest-validation-empty'
      });

      const publishReadyMarkers = this.validateAndNormalizeCollection(validatedIngestMarkers, 'publish');
      this.emitPipelineStep('publish_validation_complete', {
        provider: providerKey,
        result: publishReadyMarkers.length > 0 ? 'success' : 'failure',
        receivedCount: validatedIngestMarkers.length,
        parsedCount: publishReadyMarkers.length,
        reason: publishReadyMarkers.length > 0 ? undefined : 'publish-validation-empty'
      });

      this.assertPublishQuality(publishReadyMarkers.length, sourceRecords.length);
      this.emitPipelineStep('publish_quality_gate_passed', {
        provider: providerKey,
        result: 'success',
        receivedCount: sourceRecords.length,
        parsedCount: publishReadyMarkers.length
      });

      this.publishSnapshot(publishReadyMarkers);
      this.emitPipelineStep('cache_published', {
        provider: providerKey,
        result: 'success',
        cacheSize: this.cache.length,
        parsedCount: publishReadyMarkers.length
      });

      this.recordPublishSuccess(providerKey, publishReadyMarkers.length);

      const completedAt = Date.now();
      this.pipelineActiveRunStartedAt = null;
      this.pipelineLastRunCompletedAt = new Date(completedAt).toISOString();
      this.pipelineLastRunDurationMs = completedAt - runStart;
      this.emitPipelineStep('pipeline_complete', {
        provider: providerKey,
        result: 'success',
        durationMs: this.pipelineLastRunDurationMs,
        cacheSize: this.cache.length,
        parsedCount: publishReadyMarkers.length
      });
    } catch (error) {
      const providerKey = this.extractProviderFromError(error);
      this.recordFetchFailure(providerKey, error);
      this.emitPipelineStep('pipeline_failure', {
        provider: providerKey,
        result: 'failure',
        reason: error instanceof Error ? error.message : 'unknown error'
      });

      this.recordEvent('rlsh_publish_failure', {
        provider: providerKey,
        error: error instanceof Error ? error.message : 'unknown error'
      });

      const rollbackMarkers = this.promoteLastKnownGoodSnapshot('pipeline_failure', {
        provider: providerKey,
        error: error instanceof Error ? error.message : 'unknown error'
      });

      if (!rollbackMarkers) {
        const failedAt = Date.now();
        this.pipelineActiveRunStartedAt = null;
        this.pipelineLastRunCompletedAt = new Date(failedAt).toISOString();
        this.pipelineLastRunDurationMs = failedAt - runStart;
        throw error;
      }

      const degradedAt = Date.now();
      this.pipelineActiveRunStartedAt = null;
      this.pipelineLastRunCompletedAt = new Date(degradedAt).toISOString();
      this.pipelineLastRunDurationMs = degradedAt - runStart;
      this.emitPipelineStep('pipeline_complete', {
        provider: providerKey,
        result: 'degraded',
        durationMs: this.pipelineLastRunDurationMs,
        cacheSize: this.cache.length,
        reason: 'fallback-snapshot-promoted'
      });
    }
  }

  private emitCuratedRegistrationDiagnostics(): void {
    if (this.curatedDiagnosticsEmitted) {
      return;
    }

    this.curatedDiagnosticsEmitted = true;
    const { totalInvalid, totalNormalized, duplicateIds } = CURATED_RLSH_REGISTRATION_DIAGNOSTICS;

    if (totalInvalid === 0 && duplicateIds.length === 0) {
      this.emitPipelineStep('curated_registration_diagnostics', {
        provider: 'embedded_curated_rlsh_roles',
        result: 'success',
        parsedCount: totalNormalized,
        filteredCount: totalNormalized
      });
      return;
    }

    this.emitPipelineStep('curated_registration_diagnostics', {
      provider: 'embedded_curated_rlsh_roles',
      result: 'degraded',
      parsedCount: totalNormalized,
      filteredCount: totalNormalized,
      receivedCount: totalNormalized + totalInvalid,
      reason: 'curated-registration-data-quality-issues'
    });

    log.warn('RLSH curated registration diagnostics reported issues', CURATED_RLSH_REGISTRATION_DIAGNOSTICS);
  }

  private assertPublishQuality(validCount: number, totalCount: number): void {
    // None submitted yet is a state, not a failure (RS49): drawn as nothing. The gate is for records that came
    // and did not hold up.
    if (totalCount === 0) return;
    if (validCount < RLSHVisualizationService.PUBLISH_MIN_VALID_MARKERS) {
      throw new Error('rlsh publish quality gate failed: no valid markers');
    }


    const rejectionRate = (totalCount - validCount) / totalCount;
    if (rejectionRate > RLSHVisualizationService.MAX_ALLOWED_REJECTION_RATE) {
      throw new Error(`rlsh publish quality gate failed: rejection rate ${rejectionRate.toFixed(2)}`);
    }
  }

  private publishSnapshot(markers: RLSHOverlayMarker[]): void {
    const snapshot: SnapshotRecord = {
      id: `snapshot-${Date.now()}`,
      createdAt: new Date().toISOString(),
      markers: markers.map(marker => ({ ...marker, tags: [...marker.tags] }))
    };

    this.snapshots.unshift(snapshot);
    this.snapshots = this.snapshots.slice(0, RLSHVisualizationService.MAX_SNAPSHOTS);
    this.cache = snapshot.markers.map(marker => ({ ...marker, tags: [...marker.tags] }));
    this.activeSnapshotId = snapshot.id;
    this.lastRefresh = new Date();
    this.publishCount += 1;
    this.fallbackInUse = false;
  }

  private promoteLastKnownGoodSnapshot(reason: string, details?: Record<string, unknown>): RLSHOverlayMarker[] | null {
    const fallbackSnapshot = this.snapshots[0];
    if (!fallbackSnapshot) {
      return null;
    }

    this.cache = fallbackSnapshot.markers.map(marker => ({ ...marker, tags: [...marker.tags] }));
    this.activeSnapshotId = fallbackSnapshot.id;
    this.fallbackInUse = true;
    this.rollbackCount += 1;
    rlshTelemetryService.emit('rlsh_fallback_used', {
      markerCount: this.cache.length,
      result: 'degraded',
      reason
    });
    this.recordEvent('rlsh_publish_rollback', {
      reason,
      snapshotId: fallbackSnapshot.id,
      ...details
    });
    return this.cache;
  }

  private validateAndNormalizeCollection(records: unknown[], stage: ValidationStage): RLSHOverlayMarker[] {
    const validMarkers: RLSHOverlayMarker[] = [];

    records.forEach((record) => {
      const result = this.validateAndNormalizeMarker(record, stage);
      if (result.marker) {
        validMarkers.push(result.marker);
      } else if (result.reason) {
        this.recordRejection(result.reason, result.provider, stage);
      }
    });

    return validMarkers;
  }

  private validateAndNormalizeMarker(record: unknown, stage: ValidationStage): ValidationResult {
    if (!record || typeof record !== 'object') {
      return { marker: null, reason: 'missing-id', provider: 'unknown' };
    }

    const candidate = record as Partial<RLSHOverlayMarker> & {
      source?: Partial<RLSHOverlayMarker['source']>;
      city?: unknown;
      region?: unknown;
      countryCode?: unknown;
    };

    const provider = candidate.source?.provider?.trim() || 'unknown';
    const schemaVersion = (candidate.schemaVersion || '').trim();
    if (schemaVersion !== RLSHVisualizationService.SCHEMA_VERSION) {
      return { marker: null, reason: 'invalid-schema-version', provider };
    }

    const id = (candidate.id || '').trim();
    if (!id) {
      return { marker: null, reason: 'missing-id', provider };
    }

    const displayName = (candidate.displayName || '').trim();
    if (displayName.length < 2) {
      return { marker: null, reason: 'invalid-display-name', provider };
    }

    const canonicalUrl = (candidate.canonicalUrl || '').trim();
    if (!isHttpUrl(canonicalUrl)) {
      return { marker: null, reason: 'invalid-url', provider };
    }

    const geo = resolveGeoCandidate(candidate);
    if (geo.reason) {
      return { marker: null, reason: geo.reason, provider };
    }

    const updatedAt = (candidate.updatedAt || '').trim();
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
      return { marker: null, reason: 'invalid-updated-at', provider };
    }

    const sourceProvider = (candidate.source?.provider || '').trim();
    if (!sourceProvider) {
      return { marker: null, reason: 'invalid-provider', provider };
    }

    const sourceId = (candidate.source?.sourceId || '').trim();
    if (!sourceId) {
      return { marker: null, reason: 'invalid-source-id', provider: sourceProvider };
    }

    const normalizedMarker: RLSHOverlayMarker = {
      schemaVersion,
      id,
      displayName,
      aliases: normalizeMemberList(candidate.aliases),
      summary: (candidate.summary || '').trim(),
      canonicalUrl,
      latitude: geo.latitude,
      longitude: geo.longitude,
      city: geo.city,
      region: geo.region,
      countryCode: geo.countryCode,
      locationText: typeof candidate.locationText === 'string' ? candidate.locationText.trim() : '',
      updatedAt,
      lastVerifiedAt: normalizeOptionalIsoDate(candidate.lastVerifiedAt),
      imageUrl: normalizeOptionalUrl(candidate.imageUrl),
      symbolImageUrl: normalizeOptionalUrl(candidate.symbolImageUrl),
      identity: typeof candidate.identity === 'string' ? candidate.identity.trim() : '',
      category: typeof candidate.category === 'string' ? candidate.category.trim() : '',
      status: typeof candidate.status === 'string' ? candidate.status.trim() : '',
      // Member lists, not string lists: the wiki scrape put list bullets and
      // orphaned role qualifiers in here as though they were teams.
      team: normalizeMemberList(candidate.team),
      affiliates: normalizeMemberList(candidate.affiliates),
      // 'Unknown' as a foe's NAME is not a foe. Absent is the honest answer.
      foes: normalizeOptionalText(candidate.foes),
      actions: normalizeOptionalText(candidate.actions),
      equipment: normalizeOptionalText(candidate.equipment),
      abilities: normalizeOptionalText(candidate.abilities),
      fullText: typeof candidate.fullText === 'string' ? candidate.fullText.trim() : '',
      nostrNpub: normalizeOptionalNpub(candidate.nostrNpub),
      contactEmail: normalizeOptionalEmail(candidate.contactEmail),
      socialLinks: normalizeUrlArray(candidate.socialLinks),
      sourceUrl: typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl.trim() : '',
      source: {
        provider: sourceProvider,
        sourceId
      },
      geoConfidence: geo.geoConfidence,
      // team: tags derived from the same field the markers group by.
      tags: normalizeMeaningfulTags(candidate.tags, candidate.team),
      riskFlags: normalizeMemberList(candidate.riskFlags)
    };

    this.applyCuratedRegistration(normalizedMarker);

    if (stage === 'publish' || stage === 'client') {
      normalizedMarker.summary = normalizedMarker.summary.slice(0, 800);
    }

    this.geoResolutionsByConfidence[normalizedMarker.geoConfidence] += 1;
    if (geo.conflict) {
      this.geoConflictCount += 1;
      log.warn('RLSH georesolution conflict detected', {
        id,
        provider: sourceProvider,
        city: geo.city,
        region: geo.region,
        countryCode: geo.countryCode
      });
    }

    return {
      marker: normalizedMarker,
      provider: sourceProvider
    };
  }

  private applyCuratedRegistration(marker: RLSHOverlayMarker): void {
    const curated = RLSHVisualizationService.CURATED_REGISTRATION_BY_ID.get(marker.id);
    const roleClass: RLSHRoleClass = curated?.role ?? 'hero';
    const roleLabel = ROLE_LABELS[roleClass];

    marker.roleClass = roleClass;
    marker.roleLabel = roleLabel;
    /*
     * The role class is still assigned to every marker, because
     * isMarkerIncludedByRoleFilter drops a marker that has none and the globe
     * would go empty. But `assumed` records that WE chose it, so the popup can
     * stop presenting our default as the person's own claim.
     */
    marker.roleSource = curated?.role ? 'registered' : 'assumed';
    marker.registrationApproved = curated?.approved ?? false;
    /*
     * Three states. 195 of these people never submitted anything — they were
     * scraped from a wiki by a third party — and calling that "Pending
     * curation" asserts a queue they are not in.
     */
    marker.registrationStatus = curated
      ? (curated.approved ? 'approved' : 'submitted')
      : 'none';
    marker.registrationReviewedBy = curated?.reviewedBy ?? '';
    marker.registrationReviewedAt = curated?.reviewedAt ?? '';
    marker.registrationNotes = curated?.notes ?? '';
    marker.nostrNpub = normalizeOptionalNpub(curated?.nostrNpub || marker.nostrNpub);
    marker.contactEmail = normalizeOptionalEmail(curated?.contactEmail || marker.contactEmail);
    marker.socialLinks = normalizeUrlArray((curated?.socialLinks && curated.socialLinks.length > 0)
      ? curated.socialLinks
      : marker.socialLinks);
    marker.contactConsent = {
      nostr: typeof curated?.contactConsent?.nostr === 'boolean' ? curated.contactConsent.nostr : undefined,
      email: typeof curated?.contactConsent?.email === 'boolean' ? curated.contactConsent.email : undefined,
      social: typeof curated?.contactConsent?.social === 'boolean' ? curated.contactConsent.social : undefined
    };

    if (!marker.tags.includes(`role:${roleClass}`)) {
      marker.tags = [...marker.tags, `role:${roleClass}`];
    }
    if (!marker.tags.includes(`role_label:${roleLabel}`)) {
      marker.tags = [...marker.tags, `role_label:${roleLabel}`];
    }
    if (marker.registrationApproved && !marker.tags.includes('registration:approved')) {
      marker.tags = [...marker.tags, 'registration:approved'];
    }
  }

  private isMarkerIncludedByRoleFilter(marker: RLSHOverlayMarker, roleFilter: RLSHRoleClass | 'all'): boolean {
    if (roleFilter === 'all') {
      return true;
    }

    return marker.roleClass === roleFilter;
  }

  private recordRejection(reason: RejectionReason, provider: string, stage: ValidationStage): void {
    this.rejectionCount += 1;
    this.rejectionsByStage[stage] += 1;
    this.rejectionsByReason.set(reason, (this.rejectionsByReason.get(reason) || 0) + 1);
    this.rejectionsByProvider.set(provider, (this.rejectionsByProvider.get(provider) || 0) + 1);
  }

  private async fetchSourceRecords(): Promise<unknown[]> {
    if (this.isTestRuntime()) {
      this.emitPipelineStep('source_test_placeholder', {
        provider: 'test_runtime',
        result: 'degraded',
        reason: 'test-runtime-placeholder-path'
      });
      return this.buildPlaceholderMarkers();
    }

    /*
     * Profiles are the heroes' own (owner, 2026-10-17; rlsh-minors.md, RS49). Starcom ships no scraped data and
     * fetches none: the embedded copy of the RLSH wiki, the static file and the Wikipedia rung are gone, and only
     * profiles heroes submit themselves through NavCom will be drawn. Until then the layer draws no one, and says
     * so: a source that has nothing yet is not a failure, and it never invents anyone (D-F step 12).
     */
    this.emitPipelineStep('source_self_submitted_only', {
      provider: 'navcom_submitted_profiles',
      result: 'success',
      reason: 'no-scraped-data: profiles come only as heroes submit them'
    });
    return [];
  }

  private isTestRuntime(): boolean {
    return typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  }

  private async fetchJson(url: string): Promise<unknown> {
    if (typeof fetch !== 'function') {
      throw new Error('fetch is unavailable in current runtime');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), RLSHVisualizationService.DEFAULT_FETCH_TIMEOUT_MS)
      : null;

    const startedAt = Date.now();
    this.emitPipelineStep('http_request_started', {
      endpoint: url,
      result: 'success'
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller?.signal
      });

      if (!response.ok) {
        throw new Error(`request failed ${response.status} ${response.statusText}`);
      }

      const payload = await response.json();
      this.emitPipelineStep('http_request_succeeded', {
        endpoint: url,
        result: 'success',
        durationMs: Date.now() - startedAt
      });

      return payload;
    } catch (error) {
      this.emitPipelineStep('http_request_failed', {
        endpoint: url,
        result: 'failure',
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : 'unknown fetch failure'
      });
      const message = error instanceof Error ? error.message : 'unknown fetch failure';
      throw new Error(`${message} url=${url}`);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private getProviderKey(records: unknown[]): string {
    const first = records[0];
    if (!first || typeof first !== 'object') {
      return 'unknown';
    }

    const provider = (first as { source?: { provider?: string } }).source?.provider;
    if (typeof provider === 'string' && provider.trim()) {
      return provider.trim();
    }

    return 'unknown';
  }

  private extractProviderFromError(error: unknown): string {
    if (error instanceof Error && error.message.includes('provider=')) {
      const match = /provider=([a-zA-Z0-9_-]+)/.exec(error.message);
      if (match?.[1]) {
        return match[1];
      }
    }

    return 'unknown';
  }

  private recordFetchSuccess(provider: string, recordCount: number): void {
    this.providerFailureCounts.set(provider, 0);
    if (this.circuitOpenProviders.has(provider)) {
      this.circuitOpenProviders.delete(provider);
      this.recordEvent('rlsh_circuit_close', { provider });
    }

    this.recordEvent('rlsh_fetch_success', {
      provider,
      recordCount
    });
  }

  private recordFetchFailure(provider: string, error: unknown): void {
    const nextCount = (this.providerFailureCounts.get(provider) || 0) + 1;
    this.providerFailureCounts.set(provider, nextCount);

    this.recordEvent('rlsh_fetch_failure', {
      provider,
      consecutiveFailures: nextCount,
      error: error instanceof Error ? error.message : 'unknown error'
    });

    if (nextCount >= RLSHVisualizationService.CIRCUIT_FAILURE_THRESHOLD && !this.circuitOpenProviders.has(provider)) {
      this.circuitOpenProviders.add(provider);
      this.recordEvent('rlsh_circuit_open', {
        provider,
        consecutiveFailures: nextCount
      });
    }
  }

  private recordPublishSuccess(provider: string, markerCount: number): void {
    this.recordEvent('rlsh_publish_success', {
      provider,
      markerCount,
      snapshotId: this.activeSnapshotId
    });
  }

  private recordEvent(type: RLSHEventType, details?: Record<string, unknown>): void {
    const event: RLSHServiceEvent = {
      type,
      provider: typeof details?.provider === 'string' ? details.provider : undefined,
      timestamp: new Date().toISOString(),
      details
    };

    this.recentEvents.unshift(event);
    this.recentEvents = this.recentEvents.slice(0, 20);
  }

  private emitPipelineStep(step: string, details: Omit<RLSHPipelineStepEvent, 'step' | 'timestamp'>): void {
    const event: RLSHPipelineStepEvent = {
      step,
      timestamp: new Date().toISOString(),
      ...details
    };

    this.pipelineStepCounts.set(step, (this.pipelineStepCounts.get(step) || 0) + 1);
    this.recentPipelineSteps.unshift(event);
    this.recentPipelineSteps = this.recentPipelineSteps.slice(0, 60);

    rlshTelemetryService.emit('rlsh_pipeline_step', {
      step,
      provider: event.provider,
      endpoint: event.endpoint,
      durationMs: event.durationMs,
      receivedCount: event.receivedCount,
      filteredCount: event.filteredCount,
      parsedCount: event.parsedCount,
      cacheSize: event.cacheSize,
      result: event.result,
      reason: event.reason
    });

    if (typeof window !== 'undefined') {
      const globalWindow = window as Window & {
        __RLSH_PIPELINE_STEPS__?: RLSHPipelineStepEvent[];
        __RLSH_PIPELINE_LAST_SUMMARY__?: RLSHPipelineHumanReadableSummary;
        __RLSH_PIPELINE_PRINT_SUMMARY__?: () => void;
        __RLSH_PIPELINE_STATS__?: {
          runs: number;
          activeRunStartedAt: string | null;
          lastRunStartedAt: string | null;
          lastRunCompletedAt: string | null;
          lastRunDurationMs: number | null;
          stepCounts: Record<string, number>;
          sourceAttemptsByProvider: Record<string, number>;
          sourceSuccessByProvider: Record<string, number>;
        };
      };

      globalWindow.__RLSH_PIPELINE_STEPS__ = [...this.recentPipelineSteps];
      globalWindow.__RLSH_PIPELINE_STATS__ = {
        runs: this.pipelineRuns,
        activeRunStartedAt: this.pipelineActiveRunStartedAt,
        lastRunStartedAt: this.pipelineLastRunStartedAt,
        lastRunCompletedAt: this.pipelineLastRunCompletedAt,
        lastRunDurationMs: this.pipelineLastRunDurationMs,
        stepCounts: Object.fromEntries(this.pipelineStepCounts.entries()),
        sourceAttemptsByProvider: Object.fromEntries(this.sourceAttemptsByProvider.entries()),
        sourceSuccessByProvider: Object.fromEntries(this.sourceSuccessByProvider.entries())
      };

      globalWindow.__RLSH_PIPELINE_PRINT_SUMMARY__ = () => {
        const summary = this.buildHumanReadableRunSummary();
        this.logHumanReadableRunSummary(summary);
      };
    }

    const shouldLogDetailedStep = event.result !== 'success'
      || step === 'pipeline_start'
      || step === 'pipeline_complete'
      || step === 'pipeline_failure'
      || step === 'display_ready';

    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && shouldLogDetailedStep) {
      console.groupCollapsed(`[RLSH][Pipeline] ${step} :: ${event.result}`);
      console.table([{ 
        provider: event.provider || '-',
        endpoint: event.endpoint || '-',
        durationMs: event.durationMs ?? '-',
        receivedCount: event.receivedCount ?? '-',
        filteredCount: event.filteredCount ?? '-',
        parsedCount: event.parsedCount ?? '-',
        cacheSize: event.cacheSize ?? '-',
        reason: event.reason || '-'
      }]);
      log.debug('Pipeline stats snapshot:', {
        runs: this.pipelineRuns,
        activeRunStartedAt: this.pipelineActiveRunStartedAt,
        lastRunDurationMs: this.pipelineLastRunDurationMs,
        sourceAttemptsByProvider: Object.fromEntries(this.sourceAttemptsByProvider.entries()),
        sourceSuccessByProvider: Object.fromEntries(this.sourceSuccessByProvider.entries())
      });
      console.groupEnd();
    }

    if (step === 'pipeline_complete' || step === 'pipeline_failure') {
      const summary = this.buildHumanReadableRunSummary();
      if (typeof window !== 'undefined') {
        (window as Window & {
          __RLSH_PIPELINE_LAST_SUMMARY__?: RLSHPipelineHumanReadableSummary;
        }).__RLSH_PIPELINE_LAST_SUMMARY__ = summary;
      }
      this.logHumanReadableRunSummary(summary);
    }
  }

  private getCurrentRunSteps(): RLSHPipelineStepEvent[] {
    const latestFirst = [...this.recentPipelineSteps];
    const runStepsNewestToOldest: RLSHPipelineStepEvent[] = [];

    for (const step of latestFirst) {
      runStepsNewestToOldest.push(step);
      if (step.step === 'pipeline_start') {
        break;
      }
    }

    return runStepsNewestToOldest.reverse();
  }

  private buildHumanReadableRunSummary(): RLSHPipelineHumanReadableSummary {
    const steps = this.getCurrentRunSteps();
    const latestByStep = new Map<string, RLSHPipelineStepEvent>();

    steps.forEach((step) => {
      latestByStep.set(step.step, step);
    });

    const completion = latestByStep.get('pipeline_complete') || latestByStep.get('pipeline_failure');

    const sourceAttemptFailed = latestByStep.get('source_attempt_failed');
    const sourceRecordsReceived = latestByStep.get('source_records_received');
    const ingestValidation = latestByStep.get('ingest_validation_complete');
    const publishValidation = latestByStep.get('publish_validation_complete');
    const cachePublished = latestByStep.get('cache_published');
    // Prefer the intel-overlay display step when present — getIntelCompatibleMarkers
    // is a distinct consumer path from getMarkers/RLSHPopup, and its own display metrics
    // take priority when the marker-display step from this run is absent.
    const displayReady = latestByStep.get('intel_display_ready') ?? latestByStep.get('display_ready');

    const endpointChecks = steps
      .filter((step) => step.step === 'http_request_succeeded' || step.step === 'http_request_failed')
      .map((step) => ({
        endpoint: step.endpoint || 'unknown-endpoint',
        status: step.step === 'http_request_succeeded' ? 'ok' as const : 'failed' as const,
        durationMs: step.durationMs,
        reason: step.reason
      }));

    const missingEndpoints = endpointChecks
      .filter((item) => item.status === 'failed' && (item.reason || '').includes('404'))
      .map((item) => item.endpoint);
    const endpoint404Count = missingEndpoints.length;

    const fallbackUsed = steps.some((step) => step.step === 'source_chain_placeholder_fallback')
      || steps.some((step) => step.step === 'pipeline_complete' && step.reason === 'fallback-snapshot-promoted');

    let dataOrigin: RLSHPipelineHumanReadableSummary['dataOrigin'] = 'unknown';
    if (steps.some((step) => step.step === 'pipeline_complete' && step.reason === 'fallback-snapshot-promoted')) {
      dataOrigin = 'snapshot';
    } else if (steps.some((step) => step.step === 'source_chain_placeholder_fallback') || steps.some((step) => step.step === 'source_test_placeholder')) {
      dataOrigin = 'placeholder';
    } else if (steps.some((step) => step.step === 'source_self_submitted_only')) {
      dataOrigin = 'self_submitted';
    }
    // A final branch here set dataOrigin = 'api' when '/api/rlsh/entities'
    // succeeded. That endpoint was never written, so the branch could not be
    // reached and the 'api' origin could never be reported.

    const sourceProvider = sourceRecordsReceived?.provider
      || sourceAttemptFailed?.provider
      || completion?.provider
      || 'unknown';

    const sourceReachability = sourceAttemptFailed
      ? `Failed to reach/parse source (${sourceAttemptFailed.reason || 'unknown reason'})`
      : endpointChecks.some((item) => item.status === 'ok')
        ? 'Source endpoint reached successfully'
        : 'No HTTP source endpoint reached (likely test/runtime fallback path)';

    const issues: string[] = [];
    if (sourceAttemptFailed?.reason) {
      issues.push(`Source attempt failed: ${sourceAttemptFailed.reason}`);
    }
    if (completion?.reason && completion.reason !== 'fallback-snapshot-promoted') {
      issues.push(`Pipeline issue: ${completion.reason}`);
    }
    if (fallbackUsed) {
      issues.push('Fallback path used (placeholder or snapshot).');
    }
    if (endpoint404Count > 0) {
      issues.push(`Endpoint missing (404): ${missingEndpoints.join(', ')}`);
    }

    const completionFailure = completion?.result === 'failure' || latestByStep.has('pipeline_failure');
    const displayedCount = displayReady?.filteredCount ?? 0;
    const recordsCachedCount = cachePublished?.cacheSize ?? this.cache.length;
    const displayPath = displayReady?.displayPath ?? 'none';
    const activeRoleFilter = displayReady?.roleFilter ?? 'unknown';

    if (recordsCachedCount > 0 && displayedCount === 0 && displayReady?.roleFilter && displayReady.roleFilter !== 'all') {
      issues.push(`Role filter excluded all cached markers (role=${displayReady.roleFilter}).`);
    }

    let issueScore = 0;
    if (completionFailure) {
      issueScore += 60;
    }
    if (fallbackUsed) {
      issueScore += 35;
    }
    if (endpoint404Count > 0) {
      issueScore += Math.min(40, endpoint404Count * 20);
    }
    if (displayedCount === 0) {
      issueScore += 15;
    }
    if (sourceAttemptFailed) {
      issueScore += 15;
    }
    issueScore = Math.min(100, issueScore);

    const issueLevel: RLSHPipelineHumanReadableSummary['issueLevel'] =
      issueScore === 0 ? 'none' : issueScore <= 20 ? 'low' : issueScore <= 50 ? 'medium' : 'high';

    const status: 'success' | 'failure' | 'degraded' = completionFailure
      ? 'failure'
      : issueScore > 0 || fallbackUsed || displayedCount === 0
        ? 'degraded'
        : 'success';

    return {
      status,
      issueScore,
      issueLevel,
      durationMs: this.pipelineLastRunDurationMs,
      dataOrigin,
      sourceReachability,
      sourceProvider,
      recordsReceived: sourceRecordsReceived?.receivedCount ?? 0,
      recordsAfterFilter: ingestValidation?.filteredCount ?? 0,
      recordsParsed: publishValidation?.parsedCount ?? 0,
      recordsCached: recordsCachedCount,
      recordsDisplayed: displayedCount,
      displayPath,
      activeRoleFilter,
      roleFilteredCount: displayedCount,
      fallbackUsed,
      endpoint404Count,
      missingEndpoints,
      endpointChecks,
      issues
    };
  }

  private logHumanReadableRunSummary(summary: RLSHPipelineHumanReadableSummary): void {
    console.groupCollapsed(`[RLSH][Summary] ${summary.status.toUpperCase()} | provider=${summary.sourceProvider} | displayed=${summary.recordsDisplayed}`);
    log.info('Pipeline status:', summary.status);
    log.info('Issue severity:', `${summary.issueLevel.toUpperCase()} (${summary.issueScore}/100)`);
    log.info('Data origin:', summary.dataOrigin);
    log.info('Source reachability:', summary.sourceReachability);
    log.info('Duration (ms):', summary.durationMs ?? 'unknown');
    console.table([
      {
        stage: 'received',
        count: summary.recordsReceived
      },
      {
        stage: 'filtered',
        count: summary.recordsAfterFilter
      },
      {
        stage: 'parsed',
        count: summary.recordsParsed
      },
      {
        stage: 'cached',
        count: summary.recordsCached
      },
      {
        stage: 'displayed',
        count: summary.recordsDisplayed
      }
    ]);

    if (summary.endpointChecks.length > 0) {
      console.table(summary.endpointChecks);
    } else {
      log.info('Endpoint checks: none captured for this run');
    }

    if (summary.issues.length > 0) {
      log.warn('Issues detected:', summary.issues);
    } else {
      log.info('Issues detected: none');
    }

    if (summary.endpoint404Count > 0) {
      log.warn('Endpoint diagnostics:', {
        endpoint404Count: summary.endpoint404Count,
        missingEndpoints: summary.missingEndpoints,
        interpretation: '404 indicates endpoint/file does not exist at the requested route in this deployment.'
      });
    }

    log.info('Console helper: window.__RLSH_PIPELINE_LAST_SUMMARY__ and window.__RLSH_PIPELINE_PRINT_SUMMARY__()');
    console.groupEnd();
  }

  private buildPlaceholderMarkers(): unknown[] {
    const nowIso = new Date().toISOString();
    return [
      {
        schemaVersion: RLSHVisualizationService.SCHEMA_VERSION,
        id: 'rlsh-seattle-1',
        displayName: 'Phoenix Sentinel',
        aliases: ['Sentinel', 'PS-47'],
        summary: 'Community responder focused on neighborhood patrol and welfare checks.',
        canonicalUrl: 'https://example.org/rlsh/phoenix-sentinel',
        latitude: 47.6062,
        longitude: -122.3321,
        updatedAt: nowIso,
        lastVerifiedAt: nowIso,
        imageUrl: 'https://example.org/rlsh/images/phoenix-sentinel.jpg',
        source: {
          provider: 'primary_wiki',
          sourceId: 'phoenix-sentinel'
        },
        geoConfidence: 'city',
        tags: ['Patrol', 'Seattle', 'placeholder'],
        riskFlags: ['LOW_VERIFICATION_COVERAGE']
      },
      {
        schemaVersion: RLSHVisualizationService.SCHEMA_VERSION,
        id: 'rlsh-chicago-1',
        displayName: 'Lakefront Guardian',
        aliases: ['LFG'],
        summary: 'Volunteer-led safety escort network operating in transit-adjacent areas.',
        canonicalUrl: 'https://example.org/rlsh/lakefront-guardian',
        latitude: 41.8781,
        longitude: -87.6298,
        updatedAt: nowIso,
        lastVerifiedAt: nowIso,
        source: {
          provider: 'primary_wiki',
          sourceId: 'lakefront-guardian'
        },
        geoConfidence: 'city',
        tags: ['Transit', 'Chicago', 'placeholder'],
        riskFlags: []
      },
      {
        schemaVersion: RLSHVisualizationService.SCHEMA_VERSION,
        id: 'rlsh-nyc-1',
        displayName: 'Midtown Watchlight',
        aliases: ['Watchlight'],
        summary: 'Night visibility and rapid reporting support for community incidents.',
        canonicalUrl: 'https://example.org/rlsh/midtown-watchlight',
        city: 'New York',
        region: 'NY',
        countryCode: 'US',
        updatedAt: nowIso,
        lastVerifiedAt: nowIso,
        source: {
          provider: 'primary_wiki',
          sourceId: 'midtown-watchlight'
        },
        geoConfidence: 'city',
        tags: ['NightWatch', 'NYC', 'placeholder'],
        riskFlags: ['UNVERIFIED_ALIAS']
      },
      {
        schemaVersion: RLSHVisualizationService.SCHEMA_VERSION,
        id: '',
        displayName: 'Bad Record Example',
        summary: 'Intentional invalid entry used to verify rejection counters.',
        canonicalUrl: 'not-a-url',
        latitude: 999,
        longitude: -74.006,
        updatedAt: nowIso,
        source: {
          provider: 'secondary_registry',
          sourceId: 'invalid-sample'
        },
        geoConfidence: 'city',
        tags: ['invalid-sample']
      }
    ];
  }
}

export const rlshVisualizationService = new RLSHVisualizationService();
