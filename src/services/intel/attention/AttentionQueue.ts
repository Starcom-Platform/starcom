import type { AttentionItem, AttentionState } from './AttentionItem';
import { isActionable } from './AttentionItem';
import {
  MemoryAttentionStateStore, pruneDecisions,
  type AttentionDecision, type AttentionStateStore,
} from './AttentionStateStore';

/**
 * Most items rendered at once.
 *
 * A queue is a claim on attention, and past a couple of screens the claim
 * stops being credible — nobody triages the four hundredth row. Capping keeps
 * the list readable while `hiddenByBudget` keeps it honest about the backlog.
 *
 * The ordering rule is what makes a cap safe: severity descending, then oldest
 * first, so the cut always falls on the least severe and most recently raised
 * items. Under a naive newest-first tiebreak the same cap would permanently
 * hide the oldest work — the starvation this pass exists to prevent.
 */
export const MAX_SHOWN = 100;

/**
 * Hard ceiling on retained items, across all producers.
 *
 * Separate from MAX_SHOWN and much larger: this one is about memory, not
 * readability. A producer with a bug can emit unboundedly, and the queue held
 * every item it had ever seen plus a persisted decision for each. Bounded by
 * the same ordering, so what gets dropped is the least severe.
 */
export const MAX_RETAINED = 5_000;

/**
 * The single ordering rule, used by display, truncation AND eviction.
 *
 * One function rather than three call sites, because the cap is only safe if
 * eviction and display agree: if they diverged, the queue could evict an item
 * that the display would have ranked first.
 *
 *   1. severity, descending
 *   2. firstSeen, ASCENDING — oldest first
 *
 * The plan (I.B.2) says "recency as tiebreak", and this deliberately differs.
 * Newest-first means a steady arrival of new items permanently starves the old
 * ones, which is exactly the failure I.B.4 names. Oldest-first makes waiting
 * monotonically improve an item's position, so nothing can be starved
 * indefinitely — and it is what makes MAX_SHOWN safe to apply at all.
 */
function compareItems(a: AttentionItem, b: AttentionItem): number {
  return b.severity - a.severity || a.firstSeen.localeCompare(b.firstSeen);
}

/** A named source of attention items. Named, so a failure is attributable. */
export interface AttentionProducer {
  name: string;
  produce: () => AttentionItem[];
}

export interface ProducerFailure {
  producer: string;
  message: string;
  at: string;
}

export interface QueueSnapshot {
  /** Actionable items, most severe first. Never more than MAX_SHOWN. */
  items: AttentionItem[];
  /**
   * How many actionable items exist beyond the ones shown.
   *
   * Reported, never silent. "Fewer items" and "not all the items" look
   * identical in a list, and a queue that quietly truncates teaches its reader
   * that the bottom of the list is the end of the work.
   */
  hiddenByBudget: number;
  /**
   * Count for a badge. Actionable items ONLY.
   *
   * Dismissed and resolved items are excluded because a badge is a claim that
   * there is something to do. Counting items the analyst has already handled
   * inflates the number, and an inflated badge is how a queue teaches people
   * to ignore it — see docs/build-passes.md I.B.3, "never manufacture urgency".
   */
  actionableCount: number;
  /**
   * Producers that threw on this pass.
   *
   * Surfaced rather than swallowed. A queue that silently drops a failed
   * producer's output shows fewer items, and fewer items is indistinguishable
   * from a calmer world — the exact substitution this whole codebase keeps
   * having to undo.
   */
  failures: ProducerFailure[];
  /** True when every producer ran and none of them found anything. A real state, not an empty accident. */
  quiet: boolean;
}

/**
 * The attention queue.
 *
 * Producers are stateless and recompute from scratch; this class is what turns
 * their repeated output into a stable set of concerns with a lifecycle.
 *
 * The hard part is not collecting items, it is NOT losing what the analyst
 * already did with them. Correlation reruns constantly, so a naive queue
 * replaces its contents every few seconds and every acknowledgement is
 * discarded. The item id is the seam that prevents it.
 */
export class AttentionQueue {
  private items = new Map<string, AttentionItem>();
  private producers: AttentionProducer[] = [];
  private lastFailures: ProducerFailure[] = [];
  /**
   * Decisions for concerns not currently produced.
   *
   * An item can vanish and come back — evidence changes, a case is reopened, a
   * source returns. Without this, a contradiction the analyst dismissed on
   * Monday reappears as new on Wednesday and the queue nags about a settled
   * question. Keyed by item id, pruned by age.
   */
  private decisions = new Map<string, AttentionDecision>();
  /**
   * The clock the queue last ran against.
   *
   * refresh() takes an injectable `now`, but setState() previously persisted
   * against the real Date.now(). Two clocks in one object is a bug even when
   * both are real: pruning compares a decision's lastSeen — written by
   * refresh's clock — against setState's, so any disagreement silently deletes
   * live decisions. It surfaced immediately under a test clock, where every
   * acknowledgement was pruned the instant it was made.
   */
  private lastNowMs = Date.now();

