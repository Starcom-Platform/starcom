import type { Event } from '../adapters/eventsAdapter';
import {
  bucketByEntity,
  conflictsForBucket,
  findingForBucket,
  rankConflicts,
  type BucketedEvent,
  type CorroboratedFinding,
  type LocationConflict,
} from './correlationUtils';

/**
 * Incremental correlation over a bounded working set.
 *
 * The problem this solves is not raw speed — II.A.4's algorithmic pass already
 * took 8000 events from 5191 ms to 499 ms. It is that a full recompute costs
 * the same whether one new observation arrived or ten thousand did, and six
 * polled sources produce a steady trickle. Recomputing the entire corpus on
 * every poll is the shape that makes a UI feel broken regardless of how fast
 * any single pass is.
 *
 * An entity's conflicts and corroborated finding depend only on that entity's
 * own events (see conflictsForBucket). That is what makes per-entity
 * memoisation sound rather than an approximation: adding an observation about
 * Acme Corp cannot change the answer for anyone else, so nothing else is
 * recomputed.
 */

/**
 * Working-set cap.
 *
 * Stated rather than implied, because an unbounded in-memory corpus fed by six
 * polling sources is a slow leak, and the failure mode is a tab that gets
 * gradually worse until it dies — the hardest kind to attribute.
 *
 * 20000 is chosen against the measured budget: the algorithmic pass handles
 * 8000 events in ~500 ms, and a full rebuild at the cap is a rare event
 * (eviction, or a caller resetting), not a per-poll cost.
 */
export const DEFAULT_MAX_EVENTS = 20_000;

export interface IndexStats {
  events: number;
  entities: number;
  /** Entities whose cached result is stale and will be recomputed on next read. */
  dirtyEntities: number;
  evicted: number;
  maxEvents: number;
}

interface EntityState {
  displayName: string;
  events: BucketedEvent[];
  conflicts: LocationConflict[] | null;
  finding: CorroboratedFinding | null;
  /** Distinguishes "computed, and the answer was no finding" from "not computed yet". */
  computed: boolean;
}

export class CorrelationIndex {
  private entities = new Map<string, EntityState>();
  private eventIds = new Set<string>();
  private evictedCount = 0;

  constructor(private maxEvents: number = DEFAULT_MAX_EVENTS) {}

  /**
   * Add events, marking only the entities they touch as needing recomputation.
   *
   * Events already present by id are ignored rather than added twice — the
   * sources feeding this are polled, so re-delivery of an unchanged record is
   * the normal case, and counting it again would turn repetition into apparent
   * corroboration.
   */
  add(events: Event[]): void {
    const fresh = events.filter(ev => !this.eventIds.has(ev.id));
    if (fresh.length === 0) return;

    for (const ev of fresh) this.eventIds.add(ev.id);

    for (const [key, bucket] of bucketByEntity(fresh)) {
      const existing = this.entities.get(key);
      if (existing) {
        existing.events = mergeSorted(existing.events, bucket.events);
        existing.computed = false;
        existing.conflicts = null;
        existing.finding = null;
      } else {
        this.entities.set(key, {
          displayName: bucket.displayName,
          events: bucket.events,
          conflicts: null,
          finding: null,
          computed: false,
        });
      }
    }

    this.evictIfNeeded();
  }

  /** Replace the whole working set. Used when a caller's filters change. */
  reset(events: Event[]): void {
    this.entities.clear();
    this.eventIds.clear();
    this.evictedCount = 0;
    this.add(events);
  }

  conflicts(): LocationConflict[] {
    this.recomputeDirty();
    const all: LocationConflict[] = [];
    for (const state of this.entities.values()) {
      if (state.conflicts) all.push(...state.conflicts);
    }
    // Ranking and truncation are global, applied once over the merged set.
    return rankConflicts(all);
  }

  findings(): CorroboratedFinding[] {
    this.recomputeDirty();
    const out: CorroboratedFinding[] = [];
    for (const state of this.entities.values()) {
      // Corroboration and contradiction stay mutually exclusive, per the
      // Findings Publisher rule — an entity with an unresolved conflict does
      // not also get published as confidently agreed.
      if (state.conflicts && state.conflicts.length > 0) continue;
      if (state.finding) out.push(state.finding);
    }
    return out.sort((x, y) => y.confidence - x.confidence || y.sourceCount - x.sourceCount);
  }

  stats(): IndexStats {
    let dirty = 0;
    for (const state of this.entities.values()) if (!state.computed) dirty++;
    return {
      events: this.eventIds.size,
      entities: this.entities.size,
      dirtyEntities: dirty,
      evicted: this.evictedCount,
      maxEvents: this.maxEvents,
    };
  }

  private recomputeDirty(): void {
    for (const state of this.entities.values()) {
      if (state.computed) continue;
      state.conflicts = conflictsForBucket(state.displayName, state.events);
      state.finding = findingForBucket(state.displayName, state.events);
      state.computed = true;
    }
  }

  /**
   * Eviction: oldest events first, across the whole working set.
   *
   * Age, not entity, is the axis on purpose. Evicting whole entities would
   * make an entity vanish from analysis entirely; evicting oldest events
   * degrades every entity's history evenly and keeps the recent picture — which
   * is the one corroboration's 24-hour window actually uses.
   */
  private evictIfNeeded(): void {
    if (this.eventIds.size <= this.maxEvents) return;

    const all: BucketedEvent[] = [];
    for (const state of this.entities.values()) all.push(...state.events);
    all.sort((a, b) => a.t - b.t);

    const overBy = this.eventIds.size - this.maxEvents;
    const doomed = new Set<string>();
    for (const item of all) {
      if (doomed.size >= overBy) break;
      doomed.add(item.ev.id);
    }
    if (doomed.size === 0) return;

    for (const [key, state] of this.entities) {
      const kept = state.events.filter(e => !doomed.has(e.ev.id));
      if (kept.length === state.events.length) continue;
      if (kept.length === 0) {
        this.entities.delete(key);
        continue;
      }
      state.events = kept;
      state.computed = false;
      state.conflicts = null;
      state.finding = null;
    }
    for (const id of doomed) this.eventIds.delete(id);
    this.evictedCount += doomed.size;
  }
}

/** Merge two time-sorted lists without re-sorting the whole bucket. */
function mergeSorted(a: BucketedEvent[], b: BucketedEvent[]): BucketedEvent[] {
  const out: BucketedEvent[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(a[i].t <= b[j].t ? a[i++] : b[j++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}
