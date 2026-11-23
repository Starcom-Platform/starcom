// IntelCaseUI — ported essentially as-is from core/intel's CaseRecord (and
// its Collaborator/CaseComment/ActivityLogEntry/CasePermissions siblings) in
// core/intel/types/intelDataModels.ts. That shape was already right — it's
// exactly what CaseManagerAdapter's ~1000 lines of comment/permission/
// activity-log/sharing-token logic were built against — it just needed a
// home in the canonical type system instead of the orphaned one, so cases
// can finally be persisted through the same substrate everything else uses.
//
// Collaborator/Attachment/Comment/ActivityLogEntry/permissions are now
// defined once in Collaboration.ts (Cycle 3, shared with MissionUI) and
// re-exported here under their original Case-flavored names so nothing
// importing them from this file needed to change.

import type {
  InformationVisibility,
  ContentSensitivity
} from './IntelItemUI';
import type { CollectionRequirement } from '../../services/intel/collection/collectionRequirement';
import {
  Collaborator,
  Attachment,
  Comment as SharedComment,
  ActivityLogEntry as SharedActivityLogEntry,
  CollaborationPermissions
} from './Collaboration';

export type { Collaborator };

export enum CaseStatus {
  NEW = 'NEW',
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

export enum CasePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum CaseActivityAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  COMMENTED = 'COMMENTED',
  ASSIGNED = 'ASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ENTITY_LINKED = 'ENTITY_LINKED',
  ENTITY_UNLINKED = 'ENTITY_UNLINKED',
  CONTRADICTION_LINKED = 'CONTRADICTION_LINKED',
  CONTRADICTION_UNLINKED = 'CONTRADICTION_UNLINKED',
  POSITION_STATED = 'POSITION_STATED',
  REQUIREMENT_RAISED = 'REQUIREMENT_RAISED',
  REQUIREMENT_ANSWERED = 'REQUIREMENT_ANSWERED',
  REQUIREMENT_CLOSED = 'REQUIREMENT_CLOSED',
  CASE_LINKED = 'CASE_LINKED',
  CASE_UNLINKED = 'CASE_UNLINKED',
  COLLABORATOR_ADDED = 'COLLABORATOR_ADDED',
  COLLABORATOR_REMOVED = 'COLLABORATOR_REMOVED',
  SHARED = 'SHARED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
  /** Deleted, then brought back with Undo (plan item 0.6). */
  RESTORED = 'RESTORED',
  /** An article the case rests on, added to its sources, or taken off them (D-DP, DP7). */
  SOURCE_ADDED = 'SOURCE_ADDED',
  SOURCE_REMOVED = 'SOURCE_REMOVED'
}

/**
 * An article a case rests on (decision D-DP, DP7): its link, the outlet it is on and when it was
 * reported. A case had related records and nowhere for the reports behind, say, a GDELT event.
 */
export interface CaseSource {
  /** The article's link: http or https only. */
  url: string;
  /** The site it is on, read from the link (www., m. and amp. dropped); null where none can be. */
  outlet: string | null;
  /** When it was reported, where known: when GDELT added it, for an article from Diplomacy. ISO. */
  reportedAt?: string;
  /** What it is, in a few words, where its giver said. */
  title?: string;
  /** When it was added to the case. ISO. */
  addedAt: string;
}

/** An article offered to a case: its link, and when it was reported and what it is where known. */
export type CaseSourceInput = Pick<CaseSource, 'url'> & Partial<Pick<CaseSource, 'reportedAt' | 'title'>>;

export type CaseAttachment = Attachment;

export type CaseComment = SharedComment;

export type ActivityLogEntry = SharedActivityLogEntry<CaseActivityAction>;

export type CasePermissions = CollaborationPermissions;

