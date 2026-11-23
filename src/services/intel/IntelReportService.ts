import { nostrIdentityService } from '../identity/NostrIdentityService';
import { IntelReportUI, CreateIntelReportInput, VALID_REPORT_STATUS_TRANSITIONS } from '../../types/intel/IntelReportUI';
import { IntelReportData, IntelReportFile } from '../../types/IntelWorkspace';
import { uiToWorkspaceReportData, workspaceFileToUI } from './adapters/reportMappers';
import { holdDeletion } from './deletionHolding';
import { intelWorkspaceManager } from './IntelWorkspaceManager';
import { computeChangedFields, nextVersion, makeHistoryEntry } from './reportLifecycle';

export interface IntelReportService {
  listReports(): Promise<IntelReportUI[]>;
  /**
   * @param author - Only for work that is not the person's own: a bot, an import.
   *   Omitted, the report is the signer's (plan item 2.2), not a placeholder.
   */
  createReport(input: CreateIntelReportInput, author?: string): Promise<IntelReportUI>;
  saveReport(report: IntelReportUI): Promise<void>;
  /**
   * @param user - Who performed the transition (e.g. nostrIdentityService.signerPubkey()).
   *   Optional and defaults to unattributed — the caller may not always have
   *   a resolved identity (e.g. the import path's synthetic transitions) —
   *   but callers that DO have one should pass it: without it, "who
   *   approved this report" is unrecoverable after the fact, which is
   *   exactly the gap the attribution/contribution surfacing work needs
   *   this filled for.
   */
  updateStatus(id: string, status: IntelReportUI['status'], user?: string): Promise<IntelReportUI | null>;
  getReport(id: string): Promise<IntelReportUI | null>;
  migrateLegacyIfNeeded(): Promise<void>;
  onChange(listener: (reports: IntelReportUI[]) => void): () => void;
  deleteReport(id: string): Promise<void>;
  /** Takes out a report read from the relays that its publisher withdrew or replaced: no Undo, since the person deleted nothing. */
  dropReadReport(id: string): Promise<void>;
  importReport(report: IntelReportUI, opts?: { strategy?: 'newId' | 'overwrite' | 'skip' }): Promise<IntelReportUI | null>;
  /**
   * Decrypt a protected report's content on demand (Cycle 7) — reports
   * at that classification are encrypted at rest in the workspace; listReports()/
   * getReport() return the ciphertext form in `content` for those, not a
   * transparently-decrypted one (see IntelWorkspaceManager's Cycle 7 comment
   * for why). Returns null if the record doesn't exist or its key is missing.
   */
  decryptReportContent(id: string): Promise<string | null>;
}

class WorkspaceBackedIntelReportService implements IntelReportService {
  private listeners = new Set<(reports: IntelReportUI[]) => void>();
  /**
   * Memoized promise, not a boolean. A plain `if (!this.initialized)` flag let
   * two near-simultaneous callers (there are 20+ call sites for
   * listReports()/createReport() across the app) both slip through before
   * either finished — each would independently await
   * intelWorkspaceManager.ensureInitialized() and then register its own
   * change subscription, double-firing every future notify(). Storing the
   * in-flight promise means every concurrent caller awaits the exact same
   * initialization, and subscribe() runs exactly once.
   */
  private initPromise: Promise<void> | null = null;

  private notify(reports: IntelReportUI[]) { this.listeners.forEach(l => l(reports)); }

