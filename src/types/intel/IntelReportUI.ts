// IntelReportUI - UI-facing representation of an Intelligence Report
// Bridges existing IntelDashboard component and the richer IntelWorkspace types.
// Dates are concrete Date objects in UI layer; persistence adapters serialize to ISO strings.
import type { ReceivedFrom } from './IntelCaseUI';
import type { BoundedOutline } from '../../services/geoint/boundedOutline';
import type {
  IntelReliability,
  IntelProcessingLineage,
  IntelConfidenceMetrics,
  IntelOsintMetadata,
  InformationVisibility,
  ContentSensitivity
} from './IntelItemUI';
import type { Collaborator } from './IntelCaseUI';

export type IntelReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'ARCHIVED';
/**
 * Validated report-status transitions: the table IntelReportService enforces
 * and the steps a person is offered read (plan item 1.7). Approval is open to
 * any key but the author's.
 */
export const VALID_REPORT_STATUS_TRANSITIONS: Record<IntelReportStatus, IntelReportStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['REVIEWED', 'DRAFT', 'ARCHIVED'],
  REVIEWED: ['APPROVED', 'SUBMITTED', 'ARCHIVED'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: []
};
/** How serious it is, on the Cases' scale (plan item 1.9). Absent: not assessed. See reportPriority.ts. */
export type IntelReportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
// `IntelReportClassification = IntelItemClassification` was here — an alias
// for the ladder, and it outlived the thing it aliased by one commit.

/*
 * ─── THE ORDERED LADDER IS GONE, AND IT WAS MINE ───────────────────────────
 *
 * UNMARKED, ClassificationDisplay, CLASSIFICATION_ORDER, isClassification and
 * classificationAtOrAbove stood here. All five came from `56eddefd`, and they
 * were a real improvement on what they replaced: rules had been written as
 * `=== 'CONFIDENTIAL'` against an unordered union, so DraftBuilder left SECRET
 * and TOP_SECRET drafts LESS protected than CONFIDENTIAL ones — the two most
 * restrictive markings were the two least protected. An explicit order fixed
 * that class of bug, and it fixed it correctly.
 *
 * It was still the wrong thing to build. The product had already decided the
 * ladder was leaving, and I had read that decision before writing this. What I
 * produced was a well-engineered ordering for a scheme with no future, which
 * then had to be carried through eight more stages of removal.
 *
 * The distinction it drew is the part worth keeping, and it is kept — not here
 * but in the shape of the replacement. UNMARKED existed because 'UNCLASSIFIED'
 * is a marking somebody applied after looking at the content while absence is
 * nobody having looked, and collapsing the second into the first invents a
 * review that never happened. The two axes carry that by being OPTIONAL: absent
 * means unstated, and every predicate reads it as the open case rather than
 * substituting a bottom rung. See src/types/intel/IntelItemUI.ts.
 *
 * And the ordering problem cannot recur, because there is no order to get
 * wrong: `requiresCare` covers two of three sensitivity values, so there is no
 * rung to skip past.
 */

export interface IntelReportHistoryEntry {
  timestamp: string; // ISO
  action: string; // e.g. CREATED, UPDATED, STATUS_CHANGED
  user?: string;
  changes?: string[]; // field names changed
  fromStatus?: IntelReportStatus;
  toStatus?: IntelReportStatus;
}

/** An event a report rests on: its id, and a relay that held it, as a hint for whoever fetches it. */
export interface ReportCitation {
  eventId: string;
  relay?: string;
}

