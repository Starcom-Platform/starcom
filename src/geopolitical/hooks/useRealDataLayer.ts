// useRealDataLayer.ts — shared real-data-fetch hook, the GeoPolitical prototype of a
// wider "one data-handling architecture" the codebase has reached for piecemeal across
// several prior passes: pollerRegistry (generic scheduling — backoff, jitter, in-flight
// dedup, tab-visibility throttling), VisualizationResourceMonitor (per-mode resource
// budgets + warnings), and each layer's own bespoke {data, fetchedAt} + TTL cache. All
// three already existed; almost nothing used pollerRegistry or the resource monitor. This
// hook is the first thing that wires a real GeoPolitical layer through both at once,
// replacing the "fetch once on enable, never again" shape every one of this session's
// four real-data hooks (useRealDiplomaticEvents/useRealConflictEvents/
// useRealDisplacementData/useResourceZonePercentiles) previously had — a real operative
// watching one of these layers for hours would otherwise be looking at hour-one data with
// no signal it had gone stale.
//
// What this adds over a bare useEffect fetch-on-enable:
//   - Periodic background refresh via pollerRegistry, not a one-shot fetch — intervalMs
//     should match the underlying service's own module-level cache TTL (see each
//     migrated hook's call site), so this never fetches more often than the service would
//     actually return fresh data for, but does refresh right when it goes stale.
//   - A fetch timeout (pollerRegistry's own timeoutMs/AbortSignal), which none of the
//     bespoke one-shot hooks had — an indefinitely-hanging fetch no longer silently pins
//     `loading: true` forever.
//   - Real backpressure, not just observability: if this layer's real record count trips
//     its VisualizationResourceMonitor budget, its poller stops (via the derived
//     `enabled` composition below) instead of continuing to fetch/re-render at the same
//     cadence regardless of load. Reversible — toggling the caller's own `enabled` off
//     then on clears the pause, the same "toggle to reset" affordance every GeoPolitical
//     overlay already has.
//   - A uniform return shape (`data`, `loading`, `error`, `lastUpdated`, `pausedByBudget`)
//     every consumer can render consistently, instead of each hook only exposing
//     `{data, loading, error}` with no staleness or backpressure signal at all.
//
// One key is one poller and ONE copy of the data, whoever subscribes. Each hook kept its own
// copy, while pollerRegistry hands a second subscriber of a key the first one's handle: only
// the first subscriber's fetch ever ran, so the others never got the data, and whichever
// unmounted first stopped the key for all of them. The Geopolitical layers popup read nothing
// while the globe drew Diplomacy, and closing it stopped the globe's refresh. The data now lives
// in `shared`, by key; the poller runs while any enabled subscriber holds it.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pollerRegistry } from '../../services/pollerRegistry';
import { visualizationResourceMonitor, type VisualizationModeKey, type ResourceBudget } from '../../services/visualization/VisualizationResourceMonitor';

export interface UseRealDataLayerOptions<T> {
  /** Unique poller key. Stable across renders — passing a changing string re-registers a
   * fresh poller on every render, which is never what's wanted here. */
  key: string;
  enabled: boolean;
  fetchFn: () => Promise<T>;
  /** Refresh cadence — should match/slightly exceed the underlying service's own cache
   * TTL (see each service's own CACHE_TTL_MS), not be invented independently of it. */
  intervalMs: number;
  initialValue: T;
  /** How long a single fetch may run before being aborted. Defaults to 20s — generous
   * for these real network calls (the slowest observed this session, GDELT's full 24h
   * window, completes in ~1-2s), but bounded, unlike the bespoke hooks this replaces,
   * which had no timeout at all and could pin `loading: true` forever on a hung request. */
  timeoutMs?: number;
  /** Resource-monitor integration — omit entirely to skip it (e.g. a future baked/static
   * consumer with no meaningful per-fetch "record count"). */
  resourceMode?: VisualizationModeKey;
  countRecords?: (data: T) => number;
  budget?: ResourceBudget;
  /** Which ModeResourceSnapshot field to record into — 'vectors' (default) or
   * 'pipelineVectors'. Two independent data sources can legitimately share one
   * resourceMode (e.g. ConflictZones' GDELT war events and UNHCR humanitarian-crisis
   * counts both live under 'GeoPolitical.ConflictZones'); recording into different
   * fields keeps their budgets/warnings distinguishable instead of one overwriting the
   * other's snapshot field. */
  metricKind?: 'vectors' | 'pipelineVectors';
}

export interface UseRealDataLayerResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last successful fetch, or null before the first one ever completes.
   * The one piece of staleness signal none of the bespoke one-shot hooks exposed at all. */
  lastUpdated: number | null;
  /** True once this layer's own resource-monitor budget tripped and its poller was
   * stopped in response — real backpressure, not just a logged warning. Cleared the next
   * time the caller's own `enabled` flips off then on. */
  pausedByBudget: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

