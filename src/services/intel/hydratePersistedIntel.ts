/**
 * Draw the last session's intel when the globe opens (decision D-F, step 4.4).
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * The globe is frequently empty. Measured across several runs on 2026-09-17:
 * the ingest asks five public relays, of which 2/5 and 3/5 were reachable at
 * different moments, relay.damus.io answered 503, and report delivery went
 * 7 → 2 → 0 between runs. A full layer audit drew ZERO Intel Reports marks in
 * all three views, so the app's flagship layer showed nothing and could not be
 * measured at all.
 *
 * The reports were already being persisted. Nothing read them back onto the
 * globe: `listReports()` is read by six other surfaces and by no globe path,
 * and a report a person created from the globe's own context menu vanished from
 * it on reload.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT TOUCH ───────────────────────────────────
 *
 * Placement. Decision D-E settled that a mark sits at its event time, or at its
 * written time when it states none, and says which. Receipt time is a third kind
 * of time and is only what the label says. Nothing here moves a mark.
 *
 * ─── AND WHY IT IS INJECTED RATHER THAN IMPORTED ───────────────────────────
 *
 * It takes `listReports` and `draw` rather than reaching for the service and the
 * visualization singleton. The interesting behaviour is which reports are drawn
 * and in what order, and that should be testable without a workspace, an
 * IndexedDB or a globe.
 */
import { reportToMarker } from './globe/reportMarker';
import { reportReceivedAtMs } from './recordTime';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

const asMs = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export interface HydratePersistedIntelDeps {
  listReports: () => Promise<IntelReportUI[]>;
  /** Hand a report to the globe, exactly as a live one is handed over. */
  draw: (report: IntelReportUI) => void;
  /**
   * The window the live relay query asks for.
   *
   * Bounding on the same span, and on the same time the query filters by — the
   * event's own — means the globe never shows something the live query would not
   * have requested. It is the ingest's own number rather than a second one that
   * could drift from it.
   */
  sinceWindowMs: number;
  now?: number;
}

export interface HydratePersistedIntelResult {
  drawn: number;
  skippedOutsideWindow: number;
  skippedWithoutPlace: number;
  /** The most recent receipt among what was drawn, for the label to print. */
  newestReceivedAtMs: number | null;
}

export async function hydratePersistedIntel({
  listReports, draw, sinceWindowMs, now = Date.now(),
}: HydratePersistedIntelDeps): Promise<HydratePersistedIntelResult> {
  const result: HydratePersistedIntelResult = {
    drawn: 0, skippedOutsideWindow: 0, skippedWithoutPlace: 0, newestReceivedAtMs: null,
  };

  let stored: IntelReportUI[];
  try {
    stored = await listReports();
  } catch {
    // The live ingest is the primary path; this is a convenience on top of it and
    // must never take the globe down with it.
    return result;
  }
  if (!Array.isArray(stored)) return result;

  const cutoff = now - sinceWindowMs;
  const drawable: Array<{ report: IntelReportUI; eventAtMs: number }> = [];

  for (const report of stored) {
    try {
      // reportToMarker is already the one authority on whether the globe can place
      // a report: it returns null for a missing or unusable coordinate.
      if (!reportToMarker(report)) {
        result.skippedWithoutPlace += 1;
        continue;
      }
      const eventAtMs = asMs(report.createdAt);
      if (eventAtMs === null) {
        result.skippedWithoutPlace += 1;
        continue;
      }
      if (eventAtMs < cutoff) {
        result.skippedOutsideWindow += 1;
        continue;
      }
      drawable.push({ report, eventAtMs });
    } catch {
      // One unreadable record must not cost the others.
      result.skippedWithoutPlace += 1;
    }
  }

  /*
   * Oldest first. The draw path unshifts, and the pipeline caps how many marks
   * it keeps — so drawing newest first would leave the oldest at the front of the
   * cache and push the newest out past the cap.
   */
  drawable.sort((a, b) => a.eventAtMs - b.eventAtMs);

  for (const { report } of drawable) {
    try {
      draw(report);
      result.drawn += 1;
      const receivedAt = reportReceivedAtMs(report);
      if (receivedAt !== null && (result.newestReceivedAtMs === null || receivedAt > result.newestReceivedAtMs)) {
        result.newestReceivedAtMs = receivedAt;
      }
    } catch {
      // Same rule: one report the globe refuses must not cost the rest.
    }
  }

  return result;
}
