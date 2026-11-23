// src/services/IntelReportVisualizationService.ts
// Service for managing Intel Report visualization data for the 3D Globe

import { IntelReportOverlayMarker } from '../interfaces/IntelReportOverlay';
import { intelReportService } from './intel/IntelReportService';
import type { IntelReportUI } from '../types/intel/IntelReportUI';
import { reportToMarker } from './intel/globe/reportMarker';
import { passesLensChoice, type LensId } from './intel/bigThreeLenses';
import { markerRecordTime, overlapsWindow } from './intel/recordTime';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'IntelReportVisualizationService' });

// Import unified Intel types from Phase 2 cleanup
// import { IntelReport as UnifiedIntelReport, IntelReportAdapter } from '../models/Intel/IntelReport';

// Legacy interfaces removed; this service now consumes IntelReportUI exclusively

// Legacy transformer and types removed in favor of IntelReportUI + intelReportService

export interface IntelReportVisualizationOptions {
  maxReports?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  tagFilter?: string[];
  /**
   * The big-three lenses to focus on (D-CT, CT5): only markers carrying one of these `lens:*`
   * tags. Applied before the cap, so a cap of 50 draws 50 of the lens's reports, not those of
   * the newest 50 that carry it. Empty or absent is All.
   */
  lenses?: readonly LensId[];
  radiusFilter?: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
  };
}

export interface IntelReportVisualizationDebugStats {
  cacheSize: number;
  subscriberCount: number;
  lastFetchAgeMs: number | null;
  markerAdds: number;
  duplicateMarkerReplacements: number;
  notifyCalls: number;
}

/** Newest first; a marker with no readable time after every timed one. */
const newestFirstUntimedLast = (a: IntelReportOverlayMarker, b: IntelReportOverlayMarker): number => {
  const at = Number.isFinite(a.timestamp), bt = Number.isFinite(b.timestamp);
  if (at && bt) return b.timestamp - a.timestamp;
  return at === bt ? 0 : at ? -1 : 1;
};

export class IntelReportVisualizationService {
  private static readonly MAX_CACHE_MARKERS = 500;
  private cache: IntelReportOverlayMarker[] = [];
  /**
   * Markers delivered by `addMarker` that storage has not yet seen, keyed by
   * pubkey. Held apart from `cache` because `cache` is rebuilt from storage
   * whenever the workspace changes, and these would not survive it — which for
   * a long time they did not. An entry leaves when the same report turns up in
   * storage, so this holds only the gap between arrival and persistence.
   */
  private liveMarkers = new Map<string, IntelReportOverlayMarker>();
  private lastFetch: Date | null = null;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastFilteredResult: IntelReportOverlayMarker[] = [];
  private lastOptionsHash: string = '';
  private subscribers = new Set<(markers: IntelReportOverlayMarker[]) => void>();
  private subscriptionInitialized = false;
  private realtimeUnsubscribe: (() => void) | null = null;
  private invalidCoordinateReports = new Set<string>();
  private markerAdds = 0;
  private duplicateMarkerReplacements = 0;
  private notifyCalls = 0;
  private lastMatchingCountBeforeCap = 0;
  /** How many markers the last call's lens choice left out, before the cap (D-CT, CT5). */
  private lastHiddenByLens = 0;
  /**
   * Of the reports the last date range judged, how many it placed by when they were
   * written rather than when their event happened (decision D-E). Null when the last
   * call had no date range, since nothing was then placed in time.
   */
  private lastTimeBasis: { judged: number; written: number; untimed: number } | null = null;

  constructor() {
    this.initializeRealtimeSubscription();
  }

