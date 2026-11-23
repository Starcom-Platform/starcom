// IntelItemUI - simplified UI representation of a raw Intel (.intel) file entry
// Mirrors a subset of IntelFrontmatter + markdown content for create/list purposes.

import { en } from '../../i18n/app/en';

/**
 * ─── HOW A RECORD ASKS TO BE HANDLED ───────────────────────────────────────
 *
 * Two independent axes, replacing a single four-rung clearance ladder.
 *
 * The ladder was `IntelItemClassification` — UNCLASSIFIED | CONFIDENTIAL |
 * SECRET | TOP_SECRET — and it conflated two questions that are not the same
 * question:
 *
 *   "who may receive this?"        → distribution
 *   "what must be stripped first?" → handling of the content itself
 *
 * Because one value answered both, every rule had to pick a rung and mean two
 * things by it, and three separate behaviours ended up keyed off
 * `>= CONFIDENTIAL` for want of anywhere better to hang. A report that is
 * freely publishable but names a source had nowhere to say so; neither did one
 * that is internal-only but contains nothing delicate.
 *
 * Splitting them lets the middle values do real work:
 *
 *   sensitivity 'careful'  → redact before emitting, but no encryption at rest
 *   visibility  'limited'  → keep off public relays, but nothing to redact
 *
 * Neither of those was expressible before. That is the point of the change; it
 * is not a re-spelling of the same four rungs in gentler words.
 *
 * Both fields are OPTIONAL on every record. Absent means the author did not
 * say. For sensitivity the open reading is the correct reading of silence:
 * nothing needs protecting until someone says so. For distribution it is not
 * (plan item 0.5, decision D2): Public cannot be recalled, so a record nobody
 * has decided on goes nowhere. Neither is required, because requiring a
 * declaration nobody made is what produced 17 spurious errors on the first
 * attempt at this migration: undecided is a state, not an error.
 */
import type { ReceivedFrom } from './IntelCaseUI';


/** Who may receive this. Governs distribution, not content. */
export type InformationVisibility =
  | 'public'        // publishable anywhere, including public relays
  | 'limited'       // restricted distribution for operational reasons
  | 'private';      // internal use only

/** What the content itself requires. Governs handling, not audience. */
export type ContentSensitivity =
  | 'open'          // nothing here needs protecting
  | 'careful'       // contains source/method detail — redact before emitting
  | 'protected';    // protect at rest as well; encrypt stored fields

/**
 * The permitted values, as data.
 *
 * Exported because three places had already grown their own copy of these
 * arrays — IntelWorkspaceManager's metadata reader, reportValidation and
 * intelReportSerialization — which is how the tier ladder ended up with five
 * different spellings across the codebase ('UNCLASS', 'PUBLIC', 'SCI', ...).
 * One definition, used by every validator.
 */
export const INFORMATION_VISIBILITIES = ['public', 'limited', 'private'] as const;
export const CONTENT_SENSITIVITIES = ['open', 'careful', 'protected'] as const;

/**
 * What each value MEANS, for anyone choosing one.
 *
 * Option text lives beside the values because a second copy of it drifts the
 * same way a second copy of the values did — and because "CONFIDENTIAL" told
 * an operator nothing about what would happen to their report, which is half
 * the reason the ladder was useless. These say what the choice does.
 */
export const VISIBILITY_LABELS: Record<InformationVisibility, string> = en.shared.distribution.labels;

export const SENSITIVITY_LABELS: Record<ContentSensitivity, string> = en.shared.sensitivity;

/** Narrows unknown input — for anything arriving from storage, a file or the wire. */
export function isInformationVisibility(value: unknown): value is InformationVisibility {
  return typeof value === 'string'
    && (INFORMATION_VISIBILITIES as readonly string[]).includes(value);
}

export function isContentSensitivity(value: unknown): value is ContentSensitivity {
  return typeof value === 'string'
    && (CONTENT_SENSITIVITIES as readonly string[]).includes(value);
}

/** Anything carrying handling instructions. Widened so predicates take records. */
export interface HandlingMarked {
  visibility?: InformationVisibility;
  sensitivity?: ContentSensitivity;
}

