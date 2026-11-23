// MissionUI — a sibling to IntelCaseUI, not an extension of it. Extending
// IntelCaseUI would force Missions into Case's investigation-oriented status
// enum (NEW/OPEN/IN_PROGRESS/...) and activity actions (ENTITY_LINKED,
// CASE_LINKED, ...), neither of which fit "assemble objectives, package,
// dispatch to Navcom." Shares Collaborator/Comment/ActivityLogEntry/
// permissions with IntelCaseUI via Collaboration.ts instead.
import type { ReceivedFrom } from './IntelCaseUI';
import type {
  InformationVisibility,
  ContentSensitivity
} from './IntelItemUI';
import type { Collaborator, Comment, ActivityLogEntry, CollaborationPermissions } from './Collaboration';
import type { PackageManifest } from '../../services/exchange/types';
import type { ReportCitation } from './IntelReportUI';
import { en } from '../../i18n/app/en';

export enum MissionStatus {
  DRAFT = 'DRAFT',
  PLANNING = 'PLANNING',
  READY_FOR_PACKAGE = 'READY_FOR_PACKAGE',
  PACKAGED = 'PACKAGED',
  DISPATCHED = 'DISPATCHED',
  /** Done or called off, after it was dispatched (D-MX, MX12). How it ended is `closedAs`. */
  CLOSED = 'CLOSED'
}

export enum MissionActivityAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  OBJECTIVE_ADDED = 'OBJECTIVE_ADDED',
  OBJECTIVE_REMOVED = 'OBJECTIVE_REMOVED',
  OBJECTIVE_COMPLETED = 'OBJECTIVE_COMPLETED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  REPORT_LINKED = 'REPORT_LINKED',
  REPORT_UNLINKED = 'REPORT_UNLINKED',
  CASE_LINKED = 'CASE_LINKED',
  CASE_UNLINKED = 'CASE_UNLINKED',
  COLLABORATOR_ADDED = 'COLLABORATOR_ADDED',
  COLLABORATOR_REMOVED = 'COLLABORATOR_REMOVED',
  /** Deleted, then brought back with Undo (plan item 0.6). */
  RESTORED = 'RESTORED',
}

/*
 * PACKAGED and DISPATCHED were here and no code ever wrote them. They were
 * also redundant: STATUS_CHANGED already records every transition with
 * `{ fromStatus, toStatus }`, so packaging and dispatch are in the log twice
 * over in vocabulary and once in fact.
 *
 * Removed rather than left as a reminder. Nothing read them either, and an
 * enum listing events the system cannot produce is the same failure as a
 * registry listing kinds nobody claimed — it reads as capability and is
 * absence. Safe to drop precisely because no producer ever existed, so no
 * stored activity log can contain one.
 */

/**
 * Who a finished objective is for.
 *
 * Named because "who benefits" is the question that separates work worth doing
 * from work that merely looks busy, and it was nowhere in the model. Ours, not
 * anyone else's vocabulary — a peer's published set was read while choosing
 * these and is deliberately not mirrored, since their document says every name
 * in it is a proposal.
 *
 * There is no 'us'. Work whose only beneficiary is this system's own records is
 * housekeeping, and giving it a name here would make it look like a mission.
 */
export type ObjectiveBeneficiary =
  | 'public'
  | 'affected-group'
  | 'person-served'
  | 'operative'
  | 'agency';

export const OBJECTIVE_BENEFICIARY_LABELS: Record<ObjectiveBeneficiary, string> = en.missionParts.beneficiaries;

/**
 * One piece of work a mission is asking for.
 *
 * ─── WHY THIS IS MORE THAN A SENTENCE AND A TICKBOX ────────────────────────
 *
 * It used to be `{ id, description, completed }`. Everything that makes work
 * doable had nowhere to live: what the doer hands back, roughly how long it
 * takes, what they must NOT do, who it is for, and which record it rests on.
 * So a mission was a title, a briefing and a checklist of sentences, and
 * assembling one felt like filing rather than commissioning work.
 *
 * Every added field is OPTIONAL, and that is deliberate rather than lazy: an
 * objective written before this existed is not retroactively deficient, and a
 * required field would have forced a migration to invent values nobody stated.
 * An absent field is displayed as absent — see epistemicLanguage's notStated —
 * never as a default that reads like an answer.
 *
 * `completed` stays a boolean and stays honest: it says a person marked this
 * done, not that an artifact was checked. When `expectedArtifact` is set and
 * nothing was handed back, the UI says which, rather than blocking the tick.
 */
export interface MissionObjective {
  id: string;
  description: string;
  completed: boolean;
  /** What the doer hands back. Absent means nobody said. */
  expectedArtifact?: string;
  /** The report or finding this rests on, by id. */
  evidenceRef?: string;
  /** An honest estimate in minutes. Absent means nobody estimated it. */
  effortMinutes?: number;
  /** What must NOT be done. Stated, because an unstated limit is not a limit. */
  limits?: string[];
  beneficiary?: ObjectiveBeneficiary;
  /**
   * Who has taken this on. Not a role and not an access level: nothing is
   * enforced by it, and `guard-no-access-roles` records why a local-first
   * record cannot enforce one. It exists so open work is distinguishable from
   * claimed work — including on the globe.
   */
  claimedBy?: string;
}

