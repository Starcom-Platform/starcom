import type { SignedFinding } from '../findings/signFinding';

/**
 * Bumped only when the STORED shape below changes. Records are persisted
 * across sessions (that is the entire point of an outbox), so a record
 * written by an older build has to remain readable — or be recognisably
 * unreadable — by a newer one. Unversioned persisted state is how a
 * refactor silently drops someone's unpublished findings.
 */
export const OUTBOX_SCHEMA_VERSION = 1;

/**
 * `abandoned` is deliberately a terminal state rather than a delete.
 *
 * A finding that never reached a single relay is information the operator
 * needs — "this never went out" is exactly the kind of fact this codebase
 * has a standing rule against hiding (see the data-integrity dashboard and
 * the simulated-presence finding). Deleting an exhausted record would make
 * the outbox lie by omission: an empty queue would mean both "everything
 * published" and "we gave up on three of them".
 */
export type OutboxRecordStatus = 'pending' | 'sent' | 'abandoned' | 'cancelled';
/*
 * `cancelled` is the person's own decision not to send a waiting finding (plan
 * item 0.2). Terminal and kept, for the same reason as `abandoned`: a record
 * that disappeared would read the same as one that was sent. An older build
 * reading it sees a status it neither drains nor lists, which is the right
 * reading, so the schema version stays at 1.
 */

export interface OutboxRecord {
  /** Stable record id. Distinct from `dedupeKey` — a replaced record keeps its own id. */
  id: string;
  schemaVersion: number;
  /** Only findings today. Mission Packages are the obvious second kind; the field exists so adding one is not a migration. */
  kind: 'finding';
  /**
   * Derived from the finding's own content (entity + attribute), matching
   * the `d` tag kind 30082 is addressed by. Kind 30082 is parameterized-
   * replaceable: two queued records with the same key would publish twice
   * to overwrite the same relay slot, so the second enqueue replaces the
   * first instead of stacking.
   */
  dedupeKey: string;
  /**
   * The ML-DSA-signed finding, NOT a finalized Nostr event.
   *
   * A Nostr event's `created_at` is set at signing time, and relays commonly
   * reject events far in the past. Queueing a finalized event would mean a
   * finding drained three days later arrives stamped three days stale and
   * may be refused outright. The ML-DSA signature here covers the content
   * and is timeless, so the outer Nostr event can be rebuilt and re-signed
   * with a current timestamp at drain time.
   */
  payload: SignedFinding;
  /**
   * Where it was going (plan item 0.4): a Limited case's position retries to
   * the internal relays, not to every findings relay. Absent on records queued
   * before that, which go to the findings relays as they always did.
   */
  relays?: string[];
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  status: OutboxRecordStatus;
}

export interface DrainSummary {
  attempted: number;
  sent: number;
  stillPending: number;
  abandoned: number;
}
