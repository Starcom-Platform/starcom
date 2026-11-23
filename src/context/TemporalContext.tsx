/**
 * TemporalContext — Shared temporal state for every screen.
 *
 * This context is the single source of truth for "what time is the operator
 * looking at?" Every time-aware service in Starcom already accepts a time
 * range filter:
 *
 *   - CyberCommandDataService.applyFilters({ timeRange })
 *   - IntelReportVisualizationService({ dateRange })
 *   - timelineAdapter (between / before / after operators)
 *
 * The TimeScrubber and the timeline write to this context. Any component or hook
 * that needs to filter by time reads from it. While live, currentTime tracks
 * Date.now() and there is no window. When the operator pauses, clicks or drags,
 * isLive becomes false, currentTime is the moment they chose, and timeWindow is
 * the window they selected (decision D-E).
 *
 * Usage:
 *   const { currentTime, isLive, timeWindow } = useTemporalState();
 *   // timeWindow is the selected { start: Date, end: Date }, or null while live
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { utcStepContaining } from '../utils/utcTime';

const CURSOR_KEY = 'starcom.temporalCursor.v1';
/** Beyond this, a restored cursor is archaeology rather than where you left off. */
const CURSOR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface StoredCursor {
  at: number;
  window: { start: number; end: number };
}

/**
 * Pausing opens the last day (owner, 1 Nov 2026: critique-2026-11-01 OR27): the 24 hours up to now. The time bar
 * opens the same when dragged from live (lastDayTo). A moment chosen on a timeline still takes the step containing
 * it, as decision D-E has it.
 */
export const LEAVING_LIVE_MS = 24 * 60 * 60 * 1000;
export const lastDayTo = (at: number) => ({ start: at - LEAVING_LIVE_MS, end: at });

/** The UTC day containing a moment: the window when there is no span to take a step from. */
const dayContaining = (at: number) => utcStepContaining(at, 0, 0);

function restoreCursor(): StoredCursor | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CURSOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; savedAt?: number; start?: number; end?: number };
    if (typeof parsed?.at !== 'number' || typeof parsed?.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > CURSOR_MAX_AGE_MS) return null;
    // A cursor stored before windows existed holds only its moment.
    const window = typeof parsed.start === 'number' && typeof parsed.end === 'number' && parsed.end > parsed.start
      ? { start: parsed.start, end: parsed.end }
      : dayContaining(parsed.at);
    return { at: parsed.at, window };
  } catch {
    return null;
  }
}

function persistCursor(cursor: StoredCursor | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (cursor === null) localStorage.removeItem(CURSOR_KEY);
    else localStorage.setItem(CURSOR_KEY, JSON.stringify({
      at: cursor.at, start: cursor.window.start, end: cursor.window.end, savedAt: Date.now(),
    }));
  } catch {
    // Storage unavailable — the cursor simply will not survive, which is the
    // pre-existing behaviour and not worth failing over.
  }
}

/**
 * One ticking clock for the app (decision D-E).
 *
 * Every surface that shows the moving time reads it, instead of each keeping an
 * interval of its own: the scrubber, the timeline and the corner clock each had
 * one. It ticks on each whole second while anything is listening and stops when
 * nothing is. It lives outside the provider, so a surface rendered without one
 * still shows the right time.
 */
const CLOCK_TICK_MS = 1000;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setTimeout> | null = null;
let clockNow = 0;

const wholeSecondNow = () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;

function scheduleClockTick(): void {
  // To the next whole second, so a readout with seconds changes when the second does.
  clockTimer = setTimeout(() => {
    clockNow = wholeSecondNow();
    clockListeners.forEach((notify) => notify());
    scheduleClockTick();
  }, CLOCK_TICK_MS - (Date.now() % CLOCK_TICK_MS));
}

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = wholeSecondNow();
    scheduleClockTick();
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearTimeout(clockTimer);
      clockTimer = null;
    }
  };
}

/** Now, to the second. The caller re-renders each second while it is mounted. */
export function useClockNow(): number {
  return useSyncExternalStore(subscribeClock, () => (clockTimer ? clockNow : wholeSecondNow()), wholeSecondNow);
}

export interface TemporalState {
  /** The operator's position (ms since epoch): now while live, the paused moment otherwise. */
  currentTime: number;
  /** Whether we're tracking real-time */
  isLive: boolean;
  /** The full range of loaded intel events (ms since epoch) */
  dataRange: { start: number; end: number } | null;
  /**
   * The selected window while paused, null while live (decision D-E): the axis
   * step containing the moment a click or pause chose, or a dragged range.
   */
  timeWindow: { start: Date; end: Date } | null;
}

export interface TemporalActions {
  /** Pause at a moment (exits live mode), selecting the axis step that contains it */
  setCurrentTime: (time: number) => void;
  /** Toggle or set live mode; pausing selects the axis step containing now */
  setIsLive: (isLive: boolean) => void;
  /**
   * Select a window by its two ends, in either order (exits live mode); the moment
   * becomes its end, or `at` when given, kept inside it: a range read from a moment
   * in it, as tonight's card reads tonight from its start (raver-nights.md, RN10)
   */
  setTimeWindow: (start: number, end: number, at?: number) => void;
  /** Set the data range from loaded events */
  setDataRange: (start: number, end: number) => void;
}

export type TemporalContextValue = TemporalState & TemporalActions;

const TemporalContext = createContext<TemporalContextValue | null>(null);

/**
 * Hook to read and update the shared temporal state.
 * Must be used inside <TemporalProvider>.
 */
