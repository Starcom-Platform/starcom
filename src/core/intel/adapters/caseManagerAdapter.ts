/**
 * CaseManagerAdapter — same public contract as before (CaseItem/CaseFilter/
 * CaseStats, and every method CasesDashboard/useCaseManager already call),
 * now backed by the unified Intel substrate (IntelWorkspaceManager, via
 * IntelCaseService) instead of storageOrchestrator/intelDataStore. Every
 * collaboration method below — comments, collaborators, permissions, sharing
 * tokens, activity log — carries over the exact read-modify-write logic that
 * was already built here; it just persists for real now.
 *
 * Event emission: the old adapter listened for generic entity:created/
 * updated/deleted events from storageOrchestrator and translated them into
 * case:* events. There's no equivalent generic entity-event stream on the
 * unified substrate, so case:created/updated/deleted are now emitted
 * directly from the methods that cause them — the same direct-emit approach
 * the collaboration methods (addCollaborator, addComment, ...) already used.
 */
import {
  CaseRecord,
  CaseStatus,
  CasePriority,
  Collaborator,
  CaseComment,
  ActivityLogEntry,
  CasePermissions,
} from '../types/intelDataModels';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';

/*
 * A record is evidence for a case or argues against it, never both (plan item
 * 1.3). Neither link checked the other list, so a record could sit on both and
 * be counted on each side of a position. The words are shared with the screens
 * that offer the choice, so they say what the refusal says.
 */
export const EVIDENCE_BLOCKED =
  'This record is already recorded as arguing against this case. Remove it from what argues against the case before adding it as evidence.';
export const CONTRADICTION_BLOCKED =
  'This record is already evidence for this case. Unlink it as evidence before recording it as arguing against the case.';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { outletOf } from '../../../utils/outletOf';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import {
  IntelCaseUI,
  CasePosition,
  CaseVerdict,
  CaseStatus as UICaseStatus,
  CasePriority as UICasePriority,
  CaseActivityAction,
  Collaborator as UICollaborator,
  CaseComment as UICaseComment,
  ActivityLogEntry as UIActivityLogEntry,
  caseGroup,
  type CaseGroup,
  type CaseSource,
  type CaseSourceInput,
} from '../../../types/intel/IntelCaseUI';
import type { CollectionRequirement } from '../../../services/intel/collection/collectionRequirement';
import { requirementPlace } from '../../../services/intel/collection/collectionRequirement';
import { FIELD_METHODS, type FieldMethod } from '../../../types/intel/SourceObservation';
import type { InformationVisibility, ContentSensitivity } from '../../../types/intel/IntelItemUI';

// Public contract types — unchanged from the pre-migration adapter, so
// CasesDashboard.tsx and useCaseManager.ts need no changes to consume them.

/** An http or https link, trimmed; null for anything else (a javascript: link is not a source). */
function webLinkOf(raw: string): string | null {
  try {
    const link = raw.trim();
    const { protocol } = new URL(link);
    return protocol === 'http:' || protocol === 'https:' ? link : null;
  } catch {
    return null;
  }
}

export interface CaseItem {
  id: string;
  /**
   * Sample material: written by a demo seed or a tutorial, never by a person
   * about the world (plan item 0.9). Never published. Absent means real.
   */
  sample?: boolean;
  /** Who it came from, when it arrived in a bundle (plan item 2.4). */
  receivedFrom?: IntelCaseUI['receivedFrom'];
  caseNumber: string;
  title: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  assignedTo: string[];
  startDate: Date;
  dueDate?: Date;
  closedDate?: Date;
  relatedEntities: string[];
  /**
   * Records that ARGUE AGAINST this case.
   *
   * On the public shape as well as the stored one, because a field that stops
   * at the storage boundary is a field the surfaces cannot show — and the
   * whole reason this exists is that a case able only to accumulate agreement
   * is a filing cabinet rather than an analytic object.
   */
  contradictedBy?: string[];
  /**
   * What the case concluded. See CasePosition in IntelCaseUI for why it
   * carries no confidence figure: weight is derived from disclosed method,
   * and this case's method is its members, its contradictions and its
   * adjudicator.
   */
  position?: CasePosition;
  /** What the case still needs. Carried through so a reader sees the gaps, not only the findings. */
  requirements?: CollectionRequirement[];
  /** The articles it rests on (D-DP, DP7). Carried through, as the rest are. */
  sources?: IntelCaseUI['sources'];
  relatedCases: string[];
  visibility?: InformationVisibility;
  /** The joined team relays a Limited case also goes to (LW1). */
  limitedTo?: string[];
  sensitivity?: ContentSensitivity;
  tags: string[];
  metadata: Record<string, unknown>;
  updatedAt: Date;
  collaborators: Collaborator[];
  comments: CaseComment[];
  activityLog: ActivityLogEntry[];
  shareToken?: string;
  permissions: CasePermissions;
}