  /**
   * Fetch Intel Reports for visualization on the globe
   */
  async getIntelReportMarkers(
    options: IntelReportVisualizationOptions = {}
  ): Promise<IntelReportOverlayMarker[]> {
    try {
      this.initializeRealtimeSubscription();

      // Create options hash for memoization
      const optionsHash = JSON.stringify(options);
      
      // Check cache first
      if (this.isCacheValid()) {
        // Return same reference if options haven't changed
        if (optionsHash === this.lastOptionsHash && this.lastFilteredResult.length > 0) {
          return this.lastFilteredResult;
        }
        
        const filtered = this.applyFilters(this.cache, options);
        this.lastFilteredResult = filtered;
        this.lastOptionsHash = optionsHash;
        return filtered;
      }

      log.debug('Fetching Intel Reports (UI) for 3D visualization...');
      
      // Fetch via centralized intelReportService
      const uiReports = await intelReportService.listReports();
      
      // Transform to overlay markers with validation
      const stored = this.buildMarkersFromReports(uiReports);

      // Update cache. The merged result, not `stored`, is what anyone is shown:
      // storage cannot see a report that arrived from a relay and was never
      // persisted, and handing `stored` onward is how those were erased.
      const markers = this.updateCache(stored);
      this.notifySubscribers(markers);

      log.debug(`Loaded ${markers.length} Intel Report markers for 3D visualization`);

      const filtered = this.applyFilters(markers, options);
      this.lastFilteredResult = filtered;
      this.lastOptionsHash = JSON.stringify(options);
      return filtered;
    } catch (error) {
      log.error('Error fetching Intel Reports for visualization:', error);

      // Never fabricate markers on a real failure — this is an intelligence
      // platform, and fake pins rendered indistinguishably from real ones on
      // a fetch error is a trust problem, not a UX nicety. Degrade to the
      // last known-good (possibly stale) cache instead, or an empty result
      // if nothing has ever loaded successfully yet.
      return this.cache.length > 0 ? this.applyFilters(this.cache, options) : [];
    }
  }

  /**
   * How many reports matched the last getIntelReportMarkers() call's filters
   * (date/tag/radius) *before* maxReports truncated the result — lets a
   * caller show an honest "showing X of Y" indicator instead of silently
   * dropping reports past the cap with no signal.
   */
  getLastMatchingCountBeforeCap(): number {
    return this.lastMatchingCountBeforeCap;
  }

  /** How many markers the last call's lens choice left out (D-CT, CT5): said, never silently dropped. */
  getLastHiddenByLens(): number {
    return this.lastHiddenByLens;
  }

  /** See lastTimeBasis. */
  getLastTimeBasisCounts(): { judged: number; written: number; untimed: number } | null {
    return this.lastTimeBasis;
  }

  subscribe(listener: (markers: IntelReportOverlayMarker[]) => void): () => void {
    this.subscribers.add(listener);

    if (this.cache.length > 0) {
      listener(this.cloneMarkers(this.cache));
    }

    return () => {
      this.subscribers.delete(listener);
    };
  }

  private initializeRealtimeSubscription(): void {
    if (this.subscriptionInitialized) {
      return;
    }

    // Avoid initializing during SSR
    if (typeof window === 'undefined') {
      return;
    }

    this.subscriptionInitialized = true;

    try {
      this.realtimeUnsubscribe = intelReportService.onChange((reports) => {
        this.refreshCacheFromReports(reports);
      });

      // Prime the cache on first subscription
      void intelReportService.listReports()
        .then((reports) => {
          this.refreshCacheFromReports(reports);
        })
        .catch((error) => {
          log.warn('Failed to prime Intel Report visualization cache:', error);
        });
    } catch (error) {
      log.warn('Failed to subscribe to intelReportService changes:', error);
      this.subscriptionInitialized = false;
    }
  }

  private refreshCacheFromReports(reports: IntelReportUI[]): void {
    // Newest first, and a report with no time LAST: before the cap, so it is the
    // first to go rather than — as when it was stamped "now" — the one always kept.
    const stored = this.buildMarkersFromReports(reports)
      .sort(newestFirstUntimedLast)
      .slice(0, IntelReportVisualizationService.MAX_CACHE_MARKERS);
    this.notifySubscribers(this.updateCache(stored));
  }

  private buildMarkersFromReports(reports: IntelReportUI[]): IntelReportOverlayMarker[] {
    const markers: IntelReportOverlayMarker[] = [];

    reports.forEach((report) => {
      const marker = this.transformReportToMarker(report);
      if (marker) {
        markers.push(marker);
      }
    });

    return markers;
  }

  /**
   * Replace what storage says, KEEP what the network delivered.
   *
   * This took `markers` and assigned it to `this.cache`. Storage is only one of
   * the two channels a report can arrive on — `addMarker` is the other, and it
   * is the one the Nostr ingest uses — so an assignment erased every report
   * from a relay the moment the workspace changed for any reason. It was drawn
   * for a few seconds and then vanished, with nothing logged and no count
   * moving. See IntelReportVisualizationService.liveMarkers.test.ts for the
   * measurement that found it.
   *
   * Storage wins on identity: once the pipeline's flush persists a report, the
   * stored copy is the durable one and may carry later edits, so the live copy
   * is dropped rather than merged field-by-field.
   *
   * @returns the merged set, which is what callers must show and notify with.
   */
  private updateCache(stored: IntelReportOverlayMarker[]): IntelReportOverlayMarker[] {
    for (const marker of stored) {
      this.liveMarkers.delete(marker.pubkey);
    }

    const merged = this.liveMarkers.size === 0
      ? stored
      : [...stored, ...this.liveMarkers.values()].sort(newestFirstUntimedLast);

    this.cache = merged.slice(0, IntelReportVisualizationService.MAX_CACHE_MARKERS);
    this.lastFetch = new Date();
    this.lastOptionsHash = '';
    this.lastFilteredResult = [];

    if (this.invalidCoordinateReports.size > 1000) {
      this.invalidCoordinateReports.clear();
    }

    return this.cache;
  }

