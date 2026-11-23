/**
 * useTimelineData — the timeline's events, from one read that every view shares.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): every view
 * shows the same events. Each caller used to load its own copy once, when it
 * mounted, and was never told about new events. Measured in the running app on
 * 2026-09-13: on a first visit the scrubber, mounted before the sample data was
 * written, said "0 events" for the whole session, while the timeline panel, opened
 * later, said 31.
 *
 * The read starts when the first view mounts, runs again whenever the workspace
 * reports a change, and is dropped when the last view unmounts. Counts come from
 * the same read as the list (timelineStats), so a view cannot count differently
 * from what it draws. Filters are gone from this hook, which no caller passed: a
 * read shared by every view cannot also be filtered for one of them. The adapter
 * still takes filters.
 */

import { useSyncExternalStore } from 'react';
import {
  timelineAdapter,
  TimelineData,
  TimelineStats,
  TimelineEventInput
} from '../adapters/timelineAdapter';
import { timelineStats } from '../utils/timelineSummary';

export interface UseTimelineDataResult {
  // Timeline data
  timelineData: TimelineData;
  stats: TimelineStats;
  loading: boolean;
  error: string | null;

  // Actions
  /** Reads again now. The shared read already follows every change; SYNC asks anyway. */
  refreshData: () => Promise<void>;
  addEvent: (event: Partial<TimelineEventInput>) => Promise<string | null>;
  updateEvent: (id: string, updates: Partial<TimelineEventInput>) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<boolean>;
}

type TimelineSnapshot = Pick<UseTimelineDataResult, 'timelineData' | 'stats' | 'loading' | 'error'>;

const NOT_YET_READ: TimelineSnapshot = {
  timelineData: { items: [], groups: [] },
  stats: timelineStats([]),
  loading: true,
  error: null,
};

/** Changes come in bursts (seeding writes dozens of items), so read at most this often. */
const READ_AFTER_CHANGE_MS = 100;

let snapshot = NOT_YET_READ;
const views = new Set<() => void>();
let stopListening: (() => void) | null = null;
let readTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let readAgain = false;
/** Moves on when the last view unmounts, so a read that finishes after that is dropped. */
let generation = 0;

function publish(next: Partial<TimelineSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  views.forEach((notify) => notify());
}

async function readOnce(mine: number): Promise<void> {
  try {
    const timelineData = await timelineAdapter.getTimelineData();
    if (mine !== generation) return;
    publish({ timelineData, stats: timelineStats(timelineData.items), loading: false, error: null });
  } catch (err) {
    if (mine !== generation) return;
    console.error('Error loading Timeline data:', err);
    publish({ loading: false, error: err instanceof Error ? err.message : 'An error occurred loading timeline data' });
  }
}

/**
 * Reads the events. Asked during a read, it reads once more when that one
 * finishes, and resolves after that, so a caller never awaits a read that started
 * before its change.
 */
function read(): Promise<void> {
  if (inFlight) {
    readAgain = true;
    return inFlight;
  }
  const mine = generation;
  const run: Promise<void> = readOnce(mine).then(() => {
    if (inFlight === run) inFlight = null;
    if (readAgain && mine === generation) {
      readAgain = false;
      return read();
    }
  });
  inFlight = run;
  return run;
}

function readSoon(): void {
  if (readTimer) return;
  readTimer = setTimeout(() => {
    readTimer = null;
    void read();
  }, READ_AFTER_CHANGE_MS);
}

function subscribe(notify: () => void): () => void {
  views.add(notify);
  if (!stopListening) {
    stopListening = timelineAdapter.subscribeToUpdates(readSoon);
    void read();
  }
  return () => {
    views.delete(notify);
    if (views.size > 0) return;
    stopListening?.();
    stopListening = null;
    if (readTimer) {
      clearTimeout(readTimer);
      readTimer = null;
    }
    generation++;
    inFlight = null;
    readAgain = false;
    snapshot = NOT_YET_READ;
  };
}

const getSnapshot = () => snapshot;

/**
 * Add a new event to the timeline
 */
async function addEvent(event: Partial<TimelineEventInput>): Promise<string | null> {
  try {
    const eventId = await timelineAdapter.addEvent(event);
    // The workspace reports the change and every view reads again; reading here
    // too means the events are current by the time this resolves.
    if (eventId) await read();
    return eventId;
  } catch (err) {
    publish({ error: err instanceof Error ? err.message : 'An error occurred adding an event' });
    console.error('Error adding event:', err);
    return null;
  }
}

/**
 * Update an existing event
 */
async function updateEvent(id: string, updates: Partial<TimelineEventInput>): Promise<boolean> {
  try {
    const success = await timelineAdapter.updateEvent(id, updates);
    if (success) await read();
    return success;
  } catch (err) {
    publish({ error: err instanceof Error ? err.message : 'An error occurred updating an event' });
    console.error('Error updating event:', err);
    return false;
  }
}

/**
 * Delete an event from the timeline
 */
async function deleteEvent(id: string): Promise<boolean> {
  try {
    const success = await timelineAdapter.deleteEvent(id);
    if (success) await read();
    return success;
  } catch (err) {
    publish({ error: err instanceof Error ? err.message : 'An error occurred deleting an event' });
    console.error('Error deleting event:', err);
    return false;
  }
}

/**
 * The timeline's events, the same for every view that shows them.
 */
export function useTimelineData(): UseTimelineDataResult {
  const { timelineData, stats, loading, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { timelineData, stats, loading, error, refreshData: read, addEvent, updateEvent, deleteEvent };
}

export default useTimelineData;
