/**
 * useGlobeIntelReportPipeline — fetch, subscribe, filter, dedupe and persist
 * the intel reports the globe shows as 3D markers.
 *
 * Extracted from Globe.tsx's largest single effect (~350 lines): subscribes
 * IntelReportVisualizationService, starts/stops the Nostr `#starcom_intel`
 * hashtag ingest while IntelReports mode is active, priority-filters and
 * signature-dedupes the result so an unchanged marker set doesn't trigger a
 * re-render, and runs a backpressured persistence-flush scheduler (drop the
 * oldest pending report past a cap, cap how many persist concurrently) so a
 * burst of incoming Nostr reports can't overwhelm IntelWorkspaceManager.
 *
 * Deliberately NOT extracted alongside this: the scene-attach/detach effects
 * that add/remove the marker group from the Three.js scene (the 3D models those
 * once held were retired on 2026-10-08). This hook never touches the scene —
 * confirmed while reading it, twice — which is what makes it extractable
 * without a WebGL harness. Those other pieces are more delicate (direct scene
 * mutation, a two-way state coupling through Enhanced3DGlobeInteractivity)
 * and are staying in Globe.tsx for a later pass.
 *
 * The globe's context menu wrote reports here too, with an automatic title
 * (`addLocalReport`). It opens the report form now (plan item 0.11), so the
 * form is the one place a report is written from the globe.
 */
