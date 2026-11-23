import type { AttentionState } from './AttentionItem';

const LS_KEY = 'starcom_attention_decisions_v1';

/**
 * What the analyst decided about an item, and when it was first raised.
 *
 * DECISIONS are persisted, not items. Producers recompute items from live
 * evidence on every pass, so storing them would mean carrying a second, stale
 * copy of the analysis and having to decide which one is true. What cannot be
 * recomputed is what a person chose — and `firstSeen`, which is the only
 * record that a concern has been outstanding since Tuesday.
 */
export interface AttentionDecision {
  id: string;
  state: AttentionState;
  firstSeen: string;
  /** Last time a producer still saw the underlying concern. Drives pruning. */
  lastSeen: string;
}

export interface AttentionStateStore {
  load(): AttentionDecision[];
  save(decisions: AttentionDecision[]): void;
}

/**
 * How long a decision outlives the concern it was about.
 *
 * Needed because decisions accumulate and items do not: an analyst dismisses a
 * contradiction, the evidence changes, the item disappears — and without
 * pruning its dismissal is kept forever. Thirty days is long enough that a
 * contradiction reappearing next week is still remembered as dismissed
 * (resurfacing it would be the queue nagging about a settled question), and
 * short enough that the store does not grow without bound across years.
 */
export const DECISION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Used by tests, and as the fallback when no browser storage exists. */
export class MemoryAttentionStateStore implements AttentionStateStore {
  private decisions: AttentionDecision[] = [];
  load(): AttentionDecision[] { return [...this.decisions]; }
  save(decisions: AttentionDecision[]): void { this.decisions = [...decisions]; }
}

/**
 * localStorage rather than IndexedDB, unlike the publish outbox.
 *
 * The outbox holds signed payloads that must survive at any size and must not
 * be lost; this holds a few hundred short rows, and losing one costs an
 * analyst re-dismissing something. Synchronous access also means the queue can
 * apply decisions during its first refresh instead of rendering once without
 * them and reordering underneath the reader.
 */
export class BrowserAttentionStateStore implements AttentionStateStore {
  load(): AttentionDecision[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Validated rather than trusted: this is user-writable storage, and a
      // hand-edited or half-written row must not be able to inject a state the
      // queue does not have.
      return parsed.filter((d): d is AttentionDecision =>
        !!d && typeof d === 'object'
        && typeof (d as AttentionDecision).id === 'string'
        && ['new', 'acknowledged', 'dismissed', 'resolved'].includes((d as AttentionDecision).state)
        && typeof (d as AttentionDecision).firstSeen === 'string');
    } catch {
      // Corrupt storage loses decisions; it must not stop the queue loading.
      return [];
    }
  }

  save(decisions: AttentionDecision[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(decisions));
    } catch {
      // Quota or private-mode failure. The queue still works for this session.
    }
  }
}

/** Drop decisions whose concern has not been seen for DECISION_TTL_MS. */
export function pruneDecisions(decisions: AttentionDecision[], now: number, ttlMs = DECISION_TTL_MS): AttentionDecision[] {
  return decisions.filter((d) => {
    const last = Date.parse(d.lastSeen);
    return Number.isNaN(last) || now - last <= ttlMs;
  });
}
