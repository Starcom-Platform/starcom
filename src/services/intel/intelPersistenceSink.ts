/**
 * Everything the ingest accepts reaches the workspace, whatever screen is open.
 *
 * ─── WHY THIS LEFT THE GLOBE ───────────────────────────────────────────────
 *
 * Persistence used to live inside useGlobeIntelReportPipeline, subscribed to
 * the ingest from within the globe's effect. The ingest, since decision D-F
 * step 4.2, starts at BOOT and runs for the whole session on every screen — so
 * the two lifetimes stopped matching, and reports accepted outside the globe's
 * subscription were held in the ingest's memory and written nowhere.
 *
 * Reproduced on 2026-09-20 against a local relay with three events published
 * before the app opened: `accepted: 3`, `stored: 0`. The globe subscribed after
 * the boot ingest had already taken them, and `replayAccepted` re-draws without
 * re-persisting, so all three reached the marker layer and no list view. On
 * reload they were gone. The same gap swallowed anything arriving while the
 * person was in IntelDashboard, IntelAnalyzer, Cases or NetRunner — which is
 * most of the app.
 *
 * This matters more since the ingest began accepting reports with no place:
 * those can never appear on the globe, so storage is the ONLY way they reach a
 * reader. A placeless report that is not persisted does not exist.
 *
 * ─── IT REPLAYS, AND WHY THAT IS SAFE ──────────────────────────────────────
 *
 * On start it drains what the ingest already holds, because this can attach
 * after the first events have landed and those are exactly the ones the old
 * arrangement lost. `importReport` with `overwrite` is idempotent on report id,
 * so a report seen by both the replay and the live subscription is written
 * twice with the same content rather than duplicated.
 *
 * ─── BACKPRESSURE, LIFTED UNCHANGED ────────────────────────────────────────
 *
 * The bounds are the globe's, which were tuned against real relay bursts: at
 * most 12 writes per flush, 4 in flight, 240 queued, and the OLDEST pending
 * dropped when the queue is full — newest-wins, because a burst that outruns
 * storage should cost the stalest item rather than the freshest.
 *
 * What changed is that a failed write is COUNTED. It used to be swallowed by a
 * bare `.catch(() => {})` whose comment said the visualization path stays live
 * via addMarker — which stopped being true for anything with no place, and was
 * never true after a reload. A silent drop is how "accepted: 3, stored: 0"
 * survived this long.
 */
import { intelReportService } from './IntelReportService';
import { nostrStarcomIntelIngest } from './NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { createLogger } from '@utils/logger';
import { retiredKey } from '../nostr/publisherKeys';

const log = createLogger({ prefix: 'IntelPersistence' });

const FLUSH_INTERVAL_MS = 1500;
const MAX_PER_FLUSH = 12;
/** Exported: the globe's backpressure diagnostic reports depth against these. */
export const MAX_PENDING = 240;
export const MAX_CONCURRENT = 4;

export interface IntelPersistenceMetrics {
  /** Reports handed to storage successfully. */
  persisted: number;
  /** Writes storage refused. Counted because they used to vanish. */
  failed: number;
  /** Reports taken out of storage: replaced under another of their publisher's keys, or signed by a retired key. */
  removed: number;
  /** Reports dropped from the queue unwritten, because the queue was full. */
  droppedFromQueue: number;
  /** Waiting to be written right now. */
  pending: number;
  /** Writes in flight right now. */
  inFlight: number;
}

const metrics = { persisted: 0, failed: 0, droppedFromQueue: 0, removed: 0 };

/**
 * Read by the globe's backpressure diagnostic, which used to watch local
 * variables in useGlobeIntelReportPipeline. Those went away with the queue;
 * leaving the diagnostic reading zeroes would have turned a working warning
 * into a permanently reassuring one.
 */
export function getIntelPersistenceMetrics(): IntelPersistenceMetrics {
  return { ...metrics, pending: pending.size, inFlight: inFlight.size };
}

