// useRealConflictEvents.ts — shared real-data fetch for ConflictZones' war-events layer.
// GDELTEventService.getRealConflictEvents derives from the same shared module-level cache
// as getRealDiplomaticEvents (one GDELT fetch per CACHE_TTL_MS cycle serves both
// consumers), so this hook's own periodic refresh (below) costs nothing extra beyond that
// shared fetch even when DiplomaticEvents and ConflictZones are both enabled at once —
// whichever of the two polls first each cycle populates the cache for the other.
//
// Built on useRealDataLayer, mirroring useRealDiplomaticEvents.ts — see that file's header
// for why a bare one-shot fetch-on-enable wasn't enough for a layer meant to show current
// state to an operative watching it for an extended session.
import { getRealConflictEvents, type RealGdeltEvent, type GdeltEventSet, CACHE_TTL_MS } from '../../services/geopolitical/GDELTEventService';
import { useRealDataLayer } from './useRealDataLayer';

export interface UseRealConflictEventsResult {
  events: RealGdeltEvent[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  /** When the data is from — the snapshot's own time, not when it was read. Null until loaded. */
  asOf: number | null;
  /** Where the snapshot's day starts (D-DP, DP15). Null until loaded. */
  from: number | null;
  pausedByBudget: boolean;
}

/*
 * Measured on 2026-09-11: 3,018 conflict events in one day. The 5,000 this was sat
 * under twice that, so a busy day — which is when this layer matters — could trip it
 * and stop the refresh. About three times the measured day now, as the diplomatic
 * budget is: a guard against a pathological file, not against a normal one.
 */
const MAX_REAL_EVENTS_BUDGET = 10_000;
/** One empty list, so an unloaded layer does not hand consumers a new array every render. */
const NO_EVENTS: RealGdeltEvent[] = [];

export function useRealConflictEvents(enabled: boolean): UseRealConflictEventsResult {
  const { data, loading, error, lastUpdated, pausedByBudget } = useRealDataLayer<GdeltEventSet | null>({
    key: 'geopolitical-conflict-events-fetch',
    enabled,
    fetchFn: getRealConflictEvents,
    intervalMs: CACHE_TTL_MS,
    initialValue: null,
    resourceMode: 'GeoPolitical.ConflictZones',
    countRecords: (set) => set?.events.length ?? 0,
    budget: { maxVectors: MAX_REAL_EVENTS_BUDGET }
  });

  return { events: data?.events ?? NO_EVENTS, asOf: data?.asOf ?? null, from: data?.from ?? null, loading, error, lastUpdated, pausedByBudget };
}