/**
 * Encrypt this record's stored fields at rest.
 *
 * Was `classification ∈ {CONFIDENTIAL, SECRET, TOP_SECRET}` in
 * IntelWorkspaceManager. Under the bridge below that set maps to 'protected',
 * so this is behaviour-preserving for existing records.
 */
export function requiresProtection(sensitivity: ContentSensitivity | undefined): boolean {
  return sensitivity === 'protected';
}

/**
 * Keep this record off any relay that anyone can read.
 *
 * Was the same CONFIDENTIAL+ set in MissionService.assertMayLeaveInPlaintext.
 * Note this fires on 'limited' too, which the ladder could not express without
 * also demanding encryption at rest.
 */
export function requiresRestrictedDistribution(
  visibility: InformationVisibility | undefined
): boolean {
  return visibility !== undefined && visibility !== 'public';
}

/**
 * Strip source/method detail before this record leaves the app.
 *
 * Was `=== 'CONFIDENTIAL'` in DraftBuilder — an equality test against ONE rung
 * of an ordered ladder, so SECRET and TOP_SECRET drafts emitted watchlist
 * entities in the clear while CONFIDENTIAL redacted them. The two most
 * restrictive markings were the two least protected. A predicate over a
 * two-value axis cannot reproduce that mistake: there is no rung to skip past.
 */
export function requiresCare(sensitivity: ContentSensitivity | undefined): boolean {
  return sensitivity === 'careful' || sensitivity === 'protected';
}

/*
 * ─── THE MIGRATION BRIDGE IS GONE ──────────────────────────────────────────
 *
 * sensitivityOf/visibilityOf used to fall back to a legacy `classification`
 * when no axis was present, mapping the rungs that fired encryption at rest
 * onto 'protected'/'private'. They now read the field and nothing else.
 *
 * That was only safe because the stored data was migrated FIRST — see
 * backfillHandlingAxes in IntelWorkspaceManager (7c/1), which writes the axes
 * onto every record that carried a tier. Without it, deleting these branches
 * would have let a protected record store its next edit as plaintext.
 *
 * They stay as functions rather than being inlined at ~20 call sites: absence
 * still needs a defined reading (the open case for sensitivity, undecided for
 * distribution), and it belongs in one place rather than twenty.
 */
export function sensitivityOf(record: HandlingMarked | null | undefined): ContentSensitivity {
  return record?.sensitivity ?? 'open';
}

/**
 * Who may receive a record, or undefined when nobody has decided (plan item
 * 0.5, decision D2: ask every time). Absence used to read as Public, which
 * sent a record nobody had decided on to relays that cannot recall it.
 */
export function visibilityOf(record: HandlingMarked | null | undefined): InformationVisibility | undefined {
  return record?.visibility;
}

/*
 * ─── IntelItemClassification IS GONE ──────────────────────────────────────
 *
 * The four-rung ladder, under a comment that was the whole argument against
 * it: "OSINT-only policy: all externally-sourced data must be UNCLASSIFIED.
 * Additional levels retained in the type for future multi-tenant / classified
 * deployments."
 *
 * Three of its four values were illegal by the policy stated on the line
 * above them, kept for a product that does not exist. Every rule written
 * against it therefore had one reachable value and three that described
 * somebody else's deployment — which is how a comparator ended up returning 0
 * for every pair, a validator ended up rejecting unmarked reports, and a
 * significance score ended up ranking secrecy.
 *
 * It outlived its own removal by nine stages because it was REQUIRED on the
 * core records: a required field must be supplied at every construction site,
 * so 142 files had to name it. Making it optional (7a') collapsed most of
 * that, and deleting the field (7c/2) left this type with no users at all —
 * the last four references were unused imports.
 *
 * `visibility` and `sensitivity` in this file replace it.
 */
export type IntelReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface IntelItemHistoryEntry {
  timestamp: string; // ISO
  action: 'CREATED' | 'UPDATED' | 'IMPORTED';
  user?: string;
  changes?: string[];
}

/**
 * Audit trail of how this item moved from raw collection to its current
 * state — ported from core/intel's IntelEntity.processingLineage. Optional:
 * most items (manually authored, or from sources that don't track this)
 * simply won't have one.
 */