interface SharedSnapshot {
  /** Undefined until a fetch first succeeds. */
  data: unknown;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

interface SharedEntry {
  snapshot: SharedSnapshot;
  listeners: Set<() => void>;
  /** The enabled subscribers holding the poller. */
  holders: number;
  /** The fetch the poller runs: the latest holder's, all of one key's being the same. */
  run: (signal: AbortSignal) => Promise<void>;
}

const NEVER_FETCHED: SharedSnapshot = { data: undefined, loaded: false, loading: false, error: null, lastUpdated: null };
const shared = new Map<string, SharedEntry>();

function entryFor(key: string): SharedEntry {
  let entry = shared.get(key);
  if (!entry) {
    entry = { snapshot: NEVER_FETCHED, listeners: new Set(), holders: 0, run: async () => {} };
    shared.set(key, entry);
  }
  return entry;
}

function publish(entry: SharedEntry, change: Partial<SharedSnapshot>): void {
  entry.snapshot = { ...entry.snapshot, ...change };
  for (const listener of entry.listeners) listener();
}

export function useRealDataLayer<T>({
  key,
  enabled,
  fetchFn,
  intervalMs,
  initialValue,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  resourceMode,
  countRecords,
  budget,
  metricKind = 'vectors'
}: UseRealDataLayerOptions<T>): UseRealDataLayerResult<T> {
  const [pausedByBudget, setPausedByBudget] = useState(false);
  const entry = entryFor(key);
  const snapshot = useSyncExternalStore(
    (listener) => { entry.listeners.add(listener); return () => { entry.listeners.delete(listener); }; },
    () => entry.snapshot,
    () => entry.snapshot,
  );

  // Budgets are set once, not re-applied on every fetch — cheap, and mirrors how
  // Globe.tsx sets EcologicalDisasters' budget once via its own ref guard.
  const budgetSetRef = useRef(false);
  useEffect(() => {
    if (!resourceMode || !budget || budgetSetRef.current) return;
    visualizationResourceMonitor.setBudgets(resourceMode, budget);
    budgetSetRef.current = true;
  }, [resourceMode, budget]);

  // Re-enabling always clears a prior budget-triggered pause — the same reversible
  // "toggle off then on to reset" affordance every GeoPolitical overlay already has via
  // useSimpleGeoOverlayLayer's own disable/re-enable cycle.
  useEffect(() => {
    if (enabled) setPausedByBudget(false);
  }, [enabled]);

  // A budget warning stops this layer's poller by driving the `active` composition
  // below to false — real backpressure. (Deliberately not calling pollerRegistry.stop()
  // directly here: composing through `active` keeps the holding effect below the single
  // place that owns register/stop lifecycle, so there's only one code path that can ever
  // start a poller back up.)
  useEffect(() => {
    if (!resourceMode) return;
    const off = visualizationResourceMonitor.onWarning((snapshot) => {
      if (snapshot.mode !== resourceMode) return;
      setPausedByBudget(true);
    });
    // Block body, not `return off` — onWarning's unsubscribe returns Set.delete()'s
    // boolean, which isn't a valid useEffect cleanup return type (must be void).
    return () => { off(); };
  }, [resourceMode]);

  // The fetch, with this render's options: the poller calls whichever holder set it last.
  const fetchRef = useRef<(signal: AbortSignal) => Promise<void>>(async () => {});
  fetchRef.current = async () => {
    publish(entry, { loading: true });
    try {
      const result = await fetchFn();
      publish(entry, { data: result, loaded: true, lastUpdated: Date.now(), error: null });
      if (resourceMode && countRecords) {
        const count = countRecords(result);
        if (metricKind === 'pipelineVectors') {
          visualizationResourceMonitor.recordPipelineVectors(resourceMode, { count });
        } else {
          visualizationResourceMonitor.recordVectors(resourceMode, { count });
        }
      }
    } catch (e) {
      // Deliberately does not clear `data` — a transient failure should keep showing
      // the last real, successfully-fetched value rather than blanking the layer.
      publish(entry, { error: e instanceof Error ? e.message : String(e) });
    } finally {
      publish(entry, { loading: false });
    }
  };

  const active = enabled && !pausedByBudget;
  useEffect(() => {
    if (!active) return;
    const held = entryFor(key);
    held.run = (signal) => fetchRef.current(signal);
    held.holders += 1;
    if (held.holders === 1) {
      pollerRegistry.register(key, (signal) => held.run(signal), { intervalMs, immediate: true, timeoutMs });
    }
    return () => {
      held.holders -= 1;
      if (held.holders === 0) pollerRegistry.stop(key);
    };
    // The options are read when the poller is registered, as useRegisteredPoller read them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  // A subscriber that is not enabled shows nothing of it, as if never fetched: a popup must
  // not call a layer that is off "Live" because another view of it once fetched.
  const seen = active ? snapshot : NEVER_FETCHED;
  return {
    data: seen.loaded ? (seen.data as T) : initialValue,
    loading: seen.loading,
    error: seen.error,
    lastUpdated: seen.lastUpdated,
    pausedByBudget,
  };
}