export function useTemporalState(): TemporalContextValue {
  const ctx = useContext(TemporalContext);
  if (!ctx) {
    throw new Error('useTemporalState must be used within a TemporalProvider');
  }
  return ctx;
}

/**
 * Optional safe hook that returns null if no provider is present.
 * Useful for components that may render outside the HUD.
 */
export function useTemporalStateOptional(): TemporalContextValue | null {
  return useContext(TemporalContext);
}

interface TemporalProviderProps {
  children: React.ReactNode;
}

/**
 * Provider of the shared temporal state. Mounted once, in App, above every screen
 * and every popup (decision D-E): inside the globe's HUD layout, IntelAnalyzer
 * could not read the window the globe showed.
 */
export const TemporalProvider: React.FC<TemporalProviderProps> = ({ children }) => {
  /**
   * Scrubbed position survives a reload; live mode does not need to.
   *
   * Losing the cursor on refresh silently returns the operator to "now" while
   * they are still reading a moment in the past — the surface changes meaning
   * without saying so. Only a SCRUBBED position is restored: live mode is the
   * correct default for a fresh session, and restoring "live" would be
   * restoring nothing.
   *
   * The stored position is discarded if it is older than a day. A cursor
   * restored from last week is not where the operator left off, it is
   * archaeology, and silently resuming there would be its own
   * misrepresentation.
   */
  const [restored] = useState(restoreCursor);
  const [currentTime, setCurrentTimeInternal] = useState<number>(() => restored?.at ?? Date.now());
  const [isLive, setIsLiveInternal] = useState<boolean>(() => restored === null);
  // The selected window, kept as its two ends once chosen, so data arriving later
  // cannot silently widen or narrow what the operator selected.
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(() => restored?.window ?? null);
  const [dataRange, setDataRangeInternal] = useState<{ start: number; end: number } | null>(null);
  const dataRangeRef = useRef(dataRange);
  useEffect(() => {
    dataRangeRef.current = dataRange;
  }, [dataRange]);

  /** Pause at a moment with a window, and keep both. */
  const pauseAt = useCallback((at: number, window: { start: number; end: number }) => {
    setCurrentTimeInternal(at);
    setSelection(window);
    // Leaving live mode, so the position is worth keeping.
    setIsLiveInternal(false);
    persistCursor({ at, window });
  }, []);

  /**
   * The axis step containing a moment (decision D-E): the calendar step the
   * timeline axis shows for the span of the data, or the UTC day before any data
   * has given a span. It was a fixed ±12 hours, whatever span was on screen.
   */
  const stepContaining = useCallback((at: number) => {
    const span = dataRangeRef.current;
    return span ? utcStepContaining(at, span.start, span.end) : dayContaining(at);
  }, []);

  const setCurrentTime = useCallback((time: number) => {
    pauseAt(time, stepContaining(time));
  }, [pauseAt, stepContaining]);

  const setTimeWindow = useCallback((start: number, end: number, at?: number) => {
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    // A range with no width is a moment.
    if (!(to > from)) {
      pauseAt(from, stepContaining(from));
      return;
    }
    // A dragged range: the moment is its end, where the reading stops; or the moment asked, inside it.
    pauseAt(at === undefined ? to : Math.min(Math.max(at, from), to), { start: from, end: to });
  }, [pauseAt, stepContaining]);

  const setIsLive = useCallback((live: boolean) => {
    const now = Date.now();
    if (!live) {
      // Pausing stops at this moment, showing the day up to it (OR27); it used to stop at the moment the app
      // loaded, because the live position never moved (decision D-E).
      pauseAt(now, lastDayTo(now));
      return;
    }
    setIsLiveInternal(true);
    setCurrentTimeInternal(now);
    setSelection(null);
    // Returning to live is a deliberate "stop looking at the past", so the stored
    // position is cleared rather than left to resurrect on reload.
    persistCursor(null);
  }, [pauseAt, stepContaining]);

  /**
   * Idempotent by construction.
   *
   * This allocated a fresh object on every call, so a caller that published the
   * same bounds each render re-rendered every consumer of this context, which
   * re-ran the caller's effect, and so on — React eventually gave up with
   * "Maximum update depth exceeded". Returning the previous object unchanged
   * lets React bail out of the render instead.
   */
  const setDataRange = useCallback((start: number, end: number) => {
    setDataRangeInternal((prev) =>
      prev && prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, []);

  // The window services filter by: the selection while paused. Live mode has no
  // selection, because every way into it clears one, so it has no window.
  // It was ±12 hours around the moment, clamped to the data (decision D-E).
  const timeWindow = useMemo(() => {
    if (!selection) return null;
    return { start: new Date(selection.start), end: new Date(selection.end) };
  }, [selection]);

  const value = useMemo<TemporalContextValue>(() => ({
    // Now while live, read when asked, so nothing reading the position in live mode
    // gets the moment the app loaded. Surfaces that show the moving time re-render
    // from useClockNow; the rest of the app does not re-render every second.
    get currentTime() {
      return isLive ? Date.now() : currentTime;
    },
    isLive,
    dataRange,
    timeWindow,
    setCurrentTime,
    setIsLive,
    setTimeWindow,
    setDataRange,
  }), [currentTime, isLive, dataRange, timeWindow, setCurrentTime, setIsLive, setTimeWindow, setDataRange]);

  return (
    <TemporalContext.Provider value={value}>
      {children}
    </TemporalContext.Provider>
  );
};
