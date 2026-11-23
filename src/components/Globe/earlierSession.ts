/**
 * Which marks on the globe came from storage rather than from this session
 * (decision D-F, step 4.4).
 *
 * ─── WHY ONE MODULE FOR ONE PREDICATE ──────────────────────────────────────
 *
 * Two things read it and they must never disagree: the sprite layer fades such a
 * mark, and the report notes say how many are faded and when the most recent was
 * received. A note that says three while four are faded is worse than no note,
 * so the rule and the session's start live here once rather than in both.
 *
 * ─── AND WHY IT IS DERIVED FROM THE MARKS ──────────────────────────────────
 *
 * Not from what hydration reported. A report drawn from storage and then
 * received live has its marker rebuilt with the newer receipt, so it stops
 * counting here by the same rule that stops it being faded — automatically, with
 * no flag to keep in step. Hydration's own counts would have gone stale the
 * moment the first live report replaced one.
 */
import type { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';

/**
 * When this page was loaded.
 *
 * Anything received before it predates this session. Captured at module load,
 * which is as close to "when this session began" as the app can observe.
 */
export const SESSION_STARTED_AT_MS = Date.now();

/**
 * Was this marker's copy received before this session began?
 *
 * A marker whose producer could not say is NOT from an earlier session as far as
 * this is concerned. Unmeasured is not the same claim as measured, and fading a
 * mark on a staleness that was never established would be the same defect
 * pointing the other way.
 */
export function isFromEarlierSession(
  marker: Pick<IntelReportOverlayMarker, 'receivedAtMs'>,
  sessionStartedAtMs: number = SESSION_STARTED_AT_MS,
): boolean {
  return typeof marker?.receivedAtMs === 'number' && marker.receivedAtMs < sessionStartedAtMs;
}

/**
 * How many marks predate this session, and the most recent of their receipts —
 * or null when none do, so a caller renders nothing rather than "0 marks".
 *
 * The MOST RECENT, because their receipts differ and naming one time for the
 * group would be a guess.
 */
export function earlierSessionSummary(
  markers: readonly Pick<IntelReportOverlayMarker, 'receivedAtMs'>[],
  sessionStartedAtMs: number = SESSION_STARTED_AT_MS,
): { count: number; newestReceivedAtMs: number } | null {
  let count = 0;
  let newest: number | null = null;
  for (const marker of markers ?? []) {
    if (!isFromEarlierSession(marker, sessionStartedAtMs)) continue;
    count += 1;
    const at = marker.receivedAtMs as number;
    if (newest === null || at > newest) newest = at;
  }
  return count > 0 && newest !== null ? { count, newestReceivedAtMs: newest } : null;
}
