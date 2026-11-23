import { IntelCaseUI, CreateIntelCaseInput, CaseStatus, VALID_CASE_STATUS_TRANSITIONS } from '../../types/intel/IntelCaseUI';
import { holdDeletion } from './deletionHolding';
import { intelWorkspaceManager } from './IntelWorkspaceManager';

export interface IntelCaseService {
  listCases(): Promise<IntelCaseUI[]>;
  getCase(id: string): Promise<IntelCaseUI | null>;
  createCase(input: CreateIntelCaseInput): Promise<IntelCaseUI>;
  /** Full-record save — the case adapter reads a case, mutates a sub-field (a comment, a collaborator, ...), and saves it back through this. */
  saveCase(record: IntelCaseUI): Promise<void>;
  updateStatus(id: string, status: CaseStatus): Promise<IntelCaseUI | null>;
  deleteCase(id: string, onRestored?: (restored: IntelCaseUI, deletedAt: string) => Promise<void> | void): Promise<void>;
  onChange(listener: (cases: IntelCaseUI[]) => void): () => void;
  /** Decrypt a CONFIDENTIAL+ case's description on demand (Cycle 7) — see IntelReportService.decryptReportContent for the same contract. */
  decryptCaseDescription(id: string): Promise<string | null>;
}

class WorkspaceBackedIntelCaseService implements IntelCaseService {
  private listeners = new Set<(cases: IntelCaseUI[]) => void>();
  /** Memoized promise, not a boolean — same concurrent-init hazard IntelReportService/IntelWorkspaceManager already had to fix. */
  private initPromise: Promise<void> | null = null;

  private notify(cases: IntelCaseUI[]) { this.listeners.forEach(l => l(cases)); }

  private async ensure(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await intelWorkspaceManager.ensureInitialized();
        intelWorkspaceManager.subscribe(async () => {
          this.notify(await this.listCases());
        });
      })();
    }
    return this.initPromise;
  }

  async listCases(): Promise<IntelCaseUI[]> {
    await this.ensure();
    return intelWorkspaceManager.getCases();
  }

  async getCase(id: string): Promise<IntelCaseUI | null> {
    await this.ensure();
    return intelWorkspaceManager.getCase(id);
  }

  async createCase(input: CreateIntelCaseInput): Promise<IntelCaseUI> {
    await this.ensure();
    return await intelWorkspaceManager.addCase(input);
  }

  async saveCase(record: IntelCaseUI): Promise<void> {
    await this.ensure();
    await intelWorkspaceManager.updateCase(record);
  }

  async updateStatus(id: string, status: CaseStatus): Promise<IntelCaseUI | null> {
    await this.ensure();
    const current = intelWorkspaceManager.getCase(id);
    if (!current) return null;
    if (current.status === status) return current;
    if (!VALID_CASE_STATUS_TRANSITIONS[current.status].includes(status)) {
      throw new Error(`Invalid case status transition: ${current.status} -> ${status}`);
    }
    // RESOLVED means the investigation reached a conclusion, so there must be
    // one. A case that resolves while stating nothing is the same defect the
    // position field was added to fix — an aggregation with no aggregate —
    // and it is worse at RESOLVED, where the status itself asserts a
    // conclusion the record does not contain.
    //
    // CLOSED is deliberately NOT gated: closing without concluding is a real
    // and legitimate outcome. Investigations are abandoned, superseded, or
    // turn out to be nothing, and forcing a position there would produce
    // fabricated conclusions to satisfy a check.
    if (status === CaseStatus.RESOLVED && !current.position?.statement?.trim()) {
      throw new Error(
        `Case ${current.caseNumber} cannot be RESOLVED without a position: resolving asserts a `
        + 'conclusion, so state what it concluded. Close it instead if it ended without one.',
      );
    }
    const updated: IntelCaseUI = {
      ...current,
      status,
      // Only a closed case has a closing date: a reopened one kept it, and still counted as closed.
      closedDate: status === CaseStatus.CLOSED ? new Date().toISOString() : status === CaseStatus.OPEN ? undefined : current.closedDate
    };
    await intelWorkspaceManager.updateCase(updated);
    return updated;
  }

  /**
   * Deletes a case, held for ten seconds with Undo (plan item 0.6). onRestored
   * runs after an Undo brings it back, for whoever keeps the screens in step.
   */
  async deleteCase(id: string, onRestored?: (restored: IntelCaseUI, deletedAt: string) => Promise<void> | void): Promise<void> {
    await this.ensure();
    const removed = intelWorkspaceManager.removeCase(id);
    if (!removed) return;
    holdDeletion({
      label: `Case "${removed.title}"`,
      undo: async () => {
        const restored = intelWorkspaceManager.restoreDeleted('case', id) as IntelCaseUI | null;
        if (restored && onRestored) await onRestored(restored, removed.deletedAt);
      },
      finalize: () => intelWorkspaceManager.finalizeDeletion('case', id),
    });
  }

  onChange(listener: (cases: IntelCaseUI[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async decryptCaseDescription(id: string): Promise<string | null> {
    await this.ensure();
    return intelWorkspaceManager.decryptCaseDescription(id);
  }
}

export const intelCaseService: IntelCaseService = new WorkspaceBackedIntelCaseService();