export interface CaseFilter {
  property: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'before' | 'after' | 'between';
  value: unknown;
}

export interface CaseStats {
  totalCases: number;
  /** Grouped by status, as the Cases tabs group them (plan item 1.8). */
  openCases: number;
  onHoldCases: number;
  closedCases: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  avgTimeToClose: number | null;
  recentActivity: {
    created: number;
    updated: number;
    closed: number;
  };
}

/**
 * Who to attribute a new activity entry to.
 *
 * Empty string when there is genuinely no identity — NOT a stand-in like
 * 'operative'. replayCase surfaces unattributed actions deliberately, and
 * writing a placeholder would launder "we do not know who did this" into a
 * named actor in an audit trail built for court and journalistic use.
 *
 * In practice a real pubkey is almost always available: nostrService creates
 * or restores a keypair at module load, so this rarely falls through. That is
 * precisely why the fallback must not invent a name — the rare case is the
 * one that matters.
 */
function currentAttribution(): string {
  // The signer's key (plan item 2.2): with an extension, the extension's.
  return nostrIdentityService.signerPubkey() ?? '';
}

export class CaseManagerAdapter {
  // ── Transform: IntelCaseUI (storage shape) <-> CaseItem (public shape) ──

  // Status/priority enums are string-identical between the public CaseItem
  // contract (intelDataModels) and the storage-side IntelCaseUI (types/intel),
  // so they are cast rather than re-declared.
  //
  // A third entry used to be listed here: classification. The comment called
  // the 7-value ClassificationLevel being "wider than the canonical
  // IntelItemClassification (4 values)" a documented gap that round-tripped
  // fine as plain strings. It was not a gap — it was two independent
  // inventions of the same nonexistent scheme, and this adapter existed partly
  // to launder one into the other. Both are gone; visibility and sensitivity
  // are string-identical on both sides and need no cast at all.
  private toCaseItem(record: IntelCaseUI): CaseItem {
    return {
      id: record.id,
      ...(record.sample ? { sample: true } : {}),
      ...(record.receivedFrom ? { receivedFrom: record.receivedFrom } : {}),
      caseNumber: record.caseNumber,
      title: record.title,
      description: record.description,
      status: record.status as unknown as CaseStatus,
      priority: record.priority as unknown as CasePriority,
      assignedTo: record.assignedTo,
      startDate: new Date(record.startDate),
      dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
      closedDate: record.closedDate ? new Date(record.closedDate) : undefined,
      relatedEntities: record.relatedEntities,
      // Carried through, or the fields exist in storage and vanish at the
      // boundary the dashboard actually reads from.
      contradictedBy: record.contradictedBy,
      position: record.position,
      requirements: record.requirements,
      ...(record.sources ? { sources: record.sources } : {}),
      relatedCases: record.relatedCases,
      visibility: record.visibility,
      ...(record.limitedTo ? { limitedTo: record.limitedTo } : {}),
      sensitivity: record.sensitivity,
      tags: record.tags,
      metadata: record.metadata ?? {},
      updatedAt: new Date(record.updatedAt),
      collaborators: record.collaborators as unknown as Collaborator[],
      comments: record.comments as unknown as CaseComment[],
      activityLog: record.activityLog as unknown as ActivityLogEntry[],
      shareToken: record.shareToken,
      permissions: record.permissions as unknown as CasePermissions,
    };
  }