export interface IntelReportUI {
  id: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  /** Who it came from, when it arrived in a bundle (plan item 2.4). */
  receivedFrom?: ReceivedFrom;
  title: string;
  content: string; // full body
  summary?: string; // optional manual summary override
  author: string;
  category: string; // single primary category (mapped to metadata.categories[0])
  tags: string[];
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  sensitivity?: ContentSensitivity;
  /**
   * Where the report is ABOUT — the subject or event location.
   *
   * NOT where it was collected, and not where the analyst was. That ambiguity
   * was unresolved for the life of this field, and it blocked any rule for
   * aggregating coordinates across records: averaging subject locations means
   * something, averaging analyst locations means nothing.
   *
   * Decided in docs/missions/01-architecture-decisions/case-location-semantics.md.
   * Resolving it differently means updating that document too — the temporal
   * fields below had their own ambiguity settled the same way.
   */
  latitude?: number;
  longitude?: number;
  /**
   * The shape this report was published as, bounded so it can be stored.
   *
   * Present only when the source was a line or a polygon. `latitude`/
   * `longitude` stay the representative point either way and remain what
   * places the report — this is what it LOOKS like, not where it is, and the
   * two are separate so nothing that reads a coordinate has to learn about
   * shapes.
   *
   * Bounded rather than exact: see boundedOutline for why 2000 vertices per
   * polygon cannot be kept per report, and for the counts it carries so a
   * simplified shape is never drawn as though it were the original.
   */
  outline?: BoundedOutline;
  /**
   * Jurisdictions the PUBLISHER named for this report, as they named them.
   *
   * Stated, never derived. A coordinate can be resolved to a territory by
   * geometry, but that is this node making a claim about someone else's report;
   * this is a reading of what they said. The two are separate coverage axes for
   * exactly that reason, and conflating them would turn an inference into a
   * quotation.
   *
   * Free-form on purpose. A peer publishes `us` and `us-tx`; another may use
   * ISO codes or names. Normalising to a vocabulary we chose would silently
   * reinterpret their claim, so the values are lowercased and trimmed and
   * otherwise left alone.
   */
  jurisdictions?: string[];
  /**
   * How precisely the publisher placed this, as a radius in metres: stated with
   * `geo_precision`, or the geohash cell its position came from (statedPrecision).
   * Absent when neither said; that is unknown, not exact.
   */
  geoPrecisionM?: number;
  createdAt: Date;
  updatedAt: Date;
  status: IntelReportStatus;
  // Optional Analyzer round-trip deep link for provenance/return navigation
  analysisDeepLink?: string;
  /**
   * ─── ASSESSMENT BELONGS ON A CASE, NOT HERE ──────────────────────────────
   *
   * `conclusions`, `recommendations` and `targetAudience` are DEPRECATED.
   * They are kept, and existing values are preserved and still editable —
   * nothing anyone wrote is being thrown away — but new assessment should be
   * recorded as a Case position (see CasePosition in IntelCaseUI).
   *
   * The reason is not tidiness. This network derives weight from disclosed
   * method and never from author assertion, which is published in the
   * interchange spec and this node's descriptor. A conclusion sitting on a
   * single observation has no method to disclose: no members, no
   * contradictions considered, no adjudicator. So it cannot become an attested
   * claim, and today a human analyst's conclusion has no path onto the grid at
   * all — only computed corroboration does.
   *
   * A Case position can carry all of that, because a Case records what it
   * rests on and what argues against it. Moving assessment there is what makes
   * a human's judgement a first-class product on the wire rather than a local
   * note.
   *
   * Note what is NOT deprecated. `methodology` stays: how something was
   * observed is provenance and belongs with the observation. `confidence`
   * stays because it has a real derived path — see `confidenceBasis`, which
   * records whether a value was computed from linked sources' reliability
   * grades or typed by an author, with the algorithm version and source count.
   * That distinction is the same principle, already applied here.
   */
  /** @deprecated Record assessment as a Case position; see CasePosition. */
  conclusions?: string[];
  /** @deprecated Record assessment as a Case position; see CasePosition. */
  recommendations?: string[];
  /** How this was observed. Provenance, not assessment — stays on the report. */
  methodology?: string[];
  confidence?: number; // 0..1
  // Set by IntelWorkspaceManager whenever confidence was computed from
  // sourceIntelIds' reliability grades rather than left as a bare
  // author-typed number — read-only from the UI's perspective, the
  // manager is the only writer. Absent on reports with no linked sources.
  confidenceBasis?: {
    source: 'derived' | 'author-set';
    algorithmVersion?: number;
    sourceCount?: number;
  };
  priority?: IntelReportPriority;
  /** @deprecated Dissemination is not a property of an observation. */
  targetAudience?: string[];
  sourceIntelIds?: string[]; // IDs of linked Intel items
  /**
   * The Nostr events this report rests on, cited when it is published as
   * `["e", <id>, <relay>, "cites"]` (decision D-MX, MX3 and MX19): a field
   * observation in NavCom's format, kind 1911. A citation keeps the
   * observation in NavCom's stores and credits whoever made it.
   */
  cites?: ReportCitation[];
  /**
   * The notes and mission packages a received note names, by address (`30023:` or `30079:`), from its
   * `a` tags (decision D-IW, IW1 and IW7): stated by its publisher, never inferred. IntelWeb links them.
   */
  refers?: string[];
  /**
   * Where the information was published, from a received note's `r` tags in tag order: the
   * original source first (decision D-CT, CT2; Interchange 3.19). http and https only, at most 20,
   * read again wherever shown. Never inferred from the note's text.
   */
  sourceLinks?: string[];
  // Named entities (people, orgs, places-as-entities — not general
  // categorization, that's `tags`) this report concerns. Author-tagged
  // for now, never inferred — no entity-extraction feature exists yet.
  // Feeds correlationUtils.ts's co-occurrence detection and IntelWeb's
  // entity graph, both starved of real data before this field existed.
  entityRefs?: string[];
  // Event time range (distinct from createdAt/updatedAt, which are record timestamps).
  // A single-instant event sets startDate only.
  startDate?: Date;
  endDate?: Date;
  /**
   * How closely startDate and endDate are known, in milliseconds. Each is the
   * start of a window this wide that the moment falls in: 27 Jul 00:00Z known to
   * a day is the whole of 27 Jul, not its midnight. The same field, read the same
   * way, as SourceObservation.timePrecisionMs. Absent means not stated. See
   * utils/eventTime.ts and decision D-E.
   */
  timePrecisionMs?: number;
  // External, author-supplied hashtags (e.g. from a Nostr event). Distinct from `tags`,
  // which carries internal/synthetic taxonomy (category, provenance markers) — keeping
  // them separate prevents externally-controlled content from polluting internal tagging.
  hashtags?: string[];
  /**
   * The publisher's own `["t","names_people"]` (decision D-NP): the note names a person as a cited source names them.
   * Read from the event's t tags alone, never from `hashtags`, which also takes #words from the text.
   */
  namesPeople?: boolean;
  // Forward-compat landing spot for fields not yet promoted to a named property.
  extra?: Record<string, unknown>;
  // Versioning / Metadata
  version?: number; // increment per save
  manualSummary?: boolean; // indicates summary is user-provided
  history?: IntelReportHistoryEntry[]; // local history log
  // Decentralized verification fields (Step 2.3.1)
  ipfsHash?: string;
  solanaTx?: string;
  /** The exact event a report read from a relay was read at: the version a review is pinned to (plan item 5.1). */
  nostrEventId?: string;
  /** That event's kind: 30023 for an addressable report, 1 for a note. */
  nostrKind?: number;
  verificationStatus?: VerificationStatus;
  verificationDetails?: VerificationDetails;
  // Richer provenance/quality fields, ported from core/intel's IntelEntity.
  // All optional — nothing that already constructs an IntelReportUI needs to change.
  reliability?: IntelReliability;
  processingLineage?: IntelProcessingLineage;
  confidenceMetrics?: IntelConfidenceMetrics;
  osintMetadata?: IntelOsintMetadata;
  // Team coordination: who's collaborating on this report, human or AI (Collaborator
  // doesn't distinguish — a member's actorType, if relevant, lives on the team roster
  // this userId resolves against, not duplicated here). Reuses IntelCaseUI's exact
  // Collaborator shape rather than a sixth incompatible one. Optional and defaults to
  // [] at the service layer — every existing report predates this field.
  collaborators?: Collaborator[];
}

