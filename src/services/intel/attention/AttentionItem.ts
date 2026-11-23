import type { SubjectKind } from '../../../types/intel/SourceObservation';

/**
 * What needs an analyst's attention, and why.
 *
 * Phase I.B's premise (docs/build-passes.md): "a command interface tells you
 * what needs your attention. Today it shows you what you navigated to." This
 * type is the difference between those two things.
 *
 * The design constraint that shapes everything here: an attention queue is a
 * claim on someone's time, and a queue that cries wolf gets muted — after
 * which it is worse than absent, because its silence now reads as "nothing is
 * wrong" while it is simply being ignored. So every field below exists to make
 * an item auditable rather than merely alarming.
 */

/**
 * Why an item surfaced. An ENUM, never free text.
 *
 * Free-text reasons cannot be audited, counted, filtered, suppressed, or
 * argued with. If the queue is ever accused of ranking badly — and it will be,
 * because ranking attention is inherently contestable — the only defence is
 * being able to say exactly which rule fired and how often. A string typed by
 * whichever producer happened to run cannot support that conversation.
 */
export type AttentionReason =
  /** Two sources place one exclusive subject in incompatible locations, and it touches an open case. */
  | 'new-contradiction'
  /**
   * Another instance published a claim about an entity named in an open case.
   *
   * Worth an analyst's time whether it agrees or not: independent corroboration
   * changes what a case can assert, and independent disagreement changes it
   * more. What it is NOT is a conclusion — a foreign claim is evidence about
   * the world arriving from someone whose methods you did not choose.
   */
  | 'foreign-claim-intersects-case'
  /**
   * A case asked a question, said what decision waited on it, and the answer
   * has stopped being useful without arriving.
   *
   * The first reason here whose subject is COLLECTION rather than analysis.
   * The other three watch what has been published or contested; this one
   * watches what was needed and never gathered — which is the only kind of
   * work a collector can act on, and the reason a collector had no queue.
   *
   * Not a failure to record. Something needed in time and not obtained is a
   * finding about the investigation, and hiding it would make the queue look
   * healthier than the work is.
   */
  | 'requirement-went-stale'
  /**
   * A claim this instance published has decayed and needs rechecking.
   *
   * Weight decays with age by design — that is what "analysis decays" means.
   * But a decayed claim is still standing on every relay that holds it, and
   * silence from its publisher reads as continued endorsement. Rechecking or
   * retracting is the publisher's own obligation, and nothing else will
   * prompt it.
   */
  | 'published-finding-decayed'
  /**
   * An objective on a mission was given to you, and is not done (plan item
   * 2.5). Work somebody else chose for you, which is the one kind a person
   * cannot be expected to find by browsing.
   */
  | 'objective-given-to-you'
  /**
   * You took on an ask from another node's Mission Package (plan item 2.6).
   * Kept on this device only, and the package is not, so without this the
   * work had nowhere to be found the next day.
   */
  | 'ask-you-took-on'
  /**
   * A record made before 9 Sep 2026 is Public, and an upgrade that day made
   * records with no distribution Public, so it may never have been chosen
   * (plan item 9.6, decision G3). Listed once, to keep or change.
   */
  | 'made-public-by-upgrade';

/** Lifecycle. An item nobody can retire will be ignored, and then all of them will be. */
export type AttentionState = 'new' | 'acknowledged' | 'dismissed' | 'resolved';

export interface AttentionItem {
  /**
   * Stable across recomputes. Derived ONLY from the facts that make this the
   * same concern — never from a timestamp, a counter, or array position.
   *
   * The correlation engine recomputes from scratch on every ingest, so an id
   * carrying anything incidental would make the same contradiction arrive as a
   * brand-new item every few seconds. That is the specific mechanism by which
   * queues become noise, and it is invisible in a test that runs the producer
   * once.
   */
  id: string;
  /** What the item is about, in the source's own casing. */
  subject: string;
  subjectKind: SubjectKind;
  reason: AttentionReason;
  /**
   * Which producer emitted this.
   *
   * Attribution is what makes producer failure isolation possible: a queue
   * that degrades to fewer items needs to be able to say WHICH capability went
   * quiet, otherwise "fewer items" is indistinguishable from "less is wrong".
   */
  producedBy: string;
  /** The open case this concerns. */
  caseId: string;
  /** For an item about a mission rather than a case, which has no case (plan item 2.5). */
  missionId?: string;
  /**
   * The record whose distribution this item asks about (plan item 9.6), so it
   * can be kept or changed from the queue. `locked` when it cannot change: a
   * mission's distribution travels in its package and locks with it.
   */
  distributionOf?: { kind: 'case' | 'mission' | 'report'; id: string; locked: boolean };
  /** When this concern was first raised, ISO 8601 UTC. Preserved across recomputes. */
  firstSeen: string;
  /** Most recent recompute that still saw it. */
  lastSeen: string;
  /**
   * 0..1, DERIVED from the underlying evidence — never declared by a producer.
   *
   * Same rule as attestation weight, for the same reason: a producer that can
   * assert its own importance will, and every producer asserting maximum
   * importance is identical to no ranking at all.
   */
  severity: number;
  state: AttentionState;
  /**
   * One sentence naming the rule that surfaced this, in plain language.
   *
   * Required, not optional. An item that cannot explain itself is asking for
   * trust it has not earned, and the analyst's only options are to obey it or
   * ignore it — both bad.
   */
  explanation: string;
  /**
   * Whether the evidence behind this item is real, fabricated, or unmeasured.
   *
   * A TRI-STATE, replacing what was `isMock: boolean`. The boolean was worse
   * than useless: nothing in the pipeline actually set it, so every item
   * carried `false` and the field asserted "this evidence is genuine" about
   * data nobody had checked. A safety property that is structurally always
   * satisfied is not a safety property, it is a decoration that makes the
   * surface more convincing.
   *
   * `unknown` is a real and common answer — report-derived events carry no
   * provenance flag — and it must render differently from `real`, for the
   * same reason the globe layer keeps `integrity: null` rather than zeroing
   * it: "we did not measure" and "we measured, it is fine" are different
   * claims and only one of them is earned.
   */
  evidenceProvenance: 'real' | 'mock' | 'unknown';
}

/** How to describe an item's evidence in one word, for display. */
export function provenanceOf(isMock: boolean | undefined): AttentionItem['evidenceProvenance'] {
  return isMock === true ? 'mock' : isMock === false ? 'real' : 'unknown';
}

/** True when the analyst can still do something about it. */
export function isActionable(item: AttentionItem): boolean {
  return item.state === 'new' || item.state === 'acknowledged';
}