  private async ensure(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await intelWorkspaceManager.ensureInitialized();
        // subscribe to workspace changes
        intelWorkspaceManager.subscribe(async () => {
          const list = await this.listReports();
          this.notify(list);
        });
      })();
    }
    return this.initPromise;
  }

  async migrateLegacyIfNeeded(): Promise<void> {
    // Handled inside workspace manager initialization path.
    await this.ensure();
  }

  private wrapAsFile(data: IntelReportData): IntelReportFile {
    return {
      path: '',
      filename: data.id + '.intelReport',
      extension: '.intelReport',
      reportData: data,
      size: 0,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt,
      checksum: ''
    };
  }

  async listReports(): Promise<IntelReportUI[]> {
    await this.ensure();
    return intelWorkspaceManager.getReports().map(d => workspaceFileToUI(this.wrapAsFile(d)));
  }

  async getReport(id: string): Promise<IntelReportUI | null> {
    await this.ensure();
    const found = intelWorkspaceManager.getReports().find(r => r.id === id);
    return found ? workspaceFileToUI(this.wrapAsFile(found)) : null;
  }

  async createReport(input: CreateIntelReportInput, author?: string): Promise<IntelReportUI> {
    await this.ensure();
    // Written here by the person, so theirs: the key it will be published under.
    // Callers wrote 'anonymous', 'ANALYST' or a wallet's key instead.
    const by = author ?? await nostrIdentityService.ensureSigner('writing a report');
    const now = new Date();
  const id = `intel-${globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    const initial: IntelReportUI = {
      id,
      ...(input.sample ? { sample: true } : {}),
      title: input.title,
      content: input.content,
      author: by,
      category: input.category,
      tags: input.tags,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      status: input.status || 'DRAFT',
      createdAt: now,
      updatedAt: now,
      latitude: input.latitude,
      longitude: input.longitude,
      summary: input.summary,
      conclusions: input.conclusions || [],
      recommendations: input.recommendations || [],
      methodology: input.methodology || [],
      confidence: input.confidence,
      priority: input.priority,
      // Kept, where they were dropped (plan item 1.9).
      ...(input.jurisdictions?.length ? { jurisdictions: input.jurisdictions } : {}),
      ...(typeof input.geoPrecisionM === 'number' ? { geoPrecisionM: input.geoPrecisionM } : {}),
      ...(input.entityRefs?.length ? { entityRefs: input.entityRefs } : {}),
      ...(input.cites?.length ? { cites: input.cites } : {}),
      targetAudience: input.targetAudience || [],
      sourceIntelIds: input.sourceIntelIds || [],
      startDate: input.startDate,
      endDate: input.endDate,
      timePrecisionMs: input.timePrecisionMs,
      hashtags: input.hashtags,
      extra: input.extra,
      version: 1,
      manualSummary: !!input.summary,
      history: [makeHistoryEntry({ action: 'CREATED', user: by })],
      collaborators: []
    };
    const data = uiToWorkspaceReportData(initial);
    const meta: any = data.metadata || (data.metadata = {});
    meta.history = initial.history?.map(h => ({ ...h }));
    await intelWorkspaceManager.addReport(data);
    return workspaceFileToUI(this.wrapAsFile(data));
  }

  async saveReport(report: IntelReportUI): Promise<void> {
    await this.ensure();
    const existingRaw = intelWorkspaceManager.getReports().find(r => r.id === report.id);
    if (!existingRaw) return;
    const existingUI = workspaceFileToUI(this.wrapAsFile(existingRaw));
    const changes = computeChangedFields(existingUI, report);
    if (changes.length === 0) return; // nothing to do
    const version = nextVersion(existingUI, changes, false);
    // Attributed. UPDATED entries were written with NO user at all, so every
    // edit a person made was permanently anonymous in the record and
    // contributed to nobody's count — and, since IV.D, replayed as an
    // unattributed action forever. The identity is available here: the Nostr
    // keypair is self-generated at module load, not gated on any connect flow.
    //
    // Left ABSENT rather than filled with a placeholder when there genuinely
    // is no identity. An entry that looks attributed and is not is worse than
    // one that is plainly unattributed.
    const actor = nostrIdentityService.signerPubkey() ?? undefined;
    const historyEntry = makeHistoryEntry({ action: 'UPDATED', changes, user: actor });
    const updated: IntelReportUI = {
      ...report,
      updatedAt: new Date(),
      version,
      history: [...(existingUI.history || []), historyEntry]
    };
    await intelWorkspaceManager.updateReport(uiToWorkspaceReportData(updated));
  }

  async updateStatus(id: string, status: IntelReportUI['status'], user?: string): Promise<IntelReportUI | null> {
    await this.ensure();
    const current = intelWorkspaceManager.getReports().find(r => r.id === id);
    if (!current) return null;
    const currentUI = workspaceFileToUI(this.wrapAsFile(current));
    if (currentUI.status === status) return currentUI;
    if (!VALID_REPORT_STATUS_TRANSITIONS[currentUI.status].includes(status)) {
      throw new Error(`Invalid status transition: ${currentUI.status} -> ${status}`);
    }
    // Approval is a second look, so the key that wrote the report cannot give
    // it (plan item 1.7). The approver is the key that signs here, whatever a
    // caller names, and the history records it.
    if (status === 'APPROVED') {
      user = await nostrIdentityService.ensureSigner('approving a report');
      if (user === currentUI.author) {
        throw new Error('A report is approved by someone other than its author. Ask someone on your team to approve it.');
      }
    }
    (current.metadata as any).status = status;
    current.modifiedAt = new Date().toISOString();
    const meta: any = current.metadata || (current.metadata = {});
    if (!meta.history) meta.history = [];
    const historyEntry = makeHistoryEntry({ action: 'STATUS_CHANGED', fromStatus: currentUI.status, toStatus: status, user });
    meta.history.push(historyEntry);
    meta.version = nextVersion(currentUI, [], true, status);
    await intelWorkspaceManager.updateReport(current);
    return workspaceFileToUI(this.wrapAsFile(current));
  }

  /** Deletes a report, held for ten seconds with Undo (plan item 0.6). */
  async deleteReport(id: string): Promise<void> {
    await this.ensure();
    const removed = intelWorkspaceManager.removeReport(id);
    if (!removed) return;
    holdDeletion({
      label: `Report "${removed.title}"`,
      undo: async () => { intelWorkspaceManager.restoreDeleted('report', id); },
      finalize: () => intelWorkspaceManager.finalizeDeletion('report', id),
    });
  }

  async dropReadReport(id: string): Promise<void> {
    await this.ensure();
    if (!intelWorkspaceManager.removeReport(id)) return;
    await intelWorkspaceManager.finalizeDeletion('report', id);
  }

  async importReport(report: IntelReportUI, opts: { strategy?: 'newId' | 'overwrite' | 'skip' } = {}): Promise<IntelReportUI | null> {
    await this.ensure();
    const strategy = opts.strategy || 'newId';
    const existing = intelWorkspaceManager.getReports().find(r => r.id === report.id);
    let toImport: IntelReportUI = { ...report };
    if (existing) {
      if (strategy === 'skip') return null;
      if (strategy === 'newId') {
        toImport = { ...toImport, id: report.id + '-imp-' + Math.random().toString(36).slice(2,8) };
      }
      if (strategy === 'overwrite') {
        // keep same id, proceed
      }
    }
    // Ensure dates are Date objects
    toImport.createdAt = toImport.createdAt instanceof Date ? toImport.createdAt : new Date(toImport.createdAt);
    /*
     * When its author last wrote it, kept. This was `new Date()`, and the
     * written-time fallback (recordTime.reportTime) reads updatedAt first, so
     * every network report said it was written when this device imported it and
     * sat on the timeline there (decision D-E). Importing is not editing; when it
     * was received is the IMPORTED history entry below.
     */
    const given = toImport.updatedAt instanceof Date ? toImport.updatedAt : new Date(toImport.updatedAt as unknown as string);
    toImport.updatedAt = Number.isFinite(given.getTime()) ? given : toImport.createdAt;
    if (!toImport.version) toImport.version = 1;
    const historyEntry = makeHistoryEntry({ action: 'IMPORTED', user: 'import', timestamp: new Date().toISOString() });
    toImport.history = [...(toImport.history || []), historyEntry];
    const data = uiToWorkspaceReportData(toImport);
    const meta: any = data.metadata || (data.metadata = {});
    meta.history = toImport.history;
    meta.version = toImport.version;
    if (existing && strategy === 'overwrite') {
      await intelWorkspaceManager.updateReport(data);
    } else {
      await intelWorkspaceManager.addReport(data);
    }
    return workspaceFileToUI(this.wrapAsFile(data));
  }

  onChange(listener: (reports: IntelReportUI[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async decryptReportContent(id: string): Promise<string | null> {
    await this.ensure();
    return intelWorkspaceManager.decryptReportContent(id);
  }
}

export const intelReportService: IntelReportService = new WorkspaceBackedIntelReportService();
