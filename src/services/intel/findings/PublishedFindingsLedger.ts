import type { FindingAttestation } from './attestation';
import { identifierFor } from './FindingContent';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'PublishedFindings' });
const LS_KEY = 'starcom_published_findings_v1';

/**
 * What this instance has actually asserted in public.
 *
 * Until now, a successful broadcast left no local trace whatsoever. The
 * publisher's own comment said it plainly — "this service has no storage of
 * its own findings" — and treated that as a simplification. It is not; three
 * capabilities depend on being able to enumerate what you have published:
 *
 *  - Recheck. A finding's derived weight decays with age, so an instance needs
 *    to know which of its own claims have gone stale. Without a ledger there
 *    is nothing to iterate.
 *  - Retraction. You can only withdraw a claim you can name. Retraction
 *    previously reached only findings someone happened to still remember.
 *  - Answering "what have I said?" — the question anyone operating under the
 *    attestation model has to be able to answer about themselves, and the one
 *    a federation partner is entitled to ask.
 *
 * ONE ENTRY PER SLOT, matching the relay's parameterized-replaceable
 * semantics: republishing about the same subject and attribute replaces the
 * previous claim rather than appending. That also bounds growth by the number
 * of distinct subjects published about, not by how often — which is what makes
 * localStorage adequate here where the outbox needed IndexedDB.
 */
export interface PublishedFinding {
  /** The `d`-tag slot — subject and attribute, normalised. Primary key. */
  slot: string;
  /** The content as published, so weight can be re-derived and a retraction built from it. */
  content: FindingAttestation;
  /** The author's own timestamp, from the content. */
  publishedAt: string;
  /**
   * The ML-DSA key this was actually published UNDER.
   *
   * Recorded per claim rather than read from the current key, because a
   * refutation addresses the claim by the pubkey that signed it. After a key
   * rotation, every earlier claim is still addressed by the retired key, so
   * deriving this from "whatever key we hold now" would look up refutations of
   * claims nobody made and miss every refutation of the ones we did.
   *
   * Optional: records persisted before this field existed do not carry it, and
   * a claim whose author cannot be established simply cannot be checked for
   * refutations — which is the honest outcome, not a reason to guess.
   */
  authorPubkey?: string;
  /** When the broadcast actually succeeded HERE. Distinct from publishedAt for anything that sat in the outbox. */
  confirmedAt: string;
  /** Nostr event id, when the relay returned one. */
  eventId?: string;
  /**
   * The Nostr key that signed the event, which is not the ML-DSA key above.
   * With the slot it is the claim's address, which reviews point at (plan item
   * 5.1). Absent on records from before it was kept.
   */
  nostrPubkey?: string;
  /** How many relays accepted it. Zero would mean it never went out, so it is never recorded. */
  relaysOk?: number;
  /** Set once withdrawn, rather than deleting the row — "I retracted this" is itself a fact worth keeping. */
  retractedAt?: string;
  /**
   * Where it went, so a withdrawal goes to the same place (plan item 0.4).
   * Absent on records from before that, which went to the findings relays.
   */
  relays?: string[];
}

export interface PublishedFindingsStore {
  load(): PublishedFinding[];
  save(records: PublishedFinding[]): void;
}

export class MemoryPublishedFindingsStore implements PublishedFindingsStore {
  private records: PublishedFinding[] = [];
  load(): PublishedFinding[] { return [...this.records]; }
  save(records: PublishedFinding[]): void { this.records = [...records]; }
}

/**
 * Drop records written under the previous `d`-tag format.
 *
 * The slot IS the claim's identity, and its derivation changed: it used to be
 * `starcom_finding_${subject}_${attribute}`, lowercased with every
 * non-alphanumeric collapsed — which put every non-Latin subject in one slot —
 * and is now percent-encoded components joined by a colon.
 *
 * A record left over from the old scheme is worse than absent. Retraction
 * targets a slot computed from (subjectRef, attribute), so an old entry can
 * never be matched by a retraction built today: the ledger would report a
 * standing claim that nothing can withdraw. Nothing has been published, so
 * this only affects a developer's browser — which is exactly when a silent
 * mismatch is cheapest to remove.
 */
