/**
 * useEcoHistoryPlayback — replays real captured eco-disaster snapshots
 * (EcoHistoryStore.ts, started in Phase 1 of this build specifically to unblock
 * this feature) as a scrubbable timeline, explicitly not simulated or
 * interpolated beyond what was actually captured: scrubbing to a given time shows
 * the most recent real snapshot at or before that time, verbatim, and playback
 * steps through real captured snapshot timestamps one at a time rather than
 * animating a smooth/interpolated position between them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ecoHistoryStore, type EcoHistorySnapshot } from '../services/history/EcoHistoryStore';
import { useTemporalStateOptional } from '../context/TemporalContext';
import { classifySeverity, type NaturalEvent, type SeverityBucket } from './useGeoEvents';
import type { NaturalEvent as RawNaturalEvent } from '../services/GeoEventsService';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'useEcoHistoryPlayback' });

// Real snapshots are stepped through one at a time (not a fixed real-time-scaled
// clock) — this is how long each step stays on screen before advancing.
const PLAYBACK_STEP_MS = 900;

/** Classifies raw stored events the same way useGeoEvents' live fetch path does, so replayed history renders through the identical severity-bucket pipeline. */
export function classifyHistoricalEvents(events: RawNaturalEvent[]): NaturalEvent[] {
  return events.map((event) => ({ ...event, severityBucket: classifySeverity(event) as SeverityBucket }));
}