  private matchesFilter(item: CaseItem, filter: CaseFilter): boolean {
    const raw = (item as unknown as Record<string, unknown>)[filter.property];
    switch (filter.operator) {
      case 'equals':
        return raw === filter.value;
      case 'contains':
        return typeof raw === 'string' && typeof filter.value === 'string'
          ? raw.toLowerCase().includes(filter.value.toLowerCase())
          : Array.isArray(raw) && raw.includes(filter.value);
      case 'startsWith':
        return typeof raw === 'string' && typeof filter.value === 'string' && raw.startsWith(filter.value);
      case 'endsWith':
        return typeof raw === 'string' && typeof filter.value === 'string' && raw.endsWith(filter.value);
      case 'before':
        return raw instanceof Date && filter.value instanceof Date ? raw < filter.value : false;
      case 'after':
        return raw instanceof Date && filter.value instanceof Date ? raw > filter.value : false;
      case 'between': {
        if (!(raw instanceof Date) || !Array.isArray(filter.value) || filter.value.length !== 2) return false;
        const [start, end] = filter.value as [Date, Date];
        return raw >= start && raw <= end;
      }
      default:
        return true;
    }
  }

  private async allCaseItems(): Promise<CaseItem[]> {
    const records = await intelCaseService.listCases();
    return records.map((r) => this.toCaseItem(r));
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async getCases(filters?: CaseFilter[]): Promise<CaseItem[]> {
    let items = await this.allCaseItems();
    if (filters?.length) {
      items = items.filter((item) => filters.every((f) => this.matchesFilter(item, f)));
    }
    items.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    return items;
  }

  async getCaseStats(filters?: CaseFilter[]): Promise<CaseStats> {
    const cases = await this.getCases(filters);
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let closedCount = 0;
    let totalTimeToClose = 0;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    let created = 0;
    let updated = 0;
    let closed = 0;

    for (const c of cases) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;

      if (c.closedDate) {
        closedCount++;
        // Floor at zero — bad data (closedDate before startDate) shouldn't drag the average negative.
        totalTimeToClose += Math.max(0, c.closedDate.getTime() - c.startDate.getTime());
      }

      if (c.startDate.getTime() >= thirtyDaysAgo) created++;
      if (c.updatedAt.getTime() >= thirtyDaysAgo) updated++;
      if (c.closedDate && c.closedDate.getTime() >= thirtyDaysAgo) closed++;
    }

    const inGroup = (group: CaseGroup) => cases.filter((c) => caseGroup(c.status) === group).length;
    return {
      totalCases: cases.length,
      openCases: inGroup('open'),
      onHoldCases: inGroup('on-hold'),
      closedCases: inGroup('closed'),
      byStatus,
      byPriority,
      avgTimeToClose: closedCount > 0 ? totalTimeToClose / closedCount / (24 * 60 * 60 * 1000) : null,
      recentActivity: { created, updated, closed },
    };
  }

  async getCaseById(id: string): Promise<CaseItem | null> {
    const record = await intelCaseService.getCase(id);
    return record ? this.toCaseItem(record) : null;
  }

  async getActivityLog(caseId: string): Promise<ActivityLogEntry[]> {
    const record = await intelCaseService.getCase(caseId);
    return (record?.activityLog as unknown as ActivityLogEntry[]) ?? [];
  }

  async getComments(caseId: string): Promise<CaseComment[]> {
    const record = await intelCaseService.getCase(caseId);
    return (record?.comments as unknown as CaseComment[]) ?? [];
  }

  // ── Case CRUD ──────────────────────────────────────────────────────────

  /** Returns the new case's id (matching the pre-migration contract), or null if title/description are missing. */
  async addCase(caseData: Partial<CaseRecord>): Promise<string | null> {
    if (!caseData.title || !caseData.description) return null;

    const record = await intelCaseService.createCase({
      title: caseData.title,
      description: caseData.description,
      // Kept, not dropped: the demo seed's cases say they are samples (plan item 0.9).
      ...(caseData.sample ? { sample: true } : {}),
      priority: caseData.priority as unknown as UICasePriority | undefined,
      visibility: caseData.visibility,
      ...(caseData.limitedTo?.length ? { limitedTo: caseData.limitedTo } : {}),
      sensitivity: caseData.sensitivity,
      assignedTo: caseData.assignedTo,
      dueDate: caseData.dueDate,
      relatedEntities: caseData.relatedEntities,
      tags: caseData.tags,
      metadata: caseData.metadata,
      // Overrides for callers (demo/import data generators) that already
      // know a case's full initial state — omitted by everyday callers,
      // who get the real defaults (status NEW, startDate now, ...).
      startDate: caseData.startDate,
      status: caseData.status as unknown as UICaseStatus | undefined,
      closedDate: caseData.closedDate,
      caseNumber: caseData.caseNumber,
      // Carried, not dropped: a case with no author is taken to be the current
      // person's own and ensures their signing identity, so the dev sample cases
      // made a key on every fresh profile while naming 'intel-analyst' as author.
      createdBy: caseData.createdBy,
    });
    enhancedEventEmitter.emit('case:created', { caseId: record.id, case: this.toCaseItem(record) });
    // The articles it is started on, each logged after its creation, so its history replays whole (DP7).
    if (caseData.sources?.length) await this.addSources(record.id, caseData.sources);
    return record.id;
  }

