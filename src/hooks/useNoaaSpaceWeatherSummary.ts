// useNoaaSpaceWeatherSummary.ts — NOAA's current scales and official alerts (see
// services/space-weather/noaaSummary.ts), for whatever is showing them. Fetches only
// while `enabled`: nothing loads it at startup, so a page that shows neither the
// Threat Assessment panel nor a collaboration session asks NOAA for nothing.
import { useEffect, useState } from 'react';
import {
  fetchNoaaSpaceWeatherSummary,
  NOAA_SUMMARY_TTL_MS,
  type NoaaSpaceWeatherSummary,
} from '../services/space-weather/noaaSummary';

export interface NoaaSummaryState {
  summary: NoaaSpaceWeatherSummary | null;
  loading: boolean;
  /** The last attempt's failure. A failed refresh keeps the last summary it had. */
  error: string | null;
}

export function useNoaaSpaceWeatherSummary(enabled: boolean): NoaaSummaryState {
  const [state, setState] = useState<NoaaSummaryState>({ summary: null, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      setState((s) => ({ ...s, loading: true }));
      fetchNoaaSpaceWeatherSummary().then(
        (summary) => { if (!cancelled) setState({ summary, loading: false, error: null }); },
        (e: unknown) => {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
        },
      );
    };
    load();
    const id = setInterval(load, NOAA_SUMMARY_TTL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  return state;
}