/** Real snapshots are stored in insertion (chronological) order already, but this doesn't assume that. */
function sortByTimestamp(snapshots: EcoHistorySnapshot[]): EcoHistorySnapshot[] {
  return [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
}

/** The most recent real snapshot at or before `time`, or null if none qualify. Exported for direct unit testing. */
export function findSnapshotAtOrBefore(sortedSnapshots: EcoHistorySnapshot[], time: number): EcoHistorySnapshot | null {
  let result: EcoHistorySnapshot | null = null;
  for (const snapshot of sortedSnapshots) {
    if (snapshot.timestamp > time) break;
    result = snapshot;
  }
  return result;
}

/** The next real snapshot's timestamp strictly after `time`, or null at the end of real captured data. Exported for direct unit testing. */
export function nextSnapshotTime(sortedSnapshots: EcoHistorySnapshot[], time: number): number | null {
  for (const snapshot of sortedSnapshots) {
    if (snapshot.timestamp > time) return snapshot.timestamp;
  }
  return null;
}

/** The previous real snapshot's timestamp strictly before `time`, or null at the start of real captured data. Exported for direct unit testing. */
export function previousSnapshotTime(sortedSnapshots: EcoHistorySnapshot[], time: number): number | null {
  let result: number | null = null;
  for (const snapshot of sortedSnapshots) {
    if (snapshot.timestamp >= time) break;
    result = snapshot.timestamp;
  }
  return result;
}

// Real captured span, e.g. "3.2 days captured" / "45 minutes captured" — for
// the scrubber to show how much real history actually exists, not just where
// the slider currently sits. Exported for direct unit testing.
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatHistorySpan(minTime: number | null, maxTime: number | null): string | null {
  if (minTime === null || maxTime === null || maxTime <= minTime) return null;
  const spanMs = maxTime - minTime;
  if (spanMs >= MS_PER_DAY) return `${(spanMs / MS_PER_DAY).toFixed(1)} days captured`;
  if (spanMs >= MS_PER_HOUR) return `${(spanMs / MS_PER_HOUR).toFixed(1)} hours captured`;
  return `${Math.max(1, Math.round(spanMs / MS_PER_MINUTE))} minutes captured`;
}

export interface UseEcoHistoryPlaybackOptions {
  /** Only loads real snapshots from IndexedDB while true — avoids the read entirely when the scrubber UI is never opened. */
  enabled: boolean;
}

export interface UseEcoHistoryPlaybackState {
  loading: boolean;
  snapshotCount: number;
  minTime: number | null;
  maxTime: number | null;
  /** Real snapshot timestamps, sorted ascending — for rendering tick marks at each real captured point rather than treating the range as continuous. */
  snapshotTimes: number[];
  /** Real captured span as a human string ("3.2 days captured"), or null when there's nothing to show yet. */
  historySpanLabel: string | null;
  /** null = live mode (not scrubbing) — currentEvents is empty and the caller should fall back to its own live data. */
  scrubTime: number | null;
  setScrubTime: (time: number) => void;
  /** Steps to the previous/next real snapshot (keyboard control) — no-ops at either end of real captured data. */
  stepToPrevious: () => void;
  stepToNext: () => void;
  isPlaying: boolean;
  togglePlay: () => void;
  /** Returns to live mode (scrubTime null, playback stopped). */
  stop: () => void;
  currentSnapshot: EcoHistorySnapshot | null;
  currentEvents: NaturalEvent[];
  refresh: () => Promise<void>;
}

/**
 * Follows the shared time (decision D-E, settled 2026-09-14 for step 8,
 * docs/missions/01-architecture-decisions/time-model.md). While the shared time is
 * paused, the snapshot shown is the last one at or before the paused moment, and
 * scrubbing, stepping, playing and LIVE move the shared time. Eco kept a scrubber
 * time and a LIVE of its own, so the globe could replay one moment of eco disasters
 * while its reports and its badge showed another. Without a shared time state, as
 * when the hook is used on its own, it keeps a time of its own.
 */
export function useEcoHistoryPlayback({ enabled }: UseEcoHistoryPlaybackOptions): UseEcoHistoryPlaybackState {
  const temporal = useTemporalStateOptional();
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<EcoHistorySnapshot[]>([]);
  const [localScrubTime, setLocalScrubTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackTimerRef = useRef<number | null>(null);

  // The time eco shows: the shared moment while the shared time is paused, none while live.
  const scrubTime = temporal ? (temporal.isLive ? null : temporal.currentTime) : localScrubTime;
  const setSharedTime = temporal?.setCurrentTime;
  const setSharedLive = temporal?.setIsLive;
  const sharedIsLive = temporal?.isLive ?? true;

  /** Moves the time eco shows, and with it the shared time; null returns to live. */
  const moveTo = useCallback((time: number | null) => {
    if (setSharedTime && setSharedLive) {
      if (time !== null) setSharedTime(time);
      else if (!sharedIsLive) setSharedLive(true);
      return;
    }
    setLocalScrubTime(time);
  }, [setSharedTime, setSharedLive, sharedIsLive]);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const real = await ecoHistoryStore.getSnapshotsSince(0);
      setSnapshots(sortByTimestamp(real));
    } catch (error) {
      log.error('Failed to load real eco-history snapshots', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loadSnapshots();
  }, [enabled, loadSnapshots]);

  const setScrubTime = useCallback((time: number) => {
    moveTo(time);
  }, [moveTo]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    moveTo(null);
  }, [moveTo]);

  // Real step-through-captured-snapshots playback — advances to the next real
  // snapshot's timestamp every PLAYBACK_STEP_MS, pausing automatically once it
  // reaches the last real snapshot (a genuine end-of-data state, not a silent loop).
  useEffect(() => {
    if (!isPlaying) return;
    if (playbackTimerRef.current) window.clearTimeout(playbackTimerRef.current);

    const startFrom = scrubTime ?? snapshots[0]?.timestamp ?? null;
    if (startFrom === null) {
      setIsPlaying(false);
      return;
    }
    if (scrubTime === null) moveTo(startFrom);

    playbackTimerRef.current = window.setTimeout(() => {
      const next = nextSnapshotTime(snapshots, startFrom);
      if (next === null) {
        setIsPlaying(false);
        return;
      }
      moveTo(next);
    }, PLAYBACK_STEP_MS);

    return () => {
      if (playbackTimerRef.current) window.clearTimeout(playbackTimerRef.current);
    };
  }, [isPlaying, scrubTime, snapshots, moveTo]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Keyboard-driven stepping (see EcoHistoryScrubber.tsx) — snaps to the
  // adjacent real snapshot, not an arbitrary numeric range-input step.
  // "Previous" from live lands directly on the newest real snapshot (one real
  // step back into history). "Next" past the newest real snapshot returns to
  // live (scrubTime null) — a natural history-to-present timeline, and the
  // same destination the existing LIVE button already provides.
  const stepToPrevious = useCallback(() => {
    if (scrubTime === null) {
      const newest = snapshots[snapshots.length - 1]?.timestamp;
      if (newest !== undefined) moveTo(newest);
      return;
    }
    const prev = previousSnapshotTime(snapshots, scrubTime);
    if (prev !== null) moveTo(prev); // otherwise already at the oldest real snapshot
  }, [scrubTime, snapshots, moveTo]);

  const stepToNext = useCallback(() => {
    if (scrubTime === null) return; // already live, nothing after it
    moveTo(nextSnapshotTime(snapshots, scrubTime)); // null (live) once past the newest real snapshot
  }, [scrubTime, snapshots, moveTo]);

  // The events stay the same array until their snapshot changes. Built afresh on
  // every render, they re-ran the globe's eco effects after each one while the
  // shared time was paused, and those effects set state: a render loop that left the
  // globe unable to answer clicks. The snapshot needs nothing: the lookup returns
  // the same object from the list of snapshots.
  const currentSnapshot = scrubTime !== null ? findSnapshotAtOrBefore(snapshots, scrubTime) : null;
  const currentEvents = useMemo(
    () => (currentSnapshot ? classifyHistoricalEvents(currentSnapshot.data) : []),
    [currentSnapshot],
  );
  const minTime = snapshots[0]?.timestamp ?? null;
  const maxTime = snapshots[snapshots.length - 1]?.timestamp ?? null;

  return {
    loading,
    snapshotCount: snapshots.length,
    minTime,
    maxTime,
    snapshotTimes: snapshots.map((s) => s.timestamp),
    historySpanLabel: formatHistorySpan(minTime, maxTime),
    scrubTime,
    setScrubTime,
    stepToPrevious,
    stepToNext,
    isPlaying,
    togglePlay,
    stop,
    currentSnapshot,
    currentEvents,
    refresh: loadSnapshots
  };
}
