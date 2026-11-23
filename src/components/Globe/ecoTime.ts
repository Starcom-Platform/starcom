/**
 * When an eco disaster counts as recent (decision D-E, settled 2026-09-14 for step
 * 8, docs/missions/01-architecture-decisions/time-model.md).
 */

/** How long a quake counts as recent. */
export const RECENT_QUAKE_MS = 60 * 60 * 1000;

/**
 * A quake is recent when it happened within the hour before the time the globe
 * shows: the paused moment, or now while live. It was measured from the real
 * clock, even in a replay, so a replayed quake almost never got its shockwave
 * ring. A quake after the time shown is not recent, since nothing captured after
 * that time is drawn.
 */
export function isRecentEarthquake(event: { type: string; timestamp?: string }, shownAt: number): boolean {
  if (event.type !== 'earthquake' || !event.timestamp) return false;
  const at = Date.parse(event.timestamp);
  if (!Number.isFinite(at)) return false;
  const age = shownAt - at;
  return age >= 0 && age < RECENT_QUAKE_MS;
}