/**
 * What a case concluded — the thing the aggregation tier had nowhere to put.
 *
 * A Case exists so several observations become one position, and until now it
 * had no field for the position. The conclusion vocabulary lived on
 * IntelReportUI instead, one tier down, on the object that records a single
 * observation.
 *
 * ─── NO DECLARED CONFIDENCE, DELIBERATELY ──────────────────────────────────
 *
 * There is no `confidence` here and there must not be one. The Earth
 * Intelligence Network has already ratified the rule, published in the
 * interchange spec and this node's descriptor:
 *
 *     Weight is derived from method and age, never asserted by the author.
 *
 * A position's METHOD is the case itself — which records it rests on
 * (`relatedEntities`), what argues against it (`contradictedBy`), who
 * adjudicated and when. All of that is already recorded and independently
 * checkable. A number the author picks would add nothing a consumer could
 * verify, and would reintroduce exactly the declared-confidence defect the
 * attestation model exists to refuse.
 */
/**
 * What the evidence was found to do — NOT how sure anyone is.
 *
 * The distinction is the whole reason this is allowed to exist on an object
 * that deliberately refuses a confidence field. A confidence is the author
 * grading their own work, which is worth nothing to a reader who cannot check
 * it. A verdict is the conclusion itself: the thing the case was opened to
 * reach, and the thing a consumer wants to know before deciding whether to
 * re-derive it.
 *
 * `inconclusive` is a real outcome and not a failure to reach one. A case that
 * looked and could not settle the question has produced information, and an
 * adjudicator with no way to say so is pushed toward overstating.
 */
export type CaseVerdict =
  /** The evidence supports the proposition this case was opened on. */
  | 'substantiated'
  /** The evidence weighs against it. Distinct from having found nothing. */
  | 'unsubstantiated'
  /** The evidence does not settle it, and saying so is the finding. */
  | 'inconclusive';

export interface CasePosition {
  /** What this case concludes, in the adjudicator's words. */
  statement: string;
  /**
   * The structured half of the conclusion.
   *
   * `statement` is prose and stays local; this is what can cross to other
   * nodes, because a consumer can act on it without a human reading it.
   */
  verdict: CaseVerdict;
  /**
   * How each linked contradiction was dealt with, keyed by its entity id.
   *
   * ─── WHY TEXT AND NOT A BOOLEAN ──────────────────────────────────────────
   *
   * A boolean would be the adjudicator grading their own thoroughness, and a
   * tick costs nothing to apply — it would launder unaddressed dissent into
   * apparent rigour, which is worse than recording nothing at all. Requiring
   * the adjudicator to say HOW makes the claim inspectable: a reader learns
   * "the second sighting was 40km off and the timestamp ambiguous" instead of
   * "yes".
   *
   * This follows workspaceContainment's `releasedReason`, required there for
   * the same stated reason: an empty field would let it happen while looking
   * deliberate.
   *
   * A contradiction absent from this map is UNADDRESSED, and that is a fact the
   * published claim carries rather than hides.
   */
  addressed?: Record<string, string>;
  /**
   * Who adjudicated. Empty when no identity was available — honest about an
   * unattributed decision rather than inventing an author, same rule the
   * activity log follows.
   */
  adjudicatedBy: string;
  adjudicatedAt: string; // ISO
}

/**
 * Who a record came from, when it arrived in a bundle (plan item 2.4): the
 * sender's key, which signed the bundle, and when they made it. Absent means
 * it was made here.
 */
export interface ReceivedFrom {
  pubkey: string;
  sentAt: string;
  /**
   * On a case or mission: the ids of records it cites that the sender keeps
   * Private, which the bundle left out (plan item 9.13). Absent when none were.
   */
  withheld?: string[];
}

