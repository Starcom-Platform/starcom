/**
 * The quakes for the window shown (D-EQ, EQ1, EQ2, EQ14): USGS's feed that covers it and EMSC's query for it, merged
 * (quakeWindow.ts), or for a window older than the feeds reach the baked history and NOAA's atlas (quakeHistory.ts;
 * EQ3, EQ4, EQ15); classified and filtered as the live feed's are, by Eco Disasters' own settings. Read again every
 * five minutes while the window ends now; once for a paused one. whenReady waits for the read.
 */
import { useEffect, useMemo, useState } from 'react';
import { classifySeverity, type NaturalEvent, type SeverityBucket } from './useGeoEvents';
import { readQuakeWindow, type QuakeFeed, type QuakeWindow } from '../services/quakes/quakeWindow';
import { readHistoryWindow } from '../services/quakes/quakeHistory';
import type { NaturalEvent as RawNaturalEvent } from '../services/GeoEventsService';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'useQuakeWindow' });
const LIVE_REFRESH_MS = 5 * 60_000;

type Readiness = { ready: boolean; why?: string };
/** The window shown's read, and the other moment's in a comparison (D-CM, CM4), each its own. */
const readinessOf: Record<'main' | 'then', Readiness> = { main: { ready: true }, then: { ready: true } };
/** What whenReady asks of the quakes' window: false while it is being read. */
export function quakeWindowReadiness(): Readiness {
  return readinessOf.main;
}
/** What whenReady asks of the other moment's quakes, while two moments are compared. */
export function quakeThenWindowReadiness(): Readiness {
  return readinessOf.then;
}

export interface QuakeWindowState {
  /** The window's quakes, or null before the first read, while off, or for a window the feeds do not reach. */
  quakes: NaturalEvent[] | null;
  /** The window they were read for. */
  window: QuakeWindow | null;
  emscRead: boolean;
  /** How many of NOAA's significant quakes are in a history window: cards credit NCEI when any are drawn. */
  atlasCount: number;
  lastUpdated: number | null;
  error: string | null;
  loading: boolean;
}

export interface UseQuakeWindowOptions {
  enabled: boolean;
  window: QuakeWindow | null;
  /** Eco Disasters' Earthquakes setting: false draws none. */
  earthquakesOn?: boolean;
  severity?: { showMinor?: boolean; showMajor?: boolean; showCatastrophic?: boolean };
  /** Keep the last read's quakes while another window is read: a replay's next stretch overlaps the last (EQ7). */
  keepWhileReading?: boolean;
  /** Whose read whenReady waits on: the window shown's, or the other moment's in a comparison (D-CM). */
  slot?: 'main' | 'then';
}

const shownBySeverity = (bucket: SeverityBucket, severity: UseQuakeWindowOptions['severity']) =>
  !((bucket === 'minor' && severity?.showMinor === false)
    || (bucket === 'major' && severity?.showMajor === false)
    || (bucket === 'catastrophic' && severity?.showCatastrophic === false));

export function useQuakeWindow({ enabled, window, earthquakesOn = true, severity, keepWhileReading = false, slot = 'main' }: UseQuakeWindowOptions): QuakeWindowState {
  const [read, setRead] = useState<{ key: string; window: QuakeWindow; quakes: RawNaturalEvent[]; emscRead: boolean; atlasCount: number; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A live window moves with the clock: it is the same window until its feed changes.
  const key = window ? (window.live ? `${window.feed}:live` : `${window.feed}:${window.from}:${window.until}`) : '';
  const active = enabled && !!window;

  useEffect(() => {
    if (!active || !window) { readinessOf[slot] = { ready: true }; return undefined; }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const once = async (first: boolean) => {
      if (first) {
        readinessOf[slot] = { ready: false, why: slot === 'main' ? 'The quakes for the window shown had not been read' : "The quakes for the comparison's other moment had not been read" };
        setLoading(true);
      }
      try {
        // A live window is read up to the moment of the read.
        const span = window.live ? { ...window, from: Date.now() - (window.until - window.from), until: Date.now() } : window;
        if (span.feed === 'history') {
          const history = await readHistoryWindow(span);
          if (!live) return;
          setRead({ key, window: span, quakes: history.quakes, emscRead: false, atlasCount: history.atlasCount, at: Date.now() });
          setError(history.atlasRead ? null : "NOAA's atlas could not be read: USGS's catalogue alone is drawn");
          return;
        }
        const result = await readQuakeWindow(span as QuakeWindow & { feed: QuakeFeed }, { signal: controller.signal });
        if (!live) return;
        setRead({ key, window: span, quakes: result.quakes, emscRead: result.emscRead, atlasCount: 0, at: Date.now() });
        setError(result.emscRead ? null : "EMSC's quakes could not be read: USGS's alone are drawn");
      } catch (e) {
        if (!live) return;
        log.warn('The quakes for the window could not be read', { error: String(e) });
        setError(`USGS's quakes for the window could not be read: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (live) {
          setLoading(false);
          readinessOf[slot] = { ready: true };
          if (window.live) timer = setTimeout(() => { void once(false); }, LIVE_REFRESH_MS);
        }
      }
    };
    void once(true);
    return () => {
      live = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      readinessOf[slot] = { ready: true };
    };
    // The window object changes every render for a live window; its key says when it is another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, slot]);

  const current = !!read && (read.key === key || keepWhileReading);
  const quakes = useMemo(() => {
    if (!active || !read || !current) return null;
    if (!earthquakesOn) return [];
    return read.quakes
      .map((event) => ({ ...event, severityBucket: classifySeverity(event) as SeverityBucket }))
      .filter((event) => shownBySeverity(event.severityBucket, severity));
  }, [active, read, current, earthquakesOn, severity]);

  return {
    quakes,
    window: active && current ? read.window : null,
    emscRead: read?.emscRead ?? false,
    atlasCount: active && current ? read.atlasCount : 0,
    lastUpdated: read?.at ?? null,
    error: active ? error : null,
    loading: active && loading,
  };
}