function isCurrentSlotFormat(slot: string): boolean {
  return slot.includes(':') && !slot.startsWith('starcom_finding_');
}

export class BrowserPublishedFindingsStore implements PublishedFindingsStore {
  load(): PublishedFinding[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r): r is PublishedFinding =>
        !!r && typeof r === 'object'
        && typeof (r as PublishedFinding).slot === 'string'
        && !!(r as PublishedFinding).content
        && isCurrentSlotFormat((r as PublishedFinding).slot));
    } catch {
      return [];
    }
  }

  save(records: PublishedFinding[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
    } catch (err) {
      // A full or unavailable store must not fail the publish that just
      // succeeded — the finding IS public, whatever we managed to write down.
      log.warn('Could not persist the published-findings ledger:', err instanceof Error ? err.message : String(err));
    }
  }
}

export class PublishedFindingsLedger {
  private records = new Map<string, PublishedFinding>();

  constructor(private store: PublishedFindingsStore = new MemoryPublishedFindingsStore()) {
    for (const r of this.store.load()) this.records.set(r.slot, r);
  }

  /**
   * Record a confirmed publication.
   *
   * Called ONLY on a broadcast that reached at least one relay. A queued
   * finding is not published, and recording it as though it were would make
   * the ledger claim something about the world that is not true yet — the
   * precise distinction PublishFindingResult.queued already exists to keep.
   */
  record(
    content: FindingAttestation,
    result: { eventId?: string; relaysOk?: number; authorPubkey?: string; relays?: string[]; nostrPubkey?: string },
    confirmedAt: string = new Date().toISOString(),
  ): PublishedFinding {
    const slot = identifierFor(content.claim.subjectRef, content.claim.attribute);
    const record: PublishedFinding = {
      slot,
      content,
      publishedAt: content.publishedAt,
      confirmedAt,
      eventId: result.eventId,
      relaysOk: result.relaysOk,
      authorPubkey: result.authorPubkey,
      ...(result.nostrPubkey ? { nostrPubkey: result.nostrPubkey } : {}),
      ...(result.relays ? { relays: result.relays } : {}),
      // A republished slot is a NEW live claim, so any previous retraction of
      // it no longer applies. Carrying retractedAt forward would mark a claim
      // as withdrawn while it is being asserted.
    };
    this.records.set(slot, record);
    this.persist();
    return record;
  }

  /** Mark a slot withdrawn. Returns false when we never published it. */
  markRetracted(slot: string, at: string = new Date().toISOString()): boolean {
    const existing = this.records.get(slot);
    if (!existing) return false;
    this.records.set(slot, { ...existing, retractedAt: at });
    this.persist();
    return true;
  }

  /** Everything published, including withdrawn claims. */
  all(): PublishedFinding[] {
    return [...this.records.values()];
  }

  /** Claims still standing — what this instance is currently asserting. */
  live(): PublishedFinding[] {
    return this.all().filter((r) => !r.retractedAt);
  }

  get(slot: string): PublishedFinding | undefined {
    return this.records.get(slot);
  }

  /** Test seam. */
  reset(): void {
    this.records.clear();
    this.persist();
  }

  private listeners = new Set<() => void>();

  /**
   * Told of every change, for a screen that shows what was published: the
   * analyzer's "Claims you published" read the ledger only when something
   * else re-rendered it, so a claim published or withdrawn did not appear.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private persist(): void {
    this.store.save([...this.records.values()]);
    this.listeners.forEach((listener) => listener());
  }
}

export const publishedFindingsLedger = new PublishedFindingsLedger(
  typeof localStorage !== 'undefined' ? new BrowserPublishedFindingsStore() : new MemoryPublishedFindingsStore(),
);