const pending = new Map<string, IntelReportUI>();
const inFlight = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function enqueue(report: IntelReportUI): void {
  if (!pending.has(report.id) && pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest) {
      pending.delete(oldest);
      metrics.droppedFromQueue += 1;
      if (metrics.droppedFromQueue % 25 === 1) {
        log.warn('storage is behind the relays; dropping the stalest queued report', {
          dropped: metrics.droppedFromQueue,
          pending: pending.size,
          inFlight: inFlight.size,
        });
      }
    }
  }
  pending.set(report.id, report);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer || !running) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!running || pending.size === 0) return;

    const slots = Math.max(0, MAX_CONCURRENT - inFlight.size);
    if (slots === 0) {
      scheduleFlush();
      return;
    }

    const batch: IntelReportUI[] = [];
    for (const report of pending.values()) {
      batch.push(report);
      pending.delete(report.id);
      if (batch.length >= Math.min(MAX_PER_FLUSH, slots)) break;
    }

    for (const report of batch) {
      if (inFlight.has(report.id)) continue;
      inFlight.add(report.id);
      void intelReportService
        .importReport(report, { strategy: 'overwrite' })
        .then(() => { metrics.persisted += 1; })
        .catch((error) => {
          /*
           * Counted and reported, not swallowed. The report is NOT requeued:
           * a store that refuses one write usually refuses the next, and a
           * retry loop against a broken store would spin for the session. The
           * count is what makes the loss visible instead.
           */
          metrics.failed += 1;
          if (metrics.failed % 25 === 1) {
            log.warn('a report from the relays could not be stored', {
              id: report.id, failed: metrics.failed, error,
            });
          }
        })
        .finally(() => { inFlight.delete(report.id); });
    }

    if (pending.size > 0) scheduleFlush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Takes a report out of storage, and out of the queue if it waits there. Quietly: the person deleted nothing, so no
 * Undo is offered for it (a withdrawn report offered back with Undo would put it on their screen again).
 */
function remove(id: string, why: string): void {
  pending.delete(id);
  void intelReportService
    .dropReadReport(id)
    .then(() => { metrics.removed += 1; })
    .catch((error) => {
      metrics.failed += 1;
      log.warn('a report could not be taken out of storage', { id, why, error });
    });
}

/**
 * Saved reports a retired key signed come out (decision MX31; Mecha Jono's key change, 2 Nov 2026). From the day a
 * publisher's next key speaks, nothing its exposed key signed is read; a returning visitor's device would otherwise go
 * on showing what it saved under that key.
 */
async function purgeRetiredReports(now: number = Date.now()): Promise<number> {
  const at = Math.floor(now / 1000);
  const retired = (await intelReportService.listReports()).filter((r) => typeof r.author === 'string' && retiredKey(r.author, at));
  for (const report of retired) remove(report.id, 'its key is retired');
  return retired.length;
}

/**
 * Attach to the ingest for the rest of the session.
 *
 * Returns a disposer for symmetry with startIntelIngestAtBoot; the app calls it
 * on teardown. Calling this twice is a no-op rather than a second subscription,
 * because two sinks would double every write.
 */
export function startIntelPersistence(): () => void {
  if (running) return () => {};
  running = true;

  const unsubscribe = nostrStarcomIntelIngest.subscribe((report) => enqueue(report));
  // Withdrawn by their publisher (D-RP, RP7), or replaced by a note carried to its publisher's new key: out of storage.
  const unwithdraw = nostrStarcomIntelIngest.onWithdrawn((ids) => { for (const id of ids) remove(id, 'withdrawn or replaced by its publisher'); });
  void purgeRetiredReports().catch((error) => log.warn('saved reports could not be checked for retired keys', { error }));
  // What already arrived, including anything the ingest took before this
  // attached — the exact set the globe-owned version dropped.
  nostrStarcomIntelIngest.replayAccepted((report) => enqueue(report));

  return () => {
    running = false;
    unsubscribe();
    unwithdraw();
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    pending.clear();
  };
}