export interface MissionUI {
  id: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  /** Who it came from, when it arrived in a bundle (plan item 2.4). */
  receivedFrom?: ReceivedFrom;
  missionNumber: string;
  title: string;
  briefing: string;
  status: MissionStatus;
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  /**
   * The team relays a Limited mission also goes to, beside the internal relays, as its author picked them (decision
   * LW1). Only relays still joined in this browser are sent to; never carried in a bundle.
   */
  /**
   * The Causes and Initiatives it works toward (the owner's RS59): its package carries each as a `toward` link, and
   * the cause counts it. Locked with its package, as the rest of what the package carries.
   */
  toward?: Array<{ coordinate: string; relay: string }>;
  /**
   * What it asks to be counted, each `<what>: a count` (the owner's MX32): its package carries them as effect lines,
   * so a report answers each with a whole number. Things, never people. Locked with its package.
   */
  countLines?: string[];
  limitedTo?: string[];
  sensitivity?: ContentSensitivity;
  objectives: MissionObjective[];
  assignedTo: string[];
  startDate: string; // ISO
  dueDate?: string;
  dispatchedDate?: string;
  /**
   * One person takes it, or anybody joins (interchange rev 11; D-MX, MX2).
   * Absent means anybody joins. Travels in the package, so it locks with it.
   */
  claims?: 'one' | 'many';
  /**
   * Field work for NavCom (D-MX, MX13): present while the switch is on. Its
   * package is drawn on NavCom's map, at a region and until an end, both
   * required to publish. A region, never a point (MX11): a country's code, or
   * a state's (`us`, `us-ca`). `until` is ISO 8601 with Z.
   */
  fieldWork?: { jurisdiction?: string; until?: string };
  // Cycle 4 packages Missions for Navcom by transforming these, not by
  // exposing them directly — the handoff boundary (Locked Decision #7) means
  // a Mission Package carries objectives/briefing, never raw Report content
  // or Starcom analyst identities.
  relatedReports: string[]; // IDs of linked IntelReportUI
  relatedCases: string[]; // IDs of linked IntelCaseUI
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Collaboration — human + AI (actorType lives on the team roster a
  // collaborator's userId resolves against, same convention as IntelReportUI).
  collaborators: Collaborator[];
  comments: Comment[];
  activityLog: ActivityLogEntry<MissionActivityAction>[];
  permissions: CollaborationPermissions;
  /**
   * Where this mission's package was published, as the addressable coordinate
   * `30079:<pubkey>:starcom_mission_package_<id>`. Absent until it is
   * dispatched, and absent on anything dispatched before this was recorded.
   *
   * Recorded rather than derived. The pubkey belongs to whoever signed at the
   * time, so recomputing it later from the current identity would silently
   * address a package nobody published and watch a thread that cannot exist.
   * It is what a peer's reply carries in its `a` tag — see
   * services/intel/missionPackageThread.ts.
   */
  publishedAs?: string;
  /**
   * The package as it was signed when the mission was packaged (plan item 0.7).
   * A retry sends exactly this, so what was packaged is what goes out. Dropped
   * when the mission goes back to READY_FOR_PACKAGE. Only a mission cleared for
   * public relays is ever packaged, so this holds nothing that was not already
   * bound for them.
   */
  packagedManifest?: PackageManifest;
  /**
   * What that package cites (decision D-MX: MX19, MX22, MX24): the observations
   * its linked reports rest on, as the review showed them. Beside the manifest
   * because the manifest does not carry them; kept so a retry and the closing
   * cite exactly what the package did. Dropped with the package.
   */
  packagedCites?: ReportCitation[];
  /**
   * What the publish that dispatched this mission achieved. DISPATCHED is only
   * ever written with one: at least one relay accepted the package.
   */
  dispatchReceipt?: PublishReceipt;
  /** The latest attempt that no relay accepted, so the screen can say what happened. */
  lastPublishAttempt?: PublishReceipt & { error?: string };
  /** How a closed mission ended: done, or called off (D-MX, MX12). */
  closedAs?: 'completed' | 'cancelled';
  /**
   * What publishing its closing achieved: a relay took its package again,
   * now saying `mission_state: closed`. Absent while the package, as
   * published, still says open.
   */
  closingReceipt?: PublishReceipt;
}

/** Where a package went: the signed event, and relays accepted out of relays tried. */
export interface PublishReceipt {
  eventId?: string;
  relaysAccepted: number;
  relaysTried: number;
  /** ISO time of the attempt. */
  at: string;
}

export interface CreateMissionInput {
  title: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  briefing: string;
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  limitedTo?: string[];
  sensitivity?: ContentSensitivity;
  objectives?: string[]; // plain descriptions; ids assigned on create
  assignedTo?: string[];
  dueDate?: string;
  relatedReports?: string[];
  relatedCases?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  // Overrides for demo/import data generators, mirroring
  // CreateIntelCaseInput's — everyday callers leave these unset. There is no
  // status override: every mission starts at DRAFT, and moves only through
  // MissionService (plan item 0.7).
  missionNumber?: string;
  startDate?: string;
}

/** Validated mission-status transitions, mirroring IntelCaseService's state machine. */
export const VALID_MISSION_STATUS_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  [MissionStatus.DRAFT]: [MissionStatus.PLANNING],
  [MissionStatus.PLANNING]: [MissionStatus.DRAFT, MissionStatus.READY_FOR_PACKAGE],
  [MissionStatus.READY_FOR_PACKAGE]: [MissionStatus.PLANNING, MissionStatus.PACKAGED],
  [MissionStatus.PACKAGED]: [MissionStatus.READY_FOR_PACKAGE, MissionStatus.DISPATCHED],
  [MissionStatus.DISPATCHED]: [MissionStatus.CLOSED],
  [MissionStatus.CLOSED]: []
};