export interface IntelCaseUI {
  id: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  receivedFrom?: ReceivedFrom;
  caseNumber: string;
  title: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  /**
   * The team relays a Limited case also goes to, beside the internal relays, as its author picked them (decision
   * LW1). Only relays still joined in this browser are sent to; never carried in a bundle.
   */
  limitedTo?: string[];
  sensitivity?: ContentSensitivity;
  assignedTo: string[];
  startDate: string; // ISO
  dueDate?: string;
  closedDate?: string;
  relatedEntities: string[]; // IDs of linked IntelItemUI/IntelReportUI
  /**
   * Record ids that ARGUE AGAINST this case.
   *
   * A case with nowhere to record what contradicts it is a filing cabinet
   * rather than an analytic object: it can only ever accumulate agreement,
   * and refutation has nothing to anchor to. Mecha Jono named this while
   * building their own Case layer, and Starcom had the same hole from the
   * other direction — correlationUtils already DETECTS contradictions
   * (`conflictsForBucket`, ranked by `rankConflicts`, weighting each side by
   * source confidence) and nothing has ever carried one to a case.
   *
   * Separate from relatedEntities on purpose. Folding counter-evidence into
   * the same list would make "this case rests on five records" and "this case
   * rests on three records and two that dispute them" indistinguishable,
   * which is the distinction an adjudicator most needs.
   *
   * Operator-populated today. Wiring the existing conflict detection to write
   * here automatically is the next step and is deliberately not done in the
   * same change: a field with an automated producer and no human check would
   * fill a case with machine opinion before anyone decided it was one.
   */
  contradictedBy?: string[];
  /**
   * What this case concludes. Absent until somebody states one — an
   * unstated position is a real state, and defaulting to an empty string
   * would make "not yet adjudicated" indistinguishable from "concluded
   * nothing".
   */
  position?: CasePosition;
  /**
   * What this case still needs to know.
   *
   * Held on the case rather than in a separate queue because a requirement
   * without the investigation that raised it is a task order, and this network
   * has no body to issue those. It exists because a case has a gap, and it stops
   * mattering when the case does.
   */
  requirements?: CollectionRequirement[];
  /**
   * The articles it rests on (D-DP, DP7), oldest added first. Absent where none were added. Held in
   * plain text, as tags are: only a protected case's description is encrypted at rest.
   */
  sources?: CaseSource[];
  relatedCases: string[]; // IDs of related cases
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Collaboration
  collaborators: Collaborator[];
  comments: CaseComment[];
  activityLog: ActivityLogEntry[];
  shareToken?: string;
  permissions: CasePermissions;
}

export interface CreateIntelCaseInput {
  title: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  description: string;
  priority?: CasePriority; // defaults to MEDIUM
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  limitedTo?: string[];
  sensitivity?: ContentSensitivity;
  assignedTo?: string[];
  dueDate?: string;
  relatedEntities?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  // Overrides for demo/import data generators that already know a case's
  // full initial state (e.g. backfilling historical cases) — everyday
  // callers creating a brand-new case leave these unset and get the real
  // defaults (status NEW, startDate now, a generated case number).
  startDate?: string;
  status?: CaseStatus;
  closedDate?: string;
  caseNumber?: string;
  /**
   * Who made the record, when an import already knows. Absent means "the person
   * creating it now", which ensures this browser's signing identity — so a migration
   * or import that leaves it unset would create a key for someone who only opened a
   * screen. Pass the record's own author instead.
   */
  createdBy?: string;
}

/** Validated case-status transitions, mirroring IntelReportService's updateStatus state machine. */
export const VALID_CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  [CaseStatus.NEW]: [CaseStatus.OPEN, CaseStatus.CLOSED],
  [CaseStatus.OPEN]: [CaseStatus.IN_PROGRESS, CaseStatus.PENDING, CaseStatus.CLOSED],
  [CaseStatus.IN_PROGRESS]: [CaseStatus.PENDING, CaseStatus.RESOLVED, CaseStatus.CLOSED],
  [CaseStatus.PENDING]: [CaseStatus.IN_PROGRESS, CaseStatus.CLOSED],
  [CaseStatus.RESOLVED]: [CaseStatus.CLOSED, CaseStatus.OPEN],
  [CaseStatus.CLOSED]: [CaseStatus.OPEN]
};

/**
 * Open, on hold or closed: how a case is counted and listed everywhere (plan
 * item 1.8), the Cases tabs, the header's counts and the hints alike. "Open"
 * had been every case never closed, resolved ones too, beside an Open tab that
 * listed fewer.
 */
export type CaseGroup = 'open' | 'on-hold' | 'closed';
export function caseGroup(status: CaseStatus | string): CaseGroup {
  if (status === CaseStatus.PENDING) return 'on-hold';
  if (status === CaseStatus.RESOLVED || status === CaseStatus.CLOSED) return 'closed';
  return 'open';
}