  /**
   * Adds articles to a case's sources (decision D-DP, DP7): each an http or https link, with its outlet
   * read from the link, and when it was reported where known. A link that is not one, or one the case
   * already holds, is dropped rather than repaired. Returns how many were added; each is logged.
   */
  async addSources(caseId: string, offered: readonly CaseSourceInput[]): Promise<number> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return 0;
    const held = new Set((record.sources ?? []).map((source) => source.url));
    const addedAt = new Date().toISOString();
    const added: CaseSource[] = [];
    for (const { url: raw, reportedAt, title } of offered) {
      const url = webLinkOf(raw);
      if (!url || held.has(url)) continue;
      held.add(url);
      const when = reportedAt && Number.isFinite(Date.parse(reportedAt)) ? new Date(reportedAt).toISOString() : undefined;
      added.push({ url, outlet: outletOf(url), ...(when ? { reportedAt: when } : {}), ...(title?.trim() ? { title: title.trim() } : {}), addedAt });
    }
    if (!added.length) return 0;
    const by = currentAttribution();
    const activityLog = [
      ...record.activityLog,
      ...added.map((source) => this.newActivityEntry(CaseActivityAction.SOURCE_ADDED, by, { url: source.url })),
    ];
    await intelCaseService.saveCase({ ...record, sources: [...(record.sources ?? []), ...added], activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return added.length;
  }

  /** Takes an article off a case's sources, logged. False when the case does not hold it. */
  async removeSource(caseId: string, url: string): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record?.sources?.some((source) => source.url === url)) return false;
    const activityLog = [...record.activityLog, this.newActivityEntry(CaseActivityAction.SOURCE_REMOVED, currentAttribution(), { url })];
    await intelCaseService.saveCase({ ...record, sources: record.sources.filter((source) => source.url !== url), activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /**
   * @param actorId - Who made this update (for the STATUS_CHANGED activity
   *   entry below). Optional — no current caller of updateCase supplies one
   *   yet (this is a capability, not a fully-wired attribution path; wiring
   *   real identity through every case-editing UI surface is a larger,
   *   separately-scoped gap, not something to bolt on here). When omitted,
   *   the status transition still happens, it just isn't logged — same
   *   "don't fabricate an actor" discipline as MissionService.updateStatus.
   */
  async updateCase(id: string, updates: Partial<CaseRecord>, actorId?: string): Promise<boolean> {
    const current = await intelCaseService.getCase(id);
    if (!current) return false;

    const statusChanged = updates.status && (updates.status as unknown as UICaseStatus) !== current.status;
    const fromStatus = current.status;
    if (statusChanged) {
      const transitioned = await intelCaseService.updateStatus(id, updates.status as unknown as UICaseStatus);
      if (!transitioned) return false;
    }

    const latest = (await intelCaseService.getCase(id))!;
    // Logged whenever the status actually changes, not only when a caller
    // remembers to pass an actor. The write used to be gated on `actorId` and
    // the hook's own interface did not even expose that parameter, so no
    // caller ever supplied one and a case's status history — the spine of an
    // investigation — was never recorded at all. Attribution falls back the
    // same way entity linking does: the real pubkey, or '' meaning genuinely
    // unknown, never a placeholder.
    const activityLog = statusChanged
      ? [...latest.activityLog, this.newActivityEntry(CaseActivityAction.STATUS_CHANGED, actorId ?? currentAttribution(), { from: fromStatus, to: updates.status })]
      : latest.activityLog;
    const merged: IntelCaseUI = {
      ...latest,
      title: updates.title ?? latest.title,
      description: updates.description ?? latest.description,
      priority: (updates.priority as unknown as UICasePriority) ?? latest.priority,
      assignedTo: updates.assignedTo ?? latest.assignedTo,
      dueDate: updates.dueDate ?? latest.dueDate,
      relatedEntities: updates.relatedEntities ?? latest.relatedEntities,
      relatedCases: updates.relatedCases ?? latest.relatedCases,
      visibility: updates.visibility ?? latest.visibility,
      limitedTo: updates.limitedTo ?? latest.limitedTo,
      sensitivity: updates.sensitivity ?? latest.sensitivity,
      tags: updates.tags ?? latest.tags,
      metadata: { ...latest.metadata, ...updates.metadata },
      activityLog,
    };
    await intelCaseService.saveCase(merged);
    const saved = (await intelCaseService.getCase(id))!;
    enhancedEventEmitter.emit('case:updated', { caseId: id, case: this.toCaseItem(saved) });
    return true;
  }

  async deleteCase(id: string): Promise<boolean> {
    const existing = await intelCaseService.getCase(id);
    if (!existing) return false;
    await intelCaseService.deleteCase(id, async (restored, deletedAt) => {
      // Brought back with Undo (plan item 0.6): its own history says when it
      // was deleted and that it came back, and the screens learn it is there.
      await intelCaseService.saveCase({
        ...restored,
        activityLog: [...restored.activityLog, this.newActivityEntry(CaseActivityAction.RESTORED, currentAttribution(), { deletedAt })],
      });
      const saved = (await intelCaseService.getCase(id))!;
      enhancedEventEmitter.emit('case:created', { caseId: id, case: this.toCaseItem(saved) });
    });
    enhancedEventEmitter.emit('case:deleted', { caseId: id });
    return true;
  }

  /**
   * Recover a CONFIDENTIAL+ case's description for display or editing.
   *
   * Returns null when the key is genuinely gone, which callers MUST NOT
   * present as "empty" — the ciphertext is still there, it is the key that is
   * missing, and saving an empty description over it would destroy the record.
   *
   * intelCaseService.decryptCaseDescription has existed since encryption-at-rest
   * landed and had only test callers; no UI had ever exercised this boundary.
   */
  async decryptCaseDescription(caseId: string): Promise<string | null> {
    return intelCaseService.decryptCaseDescription(caseId);
  }

  /**
   * Link IntelReport/IntelItem RECORD IDS to a case.
   *
   * The field is named relatedEntities but holds ids, not entity display
   * names — a distinction that was a shipped bug once already; see
   * contradictionProducer's doc comment. Callers must pass ids.
   *
   * Writes one ENTITY_LINKED entry per NEWLY added id. replayCase folds those
   * keyed on details.entityId (singular) and has done since before any producer
   * existed, so a case's reconstruction showed linkedEntities: [] on a
   * populated case — with no gap raised, because nothing had been logged to be
   * missing. CaseReplayPanel is live in IntelDashboard, so that silence was
   * reaching a real reader of the one artifact built not to require trust.
   */
  /**
   * Record what argues AGAINST a case.
   *
   * Kept separate from relatedEntities deliberately: folding counter-evidence
   * into the supporting list would make "rests on five records" and "rests on
   * three records and two that dispute them" indistinguishable, which is the
   * distinction an adjudicator most needs. A case that can only accumulate
   * agreement is a filing cabinet.
   */
  /**
   * Record what this case concludes.
   *
   * The position's METHOD is the case itself — its members, its
   * contradictions, its adjudicator and the time — all of which are already
   * recorded and checkable. That is why there is no confidence figure to pass
   * here: weight is derived from disclosed method, never asserted, and a
   * number the adjudicator picked would be the declared-confidence defect the
   * attestation model refuses.
   *
   * Restating a position overwrites it, and the activity log carries both,
   * so a reader can see that the case changed its mind and when.
   */
  /**
   * `addressed` maps a contradiction's entity id to how it was dealt with, in
   * words. Entries with empty text are dropped rather than stored: a key with
   * nothing behind it is the tick this field exists to refuse, and keeping it
   * would let an unaddressed contradiction count as addressed.
   */
  async statePosition(
    caseId: string,
    statement: string,
    verdict: CaseVerdict,
    addressed: Record<string, string> = {},
  ): Promise<boolean> {
    const trimmed = statement.trim();
    if (!trimmed) return false;

    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const contradictions = new Set(record.contradictedBy ?? []);
    const kept: Record<string, string> = {};
    for (const [id, how] of Object.entries(addressed)) {
      // Only contradictions this case actually carries, and only with a reason
      // — otherwise the count published later would overstate the work done.
      if (contradictions.has(id) && how.trim()) kept[id] = how.trim();
    }

    const adjudicatedBy = currentAttribution();
    const position: CasePosition = {
      statement: trimmed,
      verdict,
      adjudicatedBy,
      adjudicatedAt: new Date().toISOString(),
      ...(Object.keys(kept).length ? { addressed: kept } : {}),
    };
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.POSITION_STATED, adjudicatedBy, {
        statement: trimmed,
        verdict,
        // Recorded alongside so the log shows what the position rested on AT
        // THE TIME, not what the case happens to hold when it is read later.
        restedOn: record.relatedEntities.length,
        contradictedBy: contradictions.size,
        // How much of the disagreement was actually answered, at that moment.
        contradictionsAddressed: Object.keys(kept).length,
      }),
    ];

    await intelCaseService.saveCase({ ...record, position, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /**
   * Record something this case needs to know and does not.
   *
   * `because` is required and not defaulted. A requirement nobody can justify
   * is a wish, and the queue a collector reads is only worth reading if every
   * line in it says what turns on the answer.
   */
  async raiseRequirement(
    caseId: string,
    question: string,
    because: string,
    staleAfter?: string,
    /**
     * What field work would answer it, and where.
     *
     * Both optional and both dropped if unusable rather than repaired: a
     * requirement carrying a location nobody meant is worse than one carrying
     * none, because a queue shows it as somewhere to go.
     */
    field?: { modality?: readonly string[]; geohash?: string },
  ): Promise<string | null> {
    const q = question.trim();
    const why = because.trim();
    if (!q || !why) return null;

    const record = await intelCaseService.getCase(caseId);
    if (!record) return null;

    const raisedBy = currentAttribution();
    /*
     * Filtered against the vocabulary rather than trusted. The caller is a form
     * today and could be a peer tomorrow, and a modality outside the field
     * methods would describe collection nobody can file back.
     */
    const modality = (field?.modality ?? [])
      .filter((m): m is FieldMethod => (FIELD_METHODS as readonly string[]).includes(m));
    const place = requirementPlace(field?.geohash);

    const requirement: CollectionRequirement = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: q,
      because: why,
      raisedBy,
      raisedAt: new Date().toISOString(),
      answeredBy: [],
      ...(staleAfter ? { staleAfter } : {}),
      ...(modality.length ? { modality } : {}),
      ...(place ? { place } : {}),
    };

    const requirements = [...(record.requirements ?? []), requirement];
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.REQUIREMENT_RAISED, raisedBy, {
        requirementId: requirement.id,
        question: q,
      }),
    ];
    await intelCaseService.saveCase({ ...record, requirements, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return requirement.id;
  }

  /**
   * Offer a report as answering a requirement.
   *
   * This records the OFFER only. Whether the requirement is actually answered
   * is derived from the report's lifecycle stage at read time — see
   * requirementStatus — so linking a draft does not settle anything, and a
   * report that is later withdrawn stops answering it without anyone
   * remembering to revisit this.
   */
  async answerRequirement(caseId: string, requirementId: string, reportId: string): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const requirements = record.requirements ?? [];
    const target = requirements.find((r) => r.id === requirementId);
    if (!target || target.answeredBy.includes(reportId)) return false;

    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.REQUIREMENT_ANSWERED, currentAttribution(), {
        requirementId,
        reportId,
      }),
    ];
    await intelCaseService.saveCase({
      ...record,
      requirements: requirements.map((r) =>
        r.id === requirementId ? { ...r, answeredBy: [...r.answeredBy, reportId] } : r),
      activityLog,
    });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /**
   * Say you are working on a question, or stop saying it.
   *
   * `claim: false` releases. Releasing is as important as claiming: a signal
   * nobody can withdraw becomes stale and then misleading, and the person best
   * placed to know they have stopped is the one who said they had started.
   *
   * Deliberately does NOT refuse a claim on an already-claimed requirement. A
   * claim states intent rather than reserving, so two collectors saying they
   * are on the same question is a coordination fact worth having, not a
   * conflict to prevent — and refusing the second would turn the signal into a
   * lock that nothing can release when the first walks away.
   */
  async claimRequirement(caseId: string, requirementId: string, claim: boolean): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const requirements = record.requirements ?? [];
    const target = requirements.find((r) => r.id === requirementId);
    if (!target || target.closed) return false;

