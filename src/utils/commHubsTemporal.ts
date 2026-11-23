// commHubsTemporal.ts — pure temporal filter predicate for CommHubs' historical
// cable-growth playback (Phase F). Kept separate from commHubsConnectivity.ts since it's
// a distinct concern (time, not per-country aggregation), mirroring this codebase's
// convention of small, single-purpose pure-function modules.
import type { SubmarineCable } from '../types/CommHubs';

/**
 * Whether a real cable would have been in service by the given year — used to filter the
 * globe to "what existed then" when the operator scrubs the TimeScrubber back
 * (useTemporalStateOptional's isLive === false). A cable with no known real rfsYear is
 * treated as NOT yet active at any scrubbed year — an honest unknown, not assumed
 * pre-existing, matching the same stance SubmarineCableService.ts's isPlanned derivation
 * already takes for the live (non-scrubbed) view.
 */
export function isCableActiveByYear(cable: Pick<SubmarineCable, 'rfsYear'>, year: number): boolean {
  return cable.rfsYear !== undefined && cable.rfsYear <= year;
}