import { useEffect, useRef, useState } from 'react';
import { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { intelReportVisualizationService } from '../../../services/IntelReportVisualizationService';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { hydratePersistedIntel } from '../../../services/intel/hydratePersistedIntel';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';
import { readRelayCount } from '../../../services/intel/relays/relayCount';
import {
  getIntelPersistenceMetrics,
  MAX_PENDING as PERSIST_MAX_PENDING_SINK,
  MAX_CONCURRENT as PERSIST_MAX_CONCURRENT_SINK,
} from '../../../services/intel/intelPersistenceSink';
import RealTimeEventSystem from '../../../services/realTimeEventSystem';
import { getIntelReportPriority } from '../../../utils/intelReportPriority';
import { passesLensChoice, readLensChoice, type LensId } from '../../../services/intel/bigThreeLenses';
import { drawLimit, effectiveReportCap, holdFor, subscribeReportCap } from '../../../services/intel/reportCap';
import { createLogger } from '@utils/logger';
import { noteIntelDrawn, noteIntelTaken } from '../../../services/intel/intelReportsDrawn';

const log = createLogger({ prefix: 'globe-intel-pipeline' });

export interface IntelReportSettings {
  autoRefresh: boolean;
  refreshInterval: number; // minutes
  /** How many reports the globe draws; null for Unlimited (BA5). The handle's cap, when set, wins for its page (BA7). */
  maxReports: number | null;
  reportFiltering: {
    showCritical: boolean;
    showHigh: boolean;
    showMedium: boolean;
    showLow: boolean;
    /** Reports nobody assigned a priority to. Distinct from showLow. */
    showUnset: boolean;
  };
  /** The big-three lenses chosen (D-CT, CT5); absent or empty is All. Read through readLensChoice. */
  lenses?: LensId[];
}

export interface UseGlobeIntelReportPipelineArgs {
  /** Whether the given globe layer id is currently active. */
  isLayerActive: (layerId: string) => boolean;
  visualizationMode: { mode: string; subMode: string };
  temporalState?: { timeWindow?: { start: Date; end: Date } } | null;
  settings: IntelReportSettings;
}

export interface UseGlobeIntelReportPipelineResult {
  intelReports: IntelReportOverlayMarker[];
  /**
   * Upper bound on how many matched the active filters before the maxReports
   * cap. Sourced from the service's own pre-cap count on the refresh path; see
   * applyMarkers for why it is a bound rather than an exact figure.
   */
  intelTotalMatching: number;
  /**
   * How many of the reports actually delivered were dropped by the priority
   * filter. Exact, unlike the above — these are reports we saw and chose not to
   * draw, which is a different sentence from "there are more past the cap".
   */
  intelHiddenByPriority: number;
  /**
   * How many reports the lens choice left out (D-CT, CT5): those without a chosen `lens:*` tag.
   * Said beside the priority filter's count, for the same reason: a filter that hides must say so.
   */
  intelHiddenByLens: number;
  /**
   * Of the reports the paused cursor's window judged, how many there were, and how
   * many it placed by when they were written (decision D-E). Both zero while live,
   * when nothing is placed in time.
   */
  intelJudgedByWindow: number;
  intelPlacedByWritten: number;
  /** Paused only: reports left off the timeline for want of any readable time. */
  intelUntimed: number;
  /** Brief, real explanation for why markers just disappeared on a mode switch. */
  intelClearedNotice: string | null;
  /**
   * What the globe is listening to, in three states (decision D-F, step 4):
   * null while the layer is off, `starting` while the layer is on and the ingest
   * has not started, and the ingest's own counts once it is running.
   *
   * Connections, not answers. `relay.connected` is set when a probe socket opens
   * or a subscription reaches end-of-stored-events — both mean a connection was
   * established — but nothing counts relays that returned data.
   */
  intelListening: { connected: number; total: number } | 'starting' | null;
}

const DIAGNOSTICS_INTERVAL_MS = 45000;
const CLEARED_NOTICE_DURATION_MS = 4000;

export const useGlobeIntelReportPipeline = ({
  isLayerActive,
  visualizationMode,
  temporalState,
  settings,
}: UseGlobeIntelReportPipelineArgs): UseGlobeIntelReportPipelineResult => {
  const [intelReports, setIntelReports] = useState<IntelReportOverlayMarker[]>([]);
  const [intelTotalMatching, setIntelTotalMatching] = useState<number>(0);
  const [intelHiddenByPriority, setIntelHiddenByPriority] = useState<number>(0);
  const [intelHiddenByLens, setIntelHiddenByLens] = useState<number>(0);
  const [intelJudgedByWindow, setIntelJudgedByWindow] = useState<number>(0);
  const [intelPlacedByWritten, setIntelPlacedByWritten] = useState<number>(0);
  const [intelUntimed, setIntelUntimed] = useState<number>(0);
  const [intelClearedNotice, setIntelClearedNotice] = useState<string | null>(null);
  const [intelListening, setIntelListening] = useState<{ connected: number; total: number } | 'starting' | null>(null);
  // The number of the list handed the globe, set with it, so its render says when it is drawn (H3).
  const [intelSeq, setIntelSeq] = useState(0);
  // Hooks' effects run in call order in one flush: the glyphs' (called after this one in Globe.tsx) run in it too,
  // before anything waiting on this can look.
  useEffect(() => { if (intelSeq > 0) noteIntelDrawn(intelSeq); }, [intelSeq]);

  const intelReportsSignatureRef = useRef<string>('');
  const intelClearedNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // The lens choice as one value, so choosing a lens draws again at once (D-CT, CT5).
  const lensKey = readLensChoice(settings.lenses).join(',');

  /*
   * The cap in force (BA4–BA7): the handle's for this page when set, else the
   * person's. Re-read when the handle changes it; a change draws again, and tells
   * the intake how many reports to hold (BA6).
   */
  const [, setCapChanged] = useState(0);
  useEffect(() => subscribeReportCap(() => setCapChanged((n) => n + 1)), []);
  const cap = effectiveReportCap(settings.maxReports).cap;
  const capRef = useRef(cap);
  capRef.current = cap;
  useEffect(() => {
    nostrStarcomIntelIngest.setHoldCap(holdFor(cap));
  }, [cap]);

  useEffect(() => () => {
    if (intelClearedNoticeTimeoutRef.current) {
      clearTimeout(intelClearedNoticeTimeoutRef.current);
    }
  }, []);

  /*
   * What the globe is listening to, for GlobeReportNotes (decision D-F, step 4).
   *
   * A first visit measured 14.7 s from load to the first report, and Globe.tsx had
   * no ingest state at all, so it could not have said anything even with somewhere
   * to say it.
   *
   * Null while the ingest is not running: not fetching is a different claim from
   * fetching and hearing nothing, and only one of them is worth showing a visitor.
   * The counts come from getRelayStatus(), which carries both the connections and
   * the total, so the sentence is measured rather than asserted.
   */
  useEffect(() => {
    const read = () => {
      // The layer being off is not the same claim as fetching and hearing nothing.
      if (!isLayerActive('IntelReports')) {
        setIntelListening(null);
        return;
      }
      // start() is awaited deep in the effect below, so the ingest is not running
      // for the first seconds of a visit. Waiting for it before admitting the globe
      // is fetching is the silence this exists to end — measured at 16.8 s.
      // The one relay count the strip and its STATUS panel show too (plan item 1.8).
      const { active, connected, total } = readRelayCount();
      if (!active) {
        setIntelListening('starting');
        return;
      }
      // Same value, same object: onChange fires per event, and a fresh object each
      // time would re-render the globe for a number that did not change.
      setIntelListening((previous) => (
        previous && previous !== 'starting'
          && previous.connected === connected && previous.total === total
          ? previous
          : { connected, total }
      ));
    };
    read();
    return nostrStarcomIntelIngest.onChange(read);
  }, [isLayerActive, visualizationMode.subMode]);

  useEffect(() => {
    let mounted = true;
    let currentLoadRequest: Promise<void> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let diagnosticsInterval: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeNostr: (() => void) | undefined;
    const eventSystem = RealTimeEventSystem.getInstance();
    let lastDiagSample: {
      timestamp: number;
      eventLoopProcessed: number;
      eventLoopTicks: number;
      workspaceFlushes: number;
      workspaceSaveRequests: number;
      droppedPersist: number;
      eventLoopQueueDepth: number;
      pendingPersistDepth: number;
    } | null = null;
    let queueGrowthStreak = 0;

    const applyMarkers = (markers: IntelReportOverlayMarker[], matchedBeforeCap?: number, hiddenByLensBeforeCap = 0) => {
      if (!mounted) {
        return;
      }
      const { reportFiltering } = settingsRef.current;
      const maxReports = capRef.current;
      /*
       * The big-three lenses first (D-CT, CT5). The refresh path has the service apply them
       * before its cap and count what they left out (hiddenByLensBeforeCap); a subscriber is
       * handed every marker held, and they are applied here. Either way the count is said.
       */
      const lenses = readLensChoice(settingsRef.current.lenses);
      const lensFiltered = markers.filter((marker) => passesLensChoice(marker.tags, lenses));
      setIntelHiddenByLens(hiddenByLensBeforeCap + markers.length - lensFiltered.length);
      const priorityFiltered = lensFiltered.filter((marker) => {
        switch (getIntelReportPriority(marker)) {
          case 'critical': return reportFiltering.showCritical;
          case 'high': return reportFiltering.showHigh;
          case 'medium': return reportFiltering.showMedium;
          case 'low': return reportFiltering.showLow;
          // Exhaustive on purpose — the old `default:` silently routed
          // unprioritised reports to showLow, which is how they vanished.
          case 'unset': return reportFiltering.showUnset;
        }
      });
      const limited = priorityFiltered.slice(0, drawLimit(maxReports));
      const signature = limited
        .map((marker) => {
          const markerId = marker.pubkey || marker.title || '';
          const lat = typeof marker.latitude === 'number' ? marker.latitude.toFixed(5) : 'na';
          const lng = typeof marker.longitude === 'number' ? marker.longitude.toFixed(5) : 'na';
          // And the version read: a note sent again at its address, as every note is to gain its
          // sources (Interchange 3.19), is drawn as sent, its sources with it (D-CT, CT7).
          return `${markerId}:${lat}:${lng}:${marker.nostrEventId ?? ''}`;
        })
        .join('|');

      setIntelHiddenByPriority(lensFiltered.length - priorityFiltered.length);
      // The service caps BEFORE we see anything, so priorityFiltered.length is
      // computed over an already-truncated page — which is why the "Showing N
      // of M" notice could never fire: M was derived from the same capped array
      // as N, so M > N was false in steady state. matchedBeforeCap is the
      // service's own pre-cap figure (getLastMatchingCountBeforeCap), which has
      // existed and been tested since the cap was added and never had a caller.
      //
      // It is an UPPER BOUND, not an exact count: the priority filter only ever
      // ran over the page we received, so some of the reports past the cap might
      // have been filtered out too had we seen them. Still strictly better than
      // reporting the capped length as though it were the total, and the only
      // honest number available without fetching past the cap.
      setIntelTotalMatching(Math.max(matchedBeforeCap ?? 0, priorityFiltered.length));

      if (signature === intelReportsSignatureRef.current) {
        return;
      }

      intelReportsSignatureRef.current = signature;
      setIntelReports(limited);
      setIntelSeq(noteIntelTaken());
      if (process.env.NODE_ENV === 'development' && limited.length > 0) {
        log.debug(`📊 Intel Report 3D markers synced (${limited.length} visible)`);
      }
    };

    const refreshMarkers = async () => {
      if (currentLoadRequest) {
        return currentLoadRequest;
      }

      currentLoadRequest = (async () => {
        try {
          const markers = await intelReportVisualizationService.getIntelReportMarkers({
            // Fetch up to the settings-configured cap directly from the service (the
            // priority filter above is applied client-side, so ask for enough that
            // filtering afterward doesn't leave fewer than the cap when it didn't need to).
            maxReports: capRef.current ?? undefined,
            // The lenses before the cap, so the cap is spent on the lens's reports (D-CT, CT5).
            lenses: readLensChoice(settingsRef.current.lenses),
            // Apply temporal filter when operator is scrubbing (non-live mode)
            ...(temporalState?.timeWindow ? { dateRange: temporalState.timeWindow } : {}),
          });
          applyMarkers(markers, intelReportVisualizationService.getLastMatchingCountBeforeCap(), intelReportVisualizationService.getLastHiddenByLens());
          const timeBasis = temporalState?.timeWindow ? intelReportVisualizationService.getLastTimeBasisCounts() : null;
          if (mounted) {
            setIntelJudgedByWindow(timeBasis?.judged ?? 0);
            setIntelPlacedByWritten(timeBasis?.written ?? 0);
            setIntelUntimed(timeBasis?.untimed ?? 0);
          }
        } catch (error) {
          if (mounted) {
            log.error('Error loading Intel Report markers:', error);
          }
        } finally {
          currentLoadRequest = null;
        }
      })();

      return currentLoadRequest;
    };

    if (isLayerActive('IntelReports')) {
      if (process.env.NODE_ENV === 'development') {
        log.debug('🛰️ CYBERCOMMAND INTEL REPORTS MODE ACTIVATED - Live intel updates enabled');
      }
      unsubscribe = intelReportVisualizationService.subscribe(applyMarkers);

      // Start Nostr hashtag ingest for #starcom_intel so decentralized reports can appear on the globe.
      // This is intentionally scoped to IntelReports mode to avoid persistent background relay traffic.
      void (async () => {
        try {
          if (!mounted) return;
          /*
           * DRAWS ONLY. Storing moved to services/intel/intelPersistenceSink.ts,
           * which attaches at boot beside the ingest.
           *
           * It was here, and the lifetimes had drifted apart: the ingest runs
           * for the whole session on every screen (D-F 4.2) while this effect
           * lives and dies with the intel layer, so everything accepted while
           * the person was anywhere else was held in memory and written
           * nowhere. Measured against a local relay: accepted 3, stored 0.
           */
          const unsubscribeReports = nostrStarcomIntelIngest.subscribe((report) => {
            intelReportVisualizationService.addMarker(report);
          });
          // A note carried to its publisher's new key replaces its original: the original's marker comes off.
          const unsubscribeWithdrawn = nostrStarcomIntelIngest.onWithdrawn((ids) => intelReportVisualizationService.removeMarkers(ids));
          unsubscribeNostr = () => { unsubscribeReports(); unsubscribeWithdrawn(); };
          /*
           * The last session's intel FIRST, before anything from this one
           * (decision D-F, step 4.4).
           *
           * The globe was empty whenever the public relays were unreachable —
           * measured at 2/5 and 3/5 reachable on one afternoon, with delivery
           * going 7 → 2 → 0 between runs and a full layer audit drawing zero
           * marks in all three views. A report the person created here vanished
           * on reload too, because nothing read storage back onto the globe.
           *
           * Drawn before the replay and before live, because the draw path
           * unshifts: oldest first means the newest survive the cap. Bounded by
           * the window the live query itself asks for, so nothing appears that
           * the query would not have requested.
           */
          /*
           * Guarded on its own, because the live ingest below is the primary
           * path and this is a convenience on top of it. Inside the ingest's own
           * try block, anything thrown here — a storage that will not open, an
           * ingest without the window getter — would skip `replayAccepted` and
           * `start()` and cost the globe its live reports to save its stale
           * ones. That is the wrong way round.
           */
          try {
            const hydrated = await hydratePersistedIntel({
              listReports: () => intelReportService.listReports(),
              draw: (report) => intelReportVisualizationService.addMarker(report),
              sinceWindowMs: nostrStarcomIntelIngest.getSinceWindowMs(),
            });
            /*
             * Logged rather than returned. What the notes say is derived from the
             * marks actually drawn (earlierSession.ts), so a count from here would
             * be a second answer to one question — and it would go stale the
             * moment a live report replaced one of these.
             */
            log.debug('[IntelReports] drew %d from storage, %d outside the window, %d unplaceable',
              hydrated.drawn, hydrated.skippedOutsideWindow, hydrated.skippedWithoutPlace);
          } catch (error) {
            log.warn('[IntelReports] Could not draw the last session\'s intel', error);
          }

          // Everything accepted before this subscription existed. Boot starts the
          // ingest, so on a first visit the relays may have answered already —
          // about eleven seconds earlier under a software rasterizer. Without this
          // those reports were delivered to nobody and skipped forever.
          nostrStarcomIntelIngest.replayAccepted((report) => {
            intelReportVisualizationService.addMarker(report);
          });

          // Boot already started this (startIntelIngestAtBoot). Idempotent, so
          // asking again costs nothing and covers a boot start that threw.
          await nostrStarcomIntelIngest.start();
        } catch (error) {
          log.warn('[IntelReports] Failed to start Nostr ingest for #starcom_intel', error);
        }
      })();

      void refreshMarkers();

      if (settingsRef.current.autoRefresh) {
        interval = setInterval(() => {
          if (mounted) {
            void refreshMarkers();
          }
        }, settingsRef.current.refreshInterval * 60 * 1000);
      }

      if (process.env.NODE_ENV === 'development') {
        diagnosticsInterval = setInterval(() => {
          if (!mounted) {
            return;
          }

          try {
            const vizStats = intelReportVisualizationService.getDebugStats();
            const loopStats = eventSystem.getLoopStats();
            const workspaceStats = intelWorkspaceManager.getPersistenceStats();
            // Read from the sink, which now owns the queue this diagnostic
            // watches. It used to read local variables in this hook; those left
            // with the queue, and a diagnostic reporting zeroes would have been
            // permanently reassuring rather than merely gone.
            const persistence = getIntelPersistenceMetrics();
            const now = Date.now();

            log.info('[IntelReports][Diag]', {
              visualization: vizStats,
              nostrMetrics: nostrStarcomIntelIngest.getMetrics(),
              nostrRelays: nostrStarcomIntelIngest.getRelayStatus(),
              eventLoop: loopStats,
              workspacePersistence: workspaceStats,
              persistenceBackpressure: {
                pending: persistence.pending,
                inFlight: persistence.inFlight,
                dropped: persistence.droppedFromQueue,
                maxPending: PERSIST_MAX_PENDING_SINK,
                maxConcurrent: PERSIST_MAX_CONCURRENT_SINK,
              },
            });

            if (lastDiagSample) {
              const elapsedSec = Math.max(1, (now - lastDiagSample.timestamp) / 1000);
              const processedDelta = Math.max(0, loopStats.processedEvents - lastDiagSample.eventLoopProcessed);
              const tickDelta = Math.max(0, loopStats.tickCount - lastDiagSample.eventLoopTicks);
              const flushDelta = Math.max(0, workspaceStats.flushCount - lastDiagSample.workspaceFlushes);
              const saveReqDelta = Math.max(0, workspaceStats.saveRequests - lastDiagSample.workspaceSaveRequests);
              const droppedDelta = Math.max(0, persistence.droppedFromQueue - lastDiagSample.droppedPersist);

              log.info('[IntelReports][DiagDelta]', {
                windowSec: Number(elapsedSec.toFixed(1)),
                eventLoop: {
                  processedDelta,
                  ticksDelta: tickDelta,
                  processedPerSec: Number((processedDelta / elapsedSec).toFixed(2)),
                  ticksPerSec: Number((tickDelta / elapsedSec).toFixed(2)),
                  avgEventsPerTick: tickDelta > 0 ? Number((processedDelta / tickDelta).toFixed(2)) : 0,
                  queueDepthNow: loopStats.queueDepth,
                  maxQueueDepthSeen: loopStats.maxQueueDepth,
                },
                workspacePersistence: {
                  saveRequestsDelta: saveReqDelta,
                  flushesDelta: flushDelta,
                  coalescedSavesDelta: Math.max(0, saveReqDelta - flushDelta),
                  flushesPerSec: Number((flushDelta / elapsedSec).toFixed(2)),
                  saveRequestsPerSec: Number((saveReqDelta / elapsedSec).toFixed(2)),
                  lastSerializedBytes: workspaceStats.lastSerializedBytes,
                },
                backpressure: {
                  droppedDelta,
                  droppedPerSec: Number((droppedDelta / elapsedSec).toFixed(3)),
                  pendingNow: persistence.pending,
                  inFlightNow: persistence.inFlight,
                },
              });

              if (droppedDelta > 0) {
                log.warn('[IntelReports][DiagWarn] Persistence backpressure drops detected', {
                  droppedDelta,
                  droppedPerSec: Number((droppedDelta / elapsedSec).toFixed(3)),
                  pendingNow: persistence.pending,
                  maxPending: PERSIST_MAX_PENDING_SINK,
                  inFlightNow: persistence.inFlight,
                  maxConcurrent: PERSIST_MAX_CONCURRENT_SINK,
                });
              }

              if (loopStats.queueDepth > lastDiagSample.eventLoopQueueDepth && persistence.pending > lastDiagSample.pendingPersistDepth) {
                queueGrowthStreak += 1;
              } else {
                queueGrowthStreak = 0;
              }

              if (queueGrowthStreak >= 3) {
                log.warn('[IntelReports][DiagWarn] Sustained queue growth trend', {
                  queueGrowthStreak,
                  eventLoopQueueDepth: loopStats.queueDepth,
                  pendingPersistDepth: persistence.pending,
                  eventLoopProcessedPerSec: Number((processedDelta / elapsedSec).toFixed(2)),
                  persistFlushesPerSec: Number((flushDelta / elapsedSec).toFixed(2)),
                });
              }
            }

            lastDiagSample = {
              timestamp: now,
              eventLoopProcessed: loopStats.processedEvents,
              eventLoopTicks: loopStats.tickCount,
              workspaceFlushes: workspaceStats.flushCount,
              workspaceSaveRequests: workspaceStats.saveRequests,
              droppedPersist: persistence.droppedFromQueue,
              eventLoopQueueDepth: loopStats.queueDepth,
              pendingPersistDepth: persistence.pending,
            };
          } catch {
            // Ignore diagnostics errors in dev-only interval.
          }
        }, DIAGNOSTICS_INTERVAL_MS);
      }
    } else if (mounted) {
      intelReportsSignatureRef.current = '';
      // Reads `intelReports` (the hook's own state) by closure, matching the
      // original effect exactly rather than "improving" it: `intelReports` is
      // not in this effect's dependency array, so this intentionally reads
      // whatever the value was when the effect was LAST (re)created — the
      // same snapshot-not-latest semantics the original Globe.tsx code had.
      // A functional setState updater would read the true latest value
      // instead, which is a real behavioral difference, not a neutral
      // refactor — caught before shipping this extraction.
      const hadVisibleReports = intelReports.length > 0;
      setIntelReports([]);
      // Real, user-visible explanation instead of a silent vanish — only
      // when there was actually something on screen to lose, so switching
      // into a non-Intel mode on first load doesn't show a confusing notice.
      if (hadVisibleReports) {
        setIntelClearedNotice(`Intel reports hidden — switched to ${visualizationMode.mode} mode`);
        if (intelClearedNoticeTimeoutRef.current) {
          clearTimeout(intelClearedNoticeTimeoutRef.current);
        }
        intelClearedNoticeTimeoutRef.current = setTimeout(() => setIntelClearedNotice(null), CLEARED_NOTICE_DURATION_MS);
      }
      setIntelTotalMatching(0);
      setIntelJudgedByWindow(0);
      setIntelPlacedByWritten(0);
      if (process.env.NODE_ENV === 'development') {
        log.debug('🧹 Intel Report 3D markers cleared - not in CyberCommand/IntelReports mode');
      }
    }

    return () => {
      mounted = false;
      if (interval) {
        clearInterval(interval);
      }
      if (diagnosticsInterval) {
        clearInterval(diagnosticsInterval);
      }
      currentLoadRequest = null;
      unsubscribe?.();
      // The globe stops LISTENING; it does not stop the ingest (decision D-F,
      // step 4.2). This cleanup runs on sub-mode change, layer change, timeline
      // scrub and any refresh-setting change, and stopping here killed a
      // boot-started ingest on the first layer switch with nothing to restart it.
      unsubscribeNostr?.();
    };
  }, [
    visualizationMode.mode,
    visualizationMode.subMode,
    isLayerActive,
    temporalState?.timeWindow,
    settings.autoRefresh,
    settings.refreshInterval,
    // A changed cap draws again: it was read once, when the layer started.
    cap,
    // And a changed lens choice (D-CT, CT5).
    lensKey,
  ]);

  return { intelReports, intelTotalMatching, intelHiddenByPriority, intelHiddenByLens, intelJudgedByWindow, intelPlacedByWritten, intelUntimed, intelClearedNotice, intelListening };
};

export default useGlobeIntelReportPipeline;