// Input when creating a new report from the UI (before id/dates assigned)
export interface CreateIntelReportInput {
  title: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  content: string;
  summary?: string;
  category: string;
  tags: string[]; // already split & trimmed
  latitude?: number;
  longitude?: number;
  status?: IntelReportStatus; // optional (defaults to DRAFT)
  /** Handling axes — see IntelItemUI. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  sensitivity?: ContentSensitivity;
  conclusions?: string[];
  recommendations?: string[];
  methodology?: string[];
  confidence?: number;
  /** Jurisdictions the author named, lowercased and trimmed (plan item 1.9). */
  jurisdictions?: string[];
  /** How precisely the author placed it, as a radius in metres. Absent: not stated. */
  geoPrecisionM?: number;
  priority?: IntelReportPriority;
  targetAudience?: string[];
  sourceIntelIds?: string[];
  /** The events it rests on, cited when it is published (D-MX, MX19). */
  cites?: ReportCitation[];
  entityRefs?: string[];
  startDate?: Date;
  endDate?: Date;
  timePrecisionMs?: number;
  hashtags?: string[];
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Verification types (Step 2.3.1 — Verification Chain)
// ---------------------------------------------------------------------------

export type VerificationStatus = 'verified' | 'partial' | 'unverified' | 'local-only';

export interface VerificationCheckResult {
  passed: boolean;
  checkedAt: string; // ISO timestamp
  detail?: string;
}

export interface VerificationDetails {
  ipfsExists?: VerificationCheckResult;
  cidMatches?: VerificationCheckResult;
  onChain?: VerificationCheckResult;
  nostrPublished?: VerificationCheckResult;
  overall: VerificationStatus;
  checkCount: number; // how many of 4 passed
  lastChecked: string; // ISO timestamp
}