export interface IntelProcessingLineage {
  steps: Array<{
    stage: 'collection' | 'processing' | 'analysis' | 'visualization';
    timestamp: number;
    processor: string;
    transformationType: string;
    sourceIds: string[];
    confidence: number;
  }>;
  totalSteps: number;
  processingDuration: number;
  qualityScore: number;
}

/** Confidence broken down by stage rather than a single number — ported from IntelEntity.confidenceMetrics. */
export interface IntelConfidenceMetrics {
  extraction: number;  // 0-100
  correlation: number; // 0-100
  analysis: number;    // 0-100
  validation: number;  // 0-100
  overall: number;     // 0-100, computed from the above
}

/** OSINT-specific collection metadata — ported from IntelEntity.osintMetadata. */
export interface IntelOsintMetadata {
  collectionMethod: string;
  collectionTimestamp: number;
  lastVerified: number;
  verificationMethod?: string;
  qualityIndicators: {
    freshness: number;    // 0-100
    completeness: number; // 0-100
    accuracy: number;     // 0-100
    relevance: number;    // 0-100
  };
}

export interface IntelItemUI {
  id: string;
  title: string;
  type: string; // e.g. INDICATOR, OBSERVATION, EVENT
  source: string;
  reliability: IntelReliability;
  confidence: number; // 0..1
  tags: string[];
  categories: string[];
  latitude?: number;
  longitude?: number;
  content: string; // markdown body
  createdAt: Date;
  updatedAt: Date;
  /** When it was collected, ISO, where it is kept: a capture's moment, which may be before it was added. */
  collectedAt?: string;
  verified: boolean;
  /** Who sent it, when it came in a bundle (plan item 2.4); absent for one made here. */
  receivedFrom?: ReceivedFrom;
  version?: number;
  history?: IntelItemHistoryEntry[];
  // Richer provenance/quality fields, ported from core/intel's IntelEntity.
  // All optional — nothing that already constructs an IntelItemUI needs to change.
  processingLineage?: IntelProcessingLineage;
  confidenceMetrics?: IntelConfidenceMetrics;
  osintMetadata?: IntelOsintMetadata;
  // Event-dating fields, ported from core/intel's TimelineEvent — generically
  // useful for any item that represents something that happened at a
  // particular time, not Timeline-specific. Distinct from createdAt/
  // updatedAt, which are record timestamps, not observed-event timestamps.
  eventDate?: string; // ISO — when the observed activity actually occurred
  eventEndDate?: string; // ISO — for events with a duration
  isEstimated?: boolean; // whether eventDate is an estimate rather than a confirmed timestamp
  /** 0-100 — how significant this item is judged to be, distinct from confidence (how sure we are it's true). */
  importance?: number;
  /** IDs of other IntelItemUI/IntelReportUI records this one references or was derived alongside. Lighter-weight than a full IntelRelationshipUI — no type/confidence/direction, just a plain association. */
  relatedIds?: string[];
  // Named entities (people, orgs, places-as-entities — not general
  // categorization, that's `tags`) this item concerns. Author-tagged for
  // now — no extraction feature exists yet, so this is empty until
  // someone explicitly names an entity, never inferred. Feeds
  // correlationUtils.ts's co-occurrence detection and IntelWeb's entity
  // graph, both of which were starved of real data before this field
  // existed (eventsAdapter.ts previously hardcoded entityRefs: []).
  entityRefs?: string[];
  /** See HOW A RECORD ASKS TO BE HANDLED above. Optional: absent means unstated. */
  visibility?: InformationVisibility;
  sensitivity?: ContentSensitivity;
}

export interface CreateIntelItemInput {
  title: string;
  type: string;
  source: string;
  reliability: IntelReliability;
  confidence: number;
  tags: string[];
  categories: string[];
  latitude?: number;
  longitude?: number;
  content: string;
  verified?: boolean;
  entityRefs?: string[];
  visibility?: InformationVisibility;
  sensitivity?: ContentSensitivity;
  /** When it was collected, ISO, where that is not when it is added: a capture may wait before Starcom takes it in. */
  collectedAt?: string;
}
