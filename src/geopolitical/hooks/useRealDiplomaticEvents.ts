// useRealDiplomaticEvents.ts — shared real-data fetch for DiplomaticEvents. Both the 3D
// layer (useDiplomaticEvents3D.ts) and any country-context UI (CountryInfoPopup.tsx,
// GlobalHeader.tsx's country search) need the exact same real GDELT events, or the UI
// could claim an event the scene isn't actually showing.
//
// Built on useRealDataLayer (the shared poller/backpressure prototype) rather than a bare
// one-shot useEffect — the previous version only ever fetched once per enable and never
// again, so a real operative leaving DiplomaticEvents on for hours would silently keep
// looking at the data from the moment they turned it on. intervalMs matches
// GDELTEventService's own CACHE_TTL_MS exactly, so this refreshes right when the
// underlying cache goes stale, never more often than that cache would return anything new.
import { getRealDiplomaticEvents, type RealGdeltEvent, type GdeltEventSet, CACHE_TTL_MS } from '../../services/geopolitical/GDELTEventService';
import { useRealDataLayer } from './useRealDataLayer';

export interface UseRealDiplomaticEventsResult {
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
 * A guard against a pathological file (a GDELT schema change matching far more rows
 * than expected), not against a normal day. This was 5,000, described as "set
 * generously above any realistic real count" — without the count. Measured on
 * 2026-09-11: 13,020 cooperative events in one day, so a normal day tripped it and
 * stopped the refresh. It now sits about three times the measured day.
 */
const MAX_REAL_EVENTS_BUDGET = 40_000;
/** One empty list, so an unloaded layer does not hand consumers a new array every render. */
const NO_EVENTS: RealGdeltEvent[] = [];

export function useRealDiplomaticEvents(enabled: boolean): UseRealDiplomaticEventsResult {
  const { data, loading, error, lastUpdated, pausedByBudget } = useRealDataLayer<GdeltEventSet | null>({
    key: 'geopolitical-diplomatic-events-fetch',
    enabled,
    fetchFn: getRealDiplomaticEvents,
    intervalMs: CACHE_TTL_MS,
    initialValue: null,
    resourceMode: 'GeoPolitical.DiplomaticEvents',
    countRecords: (set) => set?.events.length ?? 0,
    budget: { maxVectors: MAX_REAL_EVENTS_BUDGET }
  });

  return { events: data?.events ?? NO_EVENTS, asOf: data?.asOf ?? null, from: data?.from ?? null, loading, error, lastUpdated, pausedByBudget };
}