  constructor(private store: AttentionStateStore = new MemoryAttentionStateStore()) {
    for (const d of this.store.load()) this.decisions.set(d.id, d);
  }

  register(producer: AttentionProducer): void {
    this.producers.push(producer);
  }

  /**
   * Run every producer and merge the result.
   *
   * Each producer is isolated. One throwing must degrade the queue to fewer
   * items, never to a broken queue — a command interface that goes blank
   * because one capability regressed is worse than one that admits a gap.
   */
  refresh(now: () => Date = () => new Date()): QueueSnapshot {
    const stamp = now();
    this.lastNowMs = stamp.getTime();
    const at = stamp.toISOString();
    const failures: ProducerFailure[] = [];
    const seen = new Set<string>();
    let ranClean = 0;

    for (const producer of this.producers) {
      let produced: AttentionItem[];
      try {
        produced = producer.produce();
      } catch (e) {
        failures.push({ producer: producer.name, message: e instanceof Error ? e.message : String(e), at });
        continue;
      }
      ranClean++;

      for (const fresh of produced) {
        seen.add(fresh.id);
        // In-memory item first, then a persisted decision from an earlier
        // session, then genuinely new. Everything the analyst did survives;
        // everything the evidence says is refreshed. firstSeen must NOT move —
        // it is how "this has been unresolved for three days" stays true.
        const prior = this.items.get(fresh.id) ?? this.decisions.get(fresh.id);
        this.items.set(fresh.id, prior
          ? { ...fresh, firstSeen: prior.firstSeen, state: prior.state, lastSeen: at }
          : { ...fresh, firstSeen: at, lastSeen: at });
      }
    }

    // An item whose producer FAILED must not be treated as gone. Its absence
    // is a fact about the producer, not about the world.
    const failedProducers = new Set(failures.map((f) => f.producer));
    for (const [id, item] of this.items) {
      if (seen.has(id)) continue;
      if (failedProducers.has(item.producedBy)) continue;
      // No longer produced by a healthy producer: the underlying evidence
      // changed and the concern no longer exists. Removed rather than marked
      // resolved — the analyst did not resolve it, reality did, and recording
      // it as their resolution would be a small lie in an audit log.
      this.items.delete(id);
    }

    this.evictBeyondBudget();
    this.lastFailures = failures;
    this.persist(this.lastNowMs);
    return this.snapshot(failures, ranClean);
  }

  /**
   * Keep retention bounded.
   *
   * Drops the least severe, most recently raised items first — the same order
   * the display cap uses, so eviction can never remove something that would
   * have been shown while keeping something that would not.
   */
  private evictBeyondBudget(): void {
    if (this.items.size <= MAX_RETAINED) return;
    const ranked = [...this.items.values()].sort(compareItems);
    for (const item of ranked.slice(MAX_RETAINED)) this.items.delete(item.id);
  }

  /** Record what the analyst decided. Returns false when the id is unknown. */
  setState(id: string, state: AttentionState): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    this.items.set(id, { ...item, state });
    this.persist(this.lastNowMs);
    return true;
  }

  /**
   * Write decisions through on every change.
   *
   * Not on unmount, and not on an interval. A decision that only survives a
   * clean teardown is not persisted, it is lucky — and the analyzer is one
   * of two mutually exclusive applications, so it is unmounted abruptly and
   * routinely. This is the same lesson as the findings outbox draining at app
   * level rather than when someone happens to open a view.
   */
  private persist(nowMs: number): void {
    for (const item of this.items.values()) {
      this.decisions.set(item.id, {
        id: item.id, state: item.state, firstSeen: item.firstSeen, lastSeen: item.lastSeen,
      });
    }
    const kept = pruneDecisions([...this.decisions.values()], nowMs);
    this.decisions = new Map(kept.map((d) => [d.id, d]));
    this.store.save(kept);
  }

  private snapshot(failures: ProducerFailure[], ranClean: number): QueueSnapshot {
    const actionable = [...this.items.values()].filter(isActionable);
    actionable.sort(compareItems);
    return {
      items: actionable.slice(0, MAX_SHOWN),
      hiddenByBudget: Math.max(0, actionable.length - MAX_SHOWN),
      // Counts EVERY actionable item, not just the shown ones. A badge that
      // stopped at the display cap would report the size of the list rather
      // than the size of the work.
      actionableCount: actionable.length,
      failures,
      // "Quiet" requires that producers actually RAN. A queue with no items
      // because everything failed is not a quiet world, and must never render
      // as one.
      quiet: actionable.length === 0 && failures.length === 0 && ranClean > 0,
    };
  }

  current(): QueueSnapshot {
    return this.snapshot(this.lastFailures, this.producers.length - this.lastFailures.length);
  }
}