    const by = currentAttribution();
    const claimedBy = claim ? { by, at: new Date().toISOString() } : undefined;

    await intelCaseService.saveCase({
      ...record,
      requirements: requirements.map((r) => {
        if (r.id !== requirementId) return r;
        const next = { ...r };
        if (claimedBy) next.claimedBy = claimedBy;
        else delete next.claimedBy;
        return next;
      }),
    });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /**
   * Withdraw a requirement, with a stated reason.
   *
   * Refuses an empty reason rather than storing one. A requirement dropped
   * without a reason looks identical to one that was decided, which is the same
   * failure a released containment and an unaddressed contradiction guard
   * against.
   */
  async closeRequirement(caseId: string, requirementId: string, reason: string): Promise<boolean> {
    const why = reason.trim();
    if (!why) return false;

    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const requirements = record.requirements ?? [];
    const target = requirements.find((r) => r.id === requirementId);
    if (!target || target.closed) return false;

    const by = currentAttribution();
    const closed = { reason: why, by, at: new Date().toISOString() };
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.REQUIREMENT_CLOSED, by, { requirementId, reason: why }),
    ];
    await intelCaseService.saveCase({
      ...record,
      requirements: requirements.map((r) => (r.id === requirementId ? { ...r, closed } : r)),
      activityLog,
    });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async linkContradictionsToCase(caseId: string, entityIds: string[]): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;
    // One or the other, never both (plan item 1.3).
    if (entityIds.some((id) => record.relatedEntities.includes(id))) throw new Error(CONTRADICTION_BLOCKED);

    const existing = new Set(record.contradictedBy ?? []);
    const added = entityIds.filter((id) => !existing.has(id));
    if (added.length === 0) return true;

    const contradictedBy = [...(record.contradictedBy ?? []), ...added];
    const activityLog = [
      ...record.activityLog,
      ...added.map((entityId) =>
        this.newActivityEntry(CaseActivityAction.CONTRADICTION_LINKED, currentAttribution(), { entityId })
      ),
    ];
    await intelCaseService.saveCase({ ...record, contradictedBy, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /** The symmetric half, for the same reason unlinking evidence is logged. */
  async unlinkContradictionsFromCase(caseId: string, entityIds: string[]): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const removing = new Set(entityIds);
    const present = (record.contradictedBy ?? []).filter((id) => removing.has(id));
    if (present.length === 0) return true;

    const contradictedBy = (record.contradictedBy ?? []).filter((id) => !removing.has(id));
    const activityLog = [
      ...record.activityLog,
      ...present.map((entityId) =>
        this.newActivityEntry(CaseActivityAction.CONTRADICTION_UNLINKED, currentAttribution(), { entityId })
      ),
    ];
    await intelCaseService.saveCase({ ...record, contradictedBy, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async linkEntitiesToCase(caseId: string, entityIds: string[]): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;
    // One or the other, never both (plan item 1.3).
    if (entityIds.some((id) => (record.contradictedBy ?? []).includes(id))) throw new Error(EVIDENCE_BLOCKED);

    const existing = new Set(record.relatedEntities);
    const added = entityIds.filter((id) => !existing.has(id));
    if (added.length === 0) return true;

    const relatedEntities = [...record.relatedEntities, ...added];
    const activityLog = [
      ...record.activityLog,
      ...added.map((entityId) =>
        this.newActivityEntry(CaseActivityAction.ENTITY_LINKED, currentAttribution(), { entityId })
      ),
    ];
    await intelCaseService.saveCase({ ...record, relatedEntities, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  /**
   * The symmetric half. Without it, replayCase raises
   * 'removal-without-addition' for anything detached — or worse, the record
   * empties while the reconstruction still shows the entity linked.
   */
  async unlinkEntitiesFromCase(caseId: string, entityIds: string[]): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const removing = new Set(entityIds.filter((id) => record.relatedEntities.includes(id)));
    if (removing.size === 0) return true;

    const relatedEntities = record.relatedEntities.filter((id) => !removing.has(id));
    const activityLog = [
      ...record.activityLog,
      ...Array.from(removing).map((entityId) =>
        this.newActivityEntry(CaseActivityAction.ENTITY_UNLINKED, currentAttribution(), { entityId })
      ),
    ];
    await intelCaseService.saveCase({ ...record, relatedEntities, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async linkCases(sourceCaseId: string, targetCaseIds: string[]): Promise<boolean> {
    const record = await intelCaseService.getCase(sourceCaseId);
    if (!record) return false;
    const relatedCases = Array.from(new Set([...record.relatedCases, ...targetCaseIds]));
    await intelCaseService.saveCase({ ...record, relatedCases });
    const saved = (await intelCaseService.getCase(sourceCaseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId: sourceCaseId, case: this.toCaseItem(saved) });
    return true;
  }

  // ── Collaboration ──────────────────────────────────────────────────────

  async addCollaborator(caseId: string, collaborator: Omit<Collaborator, 'addedAt'>): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const uiCollaborator: UICollaborator = { ...(collaborator as unknown as UICollaborator), addedAt: new Date().toISOString() };
    const collaborators = [...record.collaborators];
    const idx = collaborators.findIndex((c) => c.userId === uiCollaborator.userId);
    if (idx >= 0) collaborators[idx] = uiCollaborator;
    else collaborators.push(uiCollaborator);

    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.COLLABORATOR_ADDED, collaborator.addedBy, { userId: uiCollaborator.userId }),
    ];

    await intelCaseService.saveCase({ ...record, collaborators, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:collaborator:added', { caseId, collaborator: uiCollaborator });
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async removeCollaborator(caseId: string, userId: string, removedBy: string): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const collaborators = record.collaborators.filter((c) => c.userId !== userId);
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.COLLABORATOR_REMOVED, removedBy, { userId }),
    ];

    await intelCaseService.saveCase({ ...record, collaborators, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:collaborator:removed', { caseId, userId });
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async addComment(caseId: string, comment: Omit<CaseComment, 'id' | 'createdAt'>): Promise<string | null> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return null;

    const id = `${caseId}_comment_${Date.now()}`;
    const uiComment: UICaseComment = {
      ...(comment as unknown as UICaseComment),
      id,
      createdAt: new Date().toISOString(),
    };
    const comments = [...record.comments, uiComment];
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.COMMENTED, comment.createdBy, { commentId: id }),
    ];

    await intelCaseService.saveCase({ ...record, comments, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:comment:added', { caseId, comment: uiComment });
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return id;
  }

  async updateComment(caseId: string, commentId: string, updates: Partial<CaseComment>): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const idx = record.comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return false;

    const comments = [...record.comments];
    comments[idx] = { ...comments[idx], ...(updates as unknown as Partial<UICaseComment>), updatedAt: new Date().toISOString() };

    await intelCaseService.saveCase({ ...record, comments });
    const saved = (await intelCaseService.getCase(caseId))!;
    // No dedicated "case:comment:updated" sub-topic — case:updated is what
    // consumers actually listen for, so that's what carries this change.
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async deleteComment(caseId: string, commentId: string, deletedBy: string): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const comments = record.comments.filter((c) => c.id !== commentId);
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.COMMENTED, deletedBy, { action: 'deleted', commentId }),
    ];

    await intelCaseService.saveCase({ ...record, comments, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  async generateSharingToken(caseId: string, generatedBy: string, expiresInHours = 24): Promise<string | null> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return null;

    const randomToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expiration = Date.now() + expiresInHours * 60 * 60 * 1000;
    const shareToken = `${randomToken}_${expiration}`;

    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.SHARED, generatedBy, { expiresInHours }),
    ];

    await intelCaseService.saveCase({
      ...record,
      shareToken,
      activityLog,
      metadata: { ...record.metadata, shareTokenExpiration: expiration },
    });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return shareToken;
  }

  async revokeSharingToken(caseId: string, revokedBy: string): Promise<boolean> {
    const record = await intelCaseService.getCase(caseId);
    if (!record) return false;

    const metadata = { ...record.metadata };
    delete metadata.shareTokenExpiration;
    const activityLog = [
      ...record.activityLog,
      this.newActivityEntry(CaseActivityAction.UPDATED, revokedBy, { field: 'shareToken', newValue: null }),
    ];

    await intelCaseService.saveCase({ ...record, shareToken: undefined, metadata, activityLog });
    const saved = (await intelCaseService.getCase(caseId))!;
    enhancedEventEmitter.emit('case:updated', { caseId, case: this.toCaseItem(saved) });
    return true;
  }

  private newActivityEntry(action: CaseActivityAction, userId: string, details: Record<string, unknown>): UIActivityLogEntry {
    return {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      timestamp: new Date().toISOString(),
      userId,
      details,
    };
  }

  /** No internal listeners to tear down anymore (see file header) — kept for API compatibility. */
  dispose(): void {
    // no-op
  }
}

export const caseManagerAdapter = new CaseManagerAdapter();