  private notifySubscribers(markers: IntelReportOverlayMarker[]): void {
    if (this.subscribers.size === 0) {
      return;
    }

    this.notifyCalls += 1;

    const snapshot = this.cloneMarkers(markers);
    this.subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        log.warn('IntelReportVisualizationService subscriber threw an error:', error);
      }
    });
  }

  private cloneMarkers(markers: IntelReportOverlayMarker[]): IntelReportOverlayMarker[] {
    return markers.map((marker) => ({
      ...marker,
      tags: [...marker.tags]
    }));
  }

  /**
   * Transform IntelReport to overlay marker format. The rule itself is
   * reportToMarker, shared with a Case's pins; this adds the one-time warning.
   */
  private transformReportToMarker(report: IntelReportUI): IntelReportOverlayMarker | null {
    const marker = reportToMarker(report);

    if (!marker) {
      if (!this.invalidCoordinateReports.has(report.id)) {
        this.invalidCoordinateReports.add(report.id);
        log.warn(
          `Skipping intel report "${report.title}" (${report.id}) due to missing or invalid coordinates.`
        );
      }
      return null;
    }

    // Coordinate is now valid, ensure the warning can fire again if it becomes invalid later
    if (this.invalidCoordinateReports.has(report.id)) {
      this.invalidCoordinateReports.delete(report.id);
    }

    return marker;
  }

  /**
   * Apply filters to the markers
   */
  private applyFilters(
    markers: IntelReportOverlayMarker[], 
    options: IntelReportVisualizationOptions
  ): IntelReportOverlayMarker[] {
    let filtered = [...markers];

    // Date range filter. By overlap, since a report is a span: it falls in a window
    // it overlaps, placed by when its event happened, or by when it was written when
    // it does not say (decision D-E). A marker with no stated basis is the instant
    // `timestamp`, as before.
    if (options.dateRange) {
      const range = options.dateRange;
      /*
       * A marker with no readable time cannot be placed in a window at all. It
       * used to carry Date.now() and so sat at the present moment; it is left out
       * now, and counted as UNTIMED — "no stated time" is not "outside the
       * window" (decision D-C: excluded and counted, never quietly omitted).
       */
      this.lastTimeBasis = {
        judged: filtered.length,
        written: filtered.filter(marker => marker.timeBasis === 'written').length,
        untimed: filtered.filter(marker => !markerRecordTime(marker) && !Number.isFinite(marker.timestamp)).length,
      };
      filtered = filtered.filter(marker => {
        const time = markerRecordTime(marker);
        if (time) return overlapsWindow(time, range);
        return Number.isFinite(marker.timestamp) && overlapsWindow({ basis: 'written', start: marker.timestamp }, range);
      });
    } else {
      this.lastTimeBasis = null;
    }

    // Tag filter
    if (options.tagFilter && options.tagFilter.length > 0) {
      filtered = filtered.filter(marker =>
        options.tagFilter!.some(tag =>
          marker.tags.some(markerTag =>
            markerTag.toLowerCase().includes(tag.toLowerCase())
          )
        )
      );
    }

    // The big-three lenses (D-CT, CT5), counted so the globe can say what the choice hides.
    if (options.lenses && options.lenses.length > 0) {
      const before = filtered.length;
      filtered = filtered.filter(marker => passesLensChoice(marker.tags, options.lenses));
      this.lastHiddenByLens = before - filtered.length;
    } else {
      this.lastHiddenByLens = 0;
    }

    // Radius filter (geographic)
    if (options.radiusFilter) {
      filtered = filtered.filter(marker => {
        const distance = this.calculateDistance(
          marker.latitude,
          marker.longitude,
          options.radiusFilter!.centerLat,
          options.radiusFilter!.centerLng
        );
        return distance <= options.radiusFilter!.radiusKm;
      });
    }

    // Limit results — record the pre-cap count first so callers can show an
    // honest "showing X of Y" indicator instead of silently truncating.
    this.lastMatchingCountBeforeCap = filtered.length;
    if (options.maxReports && options.maxReports > 0) {
      filtered = filtered.slice(0, options.maxReports);
    }

    return filtered;
  }

  /**
   * Calculate distance between two points in kilometers
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.degToRad(lat2 - lat1);
    const dLng = this.degToRad(lng2 - lng1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.degToRad(lat1)) * Math.cos(this.degToRad(lat2)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private degToRad(deg: number): number {
    return deg * (Math.PI/180);
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    /*
     * "Never fetched" and "fetched, found nothing" are different states, and
     * treating them alike cost real work: `this.cache.length === 0` was part of
     * this test, so a node with no reports answered false on every call, every
     * caller refetched, and every refetch notified every subscriber. Measured
     * on a globe with one report and an empty store: 145 notifications in four
     * seconds, each one a re-render that tore down and rebuilt the layer's
     * geometry. `lastFetch` alone already says whether a fetch has happened,
     * and both write paths — a storage refresh and addMarker — invalidate this
     * explicitly, so an empty cache does not need to force a read to stay
     * current.
     */
    if (!this.lastFetch) {
      return false;
    }

    const now = new Date();
    return (now.getTime() - this.lastFetch.getTime()) < this.cacheTimeout;
  }

  /**
   * Clear cache and force refetch
   */
  clearCache(): void {
    this.cache = [];
    // Explicit reset means everything, including what the network delivered;
    // leaving these behind would make a cleared cache repopulate itself.
    this.liveMarkers.clear();
    this.lastFetch = null;
    this.lastFilteredResult = [];
    this.lastOptionsHash = '';
  }

  getDebugStats(): IntelReportVisualizationDebugStats {
    return {
      cacheSize: this.cache.length,
      subscriberCount: this.subscribers.size,
      lastFetchAgeMs: this.lastFetch ? Date.now() - this.lastFetch.getTime() : null,
      markerAdds: this.markerAdds,
      duplicateMarkerReplacements: this.duplicateMarkerReplacements,
      notifyCalls: this.notifyCalls
    };
  }

  /**
   * Add a new Intel Report marker immediately (for real-time updates)
   */
  addMarker(report: IntelReportUI): void {
    const marker = this.transformReportToMarker(report);
    if (!marker) {
      return;
    }

    this.markerAdds += 1;

    const existingIndex = this.cache.findIndex((item) => item.pubkey === marker.pubkey);
    if (existingIndex >= 0) {
      this.cache.splice(existingIndex, 1);
      this.duplicateMarkerReplacements += 1;
    }

    /*
     * Also held apart from the cache, so the next storage refresh cannot erase
     * it. Bounded by the same cap as the cache and oldest-out, because a Map
     * that only ever grows is a leak in a session that runs for hours.
     */
    this.liveMarkers.delete(marker.pubkey);
    this.liveMarkers.set(marker.pubkey, marker);
    while (this.liveMarkers.size > IntelReportVisualizationService.MAX_CACHE_MARKERS) {
      const oldest = this.liveMarkers.keys().next().value;
      if (oldest === undefined) break;
      this.liveMarkers.delete(oldest);
    }

    this.cache.unshift(marker);
    if (this.cache.length > IntelReportVisualizationService.MAX_CACHE_MARKERS) {
      this.cache.length = IntelReportVisualizationService.MAX_CACHE_MARKERS;
    }

    this.lastFetch = new Date();
    this.lastFilteredResult = [];
    this.lastOptionsHash = '';
    this.notifySubscribers(this.cache);
  }

  /**
   * Takes reports' markers off: those the ingest says a newer version, under another of their publisher's keys,
   * replaced (NostrStarcomIntelIngest.onWithdrawn). A marker is keyed by its report's id.
   */
  removeMarkers(reportIds: readonly string[]): void {
    const gone = new Set(reportIds);
    const before = this.cache.length;
    this.cache = this.cache.filter((marker) => !gone.has(marker.pubkey));
    for (const id of gone) this.liveMarkers.delete(id);
    if (this.cache.length === before) return;
    this.lastFilteredResult = [];
    this.lastOptionsHash = '';
    this.notifySubscribers(this.cache);
  }

}

// Export singleton instance
export const intelReportVisualizationService = new IntelReportVisualizationService();
